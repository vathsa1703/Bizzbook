// ============================================================================
// Organization Chart & Reporting Hierarchy API
// Mounted at /api/org (auth + branchAuth + rbac applied globally in app.js).
//
// The reporting hierarchy is NOT a new model — it is derived entirely from the
// existing employees.manager_id column. Changing a manager is done through the
// existing PUT /api/employees/:id (which already prevents self-managing and
// circular reporting). This route only READS and shapes that data into a tree
// and reporting chains. Everything is scoped to req.user.companyId.
// ============================================================================
const express = require('express');
const { getDb } = require('../config/db');

const router = express.Router();

// Load every active employee for the company as flat rows, enriched with the
// display fields the org chart needs (department, branch, team count, reports).
function loadEmployees(db, companyId) {
  return db.prepare(`
    SELECT e.id, e.name, e.job_title, e.status, e.avatar, e.manager_id,
           e.department_id, e.employment_type, e.user_id,
           COALESCE(d.name, e.department) AS department,
           d.color AS department_color,
           (SELECT b.name FROM user_branches ub JOIN branches b ON b.id = ub.branch_id
              WHERE ub.user_id = e.user_id ORDER BY ub.is_default DESC, ub.id ASC LIMIT 1) AS branch,
           (SELECT COUNT(*) FROM team_members tm WHERE tm.employee_id = e.id) AS team_count,
           (SELECT COUNT(*) FROM employees s WHERE s.manager_id = e.id AND s.deleted_at IS NULL) AS direct_reports
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    WHERE e.company_id = ? AND e.deleted_at IS NULL
    ORDER BY e.name ASC
  `).all(companyId);
}

// GET /api/org/chart — the full reporting tree.
// Roots = employees with no manager (or a manager outside the company). If the
// company OWNER has an employee record, unrooted employees are placed under it
// (per spec: "if employee has no manager, place under Company Owner"); otherwise
// they are returned as top-level roots.
router.get('/chart', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const rows = loadEmployees(db, companyId);

    const byId = new Map();
    for (const r of rows) byId.set(r.id, { ...r, children: [] });

    // Identify the owner's employee record, if any, to anchor orphans.
    const company = db.prepare('SELECT owner_user_id FROM companies WHERE id = ?').get(companyId);
    let ownerEmpId = null;
    if (company && company.owner_user_id) {
      const ownerEmp = rows.find(r => r.user_id === company.owner_user_id);
      if (ownerEmp) ownerEmpId = ownerEmp.id;
    }

    const roots = [];
    for (const node of byId.values()) {
      const mgr = node.manager_id ? byId.get(node.manager_id) : null;
      if (mgr && mgr.id !== node.id) {
        mgr.children.push(node);
      } else if (ownerEmpId && node.id !== ownerEmpId) {
        // Unmanaged employee — anchor under the company owner.
        byId.get(ownerEmpId).children.push(node);
      } else {
        roots.push(node);
      }
    }

    res.json({ roots, total: rows.length, ownerEmployeeId: ownerEmpId });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET /api/org/:id/chain — reporting chain (ancestors up to a root) + direct
// reports for one employee. Powers "highlight reporting chain" and the profile.
router.get('/:id/chain', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const empId = Number(req.params.id);

    const get = db.prepare('SELECT id, name, job_title, avatar, manager_id, status FROM employees WHERE id = ? AND company_id = ? AND deleted_at IS NULL');
    const self = get.get(empId, companyId);
    if (!self) return res.status(404).json({ error: 'Employee not found' });

    // Walk up manager_id (cap depth to stay safe even if legacy data is cyclic).
    const managers = [];
    const seen = new Set([empId]);
    let cursor = self.manager_id;
    let depth = 0;
    while (cursor && depth < 50 && !seen.has(cursor)) {
      const m = get.get(cursor, companyId);
      if (!m) break;
      managers.unshift(m); // top-most first
      seen.add(m.id);
      cursor = m.manager_id;
      depth++;
    }

    const subordinates = db.prepare(
      'SELECT id, name, job_title, avatar, status FROM employees WHERE manager_id = ? AND company_id = ? AND deleted_at IS NULL ORDER BY name ASC'
    ).all(empId, companyId);

    const chainIds = [...managers.map(m => m.id), empId];
    res.json({ employee: self, managers, subordinates, reportingChainIds: chainIds });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
