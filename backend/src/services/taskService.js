// ============================================================================
// Task Service — all Task Management business logic & SQL. Routes stay thin.
//
// A task can be assigned to individual employees, a whole team, a department, or
// a branch (task_assignments.assignee_type). Assignee membership is resolved at
// query time so team/department changes stay reflected. Everything is scoped to
// the caller's company; visibility is row-level by role (see buildVisibility).
// Notifications reuse the existing `notifications` table (same shape the leave
// and compliance reminders use). No arithmetic is done by any LLM here.
// ============================================================================
const { getDb } = require('../config/db');

const STATUSES = new Set(['todo', 'in_progress', 'review', 'blocked', 'completed', 'cancelled']);
const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const ASSIGNEE_TYPES = new Set(['employee', 'team', 'department', 'branch']);

const canManage = (user) => ['admin', 'OWNER', 'MANAGER'].includes(user.role);
const isPrivileged = (user) => ['admin', 'OWNER'].includes(user.role);

function safeJsonArr(s) { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
function placeholders(arr) { return arr.map(() => '?').join(','); }

// The caller's own employee record (employees.user_id = the JWT userId).
function callerEmployee(db, companyId, userId) {
  return db.prepare('SELECT id FROM employees WHERE user_id = ? AND company_id = ? AND deleted_at IS NULL').get(userId, companyId) || null;
}

// Direct reports of an employee — used to widen a MANAGER's visibility.
function subordinateIds(db, companyId, empId) {
  if (!empId) return [];
  return db.prepare('SELECT id FROM employees WHERE manager_id = ? AND company_id = ? AND deleted_at IS NULL').all(empId, companyId).map(r => r.id);
}

// ── Assignment validation & resolution ──────────────────────────────────────
// Normalize the many convenience shapes a caller may send into a clean list of
// {assignee_type, assignee_id}, keeping only rows that belong to this company.
function normalizeAssignments(db, companyId, data) {
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
    if (a.assignee_type === 'employee') exists = !!db.prepare('SELECT 1 FROM employees WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(a.assignee_id, companyId);
    else if (a.assignee_type === 'team') exists = !!db.prepare('SELECT 1 FROM teams WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(a.assignee_id, companyId);
    else if (a.assignee_type === 'department') exists = !!db.prepare('SELECT 1 FROM departments WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(a.assignee_id, companyId);
    else if (a.assignee_type === 'branch') exists = !!db.prepare('SELECT 1 FROM branches WHERE id = ? AND company_id = ?').get(a.assignee_id, companyId);
    if (exists) { ok.push(a); seen.add(key); }
  }
  return ok;
}

// Expand a set of assignments to the concrete employee ids they target
// (for notifications). Membership resolved live.
function assignmentEmployeeIds(db, companyId, assignments) {
  const ids = new Set();
  for (const a of assignments) {
    if (a.assignee_type === 'employee') ids.add(a.assignee_id);
    else if (a.assignee_type === 'team') db.prepare('SELECT employee_id FROM team_members WHERE team_id = ?').all(a.assignee_id).forEach(r => ids.add(r.employee_id));
    else if (a.assignee_type === 'department') db.prepare('SELECT id FROM employees WHERE department_id = ? AND company_id = ? AND deleted_at IS NULL').all(a.assignee_id, companyId).forEach(r => ids.add(r.id));
    else if (a.assignee_type === 'branch') db.prepare('SELECT e.id FROM employees e JOIN user_branches ub ON ub.user_id = e.user_id WHERE ub.branch_id = ? AND e.company_id = ? AND e.deleted_at IS NULL').all(a.assignee_id, companyId).forEach(r => ids.add(r.id));
  }
  return [...ids];
}

// Insert one notification per distinct target user (employees.user_id), skipping
// the actor and employees without a login. Reuses the shared notifications table.
function notifyEmployees(db, companyId, employeeIds, { type = 'task', title, body, taskId }, excludeUserId) {
  if (!employeeIds.length) return 0;
  const rows = db.prepare(`SELECT DISTINCT user_id FROM employees WHERE company_id = ? AND user_id IS NOT NULL AND id IN (${placeholders(employeeIds)})`).all(companyId, ...employeeIds);
  const stmt = db.prepare(`INSERT INTO notifications (company_id, user_id, type, title, body, related_type, related_id) VALUES (?, ?, ?, ?, ?, 'task', ?)`);
  let n = 0;
  for (const r of rows) {
    if (excludeUserId && r.user_id === excludeUserId) continue;
    stmt.run(companyId, r.user_id, type, title, body, taskId);
    n++;
  }
  return n;
}

function logActivity(db, taskId, userId, action, detail = null) {
  db.prepare('INSERT INTO task_activity (task_id, actor_user_id, action, detail) VALUES (?, ?, ?, ?)').run(taskId, userId || null, action, detail);
}

// Row-level visibility fragment. Privileged roles (OWNER/admin) see all company
// tasks; everyone else sees tasks they created or are assigned to (a MANAGER also
// sees tasks assigned to their direct reports). Returns SQL appended after an
// existing `WHERE t.company_id = ?`.
function buildVisibility(db, user) {
  if (isPrivileged(user)) return { clause: '', params: [] };
  const me = callerEmployee(db, user.companyId, user.userId);
  const visible = [];
  if (me) {
    visible.push(me.id);
    if (user.role === 'MANAGER') visible.push(...subordinateIds(db, user.companyId, me.id));
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
function loadAssignees(db, taskId) {
  const rows = db.prepare('SELECT assignee_type, assignee_id FROM task_assignments WHERE task_id = ?').all(taskId);
  return rows.map(a => {
    let name = null, avatar = null;
    if (a.assignee_type === 'employee') { const e = db.prepare('SELECT name, avatar FROM employees WHERE id = ?').get(a.assignee_id); name = e?.name; avatar = e?.avatar; }
    else if (a.assignee_type === 'team') name = db.prepare('SELECT name FROM teams WHERE id = ?').get(a.assignee_id)?.name;
    else if (a.assignee_type === 'department') name = db.prepare('SELECT name FROM departments WHERE id = ?').get(a.assignee_id)?.name;
    else if (a.assignee_type === 'branch') name = db.prepare('SELECT name FROM branches WHERE id = ?').get(a.assignee_id)?.name;
    return { ...a, name: name || `#${a.assignee_id}`, avatar };
  });
}

function recomputeProgress(db, taskId) {
  const c = db.prepare('SELECT COUNT(*) total, SUM(is_done) done FROM task_checklist_items WHERE task_id = ?').get(taskId);
  if (c && c.total > 0) {
    const pct = Math.round(((c.done || 0) / c.total) * 100);
    db.prepare("UPDATE tasks SET progress = ?, updated_at = datetime('now') WHERE id = ?").run(pct, taskId);
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

function createTask(user, data) {
  const db = getDb();
  try {
    if (!data.title) return { error: 'title is required', code: 400 };
    if (data.status && !STATUSES.has(data.status)) return { error: 'invalid status', code: 400 };
    if (data.priority && !PRIORITIES.has(data.priority)) return { error: 'invalid priority', code: 400 };

    const assignments = normalizeAssignments(db, user.companyId, data);
    const hasGroup = assignments.some(a => a.assignee_type !== 'employee');
    if (hasGroup && !canManage(user)) return { error: 'Only owners/managers can assign to a team, department or branch', code: 403 };

    db.exec('BEGIN TRANSACTION');
    try {
      const info = db.prepare(`
        INSERT INTO tasks (company_id, branch_id, title, description, priority, category, status, progress,
          labels, assigned_by, department_id, team_id, start_date, due_date, estimated_minutes, recurrence, recurrence_interval)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user.companyId, data.branch_id || null, data.title, data.description || null,
        data.priority || 'medium', data.category || null, data.status || 'todo', Number(data.progress || 0),
        data.labels ? JSON.stringify(data.labels) : null, user.userId, data.department_id || null, data.team_id || null,
        data.start_date || null, data.due_date || null, data.estimated_minutes || null,
        data.recurrence || 'none', Number(data.recurrence_interval || 1));
      const taskId = info.lastInsertRowid;

      const ins = db.prepare('INSERT OR IGNORE INTO task_assignments (task_id, assignee_type, assignee_id) VALUES (?, ?, ?)');
      for (const a of assignments) ins.run(taskId, a.assignee_type, a.assignee_id);

      logActivity(db, taskId, user.userId, 'created', data.title);
      const targets = assignmentEmployeeIds(db, user.companyId, assignments);
      notifyEmployees(db, user.companyId, targets, { title: 'New task assigned', body: `You have been assigned: ${data.title}`, taskId }, user.userId);
      db.exec('COMMIT');
      return { id: taskId };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } finally { db.close(); }
}

function listTasks(user, filters = {}) {
  const db = getDb();
  try {
    const vis = buildVisibility(db, user);
    let sql = `
      SELECT t.*, u.name AS assigned_by_name,
        (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) AS comment_count,
        (SELECT COUNT(*) FROM task_checklist_items ci WHERE ci.task_id = t.id) AS checklist_total,
        (SELECT COUNT(*) FROM task_checklist_items ci WHERE ci.task_id = t.id AND ci.is_done = 1) AS checklist_done,
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
    const rows = db.prepare(sql).all(...params).map(r => ({ ...r, labels: r.labels ? safeJsonArr(r.labels) : [], assignees: loadAssignees(db, r.id) }));
    return rows;
  } finally { db.close(); }
}

function getBoard(user, filters = {}) {
  const rows = listTasks(user, filters);
  const columns = { todo: [], in_progress: [], review: [], blocked: [], completed: [], cancelled: [] };
  for (const r of rows) (columns[r.status] || (columns[r.status] = [])).push(r);
  return { columns, total: rows.length };
}

// Fetch one task if the caller may see it (returns null when not visible).
function fetchVisibleTask(db, user, taskId) {
  const vis = buildVisibility(db, user);
  const row = db.prepare(`SELECT t.* FROM tasks t WHERE t.id = ? AND t.company_id = ? AND t.deleted_at IS NULL${vis.clause}`).get(taskId, user.companyId, ...vis.params);
  return row || null;
}

function getTask(user, taskId) {
  const db = getDb();
  try {
    const task = fetchVisibleTask(db, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    task.labels = task.labels ? safeJsonArr(task.labels) : [];
    const assignees = loadAssignees(db, taskId);
    const checklist = db.prepare('SELECT * FROM task_checklist_items WHERE task_id = ? ORDER BY position, id').all(taskId);
    const comments = db.prepare(`SELECT c.*, u.name AS author_name FROM task_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.created_at ASC`).all(taskId)
      .map(c => ({ ...c, mentions: c.mentions ? safeJsonArr(c.mentions) : [] }));
    const activity = db.prepare(`SELECT a.*, u.name AS actor_name FROM task_activity a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.task_id = ? ORDER BY a.created_at DESC LIMIT 100`).all(taskId);
    const attachments = db.prepare('SELECT id, original_name, file_size, mime_type, uploaded_by, created_at FROM task_attachments WHERE task_id = ? AND deleted_at IS NULL ORDER BY id DESC').all(taskId);
    return { task, assignees, checklist, comments, activity, attachments };
  } finally { db.close(); }
}

// Can this user modify the task? creator, an assignee (visible), or a manager/owner.
function canEdit(db, user, task) {
  if (canManage(user)) return true;
  if (task.assigned_by === user.userId) return true;
  return !!fetchVisibleTask(db, user, task.id); // visible => assignee
}

function updateTask(user, taskId, patch = {}) {
  const db = getDb();
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(taskId, user.companyId);
    if (!task) return { error: 'not_found', code: 404 };
    if (!canEdit(db, user, task)) return { error: 'forbidden', code: 403 };
    if (patch.status && !STATUSES.has(patch.status)) return { error: 'invalid status', code: 400 };
    if (patch.priority && !PRIORITIES.has(patch.priority)) return { error: 'invalid priority', code: 400 };

    const sets = [], params = [];
    for (const f of TASK_FIELDS) {
      if (patch[f] === undefined) continue;
      sets.push(`${f} = ?`);
      params.push(f === 'progress' || f === 'recurrence_interval' ? Number(patch[f]) : patch[f]);
    }
    if (patch.labels !== undefined) { sets.push('labels = ?'); params.push(JSON.stringify(patch.labels || [])); }

    const becomingComplete = patch.status === 'completed' && task.status !== 'completed';
    if (becomingComplete) { sets.push("completed_at = datetime('now')", 'progress = 100'); }

    db.exec('BEGIN TRANSACTION');
    try {
      if (sets.length) {
        sets.push("updated_at = datetime('now')");
        db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params, taskId);
      }
      if (patch.status && patch.status !== task.status) {
        logActivity(db, taskId, user.userId, 'status_changed', `${task.status} → ${patch.status}`);
      } else if (sets.length) {
        logActivity(db, taskId, user.userId, 'updated', Object.keys(patch).join(', '));
      }

      // Notify on completion + spawn next recurring occurrence.
      if (becomingComplete) {
        const targets = assignmentEmployeeIds(db, user.companyId, db.prepare('SELECT assignee_type, assignee_id FROM task_assignments WHERE task_id = ?').all(taskId));
        notifyEmployees(db, user.companyId, targets, { title: 'Task completed', body: `Completed: ${task.title}`, taskId }, user.userId);
        if (task.assigned_by && task.assigned_by !== user.userId) {
          db.prepare(`INSERT INTO notifications (company_id, user_id, type, title, body, related_type, related_id) VALUES (?, ?, 'task', ?, ?, 'task', ?)`)
            .run(user.companyId, task.assigned_by, 'Task completed', `Completed: ${task.title}`, taskId);
        }
        if (task.recurrence && task.recurrence !== 'none') spawnNextOccurrence(db, user, task);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  } finally { db.close(); }
}

// Clone a completed recurring task into its next occurrence (fresh status, next
// due date, same assignments & checklist) so recurring work regenerates.
function spawnNextOccurrence(db, user, task) {
  const nextDue = nextRecurrenceDate(task);
  const info = db.prepare(`
    INSERT INTO tasks (company_id, branch_id, title, description, priority, category, status, progress, labels,
      assigned_by, department_id, team_id, start_date, due_date, estimated_minutes, recurrence, recurrence_interval, parent_task_id)
    VALUES (?, ?, ?, ?, ?, ?, 'todo', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(task.company_id, task.branch_id, task.title, task.description, task.priority, task.category, task.labels,
    task.assigned_by, task.department_id, task.team_id, null, nextDue, task.estimated_minutes,
    task.recurrence, task.recurrence_interval, task.id);
  const newId = info.lastInsertRowid;
  const asg = db.prepare('SELECT assignee_type, assignee_id FROM task_assignments WHERE task_id = ?').all(task.id);
  const ins = db.prepare('INSERT OR IGNORE INTO task_assignments (task_id, assignee_type, assignee_id) VALUES (?, ?, ?)');
  for (const a of asg) ins.run(newId, a.assignee_type, a.assignee_id);
  for (const ci of db.prepare('SELECT title, position FROM task_checklist_items WHERE task_id = ?').all(task.id)) {
    db.prepare('INSERT INTO task_checklist_items (task_id, title, position) VALUES (?, ?, ?)').run(newId, ci.title, ci.position);
  }
  logActivity(db, newId, user.userId, 'created', `Recurring from task #${task.id}`);
  return newId;
}

function deleteTask(user, taskId) {
  const db = getDb();
  try {
    const task = db.prepare('SELECT id, assigned_by FROM tasks WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(taskId, user.companyId);
    if (!task) return { error: 'not_found', code: 404 };
    if (!canManage(user) && task.assigned_by !== user.userId) return { error: 'forbidden', code: 403 };
    db.prepare("UPDATE tasks SET deleted_at = datetime('now') WHERE id = ?").run(taskId);
    return { deleted: true };
  } finally { db.close(); }
}

function addAssignees(user, taskId, data) {
  const db = getDb();
  try {
    const task = db.prepare('SELECT id, title, assigned_by FROM tasks WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(taskId, user.companyId);
    if (!task) return { error: 'not_found', code: 404 };
    if (!canManage(user) && task.assigned_by !== user.userId) return { error: 'forbidden', code: 403 };
    const assignments = normalizeAssignments(db, user.companyId, data);
    if (!assignments.length) return { error: 'No valid assignees', code: 400 };
    if (assignments.some(a => a.assignee_type !== 'employee') && !canManage(user)) return { error: 'Only owners/managers can assign to a team, department or branch', code: 403 };
    db.exec('BEGIN TRANSACTION');
    try {
      const ins = db.prepare('INSERT OR IGNORE INTO task_assignments (task_id, assignee_type, assignee_id) VALUES (?, ?, ?)');
      let added = 0;
      for (const a of assignments) added += ins.run(taskId, a.assignee_type, a.assignee_id).changes;
      logActivity(db, taskId, user.userId, 'assigned', assignments.map(a => `${a.assignee_type}#${a.assignee_id}`).join(', '));
      notifyEmployees(db, user.companyId, assignmentEmployeeIds(db, user.companyId, assignments), { title: 'New task assigned', body: `You have been assigned: ${task.title}`, taskId }, user.userId);
      db.exec('COMMIT');
      return { added };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } finally { db.close(); }
}

function removeAssignee(user, taskId, assigneeType, assigneeId) {
  const db = getDb();
  try {
    const task = db.prepare('SELECT id, assigned_by FROM tasks WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(taskId, user.companyId);
    if (!task) return { error: 'not_found', code: 404 };
    if (!canManage(user) && task.assigned_by !== user.userId) return { error: 'forbidden', code: 403 };
    const r = db.prepare('DELETE FROM task_assignments WHERE task_id = ? AND assignee_type = ? AND assignee_id = ?').run(taskId, assigneeType, Number(assigneeId));
    if (r.changes === 0) return { error: 'not_found', code: 404 };
    logActivity(db, taskId, user.userId, 'unassigned', `${assigneeType}#${assigneeId}`);
    return { removed: true };
  } finally { db.close(); }
}

function addComment(user, taskId, body, mentions = []) {
  const db = getDb();
  try {
    const task = fetchVisibleTask(db, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    if (!body || !String(body).trim()) return { error: 'comment body is required', code: 400 };
    const cleanMentions = (mentions || []).map(Number).filter(n => n);
    db.exec('BEGIN TRANSACTION');
    try {
      const info = db.prepare('INSERT INTO task_comments (task_id, user_id, body, mentions) VALUES (?, ?, ?, ?)').run(taskId, user.userId, String(body), cleanMentions.length ? JSON.stringify(cleanMentions) : null);
      logActivity(db, taskId, user.userId, 'commented', null);
      if (cleanMentions.length) notifyEmployees(db, user.companyId, cleanMentions, { title: 'You were mentioned', body: `Mentioned on "${task.title}"`, taskId }, user.userId);
      if (task.assigned_by && task.assigned_by !== user.userId) {
        db.prepare(`INSERT INTO notifications (company_id, user_id, type, title, body, related_type, related_id) VALUES (?, ?, 'task', ?, ?, 'task', ?)`).run(user.companyId, task.assigned_by, 'New comment', `New comment on "${task.title}"`, taskId);
      }
      db.exec('COMMIT');
      return { id: info.lastInsertRowid };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } finally { db.close(); }
}

function addChecklistItem(user, taskId, title) {
  const db = getDb();
  try {
    const task = fetchVisibleTask(db, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    if (!title || !String(title).trim()) return { error: 'title is required', code: 400 };
    const pos = (db.prepare('SELECT MAX(position) m FROM task_checklist_items WHERE task_id = ?').get(taskId).m || 0) + 1;
    const info = db.prepare('INSERT INTO task_checklist_items (task_id, title, position) VALUES (?, ?, ?)').run(taskId, String(title), pos);
    recomputeProgress(db, taskId);
    logActivity(db, taskId, user.userId, 'checklist_added', String(title));
    return { id: info.lastInsertRowid, progress: db.prepare('SELECT progress FROM tasks WHERE id = ?').get(taskId).progress };
  } finally { db.close(); }
}

function toggleChecklistItem(user, taskId, itemId, isDone) {
  const db = getDb();
  try {
    const task = fetchVisibleTask(db, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    const item = db.prepare('SELECT id FROM task_checklist_items WHERE id = ? AND task_id = ?').get(itemId, taskId);
    if (!item) return { error: 'not_found', code: 404 };
    const done = isDone ? 1 : 0;
    db.prepare('UPDATE task_checklist_items SET is_done = ?, done_at = ? WHERE id = ?').run(done, done ? new Date().toISOString() : null, itemId);
    const progress = recomputeProgress(db, taskId);
    logActivity(db, taskId, user.userId, done ? 'checklist_done' : 'checklist_undone', null);
    return { updated: true, progress };
  } finally { db.close(); }
}

function deleteChecklistItem(user, taskId, itemId) {
  const db = getDb();
  try {
    const task = fetchVisibleTask(db, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    const r = db.prepare('DELETE FROM task_checklist_items WHERE id = ? AND task_id = ?').run(itemId, taskId);
    if (r.changes === 0) return { error: 'not_found', code: 404 };
    recomputeProgress(db, taskId);
    return { deleted: true };
  } finally { db.close(); }
}

// ── Attachments (route handles multer; service records/serves) ───────────────
function recordAttachment(user, taskId, file) {
  const db = getDb();
  try {
    const task = fetchVisibleTask(db, user, taskId);
    if (!task) return { error: 'not_found', code: 404 };
    const info = db.prepare(`INSERT INTO task_attachments (task_id, company_id, file_name, original_name, file_path, file_size, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(taskId, user.companyId, file.filename, file.originalname, file.path, file.size, file.mimetype, user.userId);
    logActivity(db, taskId, user.userId, 'attachment_added', file.originalname);
    return { id: info.lastInsertRowid, original_name: file.originalname, file_size: file.size, mime_type: file.mimetype };
  } finally { db.close(); }
}

function getAttachmentForDownload(user, attId) {
  const db = getDb();
  try {
    return db.prepare('SELECT * FROM task_attachments WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(attId, user.companyId) || null;
  } finally { db.close(); }
}

function deleteAttachment(user, attId) {
  const db = getDb();
  try {
    const att = db.prepare('SELECT id, task_id FROM task_attachments WHERE id = ? AND company_id = ? AND deleted_at IS NULL').get(attId, user.companyId);
    if (!att) return { error: 'not_found', code: 404 };
    db.prepare("UPDATE task_attachments SET deleted_at = datetime('now') WHERE id = ?").run(attId);
    logActivity(db, att.task_id, user.userId, 'attachment_removed', null);
    return { deleted: true };
  } finally { db.close(); }
}

// ── Workforce/Task analytics (deterministic SQL) ─────────────────────────────
function analytics(user) {
  const db = getDb();
  try {
    const vis = buildVisibility(db, user);
    const base = `FROM tasks t WHERE t.company_id = ? AND t.deleted_at IS NULL${vis.clause}`;
    const p = [user.companyId, ...vis.params];
    const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(...p).c;
    const byStatus = db.prepare(`SELECT status, COUNT(*) c ${base} GROUP BY status`).all(...p);
    const byPriority = db.prepare(`SELECT priority, COUNT(*) c ${base} GROUP BY priority`).all(...p);
    const completed = db.prepare(`SELECT COUNT(*) c ${base} AND t.status='completed'`).get(...p).c;
    const overdue = db.prepare(`SELECT COUNT(*) c ${base} AND t.status NOT IN ('completed','cancelled') AND t.due_date IS NOT NULL AND t.due_date < date('now')`).get(...p).c;
    const lateCompleted = db.prepare(`SELECT COUNT(*) c ${base} AND t.status='completed' AND t.due_date IS NOT NULL AND date(t.completed_at) > t.due_date`).get(...p).c;
    const avgRow = db.prepare(`SELECT AVG(julianday(t.completed_at) - julianday(t.created_at)) d ${base} AND t.status='completed' AND t.completed_at IS NOT NULL`).get(...p);
    const avgCompletionDays = avgRow.d != null ? Math.round(avgRow.d * 10) / 10 : null;
    return {
      total, completed, overdue, lateCompleted,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      avgCompletionDays, byStatus, byPriority,
    };
  } finally { db.close(); }
}

module.exports = {
  createTask, listTasks, getBoard, getTask, updateTask, deleteTask,
  addAssignees, removeAssignee, addComment, addChecklistItem, toggleChecklistItem, deleteChecklistItem,
  recordAttachment, getAttachmentForDownload, deleteAttachment, analytics,
  STATUSES, PRIORITIES,
};
