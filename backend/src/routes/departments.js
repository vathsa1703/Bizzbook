const express = require('express');
const { dbGet, dbAll } = require('../config/dbEngine');

const router = express.Router();

// GET all departments with employee count and head details
router.get('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;

    const departments = await dbAll(`
      SELECT d.*,
             e.name as head_name,
             (SELECT COUNT(*) FROM employees WHERE department_id = d.id AND deleted_at IS NULL AND status = 'Active') as employee_count
      FROM departments d
      LEFT JOIN employees e ON d.head_id = e.id
      WHERE d.company_id = ? AND d.deleted_at IS NULL
      ORDER BY d.name ASC
    `, [companyId]);
    res.json(departments);
  } catch (err) {
    next(err);
  }
});

// GET members of a department (Active employees assigned to it)
router.get('/:id/members', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const deptId = req.params.id;

    const dept = await dbGet('SELECT id FROM departments WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [deptId, companyId]);
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const members = await dbAll(`
      SELECT id, name, job_title, avatar, status, employee_code, email, manager_id
      FROM employees
      WHERE department_id = ? AND company_id = ? AND deleted_at IS NULL
      ORDER BY name ASC
    `, [deptId, companyId]);

    res.json({ members });
  } catch (err) {
    next(err);
  }
});

// POST create department
router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { name, code, description, head_id, status = 'Active', color, icon } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const insert = await dbGet(`
      INSERT INTO departments (company_id, name, code, description, head_id, status, color, icon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [companyId, name, code || null, description || null, head_id || null, status, color || null, icon || null]);

    res.status(201).json({ id: insert.id, message: 'Department created successfully' });
  } catch (err) {
    next(err);
  }
});

// PUT update department
router.put('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const deptId = req.params.id;
    const { name, code, description, head_id, status, color, icon } = req.body;

    const existing = await dbGet('SELECT id FROM departments WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [deptId, companyId]);
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }

    await dbGet(`
      UPDATE departments
      SET name = COALESCE(?, name),
          code = COALESCE(?, code),
          description = COALESCE(?, description),
          head_id = COALESCE(?, head_id),
          status = COALESCE(?, status),
          color = COALESCE(?, color),
          icon = COALESCE(?, icon)
      WHERE id = ? AND company_id = ?
    `, [
      name ?? null,
      code ?? null,
      description ?? null,
      head_id ?? null,
      status ?? null,
      color ?? null,
      icon ?? null,
      deptId,
      companyId
    ]);

    res.json({ message: 'Department updated successfully' });
  } catch (err) {
    next(err);
  }
});

// DELETE (Archive) department
router.delete('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const deptId = req.params.id;

    // Check if there are active/inactive employees still in this department
    const employeesExist = await dbGet('SELECT id FROM employees WHERE department_id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1', [deptId, companyId]);
    if (employeesExist) {
      return res.status(400).json({ error: 'Cannot archive department while it still contains employees.' });
    }

    // Soft delete
    const nowExpr = 'now()';
    await dbGet(`UPDATE departments SET deleted_at = ${nowExpr}, status = 'Archived' WHERE id = ? AND company_id = ?`, [deptId, companyId]);

    res.json({ message: 'Department archived successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
