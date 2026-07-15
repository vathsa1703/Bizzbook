const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { requirePermission } = require('../middleware/auth');

// List branches
router.get('/', requirePermission('branches.view'), (req, res, next) => {
  const db = getDb();
  try {
    const branches = db.prepare('SELECT * FROM branches WHERE company_id = ?').all(req.user.companyId);
    res.json(branches);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// Create branch
router.post('/', requirePermission('branches.manage'), (req, res, next) => {
  const db = getDb();
  try {
    const { name, code, location, address, phone, gstin, is_hq } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Branch name is required' });
    }

    const info = db.prepare(`
      INSERT INTO branches (company_id, name, code, location, address, phone, gstin, is_hq)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.companyId, name, code, location, address, phone, gstin, is_hq ? 1 : 0);

    const newBranch = db.prepare('SELECT * FROM branches WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(newBranch);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// Update branch
router.put('/:id', requirePermission('branches.manage'), (req, res, next) => {
  const db = getDb();
  try {
    const { name, code, location, address, phone, gstin, is_hq, status } = req.body;
    const branchId = req.params.id;

    const branch = db.prepare('SELECT id FROM branches WHERE id = ? AND company_id = ?').get(branchId, req.user.companyId);
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    db.prepare(`
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
    `).run(name, code, location, address, phone, gstin, is_hq !== undefined ? (is_hq ? 1 : 0) : null, status, branchId, req.user.companyId);

    const updatedBranch = db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId);
    res.json(updatedBranch);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// Delete branch
router.delete('/:id', requirePermission('branches.manage'), (req, res, next) => {
  const db = getDb();
  try {
    const branchId = req.params.id;

    const branch = db.prepare('SELECT id FROM branches WHERE id = ? AND company_id = ?').get(branchId, req.user.companyId);
    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Check if employees or departments are assigned to this branch
    const emps = db.prepare('SELECT count(*) as count FROM employees WHERE branch_id = ? AND deleted_at IS NULL').get(branchId);
    if (emps.count > 0) {
      return res.status(400).json({ error: 'Cannot delete branch: There are active employees assigned to it.' });
    }
    const depts = db.prepare('SELECT count(*) as count FROM departments WHERE branch_id = ? AND deleted_at IS NULL').get(branchId);
    if (depts.count > 0) {
      return res.status(400).json({ error: 'Cannot delete branch: There are active departments assigned to it.' });
    }

    db.prepare("UPDATE branches SET status = 'Deleted' WHERE id = ?").run(branchId);
    res.status(204).end();
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
