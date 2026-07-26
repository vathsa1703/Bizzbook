const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { dbGet, dbAll, engine } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

// List attendance records
router.get('/', async (req, res, next) => {
  try {
    const { date, employee_id, month, year, status, branch_id, department_id } = req.query;
    const isPg = engine() === 'postgres';
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
      // strftime() is SQLite-only; ar.date is a real DATE column on Postgres.
      if (isPg) {
        sql += ' AND EXTRACT(MONTH FROM ar.date) = ? AND EXTRACT(YEAR FROM ar.date) = ?';
        params.push(Number(month), Number(year));
      } else {
        sql += " AND strftime('%m',ar.date) = ? AND strftime('%Y',ar.date) = ?";
        params.push(String(month).padStart(2,'0'), String(year));
      }
    }
    sql += ' ORDER BY ar.date DESC, e.name ASC LIMIT 500';
    res.json(await dbAll(sql, params));
  } catch (err) { next(err); }
});

// Daily summary (for manager dashboard)
router.get('/summary', async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const totalActive = await dbGet("SELECT count(*) as cnt FROM employees WHERE company_id = ? AND status = 'Active' AND deleted_at IS NULL", [req.user.companyId]);
    const summary = await dbAll(
      'SELECT status, count(*) as count FROM attendance_records WHERE company_id = ? AND date = ? GROUP BY status',
      [req.user.companyId, date]
    );

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
  } catch (err) { next(err); }
});

// Monthly report per employee
router.get('/report', async (req, res, next) => {
  try {
    const { month, year, employee_id } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });
    const isPg = engine() === 'postgres';

    const joinCond = isPg
      ? 'EXTRACT(MONTH FROM ar.date) = ? AND EXTRACT(YEAR FROM ar.date) = ?'
      : "strftime('%m', ar.date) = ? AND strftime('%Y', ar.date) = ?";
    const joinParams = isPg ? [Number(month), Number(year)] : [String(month).padStart(2, '0'), String(year)];

    let sql = `
      SELECT e.id as employee_id, e.name, e.employee_code, e.avatar,
             COUNT(ar.id) as total_days_marked,
             SUM(CASE WHEN ar.status IN ('present','remote','wfh','on_site') THEN 1 ELSE 0 END) as present_days,
             SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) as absent_days,
             SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) as late_days,
             SUM(CASE WHEN ar.status = 'half_day' THEN 1 ELSE 0 END) as half_days,
             SUM(CASE WHEN ar.status = 'on_leave' THEN 1 ELSE 0 END) as leave_days,
             ROUND(SUM(COALESCE(ar.total_hours, 0))${isPg ? '::numeric' : ''}, 2) as total_hours,
             ROUND(SUM(COALESCE(ar.overtime_hours, 0))${isPg ? '::numeric' : ''}, 2) as overtime_hours
      FROM employees e
      LEFT JOIN attendance_records ar ON ar.employee_id = e.id
        AND ${joinCond}
      WHERE e.company_id = ? AND e.deleted_at IS NULL
    `;
    const params = [...joinParams, req.user.companyId];
    if (employee_id) { sql += ' AND e.id = ?'; params.push(employee_id); }
    sql += ' GROUP BY e.id ORDER BY e.name';
    res.json(await dbAll(sql, params));
  } catch (err) { next(err); }
});

