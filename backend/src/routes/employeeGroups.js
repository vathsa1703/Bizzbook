// ============================================================================
// Employee Groups API — mounted at /api/employee-groups.
// Groups are DYNAMIC, ad-hoc collections (Project Alpha, Night Shift, Festival
// Team...). They are NOT departments and NOT reporting hierarchy — an employee
// may belong to many groups. Scoped to req.user.companyId; writes require
// OWNER/MANAGER/admin. Additive; mirrors the teams route conventions.
// ============================================================================
const express = require('express');
const { dbGet, dbAll } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

const router = express.Router();

const canManage = (req) => ['admin', 'OWNER', 'MANAGER'].includes(req.user.role);

// Resolve to the subset of ids that are real, non-deleted employees in this
// company. `all` is a (sql, params) => rows function -- dbAll for a plain
// connection, or a transaction's tx.getAll -- so this one helper works both
// inside and outside a transaction without ever opening its own connection.
async function validEmployeeIds(all, companyId, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await all(
    `SELECT id FROM employees WHERE company_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
    [companyId, ...ids]
  );
  return rows.map(r => r.id);
}

// GET /api/employee-groups?q=  — list, with optional name/description search.
router.get('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const q = (req.query.q || '').trim();
    let sql = `
      SELECT g.*, (SELECT COUNT(*) FROM employee_group_members m WHERE m.group_id = g.id) AS member_count
      FROM employee_groups g
      WHERE g.company_id = ? AND g.deleted_at IS NULL`;
    const params = [companyId];
    if (q) { sql += ' AND (g.name LIKE ? OR g.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY g.name ASC';
    res.json({ groups: await dbAll(sql, params) });
  } catch (err) { next(err); }
});

// GET /api/employee-groups/:id — group detail with members.
router.get('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const group = await dbGet('SELECT * FROM employee_groups WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [req.params.id, companyId]);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const members = await dbAll(`
      SELECT m.id AS membership_id, m.added_at, e.id, e.name, e.job_title, e.avatar, e.status, e.employee_code
      FROM employee_group_members m
      JOIN employees e ON e.id = m.employee_id
      WHERE m.group_id = ? AND e.deleted_at IS NULL
      ORDER BY e.name ASC
    `, [group.id]);
    res.json({ group, members });
  } catch (err) { next(err); }
});

// POST /api/employee-groups — create.
router.post('/', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const { name, description, color, avatar, group_type, branch_id, member_ids } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Group name is required' });

    const groupId = await withTransaction(async (tx) => {
      const row = await tx.getOne(`
        INSERT INTO employee_groups (company_id, branch_id, name, description, color, avatar, group_type, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
      `, [companyId, branch_id || null, name, description || null, color || null, avatar || null, group_type || 'custom', req.user.userId]);
      const ids = await validEmployeeIds(tx.getAll, companyId, member_ids || []);
      for (const eid of ids) {
        await tx.query('INSERT INTO employee_group_members (group_id, employee_id) VALUES (?, ?) ON CONFLICT (group_id, employee_id) DO NOTHING', [row.id, eid]);
      }
      return row.id;
    });

    res.status(201).json({ id: groupId, message: 'Group created successfully' });
  } catch (err) { next(err); }
});

// PUT /api/employee-groups/:id — update.
router.put('/:id', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const { name, description, color, avatar, group_type, status } = req.body || {};
    const existing = await dbGet('SELECT id FROM employee_groups WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [req.params.id, companyId]);
    if (!existing) return res.status(404).json({ error: 'Group not found' });
    await dbGet(`
      UPDATE employee_groups SET name = COALESCE(?, name), description = COALESCE(?, description),
        color = COALESCE(?, color), avatar = COALESCE(?, avatar),
        group_type = COALESCE(?, group_type), status = COALESCE(?, status)
      WHERE id = ? AND company_id = ?
    `, [name ?? null, description ?? null, color ?? null, avatar ?? null, group_type ?? null, status ?? null, req.params.id, companyId]);
    res.json({ message: 'Group updated successfully' });
  } catch (err) { next(err); }
});

// DELETE /api/employee-groups/:id — soft delete.
router.delete('/:id', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const nowExpr = 'now()';
    const r = await dbGet(`UPDATE employee_groups SET deleted_at = ${nowExpr}, status = 'Archived' WHERE id = ? AND company_id = ? AND deleted_at IS NULL RETURNING id`, [req.params.id, companyId]);
    if (!r) return res.status(404).json({ error: 'Group not found' });
    res.json({ message: 'Group archived successfully' });
  } catch (err) { next(err); }
});

// POST /api/employee-groups/:id/members — add members { employee_ids: [] }.
router.post('/:id/members', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const group = await dbGet('SELECT id FROM employee_groups WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [req.params.id, companyId]);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const ids = await validEmployeeIds(dbAll, companyId, req.body?.employee_ids || []);
    if (!ids.length) return res.status(400).json({ error: 'No valid employees to add' });
    let added = 0;
    for (const eid of ids) {
      const r = await dbGet('INSERT INTO employee_group_members (group_id, employee_id) VALUES (?, ?) ON CONFLICT (group_id, employee_id) DO NOTHING RETURNING id', [group.id, eid]);
      if (r) added++;
    }
    res.status(201).json({ added, message: `${added} member(s) added` });
  } catch (err) { next(err); }
});

// DELETE /api/employee-groups/:id/members/:employeeId — remove a member.
router.delete('/:id/members/:employeeId', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const group = await dbGet('SELECT id FROM employee_groups WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [req.params.id, companyId]);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const r = await dbGet('DELETE FROM employee_group_members WHERE group_id = ? AND employee_id = ? RETURNING id', [group.id, req.params.employeeId]);
    if (!r) return res.status(404).json({ error: 'Member not found in group' });
    res.json({ message: 'Member removed' });
  } catch (err) { next(err); }
});

// POST /api/employee-groups/transfer — move members between groups.
// { from_group_id, to_group_id, employee_ids: [] }
router.post('/transfer', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const { from_group_id, to_group_id, employee_ids } = req.body || {};
    if (!from_group_id || !to_group_id) return res.status(400).json({ error: 'from_group_id and to_group_id are required' });
    if (Number(from_group_id) === Number(to_group_id)) return res.status(400).json({ error: 'Source and destination groups must differ' });

    const ownFrom = await dbGet('SELECT id FROM employee_groups WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [from_group_id, companyId]);
    const ownTo = await dbGet('SELECT id FROM employee_groups WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [to_group_id, companyId]);
    if (!ownFrom || !ownTo) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const ids = await validEmployeeIds(dbAll, companyId, employee_ids || []);
    if (!ids.length) return res.status(400).json({ error: 'No valid employees to transfer' });

    const moved = await withTransaction(async (tx) => {
      let n = 0;
      for (const eid of ids) {
        await tx.query('INSERT INTO employee_group_members (group_id, employee_id) VALUES (?, ?) ON CONFLICT (group_id, employee_id) DO NOTHING', [to_group_id, eid]);
        const delResult = await tx.query('DELETE FROM employee_group_members WHERE group_id = ? AND employee_id = ?', [from_group_id, eid]);
        n += delResult.rowCount;
      }
      return n;
    });

    res.json({ transferred: moved, message: `${moved} member(s) transferred` });
  } catch (err) { next(err); }
});

module.exports = router;
