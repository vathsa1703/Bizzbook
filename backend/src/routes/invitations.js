const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../config/db');

// Validate token (public - for accept invite page)
router.get('/validate/:token', (req, res, next) => {
  const db = getDb();
  try {
    const inv = db.prepare(`
      SELECT i.*, d.name as department_name, b.name as branch_name,
             r.name as role_name, c.name as company_name
      FROM invitations i
      LEFT JOIN departments d ON i.department_id = d.id
      LEFT JOIN branches b ON i.branch_id = b.id
      LEFT JOIN roles r ON i.role_id = r.id
      LEFT JOIN companies c ON i.company_id = c.id
      WHERE i.token = ? AND i.status = 'pending' AND (i.expires_at IS NULL OR i.expires_at > datetime('now'))
    `).get(req.params.token);
    if (!inv) return res.status(404).json({ error: 'Invitation not found or expired' });
    res.json(inv);
  } catch (err) { next(err); } finally { db.close(); }
});

// Accept invitation (public - creates user + employee)
router.post('/accept', (req, res, next) => {
  const db = getDb();
  try {
    const { token, name, password, phone, date_of_birth, gender } = req.body;
    if (!token || !name || !password) return res.status(400).json({ error: 'token, name, and password required' });

    const inv = db.prepare(`SELECT * FROM invitations WHERE token = ? AND status = 'pending' AND (expires_at IS NULL OR expires_at > datetime('now'))`).get(token);
    if (!inv) return res.status(404).json({ error: 'Invalid or expired invitation' });

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(inv.email);
    if (existingUser) return res.status(409).json({ error: 'An account with this email already exists' });

    const { hashPassword, generateToken } = require('../services/authService');
    const passwordHash = hashPassword(password);

    db.exec('BEGIN TRANSACTION');
    try {
      const userInfo = db.prepare(`
        INSERT INTO users (company_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, 'EMPLOYEE', 'Active')
      `).run(inv.company_id, name, inv.email, passwordHash);
      const userId = userInfo.lastInsertRowid;

      // Auto-generate employee code
      const empCount = db.prepare('SELECT count(*) as cnt FROM employees WHERE company_id = ?').get(inv.company_id);
      const empCode = `EMP${String(empCount.cnt + 1).padStart(5, '0')}`;

      const empInfo = db.prepare(`
        INSERT INTO employees (company_id, name, department, salary, joining_date, user_id, phone, email, employee_code, department_id, branch_id, date_of_birth, gender, status)
        VALUES (?, ?, 'General', 0, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
      `).run(inv.company_id, name, userId, phone, inv.email, empCode, inv.department_id, inv.branch_id, date_of_birth, gender);
      const empId = empInfo.lastInsertRowid;

      // Assign role from invitation
      if (inv.role_id) {
        db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, company_id) VALUES (?, ?, ?)').run(userId, inv.role_id, inv.company_id);
      }

      // Mark invitation as accepted
      db.prepare(`UPDATE invitations SET status = 'accepted', accepted_at = datetime('now') WHERE id = ?`).run(inv.id);

      // Link employee back to user
      db.prepare('UPDATE users SET employee_id = COALESCE(employee_id, ?) WHERE id = ?').run(empId, userId).catch?.(() => {});

      db.exec('COMMIT');

      const company = db.prepare('SELECT name, business_type FROM companies WHERE id = ?').get(inv.company_id);
      const userPayload = { id: userId, userId, companyId: inv.company_id, name, email: inv.email, role: 'EMPLOYEE', companyName: company?.name, businessType: company?.business_type };
      const jwtToken = generateToken(userPayload);

      res.status(201).json({ token: jwtToken, user: userPayload });
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
  } catch (err) { next(err); } finally { db.close(); }
});

// All routes below require auth (mounted after app-level authenticate middleware)
// List invitations
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const invs = db.prepare(`
      SELECT i.*, d.name as department_name, b.name as branch_name,
             r.name as role_name, u.name as invited_by_name
      FROM invitations i
      LEFT JOIN departments d ON i.department_id = d.id
      LEFT JOIN branches b ON i.branch_id = b.id
      LEFT JOIN roles r ON i.role_id = r.id
      LEFT JOIN users u ON i.invited_by = u.id
      WHERE i.company_id = ?
      ORDER BY i.rowid DESC
    `).all(req.user.companyId);
    res.json(invs);
  } catch (err) { next(err); } finally { db.close(); }
});

// Create invitation
router.post('/', (req, res, next) => {
  const db = getDb();
  try {
    const { email, role_id, department_id, branch_id, expires_in_days = 7 } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'A user with this email already exists' });

    const pending = db.prepare(`SELECT id FROM invitations WHERE email = ? AND company_id = ? AND status = 'pending'`).get(email, req.user.companyId);
    if (pending) return res.status(409).json({ error: 'An active invitation already exists for this email' });

    const token = crypto.randomBytes(32).toString('hex');
    const info = db.prepare(`
      INSERT INTO invitations (company_id, email, token, role_id, department_id, branch_id, invited_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ? || ' days'))
    `).run(req.user.companyId, email, token, role_id, department_id, branch_id, req.user.userId, `+${expires_in_days}`);

    const inv = db.prepare('SELECT * FROM invitations WHERE id = ?').get(info.lastInsertRowid);
    // In production, send email here. For Phase 2, return invite link.
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.status(201).json({ ...inv, invite_link: `${baseUrl}/accept-invite/${token}` });
  } catch (err) { next(err); } finally { db.close(); }
});

// Revoke invitation
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const inv = db.prepare('SELECT id FROM invitations WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!inv) return res.status(404).json({ error: 'Invitation not found' });
    db.prepare(`UPDATE invitations SET status = 'revoked' WHERE id = ?`).run(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); } finally { db.close(); }
});

module.exports = router;
