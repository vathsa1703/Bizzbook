// ============================================================================
// Teams API — mounted at /api/teams (auth + branchAuth + rbac applied globally).
// Teams are structured units (often under a department) with a lead and members.
// Distinct from departments (org structure) and employee_groups (ad-hoc). All
// queries are scoped to req.user.companyId; writes require OWNER/MANAGER/admin
// (mirrors the compliance route's isAdmin gate — no privilege escalation).
// ============================================================================
const express = require('express');
const { getDb } = require('../config/db');

const router = express.Router();

const canManage = (req) => ['admin', 'OWNER', 'MANAGER'].includes(req.user.role);

// Verify a set of employee ids all belong to this company (blocks cross-tenant
// member injection). Returns the list of valid ids.
function validEmployeeIds(db, companyId, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(
    `SELECT id FROM employees WHERE company_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`
  ).all(companyId, ...ids).map(r => r.id);
}

// GET /api/teams — all teams with member/lead/department context.
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const teams = db.prepare(`
      SELECT t.*, e.name AS lead_name, e.avatar AS lead_avatar, d.name AS department_name,
             (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count
      FROM teams t
      LEFT JOIN employees e ON t.lead_id = e.id
      LEFT JOIN departments d ON t.department_id = d.id
      WHERE t.company_id = ? AND t.deleted_at IS NULL
      ORDER BY t.name ASC
    `).all(companyId);
    res.json({ teams });
  } catch (err) { next(err); } finally { db.close(); }
});

// GET /api/teams/:id — team detail with members.
router.get('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const team = db.prepare(`
      SELECT t.*, e.name AS lead_name, d.name AS department_name
      FROM teams t
      LEFT JOIN employees e ON t.lead_id = e.id
      LEFT JOIN departments d ON t.department_id = d.id
      WHERE t.id = ? AND t.company_id = ? AND t.deleted_at IS NULL
    `).get(req.params.id, companyId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const members = db.prepare(`
      SELECT tm.id AS membership_id, tm.role_in_team, tm.added_at,
             e.id, e.name, e.job_title, e.avatar, e.status, e.employee_code
      FROM team_members tm
      JOIN employees e ON e.id = tm.employee_id
      WHERE tm.team_id = ? AND e.deleted_at IS NULL
      ORDER BY e.name ASC
    `).all(team.id);
    res.json({ team, members });
  } catch (err) { next(err); } finally { db.close(); }
});

// POST /api/teams — create.
router.post('/', (req, res, next) => {
  const db = getDb();
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage teams' });
    const companyId = req.user.companyId;
    const { name, description, color, icon, department_id, branch_id, lead_id, member_ids } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Team name is required' });

    db.exec('BEGIN TRANSACTION');
    try {
      const info = db.prepare(`
        INSERT INTO teams (company_id, branch_id, department_id, name, description, color, icon, lead_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(companyId, branch_id || null, department_id || null, name, description || null,
             color || null, icon || null, lead_id || null, req.user.userId);
      const teamId = info.lastInsertRowid;

      // Optional initial members (+ lead auto-added as a member).
      const wanted = new Set(validEmployeeIds(db, companyId, member_ids || []));
      if (lead_id && validEmployeeIds(db, companyId, [lead_id]).length) wanted.add(Number(lead_id));
      const addMember = db.prepare('INSERT OR IGNORE INTO team_members (team_id, employee_id, role_in_team) VALUES (?, ?, ?)');
      for (const eid of wanted) addMember.run(teamId, eid, eid === Number(lead_id) ? 'Lead' : 'Member');

      db.exec('COMMIT');
      res.status(201).json({ id: teamId, message: 'Team created successfully' });
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } catch (err) { next(err); } finally { db.close(); }
});

// PUT /api/teams/:id — update.
router.put('/:id', (req, res, next) => {
  const db = getDb();
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage teams' });
    const companyId = req.user.companyId;
    const { name, description, color, icon, department_id, branch_id, lead_id, status } = req.body || {};

    const existing = db.prepare('SELECT id FROM teams WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(req.params.id, companyId);
    if (!existing) return res.status(404).json({ error: 'Team not found' });

    db.prepare(`
      UPDATE teams SET name = COALESCE(?, name), description = COALESCE(?, description),
        color = COALESCE(?, color), icon = COALESCE(?, icon),
        department_id = COALESCE(?, department_id), branch_id = COALESCE(?, branch_id),
        lead_id = COALESCE(?, lead_id), status = COALESCE(?, status)
      WHERE id = ? AND company_id = ?
    `).run(name ?? null, description ?? null, color ?? null, icon ?? null,
           department_id ?? null, branch_id ?? null, lead_id ?? null, status ?? null,
           req.params.id, companyId);
    res.json({ message: 'Team updated successfully' });
  } catch (err) { next(err); } finally { db.close(); }
});

// DELETE /api/teams/:id — soft delete (membership rows kept for history).
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage teams' });
    const companyId = req.user.companyId;
    const r = db.prepare("UPDATE teams SET deleted_at = datetime('now'), status = 'Archived' WHERE id = ? AND company_id = ? AND deleted_at IS NULL").run(req.params.id, companyId);
    if (r.changes === 0) return res.status(404).json({ error: 'Team not found' });
    res.json({ message: 'Team archived successfully' });
  } catch (err) { next(err); } finally { db.close(); }
});

// POST /api/teams/:id/members — add one or more members { employee_ids: [] }.
router.post('/:id/members', (req, res, next) => {
  const db = getDb();
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage teams' });
    const companyId = req.user.companyId;
    const team = db.prepare('SELECT id FROM teams WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(req.params.id, companyId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const ids = validEmployeeIds(db, companyId, req.body?.employee_ids || []);
    if (!ids.length) return res.status(400).json({ error: 'No valid employees to add' });

    const stmt = db.prepare('INSERT OR IGNORE INTO team_members (team_id, employee_id, role_in_team) VALUES (?, ?, ?)');
    let added = 0;
    for (const eid of ids) added += stmt.run(team.id, eid, req.body?.role_in_team || 'Member').changes;
    res.status(201).json({ added, message: `${added} member(s) added` });
  } catch (err) { next(err); } finally { db.close(); }
});

// DELETE /api/teams/:id/members/:employeeId — remove a member.
router.delete('/:id/members/:employeeId', (req, res, next) => {
  const db = getDb();
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage teams' });
    const companyId = req.user.companyId;
    const team = db.prepare('SELECT id FROM teams WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(req.params.id, companyId);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const r = db.prepare('DELETE FROM team_members WHERE team_id = ? AND employee_id = ?').run(team.id, req.params.employeeId);
    if (r.changes === 0) return res.status(404).json({ error: 'Member not found in team' });
    res.json({ message: 'Member removed' });
  } catch (err) { next(err); } finally { db.close(); }
});

module.exports = router;