// Clock-in
router.post('/clock-in', async (req, res, next) => {
  try {
    const { employee_id, branch_id, notes } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'employee_id required' });
    const today = new Date().toISOString().split('T')[0];
    const existing = await dbGet('SELECT id, clock_out FROM attendance_records WHERE employee_id = ? AND date = ? AND company_id = ?', [employee_id, today, req.user.companyId]);
    if (existing && !existing.clock_out) return res.status(409).json({ error: 'Employee is already clocked in today' });

    const clockInTime = new Date().toTimeString().split(' ')[0];
    const isLate = clockInTime > '09:30:00'; // configurable later via hr_settings

    const insert = await dbGet(`
      INSERT INTO attendance_records (employee_id, company_id, branch_id, date, clock_in, status, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [employee_id, req.user.companyId, branch_id || null, today, clockInTime, isLate ? 'late' : 'present', notes || null, req.user.userId]);

    res.status(201).json(await dbGet('SELECT * FROM attendance_records WHERE id = ?', [insert.id]));
  } catch (err) { next(err); }
});

// Clock-out
router.post('/clock-out', async (req, res, next) => {
  try {
    const { employee_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const record = await dbGet('SELECT * FROM attendance_records WHERE employee_id = ? AND date = ? AND company_id = ? AND clock_out IS NULL', [employee_id, today, req.user.companyId]);
    if (!record) return res.status(404).json({ error: 'No active clock-in found for today' });

    const clockOut = new Date().toTimeString().split(' ')[0];
    const inParts = record.clock_in.split(':').map(Number);
    const outParts = clockOut.split(':').map(Number);
    const totalHours = Math.round(((outParts[0]*60+outParts[1]) - (inParts[0]*60+inParts[1])) / 60 * 100) / 100;
    const breakHours = 1; // Standard 1hr lunch
    const overtimeHours = Math.max(0, totalHours - breakHours - 8);

    await dbGet(`UPDATE attendance_records SET clock_out = ?, total_hours = ?, break_hours = ?, overtime_hours = ? WHERE id = ?`,
      [clockOut, Math.max(0, totalHours - breakHours), breakHours, overtimeHours, record.id]);

    res.json(await dbGet('SELECT * FROM attendance_records WHERE id = ?', [record.id]));
  } catch (err) { next(err); }
});

// Bulk mark attendance (admin marks for team)
router.post('/mark', async (req, res, next) => {
  try {
    const { date, records } = req.body; // records: [{employee_id, status, notes}]
    if (!date || !Array.isArray(records)) return res.status(400).json({ error: 'date and records array required' });

    // attendance_records has no UNIQUE constraint on (employee_id, date) on
    // either engine -- the original `INSERT ... ON CONFLICT(employee_id,
    // date) DO UPDATE` here always threw ("ON CONFLICT clause does not
    // match any PRIMARY KEY or UNIQUE constraint", confirmed against the
    // live SQLite db), so bulk marking has never actually worked. Rewritten
    // as a per-record select-then-insert-or-update inside the same
    // transaction -- needs no schema constraint on either engine.
    const markOne = async (get, run, r) => {
      const existing = await get('SELECT id FROM attendance_records WHERE employee_id = ? AND date = ? AND company_id = ?', [r.employee_id, date, req.user.companyId]);
      if (existing) {
        await run('UPDATE attendance_records SET status = ?, notes = ? WHERE id = ?', [r.status, r.notes || null, existing.id]);
      } else {
        await run('INSERT INTO attendance_records (employee_id, company_id, date, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)',
          [r.employee_id, req.user.companyId, date, r.status, r.notes || null, req.user.userId]);
      }
    };

    if (engine() === 'postgres') {
      await withTransaction(async (tx) => {
        for (const r of records) await markOne(tx.getOne, tx.query, r);
      });
    } else {
      const db = getDb();
      try {
        db.exec('BEGIN TRANSACTION');
        try {
          const get = async (sql, params) => db.prepare(sql).get(...params) ?? null;
          const run = async (sql, params) => db.prepare(sql).run(...params);
          for (const r of records) await markOne(get, run, r);
          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw e; }
      } finally { db.close(); }
    }

    res.json({ success: true, marked: records.length });
  } catch (err) { next(err); }
});

// Update record
router.put('/:id', async (req, res, next) => {
  try {
    // NOTE: status/notes/clock_in/clock_out are bound as-is (not `?? null`),
    // matching original behavior -- if the caller omits a field, this is
    // the same pre-existing "crashes on undefined" SQLite-only gap already
    // catalogued elsewhere (invitations.js et al.), not fixed here to keep
    // that class tracked consistently rather than patched ad hoc per file.
    const { status, notes, clock_in, clock_out } = req.body;
    await dbGet(`UPDATE attendance_records SET status=COALESCE(?,status), notes=COALESCE(?,notes), clock_in=COALESCE(?,clock_in), clock_out=COALESCE(?,clock_out) WHERE id=? AND company_id=?`,
      [status, notes, clock_in, clock_out, req.params.id, req.user.companyId]);
    res.json(await dbGet('SELECT * FROM attendance_records WHERE id = ?', [req.params.id]));
  } catch (err) { next(err); }
});

module.exports = router;
