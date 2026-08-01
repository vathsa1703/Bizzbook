const express = require('express');
const crypto = require('crypto');
const { hashPassword, comparePassword, generateToken } = require('../services/authService');
const { authenticate } = require('../middleware/auth');
const { dbGet, dbAll } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

const router = express.Router();

async function ensureOwnerRoleAsync(tx, companyId) {
  let ownerRole = await tx.getOne("SELECT id FROM roles WHERE company_id = ? AND name = 'Owner'", [companyId]);
  if (!ownerRole) {
    const info = await tx.getOne(
      "INSERT INTO roles (company_id, name, description, is_system, color) VALUES (?, 'Owner', 'Full system access', ?, '#ef4444') RETURNING id",
      [companyId, 1]
    );
    ownerRole = { id: info.id };
    const allPerms = await tx.getAll('SELECT id FROM permissions');
    for (const perm of allPerms) {
      await tx.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT (role_id, permission_id) DO NOTHING',
        [ownerRole.id, perm.id]
      );
    }
  }
  return ownerRole.id;
}

async function assignUserToRoleAsync(tx, userId, roleId, companyId) {
  await tx.query(
    'INSERT INTO user_roles (user_id, role_id, company_id) VALUES (?, ?, ?) ON CONFLICT (user_id, role_id) DO NOTHING',
    [userId, roleId, companyId]
  );
}

// POST /signup - Register a new company and owner
router.post('/signup', async (req, res, next) => {
  try {
    const { businessName, businessType, ownerName, email, phone, password } = req.body;

    if (!businessName || !businessType || !ownerName || !email || !password) {
      return res.status(400).json({ error: 'businessName, businessType, ownerName, email, and password are required' });
    }

    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await hashPassword(password);

    let companyId, userId;

    // Transaction: create company + owner + all satellite bootstrap rows atomically.
    // Resolution 3: company_code is generated inside the transaction using the
    // auto-generated PK. The UNIQUE constraint on company_code is the final
    // collision backstop.
    const ids = await withTransaction(async (tx) => {
      const companyRow = await tx.getOne(
        'INSERT INTO companies (name, business_type, phone) VALUES (?, ?, ?) RETURNING id',
        [businessName, businessType, phone || null]
      );
      const txCompanyId = companyRow.id;

      const companyCode = `BIZ${String(txCompanyId).padStart(5, '0')}`;
      // setup_completed must be a bound parameter, not a literal `0` in the
      // SQL text: Postgres parses a literal integer against a boolean column
      // more strictly than a bound parameter of the same value (the literal
      // form throws "column is of type boolean but expression is of type
      // integer"; the exact same 0, sent as a $n parameter, is accepted and
      // coerced -- confirmed directly, see products.js's commit for the
      // general case).
      await tx.query('UPDATE companies SET company_code = ?, setup_completed = ? WHERE id = ?', [companyCode, 0, txCompanyId]);

      const userRow = await tx.getOne(
        'INSERT INTO users (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?) RETURNING id',
        [txCompanyId, ownerName, email, hashedPassword, 'OWNER']
      );
      const txUserId = userRow.id;

      await tx.query('UPDATE companies SET owner_user_id = ? WHERE id = ?', [txUserId, txCompanyId]);

      const ownerRoleId = await ensureOwnerRoleAsync(tx, txCompanyId);
      await assignUserToRoleAsync(tx, txUserId, ownerRoleId, txCompanyId);

      for (let step = 1; step <= 6; step++) {
        await tx.query(
          "INSERT INTO company_setup_progress (company_id, step_number, status) VALUES (?, ?, 'pending') ON CONFLICT (company_id, step_number) DO NOTHING",
          [txCompanyId, step]
        );
      }

      await tx.query('INSERT INTO company_gst_settings (company_id) VALUES (?) ON CONFLICT (company_id) DO NOTHING', [txCompanyId]);
      await tx.query('INSERT INTO company_financial_settings (company_id) VALUES (?) ON CONFLICT (company_id) DO NOTHING', [txCompanyId]);
      await tx.query('INSERT INTO company_branding (company_id) VALUES (?) ON CONFLICT (company_id) DO NOTHING', [txCompanyId]);
      await tx.query(`
        INSERT INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
        VALUES (?, 'free', 'trialing', now() + interval '14 days', now() + interval '14 days')
        ON CONFLICT (company_id) DO NOTHING
      `, [txCompanyId]);

      return { companyId: txCompanyId, userId: txUserId };
    });
    companyId = ids.companyId;
    userId = ids.userId;

    const userPayload = {
      id: userId,
      userId: userId,
      companyId: companyId,
      name: ownerName,
      email: email,
      role: 'OWNER',
      companyName: businessName,
      businessType: businessType,
    };

    const token = generateToken(userPayload);

    res.status(201).json({
      token,
      user: userPayload,
      companyId,
      role: 'OWNER',
      setupRequired: true, // Tells frontend to redirect to Setup Wizard
    });
  } catch (err) {
    next(err);
  }
});

