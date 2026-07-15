const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');

// List attendance records
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const { date, employee_id, month, year, status, branch_id, department_id } = req.query;
    let sql = `
      SELECT ar.*, e.name as employee_name, e.employee_code, e.avatar, e.job_title,
             d.name as department_name, b.name as branch_name
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN branches b ON ar.branch_id = b.id
      WHERE ar.company_id = ?
    `;
    const params = [req.user.companyId];
    if (date) { sql += ' AND ar.date = ?'; params.push(date); }
    if (employee_id) { sql += ' AND ar.employee_id = ?'; params.push(employee_id); }
    if (status) { sql += ' AND ar.status = ?'; params.push(status); }
    if (branch_id) { sql += ' AND ar.branch_id = ?'; params.push(branch_id); }
    if (department_id) { sql += ' AND e.department_id = ?'; params.push(department_id); }
    if (month && year) {
      sql += ' AND strftime("%m",ar.date) = ? AND strftime("%Y",ar.date) = ?';
      params.push(String(month).padStart(2,'0'), String(year));
    }
    sql += ' ORDER BY ar.date DESC, e.name ASC LIMIT 500';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { next(err); } finally { db.close(); }
});

// Daily summary (for manager dashboard)
router.get('/summary', (req, res, next) => {
  const db = getDb();
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const totalActive = db.prepare("SELECT count(*) as cnt FROM employees WHERE company_id = ? AND status = 'Active' AND deleted_at IS NULL").get(req.user.companyId);
    const summary = db.prepare(`
      SELECT status, count(*) as count FROM attendance_records WHERE company_id = ? AND date = ? GROUP BY status
    `).all(req.user.companyId, date);

    const statusMap = {};
    summary.forEach(s => statusMap[s.status] = s.count);

    res.json({
      date,
      total_employees: totalActive?.cnt || 0,
      present: (statusMap['present'] || 0) + (statusMap['remote'] || 0) + (statusMap['wfh'] || 0) + (statusMap['on_site'] || 0),
      absent: statusMap['absent'] || 0,
      late: statusMap['late'] || 0,
      on_leave: statusMap['on_leave'] || 0,
      half_day: statusMap['half_day'] || 0,
      not_marked: (totalActive?.cnt || 0) - summary.reduce((s, i) => s + i.count, 0),
      breakdown: statusMap
    });
  } catch (err) { next(err); } finally { db.close(); }
});

// Monthly report per employee
router.get('/report', (req, res, next) => {
  const db = getDb();
  try {
    const { month, year, employee_id } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });
    const monthStr = String(month).padStart(2, '0');

    let sql = `
      SELECT e.id as employee_id, e.name, e.employee_code, e.avatar,
             COUNT(ar.id) as total_days_marked,
             SUM(CASE WHEN ar.status IN ('present','remote','wfh','on_site') THEN 1 ELSE 0 END) as present_days,
             SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_days,
             SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) as late_days,
             SUM(CASE WHEN ar.status = 'half_day' THEN 1 ELSE 0 END) as half_days,
             SUM(CASE WHEN ar.status = 'on_leave' THEN 1 ELSE 0 END) as leave_days,
             ROUND(SUM(COALESCE(ar.total_hours, 0)), 2) as total_hours,
             ROUND(SUM(COALESCE(ar.overtime_hours, 0)), 2) as overtime_hours
      FROM employees e
      LEFT JOIN attendance_records ar ON ar.employee_id = e.id
        AND strftime('%m', ar.date) = ? AND strftime('%Y', ar.date) = ?
      WHERE e.company_id = ? AND e.deleted_at IS NULL
    `;
    const params = [monthStr, String(year), req.user.companyId];
    if (employee_id) { sql += ' AND e.id = ?'; params.push(employee_id); }
    sql += ' GROUP BY e.id ORDER BY e.name';
    res.json(db.prepare(sql).all(...params));
  } catch (err) { next(err); } finally { db.close(); }
});

// Clock-in
router.post('/clock-in', (req, res, next) => {
  const db = getDb();
  try {
    const { employee_id, branch_id, notes } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'employee_id required' });
    const today = new Date().toISOString().split('T')[0];
    const existing = db.prepare('SELECT id, clock_out FROM attendance_records WHERE employee_id = ? AND date = ? AND company_id = ?').get(employee_id, today, req.user.companyId);
    if (existing && !existing.clock_out) return res.status(409).json({ error: 'Employee is already clocked in today' });

    const clockInTime = new Date().toTimeString().split(' ')[0];
    const isLate = clockInTime > '09:30:00'; // configurable later via hr_settings

    const info = db.prepare(`
      INSERT INTO attendance_records (employee_id, company_id, branch_id, date, clock_in, status, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(employee_id, req.user.companyId, branch_id || null, today, clockInTime, isLate ? 'late' : 'present', notes || null, req.user.userId);

    res.status(201).json(db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) { next(err); } finally { db.close(); }
});

// Clock-out
router.post('/clock-out', (req, res, next) => {
  const db = getDb();
  try {
    const { employee_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const record = db.prepare('SELECT * FROM attendance_records WHERE employee_id = ? AND date = ? AND company_id = ? AND clock_out IS NULL').get(employee_id, today, req.user.companyId);
    if (!record) return res.status(404).json({ error: 'No active clock-in found for today' });

    const clockOut = new Date().toTimeString().split(' ')[0];
    const inParts = record.clock_in.split(':').map(Number);
    const outParts = clockOut.split(':').map(Number);
    const totalHours = Math.round(((outParts[0]*60+outParts[1]) - (inParts[0]*60+inParts[1])) / 60 * 100) / 100;
    const breakHours = 1; // Standard 1hr lunch
    const overtimeHours = Math.max(0, totalHours - breakHours - 8);

    db.prepare(`UPDATE attendance_records SET clock_out = ?, total_hours = ?, break_hours = ?, overtime_hours = ? WHERE id = ?`)
      .run(clockOut, Math.max(0, totalHours - breakHours), breakHours, overtimeHours, record.id);

    res.json(db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(record.id));
  } catch (err) { next(err); } finally { db.close(); }
});

// Bulk mark attendance (admin marks for team)
router.post('/mark', (req, res, next) => {
  const db = getDb();
  try {
    const { date, records } = req.body; // records: [{employee_id, status, notes}]
    if (!date || !Array.isArray(records)) return res.status(400).json({ error: 'date and records array required' });

    db.exec('BEGIN TRANSACTION');
    try {
      const upsert = db.prepare(`
        INSERT INTO attendance_records (employee_id, company_id, date, status, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(employee_id, date) DO UPDATE SET status = excluded.status, notes = excluded.notes
      `);
      for (const r of records) {
        upsert.run(r.employee_id, req.user.companyId, date, r.status, r.notes || null, req.user.userId);
      }
      db.exec('COMMIT');
      res.json({ success: true, marked: records.length });
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } catch (err) { next(err); } finally { db.close(); }
});

// Update record
router.put('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const { status, notes, clock_in, clock_out } = req.body;
    db.prepare(`UPDATE attendance_records SET status=COALESCE(?,status), notes=COALESCE(?,notes), clock_in=COALESCE(?,clock_in), clock_out=COALESCE(?,clock_out) WHERE id=? AND company_id=?`)
      .run(status, notes, clock_in, clock_out, req.params.id, req.user.companyId);
    res.json(db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(req.params.id));
  } catch (err) { next(err); } finally { db.close(); }
});

module.exports = router;
