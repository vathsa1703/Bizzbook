const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');

// ── Salary Structure ───────────────────────────────────────────────────────────

router.get('/salary/:employeeId', (req, res, next) => {
  const db = getDb();
  try {
    const salary = db.prepare(`
      SELECT * FROM employee_salaries 
      WHERE employee_id = ? AND company_id = ?
      ORDER BY effective_from DESC LIMIT 1
    `).get(req.params.employeeId, req.user.companyId);
    res.json(salary || null);
  } catch (err) { next(err); } finally { db.close(); }
});

router.put('/salary/:employeeId', (req, res, next) => {
  const db = getDb();
  try {
    const { basic = 0, hra = 0, da = 0, medical = 0, travel = 0, bonus = 0,
            overtime = 0, incentives = 0, pf_employee = 0, pf_employer = 0,
            esi_employee = 0, esi_employer = 0, professional_tax = 0, tds = 0,
            other_deductions = 0, effective_from } = req.body;

    const gross_salary = basic + hra + da + medical + travel + bonus + overtime + incentives;
    const total_deductions = pf_employee + esi_employee + professional_tax + tds + other_deductions;
    const net_salary = gross_salary - total_deductions;

    const info = db.prepare(`
      INSERT INTO employee_salaries 
        (employee_id, company_id, effective_from, basic, hra, da, medical, travel, bonus, overtime, incentives,
         pf_employee, pf_employer, esi_employee, esi_employer, professional_tax, tds, other_deductions,
         gross_salary, net_salary, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.employeeId, req.user.companyId, effective_from || new Date().toISOString().split('T')[0],
      basic, hra, da, medical, travel, bonus, overtime, incentives,
      pf_employee, pf_employer, esi_employee, esi_employer, professional_tax, tds, other_deductions,
      gross_salary, net_salary, req.user.userId);

    // Also update the main salary field on employees table
    db.prepare('UPDATE employees SET salary = ? WHERE id = ? AND company_id = ?').run(net_salary, req.params.employeeId, req.user.companyId);

    res.status(201).json(db.prepare('SELECT * FROM employee_salaries WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) { next(err); } finally { db.close(); }
});

// ── Payroll Runs ───────────────────────────────────────────────────────────────

router.get('/runs', (req, res, next) => {
  const db = getDb();
  try {
    const runs = db.prepare(`
      SELECT pr.*, b.name as branch_name, u.name as processed_by_name
      FROM payroll_runs pr
      LEFT JOIN branches b ON pr.branch_id = b.id
      LEFT JOIN users u ON pr.processed_by = u.id
      WHERE pr.company_id = ?
      ORDER BY pr.year DESC, pr.month DESC
    `).all(req.user.companyId);
    res.json(runs);
  } catch (err) { next(err); } finally { db.close(); }
});

router.post('/runs', (req, res, next) => {
  const db = getDb();
  try {
    const { month, year, branch_id } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'month and year required' });

    // Check no existing draft/processed run for same period
    const existing = db.prepare("SELECT id FROM payroll_runs WHERE company_id = ? AND month = ? AND year = ? AND branch_id IS ? AND status NOT IN ('cancelled')").get(req.user.companyId, month, year, branch_id || null);
    if (existing) return res.status(409).json({ error: 'A payroll run already exists for this period' });

    // Get all employees with salary structures
    let empSql = `
      SELECT e.id, e.name, e.employee_code, es.basic, es.hra, es.da, es.medical, es.travel,
             es.bonus, es.overtime, es.incentives, es.pf_employee, es.esi_employee, 
             es.professional_tax, es.tds, es.other_deductions, es.gross_salary, es.net_salary
      FROM employees e
      LEFT JOIN employee_salaries es ON es.id = (
        SELECT id FROM employee_salaries WHERE employee_id = e.id ORDER BY effective_from DESC LIMIT 1
      )
      WHERE e.company_id = ? AND e.status = 'Active' AND e.deleted_at IS NULL
    `;
    const empParams = [req.user.companyId];
    if (branch_id) { empSql += ' AND e.branch_id = ?'; empParams.push(branch_id); }
    const employees = db.prepare(empSql).all(...empParams);

    if (employees.length === 0) return res.status(400).json({ error: 'No active employees found for this payroll run' });

    // Get attendance for the month for each employee
    const monthStr = String(month).padStart(2, '0');
    const yearStr = String(year);

    db.exec('BEGIN TRANSACTION');
    try {
      const runInfo = db.prepare(`
        INSERT INTO payroll_runs (company_id, branch_id, month, year, status, total_employees, processed_by)
        VALUES (?, ?, ?, ?, 'draft', ?, ?)
      `).run(req.user.companyId, branch_id || null, month, year, employees.length, req.user.userId);
      const runId = runInfo.lastInsertRowid;

      let totalGross = 0, totalDeductions = 0, totalNet = 0;
      const insertSlip = db.prepare(`
        INSERT INTO payroll_slips (payroll_run_id, employee_id, company_id, month, year, basic, hra, da, medical, travel,
          bonus, overtime, incentives, gross_salary, pf_employee, esi_employee, professional_tax, tds, other_deductions,
          net_salary, working_days, present_days, lop_days, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
      `);

      for (const emp of employees) {
        // Get attendance summary for this employee this month
        const attSummary = db.prepare(`
          SELECT
            COUNT(*) as marked_days,
            SUM(CASE WHEN status IN ('present','remote','wfh','on_site') THEN 1 ELSE 0 END) as present_days,
            SUM(CASE WHEN status = 'half_day' THEN 0.5 ELSE 0 END) as half_days
          FROM attendance_records
          WHERE employee_id = ? AND company_id = ?
            AND strftime('%m', date) = ? AND strftime('%Y', date) = ?
        `).get(emp.id, req.user.companyId, monthStr, yearStr);

        const workingDays = 26; // Standard assumption
        const presentDays = (attSummary?.present_days || 0) + (attSummary?.half_days || 0);
        const lopDays = Math.max(0, workingDays - presentDays);

        // LOP adjustment
        const lopFactor = lopDays > 0 ? (workingDays - lopDays) / workingDays : 1;
        const adjGross = Math.round((emp.gross_salary || 0) * lopFactor);
        const adjNet = Math.round((emp.net_salary || 0) * lopFactor);
        const deductions = (emp.pf_employee || 0) + (emp.esi_employee || 0) + (emp.professional_tax || 0) + (emp.tds || 0) + (emp.other_deductions || 0);

        insertSlip.run(runId, emp.id, req.user.companyId, month, year,
          emp.basic || 0, emp.hra || 0, emp.da || 0, emp.medical || 0, emp.travel || 0,
          emp.bonus || 0, emp.overtime || 0, emp.incentives || 0,
          adjGross, emp.pf_employee || 0, emp.esi_employee || 0, emp.professional_tax || 0,
          emp.tds || 0, emp.other_deductions || 0, adjNet,
          workingDays, presentDays, lopDays);

        totalGross += adjGross;
        totalDeductions += deductions;
        totalNet += adjNet;
      }

      db.prepare('UPDATE payroll_runs SET total_gross = ?, total_deductions = ?, total_net = ?, status = "processed" WHERE id = ?')
        .run(totalGross, totalDeductions, totalNet, runId);

      db.exec('COMMIT');
      res.status(201).json(db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(runId));
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } catch (err) { next(err); } finally { db.close(); }
});

router.get('/runs/:id', (req, res, next) => {
  const db = getDb();
  try {
    const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!run) return res.status(404).json({ error: 'Payroll run not found' });
    const slips = db.prepare(`
      SELECT ps.*, e.name as employee_name, e.employee_code, e.job_title
      FROM payroll_slips ps JOIN employees e ON ps.employee_id = e.id
      WHERE ps.payroll_run_id = ?
    `).all(req.params.id);
    res.json({ ...run, slips });
  } catch (err) { next(err); } finally { db.close(); }
});

router.put('/runs/:id/approve', (req, res, next) => {
  const db = getDb();
  try {
    db.prepare("UPDATE payroll_runs SET status = 'approved' WHERE id = ? AND company_id = ?").run(req.params.id, req.user.companyId);
    res.json({ success: true });
  } catch (err) { next(err); } finally { db.close(); }
});

router.put('/runs/:id/pay', (req, res, next) => {
  const db = getDb();
  try {
    db.prepare("UPDATE payroll_runs SET status = 'paid' WHERE id = ? AND company_id = ?").run(req.params.id, req.user.companyId);
    db.prepare("UPDATE payroll_slips SET status = 'paid', paid_at = datetime('now') WHERE payroll_run_id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); } finally { db.close(); }
});

// Salary slip history for an employee
router.get('/slips/:employeeId', (req, res, next) => {
  const db = getDb();
  try {
    const slips = db.prepare(`
      SELECT ps.*, pr.status as run_status
      FROM payroll_slips ps JOIN payroll_runs pr ON ps.payroll_run_id = pr.id
      WHERE ps.employee_id = ? AND ps.company_id = ?
      ORDER BY ps.year DESC, ps.month DESC
    `).all(req.params.employeeId, req.user.companyId);
    res.json(slips);
  } catch (err) { next(err); } finally { db.close(); }
});

module.exports = router;