// POST /login - Login user
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await dbGet(`
      SELECT u.*, c.name AS company_name, c.business_type, c.status AS company_status
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
      WHERE u.email = ?
    `, [email]);

    if (!user || !comparePassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Suspension checks
    if (user.company_status === 'Suspended') {
      return res.status(403).json({ error: 'Your company account has been suspended. Please contact support.' });
    }
    if (user.status === 'Inactive') {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact your administrator.' });
    }

    const userPayload = {
      id: user.id,
      userId: user.id,
      companyId: user.company_id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyName: user.company_name,
      businessType: user.business_type,
    };
    const token = generateToken(userPayload);

    // Phase 2: Create session record. Non-fatal by design (matches original):
    // a session-row failure must never block login itself.
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const ua = req.headers['user-agent'] || '';
      const ip = req.headers['x-forwarded-for'] || req.ip || '';
      const os = ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'macOS' : ua.includes('Linux') ? 'Linux' : 'Unknown';

      await dbGet(`
        INSERT INTO sessions (user_id, company_id, token_hash, browser, os, ip_address, device_name, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, now() + interval '7 days')
      `, [user.id, user.company_id, tokenHash, ua.substring(0, 200), os, ip.toString().substring(0, 100), 'Web Browser']);
      await dbGet("UPDATE users SET last_login = now(), login_count = COALESCE(login_count, 0) + 1 WHERE id = ?", [user.id]);
    } catch (sessionErr) {
      console.error('[Auth] Session creation failed (non-fatal):', sessionErr.message);
    }

    res.json({ token, user: userPayload });
  } catch (err) {
    next(err);
  }
});

// GET /me - Get current authenticated user details + granular permissions
router.get('/me', authenticate, async (req, res) => {
  try {
    // Load granular permissions for frontend feature gating
    const perms = await dbAll(`
      SELECT DISTINCT p.action
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = ? AND ur.company_id = ?
    `, [req.user.userId, req.user.companyId]);

    res.json({
      user: {
        ...req.user,
        permissions: perms.map(p => p.action)
      }
    });
  } catch (err) {
    // Non-fatal — return user without permissions if RBAC tables not ready
    res.json({ user: { ...req.user, permissions: [] } });
  }
});

// POST /bootstrap - One‑time admin creation (public, but only works when no admin exists)
router.post('/bootstrap', async (req, res, next) => {
  try {
    // Check if any admin already exists
    const adminCountRow = await dbGet('SELECT COUNT(*) as cnt FROM users WHERE role = ?', ['admin']);
    const adminCount = Number(adminCountRow.cnt);
    if (adminCount > 0) {
      return res.status(400).json({ error: 'Admin account already created' });
    }
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const passwordHash = hashPassword(password);
    const result = await dbGet(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
      RETURNING id
    `, [name, email, passwordHash, 'admin']);
    const userId = result.id;
    const user = { id: userId, name, email, role: 'admin' };
    const token = generateToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
