const express = require('express');
const router = express.Router();
// Separate router for the two endpoints an invitee must reach before they have
// an account or a JWT. Must be mounted in app.js ahead of
// app.use('/api', authenticate, branchAuth, rbacMiddleware) -- previously this
// whole file (including these two routes) was mounted after that global gate,
// so a brand-new invitee hit 401 before ever reaching the handler and could
// never accept an invite. `router` below (list/create/revoke) stays mounted
// at its existing, protected position; only these two move.
const publicRouter = express.Router();
const crypto = require('crypto');
const { getDb } = require('../config/db');
const { dbGet, dbAll, engine } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

// Validate token (public - for accept invite page)
publicRouter.get('/validate/:token', async (req, res, next) => {
  try {
    const nowExpr = engine() === 'postgres' ? 'now()' : "datetime('now')";
    const inv = await dbGet(`
      SELECT i.*, d.name as department_name, b.name as branch_name,
             r.name as role_name, c.name as company_name
      FROM invitations i
      LEFT JOIN departments d ON i.department_id = d.id
      LEFT JOIN branches b ON i.branch_id = b.id
      LEFT JOIN roles r ON i.role_id = r.id
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.token = ? AND i.status = 'pending' AND (i.expires_at IS NULL OR i.expires_at > ${nowExpr})
    `, [req.params.token]);
    if (!inv) return res.status(404).json({ error: 'Invitation not found or expired' });
    res.json(inv);
  } catch (err) { next(err); }
});

// Accept invitation (public - creates user + employee)
publicRouter.post('/accept', async (req, res, next) => {
  try {
    const { token, name, password, phone, date_of_birth, gender } = req.body;
    if (!token || !name || !password) return res.status(400).json({ error: 'token, name, and password required' });

    const nowExpr = engine() === 'postgres' ? 'now()' : "datetime('now')";
    const inv = await dbGet(`SELECT * FROM invitations WHERE token = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > ${nowExpr})`, [token]);
    if (!inv) return res.status(404).json({ error: 'Invalid or expired invitation' });

    const existingUser = await dbGet('SELECT id FROM users WHERE email = ?', [inv.email]);
    if (existingUser) return res.status(409).json({ error: 'An account with this email already exists' });

    const { hashPassword, generateToken } = require('../services/authService');
    const passwordHash = hashPassword(password); // synchronous (bcrypt.hashSync)

    let userId, empId;

    if (engine() === 'postgres') {
      const ids = await withTransaction(async (tx) => {
        const userRow = await tx.getOne(`
          INSERT INTO users (company_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'EMPLOYEE', 'Active') RETURNING id
        `, [inv.company_id, name, inv.email, passwordHash]);
        const txUserId = userRow.id;

        // Auto-generate employee code
        const empCount = await tx.getOne('SELECT count(*) as cnt FROM employees WHERE company_id = ?', [inv.company_id]);
        const empCode = `EMP${String(Number(empCount.cnt) + 1).padStart(5, '0')}`;

        const empRow = await tx.getOne(`
          INSERT INTO employees (company_id, name, department, salary, joining_date, user_id, phone, email, employee_code, department_id, branch_id, date_of_birth, gender, status)
          VALUES (?, ?, 'General', 0, CURRENT_DATE, ?, ?, ?, ?, ?, ?, ?, ?, 'Active') RETURNING id
        `, [inv.company_id, name, txUserId, phone ?? null, inv.email, empCode, inv.department_id, inv.branch_id, date_of_birth ?? null, gender ?? null]);
        const txEmpId = empRow.id;

        // Assign role from invitation
        if (inv.role_id) {
          await tx.query('INSERT INTO user_roles (user_id, role_id, company_id) VALUES (?, ?, ?) ON CONFLICT (user_id, role_id) DO NOTHING', [txUserId, inv.role_id, inv.company_id]);
        }

        // Mark invitation as accepted
        await tx.query(`UPDATE invitations SET status = 'accepted', accepted_at = now() WHERE id = ?`, [inv.id]);

        return { userId: txUserId, empId: txEmpId };
      });
      userId = ids.userId;
      empId = ids.empId;
    } else {
      const db = getDb();
      try {
        db.exec('BEGIN TRANSACTION');
        try {
          const userInfo = db.prepare(`
            INSERT INTO users (company_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'EMPLOYEE', 'Active')
          `).run(inv.company_id, name, inv.email, passwordHash);
          userId = userInfo.lastInsertRowid;

          // Auto-generate employee code
          const empCount = db.prepare('SELECT count(*) as cnt FROM employees WHERE company_id = ?').get(inv.company_id);
          const empCode = `EMP${String(empCount.cnt + 1).padStart(5, '0')}`;

          // phone/date_of_birth/gender are optional on the accept form --
          // node:sqlite rejects a raw JS `undefined` bind value outright
          // (unlike `null`), so an invitee who leaves these blank crashed
          // this insert every time. Confirmed live: this is exactly what was
          // still breaking the invite flow after the auth-exemption fix.
          const empInfo = db.prepare(`
            INSERT INTO employees (company_id, name, department, salary, joining_date, user_id, phone, email, employee_code, department_id, branch_id, date_of_birth, gender, status)
            VALUES (?, ?, 'General', 0, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
          `).run(inv.company_id, name, userId, phone ?? null, inv.email, empCode, inv.department_id, inv.branch_id, date_of_birth ?? null, gender ?? null);
          empId = empInfo.lastInsertRowid;

          // Assign role from invitation
          if (inv.role_id) {
            db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, company_id) VALUES (?, ?, ?)').run(userId, inv.role_id, inv.company_id);
          }

          // Mark invitation as accepted
          db.prepare(`UPDATE invitations SET status = 'accepted', accepted_at = datetime('now') WHERE id = ?`).run(inv.id);

          db.exec('COMMIT');
        } catch (innerErr) {
          db.exec('ROLLBACK');
          throw innerErr;
        }
      } finally { db.close(); }
    }

    const company = await dbGet('SELECT name, business_type FROM companies WHERE id = ?', [inv.company_id]);
    const userPayload = { id: userId, userId, companyId: inv.company_id, name, email: inv.email, role: 'EMPLOYEE', companyName: company?.name, businessType: company?.business_type };
    const jwtToken = generateToken(userPayload);

    res.status(201).json({ token: jwtToken, user: userPayload });
  } catch (err) { next(err); }
});

