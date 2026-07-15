const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');

// Helper: send notification on leave events
function notifyUser(db, userId, companyId, type, title, body, relatedId) {
  try {
    db.prepare(`INSERT INTO notifications (company_id, user_id, type, title, body, related_type, related_id) VALUES (?,?,?,?,?,'leave_request',?)`)
      .run(companyId, userId, type, title, body, relatedId);
  } catch (e) { console.error('Notify error:', e.message); }
}

// ── Leave Types ────────────────────────────────────────────────────────────────

router.get('/types', (req, res, next) => {
  const db = getDb();
  try {
    const types = db.prepare('SELECT * FROM leave_types WHERE company_id = ? ORDER BY name').all(req.user.companyId);
    res.json(types);
  } catch (err) { next(err); } finally { db.close(); }
});

router.post('/types', (req, res, next) => {
  const db = getDb();
  try {
    const { name, code, max_days_per_year, carry_forward, requires_approval, is_paid, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Leave type name is required' });
    const info = db.prepare(`
      INSERT INTO leave_types (company_id, name, code, max_days_per_year, carry_forward, requires_approval, is_paid, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.companyId, name, code, max_days_per_year, carry_forward || 0, requires_approval !== false ? 1 : 0, is_paid !== false ? 1 : 0, color);
    res.status(201).json(db.prepare('SELECT * FROM leave_types WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) { next(err); } finally { db.close(); }
});

router.put('/types/:id', (req, res, next) => {
  const db = getDb();
  try {
    const { name, code, max_days_per_year, carry_forward, requires_approval, is_paid, color } = req.body;
    db.prepare(`UPDATE leave_types SET name=COALESCE(?,name), code=COALESCE(?,code), max_days_per_year=COALESCE(?,max_days_per_year),
      carry_forward=COALESCE(?,carry_forward), requires_approval=COALESCE(?,requires_approval), is_paid=COALESCE(?,is_paid), color=COALESCE(?,color)
      WHERE id=? AND company_id=?`).run(name, code, max_days_per_year, carry_forward, requires_approval, is_paid, color, req.params.id, req.user.companyId);
    res.json(db.prepare('SELECT * FROM leave_types WHERE id = ?').get(req.params.id));
  } catch (err) { next(err); } finally { db.close(); }
});

// ── Leave Balances ─────────────────────────────────────────────────────────────

router.get('/balance/:employeeId', (req, res, next) => {
  const db = getDb();
  try {
    const year = req.query.year || new Date().getFullYear();
    const balances = db.prepare(`
      SELECT lb.*, lt.name as leave_type_name, lt.code, lt.color, lt.is_paid
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = ? AND lb.company_id = ? AND lb.year = ?
    `).all(req.params.employeeId, req.user.companyId, year);
    res.json(balances);
  } catch (err) { next(err); } finally { db.close(); }
});

// ── Leave Requests ─────────────────────────────────────────────────────────────

router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const { status, employee_id, leave_type_id, month, year } = req.query;
    let sql = `
      SELECT lr.*, e.name as employee_name, e.employee_code, e.avatar, e.job_title,
             lt.name as leave_type_name, lt.color, lt.is_paid,
             ua.name as approved_by_name
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN users ua ON lr.approved_by = ua.id
      WHERE lr.company_id = ?
    `;
    const params = [req.user.companyId];
    if (status) { sql += ' AND lr.status = ?'; params.push(status); }
    if (employee_id) { sql += ' AND lr.employee_id = ?'; params.push(employee_id); }
    if (leave_type_id) { sql += ' AND lr.leave_type_id = ?'; params.push(leave_type_id); }
    if (month && year) { sql += ' AND strftime("%m",lr.start_date) = ? AND strftime("%Y",lr.start_date) = ?'; params.push(String(month).padStart(2,'0'), String(year)); }
    sql += ' ORDER BY lr.created_at DESC LIMIT 200';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { next(err); } finally { db.close(); }
});

router.get('/calendar', (req, res, next) => {
  const db = getDb();
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });
    const monthStr = String(month).padStart(2, '0');
    const leaves = db.prepare(`
      SELECT lr.*, e.name as employee_name, e.avatar, lt.name as leave_type_name, lt.color
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.company_id = ? AND lr.status = 'approved'
        AND (strftime('%m', lr.start_date) = ? OR strftime('%m', lr.end_date) = ?)
        AND (strftime('%Y', lr.start_date) = ? OR strftime('%Y', lr.end_date) = ?)
    `).all(req.user.companyId, monthStr, monthStr, String(year), String(year));
    res.json(leaves);
  } catch (err) { next(err); } finally { db.close(); }
});

// Submit leave request
router.post('/', async (req, res, next) => {
  const db = getDb();
  try {
    const { employee_id, leave_type_id, start_date, end_date, reason } = req.body;
    if (!employee_id || !leave_type_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'employee_id, leave_type_id, start_date, end_date required' });
    }

    // Calculate working days (simple: weekdays only)
    const start = new Date(start_date);
    const end = new Date(end_date);
    let total_days = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) total_days++;
    }
    if (total_days <= 0) return res.status(400).json({ error: 'Leave duration must be at least 1 working day' });

    // Check for overlapping leave requests
    const overlap = db.prepare(`
      SELECT id FROM leave_requests 
      WHERE employee_id = ? AND status NOT IN ('rejected', 'cancelled')
        AND NOT (end_date < ? OR start_date > ?)
    `).get(employee_id, start_date, end_date);
    if (overlap) return res.status(409).json({ error: 'Employee already has a leave request for this period' });

    // AI Risk Analysis
    let ai_risk_score = null, ai_risk_level = null, ai_risk_reason = null, ai_suggestion_id = null, ai_recommendation = null;
    try {
      const aiService = require('../services/hrAIService');
      // Get department context
      const emp = db.prepare('SELECT e.*, d.name as dept_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = ?').get(employee_id);
      const onLeaveCount = db.prepare(`
        SELECT count(*) as cnt FROM leave_requests lr
        JOIN employees e ON lr.employee_id = e.id
        WHERE lr.company_id = ? AND lr.status = 'approved' AND e.department_id = ?
          AND NOT (lr.end_date < ? OR lr.start_date > ?)
      `).get(req.user.companyId, emp?.department_id, start_date, end_date);
      const deptSize = db.prepare('SELECT count(*) as cnt FROM employees WHERE department_id = ? AND status = "Active" AND deleted_at IS NULL').get(emp?.department_id);

      const analysis = await aiService.analyzeLeaveRequest({
        employee: emp, start_date, end_date, total_days, reason,
        on_leave_count: onLeaveCount?.cnt || 0,
        dept_size: deptSize?.cnt || 0
      }, req.user.companyId);

      if (analysis) {
        ai_risk_score = analysis.risk_score;
        ai_risk_level = analysis.risk_level;
        ai_risk_reason = analysis.reason;
        ai_suggestion_id = analysis.suggested_replacement_id;
        ai_recommendation = analysis.recommendation;
      }
    } catch (aiErr) { console.error('[Leaves] AI analysis failed:', aiErr.message); }

    const info = db.prepare(`
      INSERT INTO leave_requests (employee_id, company_id, leave_type_id, start_date, end_date, total_days, reason,
        ai_risk_score, ai_risk_level, ai_risk_reason, ai_suggested_replacement_id, ai_recommendation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(employee_id, req.user.companyId, leave_type_id, start_date, end_date, total_days, reason,
      ai_risk_score, ai_risk_level, ai_risk_reason, ai_suggestion_id, ai_recommendation);

    // Notify manager
    const emp = db.prepare('SELECT manager_id, name FROM employees WHERE id = ?').get(employee_id);
    if (emp?.manager_id) {
      const mgr = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(emp.manager_id);
      if (mgr?.user_id) {
        notifyUser(db, mgr.user_id, req.user.companyId, 'leave_request', 'New Leave Request',
          `${emp.name} has submitted a leave request`, info.lastInsertRowid);
      }
    }

    res.status(201).json(db.prepare(`
      SELECT lr.*, lt.name as leave_type_name, lt.color FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id WHERE lr.id = ?
    `).get(info.lastInsertRowid));
  } catch (err) { next(err); } finally { db.close(); }
});

// Approve leave
router.put('/:id/approve', (req, res, next) => {
  const db = getDb();
  try {
    const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be approved' });

    db.prepare(`UPDATE leave_requests SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?`)
      .run(req.user.userId, req.params.id);

    // Deduct from leave balance
    const year = new Date(leave.start_date).getFullYear();
    db.prepare(`
      INSERT INTO leave_balances (employee_id, leave_type_id, company_id, year, total_days, used_days, remaining_days)
      VALUES (?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(employee_id, leave_type_id, year) DO UPDATE SET
        used_days = used_days + ?,
        remaining_days = total_days - (used_days + ?)
    `).run(leave.employee_id, leave.leave_type_id, req.user.companyId, year, leave.total_days, -leave.total_days, leave.total_days, leave.total_days).catch?.(() => {});

    // Notify employee
    const emp = db.prepare('SELECT user_id, name FROM employees WHERE id = ?').get(leave.employee_id);
    if (emp?.user_id) notifyUser(db, emp.user_id, req.user.companyId, 'leave_approved', 'Leave Approved', `Your leave from ${leave.start_date} to ${leave.end_date} has been approved`, leave.id);

    res.json({ success: true });
  } catch (err) { next(err); } finally { db.close(); }
});

// Reject leave
router.put('/:id/reject', (req, res, next) => {
  const db = getDb();
  try {
    const { reason } = req.body;
    const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be rejected' });

    db.prepare(`UPDATE leave_requests SET status = 'rejected', rejected_by = ?, ai_risk_reason = COALESCE(?, ai_risk_reason) WHERE id = ?`)
      .run(req.user.userId, reason, req.params.id);

    const emp = db.prepare('SELECT user_id FROM employees WHERE id = ?').get(leave.employee_id);
    if (emp?.user_id) notifyUser(db, emp.user_id, req.user.companyId, 'leave_rejected', 'Leave Rejected', `Your leave request for ${leave.start_date} has been rejected. ${reason || ''}`, leave.id);

    res.json({ success: true });
  } catch (err) { next(err); } finally { db.close(); }
});

// Cancel leave
router.put('/:id/cancel', (req, res, next) => {
  const db = getDb();
  try {
    const leave = db.prepare('SELECT * FROM leave_requests WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (!['pending', 'approved'].includes(leave.status)) return res.status(400).json({ error: 'This leave cannot be cancelled' });

    db.prepare(`UPDATE leave_requests SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); } finally { db.close(); }
});

module.exports = router;
