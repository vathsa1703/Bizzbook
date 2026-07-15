// ============================================================================
// Employee Groups API — mounted at /api/employee-groups.
// Groups are DYNAMIC, ad-hoc collections (Project Alpha, Night Shift, Festival
// Team...). They are NOT departments and NOT reporting hierarchy — an employee
// may belong to many groups. Scoped to req.user.companyId; writes require
// OWNER/MANAGER/admin. Additive; mirrors the teams route conventions.
// ============================================================================
const express = require('express');
const { getDb } = require('../config/db');

const router = express.Router();

const canManage = (req) => ['admin', 'OWNER', 'MANAGER'].includes(req.user.role);

function validEmployeeIds(db, companyId, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(
    `SELECT id FROM employees WHERE company_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`
  ).all(companyId, ...ids).map(r => r.id);
}

// GET /api/employee-groups?q=  — list, with optional name/description search.
router.get('/', (req, res, next) => {
  const db = getDb();
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
    res.json({ groups: db.prepare(sql).all(...params) });
  } catch (err) { next(err); } finally { db.close(); }
});

// GET /api/employee-groups/:id — group detail with members.
router.get('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const group = db.prepare('SELECT * FROM employee_groups WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(req.params.id, companyId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const members = db.prepare(`
      SELECT m.id AS membership_id, m.added_at, e.id, e.name, e.job_title, e.avatar, e.status, e.employee_code
      FROM employee_group_members m
      JOIN employees e ON e.id = m.employee_id
      WHERE m.group_id = ? AND e.deleted_at IS NULL
      ORDER BY e.name ASC
    `).all(group.id);
    res.json({ group, members });
  } catch (err) { next(err); } finally { db.close(); }
});

// POST /api/employee-groups — create.
router.post('/', (req, res, next) => {
  const db = getDb();
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const { name, description, color, avatar, group_type, branch_id, member_ids } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Group name is required' });

    db.exec('BEGIN TRANSACTION');
    try {
      const info = db.prepare(`
        INSERT INTO employee_groups (company_id, branch_id, name, description, color, avatar, group_type, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(companyId, branch_id || null, name, description || null, color || null, avatar || null, group_type || 'custom', req.user.userId);
      const groupId = info.lastInsertRowid;
      const ids = validEmployeeIds(db, companyId, member_ids || []);
      const addMember = db.prepare('INSERT OR IGNORE INTO employee_group_members (group_id, employee_id) VALUES (?, ?)');
      for (const eid of ids) addMember.run(groupId, eid);
      db.exec('COMMIT');
      res.status(201).json({ id: groupId, message: 'Group created successfully' });
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } catch (err) { next(err); } finally { db.close(); }
});

// PUT /api/employee-groups/:id — update.
router.put('/:id', (req, res, next) => {
  const db = getDb();
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const { name, description, color, avatar, group_type, status } = req.body || {};
    const existing = db.prepare('SELECT id FROM employee_groups WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(req.params.id, companyId);
    if (!existing) return res.status(404).json({ error: 'Group not found' });
    db.prepare(`
      UPDATE employee_groups SET name = COALESCE(?, name), description = COALESCE(?, description),
        color = COALESCE(?, color), avatar = COALESCE(?, avatar),
        group_type = COALESCE(?, group_type), status = COALESCE(?, status)
      WHERE id = ? AND company_id = ?
    `).run(name ?? null, description ?? null, color ?? null, avatar ?? null, group_type ?? null, status ?? null, req.params.id, companyId);
    res.json({ message: 'Group updated successfully' });
  } catch (err) { next(err); } finally { db.close(); }
});

// DELETE /api/employee-groups/:id — soft delete.
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const r = db.prepare("UPDATE employee_groups SET deleted_at = datetime('now'), status = 'Archived' WHERE id = ? AND company_id = ? AND deleted_at IS NULL").run(req.params.id, companyId);
    if (r.changes === 0) return res.status(404).json({ error: 'Group not found' });
    res.json({ message: 'Group archived successfully' });
  } catch (err) { next(err); } finally { db.close(); }
});

// POST /api/employee-groups/:id/members — add members { employee_ids: [] }.
router.post('/:id/members', (req, res, next) => {
  const db = getDb();
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const group = db.prepare('SELECT id FROM employee_groups WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(req.params.id, companyId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const ids = validEmployeeIds(db, companyId, req.body?.employee_ids || []);
    if (!ids.length) return res.status(400).json({ error: 'No valid employees to add' });
    const stmt = db.prepare('INSERT OR IGNORE INTO employee_group_members (group_id, employee_id) VALUES (?, ?)');
    let added = 0;
    for (const eid of ids) added += stmt.run(group.id, eid).changes;
    res.status(201).json({ added, message: `${added} member(s) added` });
  } catch (err) { next(err); } finally { db.close(); }
});

// DELETE /api/employee-groups/:id/members/:employeeId — remove a member.
router.delete('/:id/members/:employeeId', (req, res, next) => {
  const db = getDb();
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const group = db.prepare('SELECT id FROM employee_groups WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(req.params.id, companyId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const r = db.prepare('DELETE FROM employee_group_members WHERE group_id = ? AND employee_id = ?').run(group.id, req.params.employeeId);
    if (r.changes === 0) return res.status(404).json({ error: 'Member not found in group' });
    res.json({ message: 'Member removed' });
  } catch (err) { next(err); } finally { db.close(); }
});

// POST /api/employee-groups/transfer — move members between groups.
// { from_group_id, to_group_id, employee_ids: [] }
router.post('/transfer', (req, res, next) => {
  const db = getDb();
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage groups' });
    const companyId = req.user.companyId;
    const { from_group_id, to_group_id, employee_ids } = req.body || {};
    if (!from_group_id || !to_group_id) return res.status(400).json({ error: 'from_group_id and to_group_id are required' });
    if (Number(from_group_id) === Number(to_group_id)) return res.status(400).json({ error: 'Source and destination groups must differ' });

    const own = db.prepare('SELECT id FROM employee_groups WHERE id = ? AND company_id = ? AND deleted_at IS NULL');
    if (!own.get(from_group_id, companyId) || !own.get(to_group_id, companyId)) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const ids = validEmployeeIds(db, companyId, employee_ids || []);
    if (!ids.length) return res.status(400).json({ error: 'No valid employees to transfer' });

    db.exec('BEGIN TRANSACTION');
    try {
      const add = db.prepare('INSERT OR IGNORE INTO employee_group_members (group_id, employee_id) VALUES (?, ?)');
      const del = db.prepare('DELETE FROM employee_group_members WHERE group_id = ? AND employee_id = ?');
      let moved = 0;
      for (const eid of ids) { add.run(to_group_id, eid); moved += del.run(from_group_id, eid).changes; }
      db.exec('COMMIT');
      res.json({ transferred: moved, message: `${moved} member(s) transferred` });
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } catch (err) { next(err); } finally { db.close(); }
});

module.exports = router;
