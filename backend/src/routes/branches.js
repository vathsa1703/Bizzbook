const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { dbGet, dbAll } = require('../config/dbEngine');

// List branches
router.get('/', requirePermission('branches.view'), async (req, res, next) => {
  try {
    const branches = await dbAll('SELECT * FROM branches WHERE company_id = ?', [req.user.companyId]);
    res.json(branches);
  } catch (err) {
    next(err);
  }
});

// Create branch
router.post('/', requirePermission('branches.manage'), async (req, res, next) => {
  try {
    const { name, code, location, address, phone, gstin, is_hq } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Branch name is required' });
    }

    const info = await dbGet(`
      INSERT INTO branches (company_id, name, code, location, address, phone, gstin, is_hq)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `, [req.user.companyId, name, code, location, address, phone, gstin, is_hq ? 1 : 0]);

    const newBranch = await dbGet('SELECT * FROM branches WHERE id = ?', [info.id]);
    res.status(201).json(newBranch);
  } catch (err) {
    next(err);
  }
});

// Update branch
router.put('/:id', requirePermission('branches.manage'), async (req, res, next) => {
  try {
    const { name, code, location, address, phone, gstin, is_hq, status } = req.body;
    const branchId = req.params.id;

    const branch = await dbGet('SELECT id FROM branches WHERE id = ? AND company_id = ?', [branchId, req.user.companyId]);
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    await dbGet(`
      UPDATE branches
      SET name = COALESCE(?, name),
          code = COALESCE(?, code),
          location = COALESCE(?, location),
          address = COALESCE(?, address),
          phone = COALESCE(?, phone),
          gstin = COALESCE(?, gstin),
          is_hq = COALESCE(?, is_hq),
          status = COALESCE(?, status)
      WHERE id = ? AND company_id = ?
    `, [name, code, location, address, phone, gstin, is_hq !== undefined ? (is_hq ? 1 : 0) : null, status, branchId, req.user.companyId]);

    const updatedBranch = await dbGet('SELECT * FROM branches WHERE id = ?', [branchId]);
    res.json(updatedBranch);
  } catch (err) {
    next(err);
  }
});

// Delete branch
router.delete('/:id', requirePermission('branches.manage'), async (req, res, next) => {
  try {
    const branchId = req.params.id;

    const branch = await dbGet('SELECT id FROM branches WHERE id = ? AND company_id = ?', [branchId, req.user.companyId]);
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Check if employees or departments are assigned to this branch
    const emps = await dbGet('SELECT count(*) as count FROM employees WHERE branch_id = ? AND deleted_at IS NULL', [branchId]);
    if (Number(emps.count) > 0) {
      return res.status(400).json({ error: 'Cannot delete branch: There are active employees assigned to it.' });
    }
    const depts = await dbGet('SELECT count(*) as count FROM departments WHERE branch_id = ? AND deleted_at IS NULL', [branchId]);
    if (Number(depts.count) > 0) {
      return res.status(400).json({ error: 'Cannot delete branch: There are active departments assigned to it.' });
    }

    await dbGet("UPDATE branches SET status = 'Deleted' WHERE id = ?", [branchId]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
