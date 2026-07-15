const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../config/db');
const { hashPassword, comparePassword, generateToken } = require('../services/authService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /signup - Register a new company and owner
router.post('/signup', async (req, res, next) => {
  const db = getDb();
  try {
    const { businessName, businessType, ownerName, email, phone, password } = req.body;

    if (!businessName || !businessType || !ownerName || !email || !password) {
      return res.status(400).json({ error: 'businessName, businessType, ownerName, email, and password are required' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await hashPassword(password);

    // Transaction: create company + owner + all satellite bootstrap rows atomically.
    // Resolution 3: company_code is generated inside the transaction using lastInsertRowid.
    // The UNIQUE constraint on company_code is the final collision backstop.
    db.exec('BEGIN TRANSACTION');
    let companyId, userId;
    try {
      // Insert company first (no code yet)
      const company = db.prepare(
        'INSERT INTO companies (name, business_type, phone) VALUES (?, ?, ?)'
      ).run(businessName, businessType, phone || null);
      companyId = company.lastInsertRowid;

      // Generate collision-safe company_code using the auto-generated PK
      const companyCode = `BIZ${String(companyId).padStart(5, '0')}`;
      db.prepare('UPDATE companies SET company_code = ?, setup_completed = 0 WHERE id = ?')
        .run(companyCode, companyId);

      // Create the owner user
      const user = db.prepare(
        'INSERT INTO users (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
      ).run(companyId, ownerName, email, hashedPassword, 'OWNER');
      userId = user.lastInsertRowid;

      // Back-link owner to company
      db.prepare('UPDATE companies SET owner_user_id = ? WHERE id = ?').run(userId, companyId);

      // Initialize setup wizard progress — all 6 steps as 'pending' (Resolution 2)
      const insertProgress = db.prepare(`
        INSERT OR IGNORE INTO company_setup_progress (company_id, step_number, status)
        VALUES (?, ?, 'pending')
      `);
      for (let step = 1; step <= 6; step++) {
        insertProgress.run(companyId, step);
      }

      // Seed default satellite rows so profile reads never 404
      db.prepare('INSERT OR IGNORE INTO company_gst_settings (company_id) VALUES (?)').run(companyId);
      db.prepare('INSERT OR IGNORE INTO company_financial_settings (company_id) VALUES (?)').run(companyId);
      db.prepare('INSERT OR IGNORE INTO company_branding (company_id) VALUES (?)').run(companyId);
      db.prepare(`
        INSERT OR IGNORE INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
        VALUES (?, 'free', 'trialing', datetime('now', '+14 days'), datetime('now', '+14 days'))
      `).run(companyId);

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

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
  } finally {
    db.close();
  }
});

// POST /login - Login user
router.post('/login', (req, res, next) => {
  const db = getDb();
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare(`
      SELECT u.*, c.name AS company_name, c.business_type, c.status AS company_status
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
      WHERE u.email = ?
    `).get(email);

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

    // Phase 2: Create session record
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const ua = req.headers['user-agent'] || '';
      const ip = req.headers['x-forwarded-for'] || req.ip || '';
      db.prepare(`
        INSERT INTO sessions (user_id, company_id, token_hash, browser, os, ip_address, device_name, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 days'))
      `).run(
        user.id, user.company_id, tokenHash,
        ua.substring(0, 200), // browser/UA string
        ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'macOS' : ua.includes('Linux') ? 'Linux' : 'Unknown',
        ip.toString().substring(0, 100),
        'Web Browser'
      );
      // Update last_login
      db.prepare("UPDATE users SET last_login = datetime('now'), login_count = COALESCE(login_count, 0) + 1 WHERE id = ?").run(user.id);
    } catch (sessionErr) {
      console.error('[Auth] Session creation failed (non-fatal):', sessionErr.message);
    }

    res.json({ token, user: userPayload });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET /me - Get current authenticated user details + granular permissions
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  try {
    // Load granular permissions for frontend feature gating
    const perms = db.prepare(`
      SELECT DISTINCT p.action
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = ? AND ur.company_id = ?
    `).all(req.user.userId, req.user.companyId);

    res.json({
      user: {
        ...req.user,
        permissions: perms.map(p => p.action)
      }
    });
  } catch (err) {
    // Non-fatal — return user without permissions if RBAC tables not ready
    res.json({ user: { ...req.user, permissions: [] } });
  } finally {
    db.close();
  }
});

// POST /bootstrap - One‑time admin creation (public, but only works when no admin exists)
router.post('/bootstrap', (req, res, next) => {
  const db = getDb();
  try {
    // Check if any admin already exists
    const adminCount = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE role = ?').get('admin').cnt;
    if (adminCount > 0) {
      return res.status(400).json({ error: 'Admin account already created' });
    }
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const passwordHash = hashPassword(password);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `).run(name, email, passwordHash, 'admin');
    const userId = result.lastInsertRowid;
    const user = { id: userId, name, email, role: 'admin' };
    const token = generateToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
