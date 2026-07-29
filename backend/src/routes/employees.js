const express = require('express');
const { getDb } = require('../config/db');
const { hashPassword } = require('../services/authService');

const router = express.Router();

// Optional FK columns (department_id, manager_id) must bind as real NULL when
// unset, not '' or undefined -- an empty string satisfies neither `?? null`
// nor a FOREIGN KEY reference, and the frontend's "No Department"/"No Branch"-
// style dropdowns send '' for "nothing selected". `?? null` only catches
// null/undefined, not ''.
function toNullableId(v) {
  if (v === '' || v === undefined || v === null) return null;
  return v;
}

// GET employee analytics (ranking, dept stats, etc.) — scoped to company
router.get('/analytics', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;

    const deptBreakdown = db.prepare(`
      SELECT 
        COALESCE(d.name, e.department) as department, 
        COUNT(*) as count, 
        SUM(e.salary) as total_salary, 
        SUM(e.revenue_generated) as total_revenue
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.company_id = ? AND e.deleted_at IS NULL
      GROUP BY COALESCE(d.name, e.department)
    `).all(companyId);

    const allEmployees = db.prepare(`
      SELECT *, 
        CASE 
          WHEN salary > 0 THEN ROUND(((revenue_generated - salary) / salary) * 100, 1)
          ELSE 0 
        END as roi
      FROM employees
      WHERE company_id = ?
      ORDER BY roi DESC
    `).all(companyId);

    const attendanceStats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN attendance >= 95 THEN 1 END) as excellent,
        COUNT(CASE WHEN attendance >= 90 AND attendance < 95 THEN 1 END) as good,
        COUNT(CASE WHEN attendance < 90 THEN 1 END) as warning,
        AVG(attendance) as average
      FROM employees
      WHERE company_id = ?
    `).get(companyId);

    const roleBreakdown = db.prepare(`
      SELECT COALESCE(u.role, 'No Role') as role, COUNT(*) as count
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.company_id = ? AND e.deleted_at IS NULL
      GROUP BY u.role
    `).all(companyId);

    const empTypeBreakdown = db.prepare(`
      SELECT employment_type, COUNT(*) as count
      FROM employees
      WHERE company_id = ? AND deleted_at IS NULL
      GROUP BY employment_type
    `).all(companyId);

    res.json({
      deptBreakdown,
      rankings: allEmployees,
      attendance: attendanceStats,
      roleBreakdown,
      empTypeBreakdown
    });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET all employees — scoped to company
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const search = req.query.search || '';
    const department = req.query.department || '';

    let query = `
      SELECT e.*,
        u.role,
        COALESCE(d.name, e.department) as department_name,
        m.name as manager_name,
        CASE 
          WHEN e.salary > 0 THEN ROUND(((e.revenue_generated - e.salary) / e.salary) * 100, 1)
          ELSE 0 
        END as roi
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.company_id = ? AND e.deleted_at IS NULL
    `;
    const params = [companyId];

    if (search) {
      query += ` AND (e.name LIKE ? OR e.employee_code LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (department && department !== 'All') {
      query += ` AND e.department = ?`;
      params.push(department);
    }
    if (req.query.status && req.query.status !== 'All') {
      query += ` AND e.status = ?`;
      params.push(req.query.status);
    }

    query += ` ORDER BY e.name ASC`;

    const employees = db.prepare(query).all(...params);
    res.json(employees);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET single employee details — scoped to company
router.get('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const employee = db.prepare(`
      SELECT e.*,
        u.role,
        COALESCE(d.name, e.department) as department_name,
        m.name as manager_name,
        CASE 
          WHEN e.salary > 0 THEN ROUND(((e.revenue_generated - e.salary) / e.salary) * 100, 1)
          ELSE 0 
        END as roi
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.id = ? AND e.company_id = ? AND e.deleted_at IS NULL
    `).get(req.params.id, companyId);

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const sales = db.prepare(`
      SELECT s.*, p.name as product_name, c.name as customer_name
      FROM sales s
      LEFT JOIN products p ON s.product_id = p.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.employee_id = ? AND s.company_id = ?
      ORDER BY s.sale_date DESC
    `).all(req.params.id, companyId);

    res.json({ ...employee, sales });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET single employee profile data — scoped to company
router.get('/:id/profile', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const empId = req.params.id;

    // 1. Employee basic data + manager name + department name + user data
    const employee = db.prepare(`
      SELECT e.*,
        u.role,
        u.email as login_email,
        u.created_at as account_created,
        u.status as account_status,
        COALESCE(d.name, e.department) as department_name,
        m.name as manager_name
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees m ON e.manager_id = m.id
      WHERE e.id = ? AND e.company_id = ? AND e.deleted_at IS NULL
    `).get(empId, companyId);

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // 2. Direct Reports
    const directReports = db.prepare(`
      SELECT id, name, job_title, avatar
      FROM employees
      WHERE manager_id = ? AND company_id = ? AND deleted_at IS NULL
    `).all(empId, companyId);

    // 3. Quick Stats (Sales, Customers, Products)
    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM sales WHERE employee_id = ? AND company_id = ?) as sales_created,
        (SELECT COUNT(*) FROM sales s JOIN invoice_items ii ON s.invoice_id = ii.invoice_id WHERE s.employee_id = ? AND s.company_id = ?) as products_managed,
        0 as customers_added -- Placeholder for future if customers are linked to employees
    `).get(empId, companyId, empId, companyId);

    // 4. Recent Activity Timeline (Sales)
    const activity = db.prepare(`
      SELECT 'sale' as type, s.sale_date as date, p.name as detail, s.revenue as amount
      FROM sales s
      LEFT JOIN products p ON s.product_id = p.id
      WHERE s.employee_id = ? AND s.company_id = ?
      ORDER BY s.sale_date DESC
      LIMIT 10
    `).all(empId, companyId);

    res.json({
      employee,
      directReports,
      stats,
      activity
    });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// POST create employee — stamped with company_id
router.post('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { 
      name, department, department_id, employment_type = 'Full Time', manager_id,
      salary, joining_date, performance_rating = 3.0, attendance = 95,
      avatar = null, phone = null, email = null, emergency_contact = null, job_title = null, status = 'Active',
      qualification = null,
      emergency_contact_name = null, emergency_contact_relation = null, emergency_contact_phone = null,
      employee_code: requestedEmployeeCode = null
    } = req.body;

    if (!name || (!department && !department_id) || salary === undefined || !joining_date) {
      return res.status(400).json({ error: 'Missing required employee fields' });
    }

    if (!emergency_contact_name || !String(emergency_contact_name).trim() ||
        !emergency_contact_phone || !String(emergency_contact_phone).trim()) {
      return res.status(400).json({ error: 'Emergency contact name and phone are required' });
    }

    // Custom Employee ID: optional. If provided, it must be unique within the
    // company (case-sensitive match — a LOWER() comparison would be a stricter
    // uniqueness rule, e.g. rejecting "EMP001" alongside "emp001", but the
    // simple exact-match check below is what was requested). Falls back to the
    // existing auto-generation (MAX(id)+1) when omitted, unchanged from before.
    let employee_code;
    if (requestedEmployeeCode && String(requestedEmployeeCode).trim()) {
      employee_code = String(requestedEmployeeCode).trim();
      const codeTaken = db.prepare(
        'SELECT id FROM employees WHERE company_id = ? AND employee_code = ?'
      ).get(companyId, employee_code);
      if (codeTaken) {
        return res.status(409).json({ error: 'Employee ID already in use' });
      }
    } else {
      // Auto-generate employee code based on max ID
      const maxEmp = db.prepare('SELECT MAX(id) as maxId FROM employees').get();
      const nextId = (maxEmp.maxId || 0) + 1;
      employee_code = `EMP${String(nextId).padStart(5, '0')}`;
    }

    const resInsert = db.prepare(`
      INSERT INTO employees (
        name, department, department_id, employment_type, manager_id,
        salary, revenue_generated, joining_date, 
        performance_rating, attendance, status, company_id,
        employee_code, avatar, phone, email, emergency_contact, job_title,
        qualification, emergency_contact_name, emergency_contact_relation, emergency_contact_phone
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, department || '', toNullableId(department_id), employment_type, toNullableId(manager_id),
      salary, joining_date,
      performance_rating, attendance, status, companyId,
      employee_code, avatar, phone, email, emergency_contact, job_title,
      qualification, emergency_contact_name, emergency_contact_relation, emergency_contact_phone
    );

    res.status(201).json({ id: resInsert.lastInsertRowid, employee_code, name, department, salary, joining_date });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// PUT update employee — scoped to company
router.put('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { 
      name, department, department_id, employment_type, manager_id,
      salary, joining_date, performance_rating, attendance, status,
      avatar, phone, email, emergency_contact, job_title,
      qualification, emergency_contact_name, emergency_contact_relation, emergency_contact_phone
    } = req.body;
    const empId = req.params.id;

    const existing = db.prepare('SELECT id, user_id, status FROM employees WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(empId, companyId);
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (manager_id) {
      if (parseInt(manager_id, 10) === parseInt(empId, 10)) {
        return res.status(400).json({ error: 'Employee cannot report to themselves' });
      }
      // Check for circular reporting
      let currentManager = manager_id;
      let depth = 0;
      while (currentManager && depth < 20) {
        if (parseInt(currentManager, 10) === parseInt(empId, 10)) {
          return res.status(400).json({ error: 'Circular reporting detected' });
        }
        const nextManager = db.prepare('SELECT manager_id FROM employees WHERE id = ?').get(currentManager);
        currentManager = nextManager ? nextManager.manager_id : null;
        depth++;
      }
    }

    db.prepare(`
      UPDATE employees
      SET name = COALESCE(?, name),
          department = COALESCE(?, department),
          department_id = COALESCE(?, department_id),
          employment_type = COALESCE(?, employment_type),
          manager_id = COALESCE(?, manager_id),
          salary = COALESCE(?, salary),
          joining_date = COALESCE(?, joining_date),
          performance_rating = COALESCE(?, performance_rating),
          attendance = COALESCE(?, attendance),
          status = COALESCE(?, status),
          avatar = COALESCE(?, avatar),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          emergency_contact = COALESCE(?, emergency_contact),
          job_title = COALESCE(?, job_title),
          qualification = COALESCE(?, qualification),
          emergency_contact_name = COALESCE(?, emergency_contact_name),
          emergency_contact_relation = COALESCE(?, emergency_contact_relation),
          emergency_contact_phone = COALESCE(?, emergency_contact_phone)
      WHERE id = ? AND company_id = ?
    `).run(
      name ?? null,
      department ?? null,
      toNullableId(department_id),
      employment_type ?? null,
      toNullableId(manager_id),
      salary ?? null,
      joining_date ?? null,
      performance_rating ?? null,
      attendance ?? null,
      status ?? null,
      avatar ?? null,
      phone ?? null,
      email ?? null,
      emergency_contact ?? null,
      job_title ?? null,
      qualification ?? null,
      emergency_contact_name ?? null,
      emergency_contact_relation ?? null,
      emergency_contact_phone ?? null,
      empId,
      companyId,
    );

    // If status changed to Terminated and employee has a user account, revoke access
    if (status === 'Terminated' && existing.user_id && existing.status !== 'Terminated') {
      db.prepare(`UPDATE users SET status = 'Inactive' WHERE id = ?`).run(existing.user_id);
    }

    res.json({ message: 'Employee updated successfully' });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// DELETE employee — scoped to company
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const empId = req.params.id;

    // Check if sales are assigned
    const salesExist = db.prepare('SELECT id FROM sales WHERE employee_id = ? AND company_id = ? LIMIT 1').get(empId, companyId);
    if (salesExist) {
      return res.status(400).json({ error: 'Cannot delete employee with assigned sales transactions.' });
    }

    // Soft delete: keep historical links (sales, invoices) but mark as deleted
    const resDelete = db.prepare('UPDATE employees SET deleted_at = datetime(\'now\') WHERE id = ? AND company_id = ?').run(empId, companyId);
    if (resDelete.changes === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Terminate user access if linked
    const existing = db.prepare('SELECT user_id FROM employees WHERE id = ? AND company_id = ?').get(empId, companyId);
    if (existing && existing.user_id) {
       db.prepare(`UPDATE users SET status = 'Inactive' WHERE id = ?`).run(existing.user_id);
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// POST create login for employee
router.post('/:id/login', async (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const empId = req.params.id;
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required' });
    }
    
    // Ensure the employee belongs to the company
    const emp = db.prepare('SELECT name FROM employees WHERE id = ? AND company_id = ?').get(empId, companyId);
    if (!emp) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Check if email already in use
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await hashPassword(password);

    const resInsert = db.prepare(`
      INSERT INTO users (company_id, name, email, password_hash, role, status)
      VALUES (?, ?, ?, ?, ?, 'Active')
    `).run(companyId, emp.name, email, hashedPassword, role);

    const userId = resInsert.lastInsertRowid;

    // Link user back to employee
    db.prepare('UPDATE employees SET user_id = ?, email = ? WHERE id = ?').run(userId, email, empId);

    res.status(201).json({ message: 'Login created successfully', userId });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
