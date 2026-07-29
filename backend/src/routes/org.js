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
const { dbGet, dbAll } = require('../config/dbEngine');

const router = express.Router();

// Load every active employee for the company as flat rows, enriched with the
// display fields the org chart needs (department, branch, team count, reports).
async function loadEmployees(companyId) {
  return dbAll(`
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
  `, [companyId]);
}

// GET /api/org/chart — the full reporting tree.
// Roots = employees with no manager (or a manager outside the company). If the
// company OWNER has an employee record, unrooted employees are placed under it
// (per spec: "if employee has no manager, place under Company Owner"); otherwise
// they are returned as top-level roots.
router.get('/chart', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const rows = await loadEmployees(companyId);

    const byId = new Map();
    for (const r of rows) byId.set(r.id, { ...r, children: [] });

    // Identify the owner's employee record, if any, to anchor orphans.
    const company = await dbGet('SELECT owner_user_id FROM companies WHERE id = ?', [companyId]);
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
  }
});

// GET /api/org/:id/chain — reporting chain (ancestors up to a root) + direct
// reports for one employee. Powers "highlight reporting chain" and the profile.
router.get('/:id/chain', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const empId = Number(req.params.id);

    const getEmp = (id) => dbGet('SELECT id, name, job_title, avatar, manager_id, status FROM employees WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [id, companyId]);
    const self = await getEmp(empId);
    if (!self) return res.status(404).json({ error: 'Employee not found' });

    // Walk up manager_id (cap depth to stay safe even if legacy data is cyclic).
    const managers = [];
    const seen = new Set([empId]);
    let cursor = self.manager_id;
    let depth = 0;
    while (cursor && depth < 50 && !seen.has(cursor)) {
      const m = await getEmp(cursor);
      if (!m) break;
      managers.unshift(m); // top-most first
      seen.add(m.id);
      cursor = m.manager_id;
      depth++;
    }

    const subordinates = await dbAll(
      'SELECT id, name, job_title, avatar, status FROM employees WHERE manager_id = ? AND company_id = ? AND deleted_at IS NULL ORDER BY name ASC',
      [empId, companyId]
    );

    const chainIds = [...managers.map(m => m.id), empId];
    res.json({ employee: self, managers, subordinates, reportingChainIds: chainIds });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
