const express = require('express');
const router = express.Router();
const { dbGet, dbAll, engine } = require('../config/dbEngine');

// Helper: send notification on leave events
async function notifyUser(userId, companyId, type, title, body, relatedId) {
  try {
    await dbGet(`INSERT INTO notifications (company_id, user_id, type, title, body, related_type, related_id) VALUES (?,?,?,?,?,'leave_request',?)`,
      [companyId, userId, type, title, body, relatedId]);
  } catch (e) { console.error('Notify error:', e.message); }
}

// requires_approval/is_paid are BOOLEAN on Postgres but INTEGER 0/1 on
// SQLite -- and node:sqlite rejects a raw JS boolean as a bind parameter
// outright (regardless of column type), so a value straight from
// `req.body` (already `true`/`false` from JSON) crashes there even before
// considering the Postgres/SQLite type mismatch. `undefined` (field
// omitted) must stay `null` so COALESCE(?, existing_col) preserves the
// old value instead of wiping it.
function boolParam(v) {
  if (v === undefined) return null;
  return engine() === 'postgres' ? !!v : (v ? 1 : 0);
}

// ── Leave Types ────────────────────────────────────────────────────────────────

router.get('/types', async (req, res, next) => {
  try {
    const types = await dbAll('SELECT * FROM leave_types WHERE company_id = ? ORDER BY name', [req.user.companyId]);
    res.json(types);
  } catch (err) { next(err); }
});