// All routes below require auth (mounted after app-level authenticate middleware)
// List invitations
router.get('/', async (req, res, next) => {
  try {
    // i.rowid was SQLite's implicit rowid alias -- Postgres has no such
    // column. id is the auto-increment PK and matches insertion order on
    // both engines, so this is a portable one-line swap, not a per-engine
    // branch.
    const invs = await dbAll(`
      SELECT i.*, d.name as department_name, b.name as branch_name,
             r.name as role_name, u.name as invited_by_name
      FROM invitations i
      LEFT JOIN departments d ON i.department_id = d.id
      LEFT JOIN branches b ON i.branch_id = b.id
      LEFT JOIN roles r ON i.role_id = r.id
      LEFT JOIN users u ON i.invited_by = u.id
      WHERE i.company_id = ?
      ORDER BY i.id DESC
    `, [req.user.companyId]);
    res.json(invs);
  } catch (err) { next(err); }
});

// Create invitation
router.post('/', async (req, res, next) => {
  try {
    const { email, role_id, department_id, branch_id, expires_in_days = 7 } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'A user with this email already exists' });

    const pending = await dbGet(`SELECT id FROM invitations WHERE email = ? AND company_id = ? AND status = 'pending'`, [email, req.user.companyId]);
    if (pending) return res.status(409).json({ error: 'An active invitation already exists for this email' });

    const token = crypto.randomBytes(32).toString('hex');
    // datetime('now', '+N days') (SQLite) -> now() + make_interval(days => N)
    // (Postgres) -- a dynamic day offset, not a fixed one, so this can't be
    // a plain literal SQL-text swap like the other datetime('now') sites;
    // make_interval takes the day count as a real parameter on both engines.
    const expiresExpr = engine() === 'postgres'
      ? 'now() + make_interval(days => ?)'
      : "datetime('now', ? || ' days')";
    const expiresParam = engine() === 'postgres' ? Number(expires_in_days) : `+${expires_in_days}`;

    const row = await dbGet(`
      INSERT INTO invitations (company_id, email, token, role_id, department_id, branch_id, invited_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ${expiresExpr}) RETURNING id
    `, [req.user.companyId, email, token, role_id, department_id, branch_id, req.user.userId, expiresParam]);

    const inv = await dbGet('SELECT * FROM invitations WHERE id = ?', [row.id]);
    // In production, send email here. For Phase 2, return invite link.
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.status(201).json({ ...inv, invite_link: `${baseUrl}/accept-invite/${token}` });
  } catch (err) { next(err); }
});

// Revoke invitation
router.delete('/:id', async (req, res, next) => {
  try {
    const inv = await dbGet('SELECT id FROM invitations WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    if (!inv) return res.status(404).json({ error: 'Invitation not found' });
    await dbGet(`UPDATE invitations SET status = 'revoked' WHERE id = ?`, [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
