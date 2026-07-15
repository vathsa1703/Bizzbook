const express = require('express');
const { getDb } = require('../config/db');

const router = express.Router();

// GET all departments with employee count and head details
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;

    const query = `
      SELECT d.*, 
             e.name as head_name,
             (SELECT COUNT(*) FROM employees WHERE department_id = d.id AND deleted_at IS NULL AND status = 'Active') as employee_count
      FROM departments d
      LEFT JOIN employees e ON d.head_id = e.id
      WHERE d.company_id = ? AND d.deleted_at IS NULL
      ORDER BY d.name ASC
    `;
    
    const departments = db.prepare(query).all(companyId);
    res.json(departments);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET members of a department (Active employees assigned to it)
router.get('/:id/members', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const deptId = req.params.id;

    const dept = db.prepare('SELECT id FROM departments WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(deptId, companyId);
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const members = db.prepare(`
      SELECT id, name, job_title, avatar, status, employee_code, email, manager_id
      FROM employees
      WHERE department_id = ? AND company_id = ? AND deleted_at IS NULL
      ORDER BY name ASC
    `).all(deptId, companyId);

    res.json({ members });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// POST create department
router.post('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { name, code, description, head_id, status = 'Active', color, icon } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const insert = db.prepare(`
      INSERT INTO departments (company_id, name, code, description, head_id, status, color, icon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, name, code || null, description || null, head_id || null, status, color || null, icon || null);

    res.status(201).json({ id: insert.lastInsertRowid, message: 'Department created successfully' });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// PUT update department
router.put('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const deptId = req.params.id;
    const { name, code, description, head_id, status, color, icon } = req.body;

    const existing = db.prepare('SELECT id FROM departments WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(deptId, companyId);
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }

    db.prepare(`
      UPDATE departments
      SET name = COALESCE(?, name),
          code = COALESCE(?, code),
          description = COALESCE(?, description),
          head_id = COALESCE(?, head_id),
          status = COALESCE(?, status),
          color = COALESCE(?, color),
          icon = COALESCE(?, icon)
      WHERE id = ? AND company_id = ?
    `).run(
      name ?? null,
      code ?? null,
      description ?? null,
      head_id ?? null,
      status ?? null,
      color ?? null,
      icon ?? null,
      deptId,
      companyId
    );

    res.json({ message: 'Department updated successfully' });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// DELETE (Archive) department
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const deptId = req.params.id;

    // Check if there are active/inactive employees still in this department
    const employeesExist = db.prepare('SELECT id FROM employees WHERE department_id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1').get(deptId, companyId);
    if (employeesExist) {
      return res.status(400).json({ error: 'Cannot archive department while it still contains employees.' });
    }

    // Soft delete
    db.prepare(`UPDATE departments SET deleted_at = datetime('now'), status = 'Archived' WHERE id = ? AND company_id = ?`).run(deptId, companyId);
    
    res.json({ message: 'Department archived successfully' });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
