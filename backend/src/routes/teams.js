// ============================================================================
// Teams API — mounted at /api/teams (auth + branchAuth + rbac applied globally).
// Teams are structured units (often under a department) with a lead and members.
// Distinct from departments (org structure) and employee_groups (ad-hoc). All
// queries are scoped to req.user.companyId; writes require OWNER/MANAGER/admin
// (mirrors the compliance route's isAdmin gate — no privilege escalation).
// ============================================================================
const express = require('express');
const { getDb } = require('../config/db');
const { dbGet, dbAll, engine } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

const router = express.Router();

const canManage = (req) => ['admin', 'OWNER', 'MANAGER'].includes(req.user.role);

// Verify a set of employee ids all belong to this company (blocks cross-tenant
// member injection). `all` is a (sql, params) => rows function -- dbAll for a
// plain connection, or a transaction's tx.getAll -- so this one helper works
// both inside and outside a transaction without ever opening its own connection.
async function validEmployeeIds(all, companyId, ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await all(
    `SELECT id FROM employees WHERE company_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
    [companyId, ...ids]
  );
  return rows.map(r => r.id);
}

// GET /api/teams — all teams with member/lead/department context.
router.get('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const teams = await dbAll(`
      SELECT t.*, e.name AS lead_name, e.avatar AS lead_avatar, d.name AS department_name,
             (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count
      FROM teams t
      LEFT JOIN employees e ON t.lead_id = e.id
      LEFT JOIN departments d ON t.department_id = d.id
      WHERE t.company_id = ? AND t.deleted_at IS NULL
      ORDER BY t.name ASC
    `, [companyId]);
    res.json({ teams });
  } catch (err) { next(err); }
});

// GET /api/teams/:id — team detail with members.
router.get('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const team = await dbGet(`
      SELECT t.*, e.name AS lead_name, d.name AS department_name
      FROM teams t
      LEFT JOIN employees e ON t.lead_id = e.id
      LEFT JOIN departments d ON t.department_id = d.id
      WHERE t.id = ? AND t.company_id = ? AND t.deleted_at IS NULL
    `, [req.params.id, companyId]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const members = await dbAll(`
      SELECT tm.id AS membership_id, tm.role_in_team, tm.added_at,
             e.id, e.name, e.job_title, e.avatar, e.status, e.employee_code
      FROM team_members tm
      JOIN employees e ON e.id = tm.employee_id
      WHERE tm.team_id = ? AND e.deleted_at IS NULL
      ORDER BY e.name ASC
    `, [team.id]);
    res.json({ team, members });
  } catch (err) { next(err); }
});

// POST /api/teams — create.
router.post('/', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage teams' });
    const companyId = req.user.companyId;
    const { name, description, color, icon, department_id, branch_id, lead_id, member_ids } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Team name is required' });

    let teamId;
    if (engine() === 'postgres') {
      teamId = await withTransaction(async (tx) => {
        const row = await tx.getOne(`
          INSERT INTO teams (company_id, branch_id, department_id, name, description, color, icon, lead_id, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
        `, [companyId, branch_id || null, department_id || null, name, description || null,
            color || null, icon || null, lead_id || null, req.user.userId]);
        const wanted = new Set(await validEmployeeIds(tx.getAll, companyId, member_ids || []));
        if (lead_id && (await validEmployeeIds(tx.getAll, companyId, [lead_id])).length) wanted.add(Number(lead_id));
        for (const eid of wanted) {
          await tx.query('INSERT INTO team_members (team_id, employee_id, role_in_team) VALUES (?, ?, ?) ON CONFLICT (team_id, employee_id) DO NOTHING',
            [row.id, eid, eid === Number(lead_id) ? 'Lead' : 'Member']);
        }
        return row.id;
      });
    } else {
      const db = getDb();
      try {
        db.exec('BEGIN TRANSACTION');
        try {
          const info = db.prepare(`
            INSERT INTO teams (company_id, branch_id, department_id, name, description, color, icon, lead_id, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(companyId, branch_id || null, department_id || null, name, description || null,
                 color || null, icon || null, lead_id || null, req.user.userId);
          teamId = info.lastInsertRowid;

          const all = async (sql, params) => db.prepare(sql).all(...params);
          const wanted = new Set(await validEmployeeIds(all, companyId, member_ids || []));
          if (lead_id && (await validEmployeeIds(all, companyId, [lead_id])).length) wanted.add(Number(lead_id));
          const addMember = db.prepare('INSERT OR IGNORE INTO team_members (team_id, employee_id, role_in_team) VALUES (?, ?, ?)');
          for (const eid of wanted) addMember.run(teamId, eid, eid === Number(lead_id) ? 'Lead' : 'Member');

          db.exec('COMMIT');
        } catch (e) { db.exec('ROLLBACK'); throw e; }
      } finally { db.close(); }
    }

    res.status(201).json({ id: teamId, message: 'Team created successfully' });
  } catch (err) { next(err); }
});