router.post('/types', async (req, res, next) => {
  try {
    const { name, code, max_days_per_year, carry_forward, requires_approval, is_paid, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Leave type name is required' });
    const insert = await dbGet(`
      INSERT INTO leave_types (company_id, name, code, max_days_per_year, carry_forward, requires_approval, is_paid, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [req.user.companyId, name, code, max_days_per_year, carry_forward || 0,
        boolParam(requires_approval !== false), boolParam(is_paid !== false), color]);
    res.status(201).json(await dbGet('SELECT * FROM leave_types WHERE id = ?', [insert.id]));
  } catch (err) { next(err); }
});

router.put('/types/:id', async (req, res, next) => {
  try {
    const { name, code, max_days_per_year, carry_forward, requires_approval, is_paid, color } = req.body;
    await dbGet(`UPDATE leave_types SET name=COALESCE(?,name), code=COALESCE(?,code), max_days_per_year=COALESCE(?,max_days_per_year),
      carry_forward=COALESCE(?,carry_forward), requires_approval=COALESCE(?,requires_approval), is_paid=COALESCE(?,is_paid), color=COALESCE(?,color)
      WHERE id=? AND company_id=?`,
      [name ?? null, code ?? null, max_days_per_year ?? null, carry_forward ?? null,
       boolParam(requires_approval), boolParam(is_paid), color ?? null, req.params.id, req.user.companyId]);
    res.json(await dbGet('SELECT * FROM leave_types WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
});

// ── Leave Balances ─────────────────────────────────────────────────────────────

router.get('/balance/:employeeId', async (req, res, next) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const balances = await dbAll(`
      SELECT lb.*, lt.name as leave_type_name, lt.code, lt.color, lt.is_paid
      FROM leave_balances lb
      JOIN leave_types lt ON lb.leave_type_id = lt.id
      WHERE lb.employee_id = ? AND lb.company_id = ? AND lb.year = ?
    `, [req.params.employeeId, req.user.companyId, year]);
    res.json(balances);
  } catch (err) { next(err); }
});

// ── Leave Requests ─────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { status, employee_id, leave_type_id, month, year } = req.query;
    const isPg = engine() === 'postgres';
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
    if (month && year) {
      // strftime() is SQLite-only; start_date is a real DATE column on
      // Postgres, so EXTRACT gives the equivalent month/year parts.
      if (isPg) {
        sql += ' AND EXTRACT(MONTH FROM lr.start_date) = ? AND EXTRACT(YEAR FROM lr.start_date) = ?';
        params.push(Number(month), Number(year));
      } else {
        sql += " AND strftime('%m',lr.start_date) = ? AND strftime('%Y',lr.start_date) = ?";
        params.push(String(month).padStart(2,'0'), String(year));
      }
    }
    sql += ' ORDER BY lr.created_at DESC LIMIT 200';
    res.json(await dbAll(sql, params));
  } catch (err) { next(err); }
});

router.get('/calendar', async (req, res, next) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });
    const isPg = engine() === 'postgres';

    let leaves;
    if (isPg) {
      leaves = await dbAll(`
        SELECT lr.*, e.name as employee_name, e.avatar, lt.name as leave_type_name, lt.color
        FROM leave_requests lr
        JOIN employees e ON lr.employee_id = e.id
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE lr.company_id = ? AND lr.status = 'approved'
          AND (EXTRACT(MONTH FROM lr.start_date) = ? OR EXTRACT(MONTH FROM lr.end_date) = ?)
          AND (EXTRACT(YEAR FROM lr.start_date) = ? OR EXTRACT(YEAR FROM lr.end_date) = ?)
      `, [req.user.companyId, Number(month), Number(month), Number(year), Number(year)]);
    } else {
      const monthStr = String(month).padStart(2, '0');
      leaves = await dbAll(`
        SELECT lr.*, e.name as employee_name, e.avatar, lt.name as leave_type_name, lt.color
        FROM leave_requests lr
        JOIN employees e ON lr.employee_id = e.id
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE lr.company_id = ? AND lr.status = 'approved'
          AND (strftime('%m', lr.start_date) = ? OR strftime('%m', lr.end_date) = ?)
          AND (strftime('%Y', lr.start_date) = ? OR strftime('%Y', lr.end_date) = ?)
      `, [req.user.companyId, monthStr, monthStr, String(year), String(year)]);
    }
    res.json(leaves);
  } catch (err) { next(err); }
});

// Submit leave request
router.post('/', async (req, res, next) => {
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
    const overlap = await dbGet(`
      SELECT id FROM leave_requests
      WHERE employee_id = ? AND status NOT IN ('rejected', 'cancelled')
        AND NOT (end_date < ? OR start_date > ?)
    `, [employee_id, start_date, end_date]);
    if (overlap) return res.status(409).json({ error: 'Employee already has a leave request for this period' });

    // AI Risk Analysis. Note: hrAIService.js still calls the SQLite-only
    // getDb() internally (it's deferred to the Phase 2 AI subsystem step,
    // not part of this file's conversion) -- under DB_ENGINE=postgres its
    // employee/department lookups will miss real data since the actual
    // records live in Postgres. Already fails soft (try/catch below,
    // pre-existing), so this degrades to no AI risk context rather than
    // breaking leave submission -- but the risk score/suggestion will be
    // empty on Postgres until hrAIService.js itself is converted.
    let ai_risk_score = null, ai_risk_level = null, ai_risk_reason = null, ai_suggestion_id = null, ai_recommendation = null;
    try {
      const aiService = require('../services/hrAIService');
      // Get department context
      const emp = await dbGet('SELECT e.*, d.name as dept_name FROM employees e LEFT JOIN departments d ON e.department_id = d.id WHERE e.id = ?', [employee_id]);
      const onLeaveCount = await dbGet(`
        SELECT count(*) as cnt FROM leave_requests lr
        JOIN employees e ON lr.employee_id = e.id
        WHERE lr.company_id = ? AND lr.status = 'approved' AND e.department_id = ?
          AND NOT (lr.end_date < ? OR lr.start_date > ?)
      `, [req.user.companyId, emp?.department_id, start_date, end_date]);
      const deptSize = await dbGet("SELECT count(*) as cnt FROM employees WHERE department_id = ? AND status = 'Active' AND deleted_at IS NULL", [emp?.department_id]);

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

    const insert = await dbGet(`
      INSERT INTO leave_requests (employee_id, company_id, leave_type_id, start_date, end_date, total_days, reason,
        ai_risk_score, ai_risk_level, ai_risk_reason, ai_suggested_replacement_id, ai_recommendation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [employee_id, req.user.companyId, leave_type_id, start_date, end_date, total_days, reason,
      ai_risk_score, ai_risk_level, ai_risk_reason, ai_suggestion_id, ai_recommendation]);

    // Notify manager
    const emp = await dbGet('SELECT manager_id, name FROM employees WHERE id = ?', [employee_id]);
    if (emp?.manager_id) {
      const mgr = await dbGet('SELECT user_id FROM employees WHERE id = ?', [emp.manager_id]);
      if (mgr?.user_id) {
        await notifyUser(mgr.user_id, req.user.companyId, 'leave_request', 'New Leave Request',
          `${emp.name} has submitted a leave request`, insert.id);
      }
    }

    res.status(201).json(await dbGet(`
      SELECT lr.*, lt.name as leave_type_name, lt.color FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id WHERE lr.id = ?
    `, [insert.id]));
  } catch (err) { next(err); }
});

// Approve leave
router.put('/:id/approve', async (req, res, next) => {
  try {
    const leave = await dbGet('SELECT * FROM leave_requests WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be approved' });

    const nowExpr = engine() === 'postgres' ? 'now()' : "datetime('now')";
    await dbGet(`UPDATE leave_requests SET status = 'approved', approved_by = ?, approved_at = ${nowExpr} WHERE id = ?`,
      [req.user.userId, req.params.id]);

    // Deduct from leave balance. leave_balances has no UNIQUE constraint on
    // (employee_id, leave_type_id, year) on either engine -- the original
    // `INSERT ... ON CONFLICT(...) DO UPDATE` here always threw ("ON
    // CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint",
    // confirmed against the live SQLite db), silently swallowed by a
    // `.catch?.(() => {})` that never actually caught anything (`.run()`
    // throws synchronously, not via a rejected promise) -- so this step has
    // never actually run successfully on either engine. Rewritten as a
    // plain select-then-insert-or-update, which needs no constraint on
    // either engine, rather than adding a schema constraint this file's
    // conversion isn't scoped to touch.
    const year = new Date(leave.start_date).getFullYear();
    const existingBalance = await dbGet(
      'SELECT id, used_days FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?',
      [leave.employee_id, leave.leave_type_id, year]
    );
    if (existingBalance) {
      await dbGet(
        'UPDATE leave_balances SET used_days = used_days + ?, remaining_days = total_days - (used_days + ?) WHERE id = ?',
        [leave.total_days, leave.total_days, existingBalance.id]
      );
    } else {
      await dbGet(
        'INSERT INTO leave_balances (employee_id, leave_type_id, company_id, year, total_days, used_days, remaining_days) VALUES (?, ?, ?, ?, 0, ?, ?)',
        [leave.employee_id, leave.leave_type_id, req.user.companyId, year, leave.total_days, -leave.total_days]
      );
    }

    // Notify employee
    const emp = await dbGet('SELECT user_id, name FROM employees WHERE id = ?', [leave.employee_id]);
    if (emp?.user_id) await notifyUser(emp.user_id, req.user.companyId, 'leave_approved', 'Leave Approved', `Your leave from ${leave.start_date} to ${leave.end_date} has been approved`, leave.id);

    res.json({ success: true });
  } catch (err) { next(err); }
});

// Reject leave
router.put('/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const leave = await dbGet('SELECT * FROM leave_requests WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be rejected' });

    await dbGet(`UPDATE leave_requests SET status = 'rejected', rejected_by = ?, ai_risk_reason = COALESCE(?, ai_risk_reason) WHERE id = ?`,
      [req.user.userId, reason, req.params.id]);

    const emp = await dbGet('SELECT user_id FROM employees WHERE id = ?', [leave.employee_id]);
    if (emp?.user_id) await notifyUser(emp.user_id, req.user.companyId, 'leave_rejected', 'Leave Rejected', `Your leave request for ${leave.start_date} has been rejected. ${reason || ''}`, leave.id);

    res.json({ success: true });
  } catch (err) { next(err); }
});

// Cancel leave
router.put('/:id/cancel', async (req, res, next) => {
  try {
    const leave = await dbGet('SELECT * FROM leave_requests WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (!['pending', 'approved'].includes(leave.status)) return res.status(400).json({ error: 'This leave cannot be cancelled' });

    await dbGet(`UPDATE leave_requests SET status = 'cancelled' WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
