// ============================================================================
// Task Service — all Task Management business logic & SQL. Routes stay thin.
//
// A task can be assigned to individual employees, a whole team, a department, or
// a branch (task_assignments.assignee_type). Assignee membership is resolved at
// query time so team/department changes stay reflected. Everything is scoped to
// the caller's company; visibility is row-level by role (see buildVisibility).
// Notifications reuse the existing `notifications` table (same shape the leave
// and compliance reminders use). No arithmetic is done by any LLM here.
//
// Phase 2 (Postgres): every helper below takes `x` (an executor) instead of a
// raw db handle -- x.{get,all,run,insert} has the same shape whether it wraps
// a SQLite `db`, the plain Postgres pool, or a transaction's single pinned
// client. This is what keeps the transaction-escaping bug class (found and
// fixed in companySettings.js -- a helper called from inside a transaction
// grabbing its own separate pooled connection instead of using the tx's) from
// being possible here: createTask/updateTask/addAssignees/addComment (the 4
// transactions this file backs) pass their `tx`-bound executor into every
// helper they call, so nothing can escape onto a different connection.
// ============================================================================
const pgDb = require('../config/pgDb');

const STATUSES = new Set(['todo', 'in_progress', 'review', 'blocked', 'completed', 'cancelled']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const ASSIGNEE_TYPES = new Set(['employee', 'team', 'department', 'branch']);

const canManage = (user) => ['admin', 'OWNER', 'MANAGER'].includes(user.role);
const isPrivileged = (user) => ['admin', 'OWNER'].includes(user.role);

function safeJsonArr(s) { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
function placeholders(arr) { return arr.map(() => '?').join(','); }

// ── Query executor ───────────────────────────────────────────────────────────
function pgExecutor(client) {
  return {
    engine: 'postgres',
    get: (sql, params = []) => client.getOne(sql, params),
    all: (sql, params = []) => client.getAll(sql, params),
    run: async (sql, params = []) => {
      const result = await client.query(sql, params);
      return { id: result.rows[0]?.id ?? null, changes: result.rowCount };
    },
    insert: async (sql, params = []) => {
      const row = await client.getOne(`${sql} RETURNING id`, params);
      return row?.id ?? null;
    },
  };
}

// Runs fn(x) against the shared (non-transactional) Postgres pool.
async function withExecutor(fn) {
  return fn(pgExecutor({ query: pgDb.query, getOne: pgDb.getOne, getAll: pgDb.getAll }));
}

// Runs fn(x) as a single atomic transaction.
async function withTx(fn) {
  return pgDb.withTransaction((tx) => fn(pgExecutor(tx)));
}

// The caller's own employee record (employees.user_id = the JWT userId).
async function callerEmployee(x, companyId, userId) {
  return x.get('SELECT id FROM employees WHERE user_id = ? AND company_id = ? AND deleted_at IS NULL', [userId, companyId]);
}

// Direct reports of an employee — used to widen a MANAGER's visibility.
async function subordinateIds(x, companyId, empId) {
  if (!empId) return [];
  const rows = await x.all('SELECT id FROM employees WHERE manager_id = ? AND company_id = ? AND deleted_at IS NULL', [empId, companyId]);
  return rows.map(r => r.id);
}

// ── Assignment validation & resolution ──────────────────────────────────────
// Normalize the many convenience shapes a caller may send into a clean list of
// {assignee_type, assignee_id}, keeping only rows that belong to this company.
async function normalizeAssignments(x, companyId, data) {
  const raw = [];
  if (Array.isArray(data.assignments)) {
    for (const a of data.assignments) if (a && ASSIGNEE_TYPES.has(a.assignee_type)) raw.push({ assignee_type: a.assignee_type, assignee_id: Number(a.assignee_id) });
  }
  for (const id of (data.assignee_ids || [])) raw.push({ assignee_type: 'employee', assignee_id: Number(id) });
  if (data.team_id) raw.push({ assignee_type: 'team', assignee_id: Number(data.team_id) });
  if (data.department_id) raw.push({ assignee_type: 'department', assignee_id: Number(data.department_id) });
  if (data.branch_id_assignee) raw.push({ assignee_type: 'branch', assignee_id: Number(data.branch_id_assignee) });

  const ok = [];
  const seen = new Set();
  for (const a of raw) {
    if (!a.assignee_id || Number.isNaN(a.assignee_id)) continue;
    const key = `${a.assignee_type}:${a.assignee_id}`;
    if (seen.has(key)) continue;
    let exists = false;
    if (a.assignee_type === 'employee') exists = !!(await x.get('SELECT 1 FROM employees WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [a.assignee_id, companyId]));
    else if (a.assignee_type === 'team') exists = !!(await x.get('SELECT 1 FROM teams WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [a.assignee_id, companyId]));
    else if (a.assignee_type === 'department') exists = !!(await x.get('SELECT 1 FROM departments WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [a.assignee_id, companyId]));
    else if (a.assignee_type === 'branch') exists = !!(await x.get('SELECT 1 FROM branches WHERE id = ? AND company_id = ?', [a.assignee_id, companyId]));
    if (exists) { ok.push(a); seen.add(key); }
  }
  return ok;
}

// Expand a set of assignments to the concrete employee ids they target
// (for notifications). Membership resolved live.
async function assignmentEmployeeIds(x, companyId, assignments) {
  const ids = new Set();
  for (const a of assignments) {
    if (a.assignee_type === 'employee') {
      ids.add(a.assignee_id);
    } else if (a.assignee_type === 'team') {
      (await x.all('SELECT employee_id FROM team_members WHERE team_id = ?', [a.assignee_id])).forEach(r => ids.add(r.employee_id));
    } else if (a.assignee_type === 'department') {
      (await x.all('SELECT id FROM employees WHERE department_id = ? AND company_id = ? AND deleted_at IS NULL', [a.assignee_id, companyId])).forEach(r => ids.add(r.id));
    } else if (a.assignee_type === 'branch') {
      (await x.all('SELECT e.id FROM employees e JOIN user_branches ub ON ub.user_id = e.user_id WHERE ub.branch_id = ? AND e.company_id = ? AND e.deleted_at IS NULL', [a.assignee_id, companyId])).forEach(r => ids.add(r.id));
    }
  }
  return [...ids];
}

// Insert one notification per distinct target user (employees.user_id), skipping
// the actor and employees without a login. Reuses the shared notifications table.
async function notifyEmployees(x, companyId, employeeIds, { type = 'task', title, body, taskId }, excludeUserId) {
  if (!employeeIds.length) return 0;
  const rows = await x.all(`SELECT DISTINCT user_id FROM employees WHERE company_id = ? AND user_id IS NOT NULL AND id IN (${placeholders(employeeIds)})`, [companyId, ...employeeIds]);
  let n = 0;
  for (const r of rows) {
    if (excludeUserId && r.user_id === excludeUserId) continue;
    await x.run(`INSERT INTO notifications (company_id, user_id, type, title, body, related_type, related_id) VALUES (?, ?, ?, ?, ?, 'task', ?)`, [companyId, r.user_id, type, title, body, taskId]);
    n++;
  }
  return n;
}

async function logActivity(x, taskId, userId, action, detail = null) {
  await x.run('INSERT INTO task_activity (task_id, actor_user_id, action, detail) VALUES (?, ?, ?, ?)', [taskId, userId || null, action, detail]);
}

// Row-level visibility fragment. Privileged roles (OWNER/admin) see all company
// tasks; everyone else sees tasks they created or are assigned to (a MANAGER also
// sees tasks assigned to their direct reports). Returns SQL appended after an
// existing `WHERE t.company_id = ?`.
async function buildVisibility(x, user) {
  if (isPrivileged(user)) return { clause: '', params: [] };
  const me = await callerEmployee(x, user.companyId, user.userId);
  const visible = [];
  if (me) {
    visible.push(me.id);
    if (user.role === 'MANAGER') visible.push(...(await subordinateIds(x, user.companyId, me.id)));
  }
  if (!visible.length) {
    // No employee record — can only see tasks they created.
    return { clause: ' AND t.assigned_by = ?', params: [user.userId] };
  }
  const ph = placeholders(visible);
  const clause = ` AND (t.assigned_by = ? OR EXISTS (
      SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND (
        (a.assignee_type = 'employee'   AND a.assignee_id IN (${ph}))
     OR (a.assignee_type = 'team'       AND EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = a.assignee_id AND tm.employee_id IN (${ph})))
     OR (a.assignee_type = 'department' AND EXISTS (SELECT 1 FROM employees e2 WHERE e2.id IN (${ph}) AND e2.department_id = a.assignee_id))
     OR (a.assignee_type = 'branch'     AND EXISTS (SELECT 1 FROM user_branches ub JOIN employees e3 ON e3.user_id = ub.user_id WHERE e3.id IN (${ph}) AND ub.branch_id = a.assignee_id))
      )))`;
  return { clause, params: [user.userId, ...visible, ...visible, ...visible, ...visible] };
}

// Resolve the display list of assignees for a task (names, for UI).
async function loadAssignees(x, taskId) {
  const rows = await x.all('SELECT assignee_type, assignee_id FROM task_assignments WHERE task_id = ?', [taskId]);
  const out = [];
  for (const a of rows) {
    let name = null, avatar = null;
    if (a.assignee_type === 'employee') { const e = await x.get('SELECT name, avatar FROM employees WHERE id = ?', [a.assignee_id]); name = e?.name; avatar = e?.avatar; }
    else if (a.assignee_type === 'team') name = (await x.get('SELECT name FROM teams WHERE id = ?', [a.assignee_id]))?.name;
    else if (a.assignee_type === 'department') name = (await x.get('SELECT name FROM departments WHERE id = ?', [a.assignee_id]))?.name;
    else if (a.assignee_type === 'branch') name = (await x.get('SELECT name FROM branches WHERE id = ?', [a.assignee_id]))?.name;
    out.push({ ...a, name: name || `#${a.assignee_id}`, avatar });
  }
  return out;
}

async function recomputeProgress(x, taskId) {
  // SUM(CASE WHEN is_done THEN 1 ELSE 0 END), not SUM(is_done) -- is_done is a
  // real BOOLEAN on Postgres (Phase 1 converted it from INTEGER 0/1), and
  // Postgres's SUM() has no boolean overload ("function sum(boolean) does not
  // exist"). The CASE form is valid on both engines regardless of is_done's
  // underlying type, so no isPg branch is needed here.
  const c = await x.get('SELECT COUNT(*) total, SUM(CASE WHEN is_done THEN 1 ELSE 0 END) done FROM task_checklist_items WHERE task_id = ?', [taskId]);
  if (c && c.total > 0) {
    const pct = Math.round(((c.done || 0) / c.total) * 100);
    const nowExpr = 'now()';
    await x.run(`UPDATE tasks SET progress = ?, updated_at = ${nowExpr} WHERE id = ?`, [pct, taskId]);
    return pct;
  }
  return null;
}

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function fmt(d) { return d.toISOString().slice(0, 10); }
function nextRecurrenceDate(task) {
  const base = task.due_date ? new Date(task.due_date) : new Date();
  const k = task.recurrence_interval || 1;
  if (task.recurrence === 'daily') return fmt(addDays(base, k));
  if (task.recurrence === 'weekly') return fmt(addDays(base, 7 * k));
  if (task.recurrence === 'monthly') return fmt(addMonths(base, k));
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────
const TASK_FIELDS = ['title', 'description', 'priority', 'category', 'status', 'progress', 'start_date',
  'due_date', 'estimated_minutes', 'logged_minutes', 'recurrence', 'recurrence_interval', 'branch_id', 'department_id', 'team_id'];

async function createTask(user, data) {
  if (!data.title) return { error: 'title is required', code: 400 };
  if (data.status && !STATUSES.has(data.status)) return { error: 'invalid status', code: 400 };
  if (data.priority && !PRIORITIES.has(data.priority)) return { error: 'invalid priority', code: 400 };

  return withTx(async (x) => {
    const assignments = await normalizeAssignments(x, user.companyId, data);
    const hasGroup = assignments.some(a => a.assignee_type !== 'employee');
    if (hasGroup && !canManage(user)) return { error: 'Only owners/managers can assign to a team, department or branch', code: 403 };

    const taskId = await x.insert(`
      INSERT INTO tasks (company_id, branch_id, title, description, priority, category, status, progress,
        labels, assigned_by, department_id, team_id, start_date, due_date, estimated_minutes, recurrence, recurrence_interval)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [user.companyId, data.branch_id || null, data.title, data.description || null,
      data.priority || 'medium', data.category || null, data.status || 'todo', Number(data.progress || 0),
      data.labels ? JSON.stringify(data.labels) : null, user.userId, data.department_id || null, data.team_id || null,
      data.start_date || null, data.due_date || null, data.estimated_minutes || null,
      data.recurrence || 'none', Number(data.recurrence_interval || 1)]);

    for (const a of assignments) {
      await x.run('INSERT INTO task_assignments (task_id, assignee_type, assignee_id) VALUES (?, ?, ?) ON CONFLICT (task_id, assignee_type, assignee_id) DO NOTHING', [taskId, a.assignee_type, a.assignee_id]);
    }

    await logActivity(x, taskId, user.userId, 'created', data.title);
    const targets = await assignmentEmployeeIds(x, user.companyId, assignments);
    await notifyEmployees(x, user.companyId, targets, { title: 'New task assigned', body: `You have been assigned: ${data.title}`, taskId }, user.userId);
    return { id: taskId };
  });
}

async function listTasks(user, filters = {}) {
  return withExecutor(async (x) => {
    const vis = await buildVisibility(x, user);
    let sql = `
      SELECT t.*, u.name AS assigned_by_name,
        (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) AS comment_count,
        (SELECT COUNT(*) FROM task_checklist_items ci WHERE ci.task_id = t.id) AS checklist_total,
        (SELECT COUNT(*) FROM task_checklist_items ci WHERE ci.task_id = t.id AND ci.is_done) AS checklist_done,
        (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id AND ta.deleted_at IS NULL) AS attachment_count
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_by
      WHERE t.company_id = ? AND t.deleted_at IS NULL`;
    const params = [user.companyId];
    if (filters.status && STATUSES.has(filters.status)) { sql += ' AND t.status = ?'; params.push(filters.status); }
    if (filters.priority && PRIORITIES.has(filters.priority)) { sql += ' AND t.priority = ?'; params.push(filters.priority); }
    if (filters.department_id) { sql += ' AND t.department_id = ?'; params.push(Number(filters.department_id)); }
    if (filters.team_id) { sql += ' AND t.team_id = ?'; params.push(Number(filters.team_id)); }
    if (filters.branch_id) { sql += ' AND t.branch_id = ?'; params.push(Number(filters.branch_id)); }
    if (filters.due_before) { sql += ' AND t.due_date IS NOT NULL AND t.due_date <= ?'; params.push(filters.due_before); }
    if (filters.q) { sql += ' AND (t.title LIKE ? OR t.description LIKE ?)'; params.push(`%${filters.q}%`, `%${filters.q}%`); }
    // Assignee filter (single employee) — reuses the same resolution logic.
    if (filters.assignee_employee_id) {
      sql += ` AND EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND (
        (a.assignee_type='employee' AND a.assignee_id = ?)
     OR (a.assignee_type='team' AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=a.assignee_id AND tm.employee_id = ?))
     OR (a.assignee_type='department' AND EXISTS(SELECT 1 FROM employees e2 WHERE e2.id = ? AND e2.department_id=a.assignee_id))))`;
      const eid = Number(filters.assignee_employee_id); params.push(eid, eid, eid);
    }
    sql += vis.clause; params.push(...vis.params);
    sql += ' ORDER BY (t.due_date IS NULL), t.due_date ASC, t.id DESC';
    const rows = await x.all(sql, params);
    const out = [];
    for (const r of rows) out.push({ ...r, labels: r.labels ? safeJsonArr(r.labels) : [], assignees: await loadAssignees(x, r.id) });
    return out;
  });
}

async function getBoard(user, filters = {}) {
  const rows = await listTasks(user, filters);
  const columns = { todo: [], in_progress: [], review: [], blocked: [], completed: [], cancelled: [] };
  for (const r of rows) (columns[r.status] || (columns[r.status] = [])).push(r);
  return { columns, total: rows.length };
}

// Fetch one task if the caller may see it (returns null when not visible).
async function fetchVisibleTask(x, user, taskId) {
  const vis = await buildVisibility(x, user);
  const row = await x.get(`SELECT t.* FROM tasks t WHERE t.id = ? AND t.company_id = ? AND t.deleted_at IS NULL${vis.clause}`, [taskId, user.companyId, ...vis.params]);
  return row || null;
}

async function getTask(user, taskId) {
  return withExecutor(async (x) => {
    const task = await fetchVisibleTask(x, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    task.labels = task.labels ? safeJsonArr(task.labels) : [];
    const assignees = await loadAssignees(x, taskId);
    const checklist = await x.all('SELECT * FROM task_checklist_items WHERE task_id = ? ORDER BY position, id', [taskId]);
    const comments = (await x.all(`SELECT c.*, u.name AS author_name FROM task_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.created_at ASC`, [taskId]))
      .map(c => ({ ...c, mentions: c.mentions ? safeJsonArr(c.mentions) : [] }));
    const activity = await x.all(`SELECT a.*, u.name AS actor_name FROM task_activity a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.task_id = ? ORDER BY a.created_at DESC LIMIT 100`, [taskId]);
    const attachments = await x.all('SELECT id, original_name, file_size, mime_type, uploaded_by, created_at FROM task_attachments WHERE task_id = ? AND deleted_at IS NULL ORDER BY id DESC', [taskId]);
    return { task, assignees, checklist, comments, activity, attachments };
  });
}

// Can this user modify the task? creator, an assignee (visible), or a manager/owner.
async function canEdit(x, user, task) {
  if (canManage(user)) return true;
  if (task.assigned_by === user.userId) return true;
  return !!(await fetchVisibleTask(x, user, task.id)); // visible => assignee
}

async function updateTask(user, taskId, patch = {}) {
  if (patch.status && !STATUSES.has(patch.status)) return { error: 'invalid status', code: 400 };
  if (patch.priority && !PRIORITIES.has(patch.priority)) return { error: 'invalid priority', code: 400 };

  return withTx(async (x) => {
    const task = await x.get('SELECT * FROM tasks WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [taskId, user.companyId]);
    if (!task) return { error: 'not_found', code: 404 };
    if (!(await canEdit(x, user, task))) return { error: 'forbidden', code: 403 };

    const sets = [], params = [];
    for (const f of TASK_FIELDS) {
      if (patch[f] === undefined) continue;
      sets.push(`${f} = ?`);
      params.push(f === 'progress' || f === 'recurrence_interval' ? Number(patch[f]) : patch[f]);
    }
    if (patch.labels !== undefined) { sets.push('labels = ?'); params.push(JSON.stringify(patch.labels || [])); }

    const nowExpr = 'now()';
    const becomingComplete = patch.status === 'completed' && task.status !== 'completed';
    if (becomingComplete) { sets.push(`completed_at = ${nowExpr}`, 'progress = 100'); }

    if (sets.length) {
      sets.push(`updated_at = ${nowExpr}`);
      await x.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, [...params, taskId]);
    }
    if (patch.status && patch.status !== task.status) {
      await logActivity(x, taskId, user.userId, 'status_changed', `${task.status} → ${patch.status}`);
    } else if (sets.length) {
      await logActivity(x, taskId, user.userId, 'updated', Object.keys(patch).join(', '));
    }

    // Notify on completion + spawn next recurring occurrence.
    if (becomingComplete) {
      const assignmentRows = await x.all('SELECT assignee_type, assignee_id FROM task_assignments WHERE task_id = ?', [taskId]);
      const targets = await assignmentEmployeeIds(x, user.companyId, assignmentRows);
      await notifyEmployees(x, user.companyId, targets, { title: 'Task completed', body: `Completed: ${task.title}`, taskId }, user.userId);
      if (task.assigned_by && task.assigned_by !== user.userId) {
        await x.run(`INSERT INTO notifications (company_id, user_id, type, title, body, related_type, related_id) VALUES (?, ?, 'task', ?, ?, 'task', ?)`,
          [user.companyId, task.assigned_by, 'Task completed', `Completed: ${task.title}`, taskId]);
      }
      if (task.recurrence && task.recurrence !== 'none') await spawnNextOccurrence(x, user, task);
    }
    return x.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  });
}

// Clone a completed recurring task into its next occurrence (fresh status, next
// due date, same assignments & checklist) so recurring work regenerates.
async function spawnNextOccurrence(x, user, task) {
  const nextDue = nextRecurrenceDate(task);
  const newId = await x.insert(`
    INSERT INTO tasks (company_id, branch_id, title, description, priority, category, status, progress, labels,
      assigned_by, department_id, team_id, start_date, due_date, estimated_minutes, recurrence, recurrence_interval, parent_task_id)
    VALUES (?, ?, ?, ?, ?, ?, 'todo', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [task.company_id, task.branch_id, task.title, task.description, task.priority, task.category, task.labels,
    task.assigned_by, task.department_id, task.team_id, null, nextDue, task.estimated_minutes,
    task.recurrence, task.recurrence_interval, task.id]);

  const asg = await x.all('SELECT assignee_type, assignee_id FROM task_assignments WHERE task_id = ?', [task.id]);
  for (const a of asg) {
    await x.run('INSERT INTO task_assignments (task_id, assignee_type, assignee_id) VALUES (?, ?, ?) ON CONFLICT (task_id, assignee_type, assignee_id) DO NOTHING', [newId, a.assignee_type, a.assignee_id]);
  }
  for (const ci of await x.all('SELECT title, position FROM task_checklist_items WHERE task_id = ?', [task.id])) {
    await x.run('INSERT INTO task_checklist_items (task_id, title, position) VALUES (?, ?, ?)', [newId, ci.title, ci.position]);
  }
  await logActivity(x, newId, user.userId, 'created', `Recurring from task #${task.id}`);
  return newId;
}

async function deleteTask(user, taskId) {
  return withExecutor(async (x) => {
    const task = await x.get('SELECT id, assigned_by FROM tasks WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [taskId, user.companyId]);
    if (!task) return { error: 'not_found', code: 404 };
    if (!canManage(user) && task.assigned_by !== user.userId) return { error: 'forbidden', code: 403 };
    const nowExpr = 'now()';
    await x.run(`UPDATE tasks SET deleted_at = ${nowExpr} WHERE id = ?`, [taskId]);
    return { deleted: true };
  });
}

async function addAssignees(user, taskId, data) {
  return withTx(async (x) => {
    const task = await x.get('SELECT id, title, assigned_by FROM tasks WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [taskId, user.companyId]);
    if (!task) return { error: 'not_found', code: 404 };
    if (!canManage(user) && task.assigned_by !== user.userId) return { error: 'forbidden', code: 403 };
    const assignments = await normalizeAssignments(x, user.companyId, data);
    if (!assignments.length) return { error: 'No valid assignees', code: 400 };
    if (assignments.some(a => a.assignee_type !== 'employee') && !canManage(user)) return { error: 'Only owners/managers can assign to a team, department or branch', code: 403 };

    let added = 0;
    for (const a of assignments) {
      const r = await x.run('INSERT INTO task_assignments (task_id, assignee_type, assignee_id) VALUES (?, ?, ?) ON CONFLICT (task_id, assignee_type, assignee_id) DO NOTHING', [taskId, a.assignee_type, a.assignee_id]);
      added += r.changes;
    }
    await logActivity(x, taskId, user.userId, 'assigned', assignments.map(a => `${a.assignee_type}#${a.assignee_id}`).join(', '));
    await notifyEmployees(x, user.companyId, await assignmentEmployeeIds(x, user.companyId, assignments), { title: 'New task assigned', body: `You have been assigned: ${task.title}`, taskId }, user.userId);
    return { added };
  });
}

async function removeAssignee(user, taskId, assigneeType, assigneeId) {
  return withExecutor(async (x) => {
    const task = await x.get('SELECT id, assigned_by FROM tasks WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [taskId, user.companyId]);
    if (!task) return { error: 'not_found', code: 404 };
    if (!canManage(user) && task.assigned_by !== user.userId) return { error: 'forbidden', code: 403 };
    const r = await x.run('DELETE FROM task_assignments WHERE task_id = ? AND assignee_type = ? AND assignee_id = ?', [taskId, assigneeType, Number(assigneeId)]);
    if (r.changes === 0) return { error: 'not_found', code: 404 };
    await logActivity(x, taskId, user.userId, 'unassigned', `${assigneeType}#${assigneeId}`);
    return { removed: true };
  });
}

async function addComment(user, taskId, body, mentions = []) {
  if (!body || !String(body).trim()) return { error: 'comment body is required', code: 400 };

  return withTx(async (x) => {
    const task = await fetchVisibleTask(x, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    const cleanMentions = (mentions || []).map(Number).filter(n => n);
    const id = await x.insert('INSERT INTO task_comments (task_id, user_id, body, mentions) VALUES (?, ?, ?, ?)',
      [taskId, user.userId, String(body), cleanMentions.length ? JSON.stringify(cleanMentions) : null]);
    await logActivity(x, taskId, user.userId, 'commented', null);
    if (cleanMentions.length) await notifyEmployees(x, user.companyId, cleanMentions, { title: 'You were mentioned', body: `Mentioned on "${task.title}"`, taskId }, user.userId);
    if (task.assigned_by && task.assigned_by !== user.userId) {
      await x.run(`INSERT INTO notifications (company_id, user_id, type, title, body, related_type, related_id) VALUES (?, ?, 'task', ?, ?, 'task', ?)`,
        [user.companyId, task.assigned_by, 'New comment', `New comment on "${task.title}"`, taskId]);
    }
    return { id };
  });
}

async function addChecklistItem(user, taskId, title) {
  if (!title || !String(title).trim()) return { error: 'title is required', code: 400 };

  return withExecutor(async (x) => {
    const task = await fetchVisibleTask(x, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    const posRow = await x.get('SELECT MAX(position) m FROM task_checklist_items WHERE task_id = ?', [taskId]);
    const pos = (posRow?.m || 0) + 1;
    const id = await x.insert('INSERT INTO task_checklist_items (task_id, title, position) VALUES (?, ?, ?)', [taskId, String(title), pos]);
    await recomputeProgress(x, taskId);
    await logActivity(x, taskId, user.userId, 'checklist_added', String(title));
    const progressRow = await x.get('SELECT progress FROM tasks WHERE id = ?', [taskId]);
    return { id, progress: progressRow.progress };
  });
}

async function toggleChecklistItem(user, taskId, itemId, isDone) {
  return withExecutor(async (x) => {
    const task = await fetchVisibleTask(x, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    const item = await x.get('SELECT id FROM task_checklist_items WHERE id = ? AND task_id = ?', [itemId, taskId]);
    if (!item) return { error: 'not_found', code: 404 };
    const done = isDone ? true : false;
    await x.run('UPDATE task_checklist_items SET is_done = ?, done_at = ? WHERE id = ?', [done, isDone ? new Date().toISOString() : null, itemId]);
    const progress = await recomputeProgress(x, taskId);
    await logActivity(x, taskId, user.userId, isDone ? 'checklist_done' : 'checklist_undone', null);
    return { updated: true, progress };
  });
}

async function deleteChecklistItem(user, taskId, itemId) {
  return withExecutor(async (x) => {
    const task = await fetchVisibleTask(x, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    const r = await x.run('DELETE FROM task_checklist_items WHERE id = ? AND task_id = ?', [itemId, taskId]);
    if (r.changes === 0) return { error: 'not_found', code: 404 };
    await recomputeProgress(x, taskId);
    return { deleted: true };
  });
}

// ── Attachments (route handles multer; service records/serves) ───────────────
async function recordAttachment(user, taskId, file) {
  return withExecutor(async (x) => {
    const task = await fetchVisibleTask(x, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    const id = await x.insert(`INSERT INTO task_attachments (task_id, company_id, file_name, original_name, file_path, file_size, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, user.companyId, file.filename, file.originalname, file.path, file.size, file.mimetype, user.userId]);
    await logActivity(x, taskId, user.userId, 'attachment_added', file.originalname);
    return { id, original_name: file.originalname, file_size: file.size, mime_type: file.mimetype };
  });
}

async function getAttachmentForDownload(user, attId) {
  return withExecutor(async (x) => {
    return (await x.get('SELECT * FROM task_attachments WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [attId, user.companyId])) || null;
  });
}

async function deleteAttachment(user, attId) {
  return withExecutor(async (x) => {
    const att = await x.get('SELECT id, task_id FROM task_attachments WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [attId, user.companyId]);
    if (!att) return { error: 'not_found', code: 404 };
    const nowExpr = 'now()';
    await x.run(`UPDATE task_attachments SET deleted_at = ${nowExpr} WHERE id = ?`, [attId]);
    await logActivity(x, att.task_id, user.userId, 'attachment_removed', null);
    return { deleted: true };
  });
}

// ── Workforce/Task analytics (deterministic SQL) ─────────────────────────────
async function analytics(user) {
  return withExecutor(async (x) => {
    const vis = await buildVisibility(x, user);
    const base = `FROM tasks t WHERE t.company_id = ? AND t.deleted_at IS NULL${vis.clause}`;
    const p = [user.companyId, ...vis.params];
    const total = (await x.get(`SELECT COUNT(*) c ${base}`, p)).c;
    const byStatus = await x.all(`SELECT status, COUNT(*) c ${base} GROUP BY status`, p);
    const byPriority = await x.all(`SELECT priority, COUNT(*) c ${base} GROUP BY priority`, p);
    const completed = (await x.get(`SELECT COUNT(*) c ${base} AND t.status='completed'`, p)).c;
    const todayExpr = 'CURRENT_DATE';
    const overdue = (await x.get(`SELECT COUNT(*) c ${base} AND t.status NOT IN ('completed','cancelled') AND t.due_date IS NOT NULL AND t.due_date < ${todayExpr}`, p)).c;
    const completedDateExpr = 't.completed_at::date';
    const lateCompleted = (await x.get(`SELECT COUNT(*) c ${base} AND t.status='completed' AND t.due_date IS NOT NULL AND ${completedDateExpr} > t.due_date`, p)).c;
    const avgExpr = `AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 86400.0)`;
    const avgRow = await x.get(`SELECT ${avgExpr} d ${base} AND t.status='completed' AND t.completed_at IS NOT NULL`, p);
    const avgCompletionDays = avgRow.d != null ? Math.round(avgRow.d * 10) / 10 : null;
    return {
      total, completed, overdue, lateCompleted,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      avgCompletionDays, byStatus, byPriority,
    };
  });
}

module.exports = {
  createTask, listTasks, getBoard, getTask, updateTask, deleteTask,
  addAssignees, removeAssignee, addComment, addChecklistItem, toggleChecklistItem, deleteChecklistItem,
  recordAttachment, getAttachmentForDownload, deleteAttachment, analytics,
  STATUSES, PRIORITIES,
};