// PUT /api/teams/:id — update.
router.put('/:id', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage teams' });
    const companyId = req.user.companyId;
    const { name, description, color, icon, department_id, branch_id, lead_id, status } = req.body || {};

    const existing = await dbGet('SELECT id FROM teams WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [req.params.id, companyId]);
    if (!existing) return res.status(404).json({ error: 'Team not found' });

    await dbGet(`
      UPDATE teams SET name = COALESCE(?, name), description = COALESCE(?, description),
        color = COALESCE(?, color), icon = COALESCE(?, icon),
        department_id = COALESCE(?, department_id), branch_id = COALESCE(?, branch_id),
        lead_id = COALESCE(?, lead_id), status = COALESCE(?, status)
      WHERE id = ? AND company_id = ?
    `, [name ?? null, description ?? null, color ?? null, icon ?? null,
        department_id ?? null, branch_id ?? null, lead_id ?? null, status ?? null,
        req.params.id, companyId]);
    res.json({ message: 'Team updated successfully' });
  } catch (err) { next(err); }
});

// DELETE /api/teams/:id — soft delete (membership rows kept for history).
router.delete('/:id', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage teams' });
    const companyId = req.user.companyId;
    const nowExpr = engine() === 'postgres' ? 'now()' : "datetime('now')";
    const r = await dbGet(`UPDATE teams SET deleted_at = ${nowExpr}, status = 'Archived' WHERE id = ? AND company_id = ? AND deleted_at IS NULL RETURNING id`, [req.params.id, companyId]);
    if (!r) return res.status(404).json({ error: 'Team not found' });
    res.json({ message: 'Team archived successfully' });
  } catch (err) { next(err); }
});

// POST /api/teams/:id/members — add one or more members { employee_ids: [] }.
router.post('/:id/members', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage teams' });
    const companyId = req.user.companyId;
    const team = await dbGet('SELECT id FROM teams WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [req.params.id, companyId]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const ids = await validEmployeeIds(dbAll, companyId, req.body?.employee_ids || []);
    if (!ids.length) return res.status(400).json({ error: 'No valid employees to add' });

    let added = 0;
    for (const eid of ids) {
      const r = await dbGet('INSERT INTO team_members (team_id, employee_id, role_in_team) VALUES (?, ?, ?) ON CONFLICT (team_id, employee_id) DO NOTHING RETURNING id',
        [team.id, eid, req.body?.role_in_team || 'Member']);
      if (r) added++;
    }
    res.status(201).json({ added, message: `${added} member(s) added` });
  } catch (err) { next(err); }
});

// DELETE /api/teams/:id/members/:employeeId — remove a member.
router.delete('/:id/members/:employeeId', async (req, res, next) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: 'Only owners/managers can manage teams' });
    const companyId = req.user.companyId;
    const team = await dbGet('SELECT id FROM teams WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [req.params.id, companyId]);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const r = await dbGet('DELETE FROM team_members WHERE team_id = ? AND employee_id = ? RETURNING id', [team.id, req.params.employeeId]);
    if (!r) return res.status(404).json({ error: 'Member not found in team' });
    res.json({ message: 'Member removed' });
  } catch (err) { next(err); }
});

module.exports = router;
