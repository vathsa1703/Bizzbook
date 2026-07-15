/**
 * Company Registration & Profile API
 * All endpoints read from satellite tables ONLY (company_settings is deprecated).
 * Resolution 1: no dual-read from company_settings anywhere in this file.
 */
const express = require('express');
const { getDb } = require('../config/db');
const { requirePermission } = require('../middleware/auth');
const {
  validateGSTIN,
  validatePAN,
  validateGSTINMatchesPAN,
  validateLicenseNumber,
  getStateFromGSTIN,
  GST_STATE_CODES,
} = require('../services/companyValidation');

const router = express.Router();

// All mutating endpoints below require 'settings.manage' (same permission action
// routes/roles.js and routes/branches.js already gate their writes on). Reads are
// left ungated, matching existing behavior, since company profile/GST/branding
// info is read by multiple non-admin flows (invoice generation, setup wizard
// progress) and gating GETs is a separate, larger change than the reported issue
// (unauthenticated-role writes to bank accounts / security settings / GST config).
const requireSettingsManage = requirePermission('settings.manage');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const { upsertGstSettings, upsertFinSettings, upsertBranding } = require('../services/companyProfileService');

function markStep(db, companyId, stepNumber, status) {
  db.prepare(`
    INSERT INTO company_setup_progress (company_id, step_number, status, completed_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(company_id, step_number) DO UPDATE SET
      status = excluded.status,
      completed_at = excluded.completed_at
  `).run(companyId, stepNumber, status);
}

// ─── GET /api/company/profile ─────────────────────────────────────────────────
// Returns complete company profile assembled from satellite tables only.
router.get('/profile', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;

    const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const gstSettings      = db.prepare('SELECT * FROM company_gst_settings WHERE company_id = ?').get(companyId) || {};
    const finSettings      = db.prepare('SELECT * FROM company_financial_settings WHERE company_id = ?').get(companyId) || {};
    const branding         = db.prepare('SELECT * FROM company_branding WHERE company_id = ?').get(companyId) || {};
    const subscription     = db.prepare('SELECT * FROM company_subscriptions WHERE company_id = ?').get(companyId) || {};
    const securitySettings = db.prepare('SELECT * FROM company_security_settings WHERE company_id = ?').get(companyId) || {};
    const addresses        = db.prepare('SELECT * FROM company_addresses WHERE company_id = ? ORDER BY is_primary DESC').all(companyId);
    const bankAccounts     = db.prepare('SELECT * FROM company_bank_accounts WHERE company_id = ? ORDER BY is_primary DESC').all(companyId);
    const licenses         = db.prepare('SELECT * FROM company_licenses WHERE company_id = ? ORDER BY created_at DESC').all(companyId);
    const setupProgress    = db.prepare('SELECT step_number, status, completed_at FROM company_setup_progress WHERE company_id = ? ORDER BY step_number').all(companyId);
    const expiryAlerts     = db.prepare('SELECT * FROM license_expiry_alerts WHERE company_id = ? AND is_dismissed = 0 ORDER BY days_until_expiry ASC').all(companyId);

    // Calculate setup completion percentage
    const completedSteps = setupProgress.filter(s => s.status === 'completed').length;
    const totalSteps = 6;
    const setupCompletionPct = Math.round((completedSteps / totalSteps) * 100);

    res.json({
      company,
      gstSettings,
      finSettings,
      branding,
      subscription,
      securitySettings,
      addresses,
      bankAccounts,
      licenses,
      setupProgress,
      expiryAlerts,
      setupCompletionPct,
    });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// ─── PUT /api/company/profile ─────────────────────────────────────────────────
router.put('/profile', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const {
      business_name, legal_business_name, trade_name, business_type, business_category,
      nic_code, date_of_incorporation, registration_type, pan, gstin, phone, website,
      industry, business_size_bracket, turnover_bracket,
    } = req.body;

    // Validate GSTIN and PAN if provided
    if (gstin) {
      const gResult = validateGSTIN(gstin);
      if (!gResult.valid) return res.status(400).json({ error: gResult.error });
    }
    if (pan) {
      const pResult = validatePAN(pan);
      if (!pResult.valid) return res.status(400).json({ error: pResult.error });
    }
    if (gstin && pan) {
      const crossResult = validateGSTINMatchesPAN(gstin, pan);
      if (!crossResult.valid) return res.status(400).json({ error: crossResult.error });
    }

    db.prepare(`
      UPDATE companies SET
        name                  = COALESCE(?, name),
        legal_business_name   = COALESCE(?, legal_business_name),
        trade_name            = COALESCE(?, trade_name),
        business_type         = COALESCE(?, business_type),
        business_category     = COALESCE(?, business_category),
        nic_code              = COALESCE(?, nic_code),
        date_of_incorporation = COALESCE(?, date_of_incorporation),
        registration_type     = COALESCE(?, registration_type),
        pan                   = COALESCE(?, pan),
        gstin                 = COALESCE(?, gstin),
        phone                 = COALESCE(?, phone),
        website               = COALESCE(?, website),
        industry              = COALESCE(?, industry),
        business_size_bracket = COALESCE(?, business_size_bracket),
        turnover_bracket      = COALESCE(?, turnover_bracket),
        updated_at            = datetime('now')
      WHERE id = ?
    `).run(
      business_name, legal_business_name, trade_name, business_type, business_category,
      nic_code, date_of_incorporation, registration_type, pan, gstin, phone, website,
      industry, business_size_bracket, turnover_bracket,
      companyId
    );

    res.json({ message: 'Company profile updated' });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// ─── ADDRESSES ───────────────────────────────────────────────────────────────

router.get('/addresses', (req, res, next) => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM company_addresses WHERE company_id = ? ORDER BY is_primary DESC, id ASC').all(req.user.companyId);
    res.json(rows);
  } catch (err) { next(err); } finally { db.close(); }
});

router.post('/addresses', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { address_type, address_line1, address_line2, city, district, state, country, pincode, gstin, is_primary } = req.body;
    if (!address_type || !address_line1 || !city || !state || !pincode) {
      return res.status(400).json({ error: 'address_type, address_line1, city, state, and pincode are required' });
    }
    if (gstin) {
      const g = validateGSTIN(gstin);
      if (!g.valid) return res.status(400).json({ error: g.error });
    }
    db.exec('BEGIN TRANSACTION');
    if (is_primary) {
      db.prepare('UPDATE company_addresses SET is_primary = 0 WHERE company_id = ?').run(companyId);
    }
    const result = db.prepare(`
      INSERT INTO company_addresses (company_id, address_type, address_line1, address_line2, city, district, state, country, pincode, gstin, is_primary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, address_type, address_line1, address_line2 || null, city, district || null, state, country || 'India', pincode, gstin || null, is_primary ? 1 : 0);
    db.exec('COMMIT');
    res.status(201).json({ id: result.lastInsertRowid, message: 'Address added' });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally { db.close(); }
});

router.put('/addresses/:id', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { id } = req.params;
    const { address_type, address_line1, address_line2, city, district, state, country, pincode, gstin, is_primary } = req.body;
    if (gstin) {
      const g = validateGSTIN(gstin);
      if (!g.valid) return res.status(400).json({ error: g.error });
    }
    db.exec('BEGIN TRANSACTION');
    if (is_primary) {
      db.prepare('UPDATE company_addresses SET is_primary = 0 WHERE company_id = ?').run(companyId);
    }
    db.prepare(`
      UPDATE company_addresses SET
        address_type = COALESCE(?, address_type),
        address_line1 = COALESCE(?, address_line1),
        address_line2 = COALESCE(?, address_line2),
        city = COALESCE(?, city),
        district = COALESCE(?, district),
        state = COALESCE(?, state),
        country = COALESCE(?, country),
        pincode = COALESCE(?, pincode),
        gstin = COALESCE(?, gstin),
        is_primary = COALESCE(?, is_primary)
      WHERE id = ? AND company_id = ?
    `).run(address_type, address_line1, address_line2, city, district, state, country, pincode, gstin, is_primary ? 1 : 0, id, companyId);
    db.exec('COMMIT');
    res.json({ message: 'Address updated' });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally { db.close(); }
});

router.delete('/addresses/:id', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    db.prepare('DELETE FROM company_addresses WHERE id = ? AND company_id = ?').run(req.params.id, req.user.companyId);
    res.json({ message: 'Address deleted' });
  } catch (err) { next(err); } finally { db.close(); }
});

// ─── LICENSES ────────────────────────────────────────────────────────────────

router.get('/licenses', (req, res, next) => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM company_licenses WHERE company_id = ? ORDER BY created_at DESC').all(req.user.companyId);
    res.json(rows);
  } catch (err) { next(err); } finally { db.close(); }
});

router.post('/licenses', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { license_type, license_number, issuing_authority, issue_date, expiry_date, document_url } = req.body;
    if (!license_type) return res.status(400).json({ error: 'license_type is required' });
    if (license_number) {
      const v = validateLicenseNumber(license_type, license_number);
      if (!v.valid) return res.status(400).json({ error: v.error });
    }
    const result = db.prepare(`
      INSERT INTO company_licenses (company_id, license_type, license_number, issuing_authority, issue_date, expiry_date, document_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, license_type, license_number || null, issuing_authority || null, issue_date || null, expiry_date || null, document_url || null);
    res.status(201).json({ id: result.lastInsertRowid, message: 'License added' });
  } catch (err) { next(err); } finally { db.close(); }
});

router.put('/licenses/:id', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const { license_type, license_number, issuing_authority, issue_date, expiry_date, status, document_url } = req.body;
    if (license_number && license_type) {
      const v = validateLicenseNumber(license_type, license_number);
      if (!v.valid) return res.status(400).json({ error: v.error });
    }
    db.prepare(`
      UPDATE company_licenses SET
        license_type = COALESCE(?, license_type),
        license_number = COALESCE(?, license_number),
        issuing_authority = COALESCE(?, issuing_authority),
        issue_date = COALESCE(?, issue_date),
        expiry_date = COALESCE(?, expiry_date),
        status = COALESCE(?, status),
        document_url = COALESCE(?, document_url),
        updated_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(license_type, license_number, issuing_authority, issue_date, expiry_date, status, document_url, req.params.id, req.user.companyId);
    res.json({ message: 'License updated' });
  } catch (err) { next(err); } finally { db.close(); }
});

router.delete('/licenses/:id', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    db.prepare('DELETE FROM company_licenses WHERE id = ? AND company_id = ?').run(req.params.id, req.user.companyId);
    res.json({ message: 'License deleted' });
  } catch (err) { next(err); } finally { db.close(); }
});

// GET /api/company/licenses/expiring — licenses expiring within 30 days
router.get('/licenses/expiring', (req, res, next) => {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT *, CAST(julianday(expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry
      FROM company_licenses
      WHERE company_id = ?
        AND expiry_date IS NOT NULL
        AND julianday(expiry_date) - julianday('now') BETWEEN 0 AND 30
      ORDER BY expiry_date ASC
    `).all(req.user.companyId);
    res.json(rows);
  } catch (err) { next(err); } finally { db.close(); }
});

// ─── BANK ACCOUNTS ───────────────────────────────────────────────────────────

router.get('/bank-accounts', (req, res, next) => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM company_bank_accounts WHERE company_id = ? ORDER BY is_primary DESC').all(req.user.companyId);
    res.json(rows);
  } catch (err) { next(err); } finally { db.close(); }
});

router.post('/bank-accounts', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { bank_name, account_holder_name, account_number, ifsc, branch_name, upi_id, is_primary, show_on_invoice } = req.body;
    if (!bank_name || !account_holder_name || !account_number || !ifsc) {
      return res.status(400).json({ error: 'bank_name, account_holder_name, account_number, and ifsc are required' });
    }
    db.exec('BEGIN TRANSACTION');
    if (is_primary) {
      db.prepare('UPDATE company_bank_accounts SET is_primary = 0 WHERE company_id = ?').run(companyId);
    }
    const result = db.prepare(`
      INSERT INTO company_bank_accounts (company_id, bank_name, account_holder_name, account_number, ifsc, branch_name, upi_id, is_primary, show_on_invoice)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, bank_name, account_holder_name, account_number, ifsc, branch_name || null, upi_id || null, is_primary ? 1 : 0, show_on_invoice !== false ? 1 : 0);
    db.exec('COMMIT');
    res.status(201).json({ id: result.lastInsertRowid, message: 'Bank account added' });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally { db.close(); }
});

router.put('/bank-accounts/:id', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { bank_name, account_holder_name, account_number, ifsc, branch_name, upi_id, is_primary, show_on_invoice } = req.body;
    db.exec('BEGIN TRANSACTION');
    if (is_primary) {
      db.prepare('UPDATE company_bank_accounts SET is_primary = 0 WHERE company_id = ?').run(companyId);
    }
    db.prepare(`
      UPDATE company_bank_accounts SET
        bank_name = COALESCE(?, bank_name),
        account_holder_name = COALESCE(?, account_holder_name),
        account_number = COALESCE(?, account_number),
        ifsc = COALESCE(?, ifsc),
        branch_name = COALESCE(?, branch_name),
        upi_id = COALESCE(?, upi_id),
        is_primary = CASE WHEN ? IS NOT NULL THEN ? ELSE is_primary END,
        show_on_invoice = CASE WHEN ? IS NOT NULL THEN ? ELSE show_on_invoice END
      WHERE id = ? AND company_id = ?
    `).run(bank_name, account_holder_name, account_number, ifsc, branch_name, upi_id,
           is_primary != null ? 1 : null, is_primary ? 1 : 0,
           show_on_invoice != null ? 1 : null, show_on_invoice ? 1 : 0,
           req.params.id, companyId);
    db.exec('COMMIT');
    res.json({ message: 'Bank account updated' });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally { db.close(); }
});

router.delete('/bank-accounts/:id', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    db.prepare('DELETE FROM company_bank_accounts WHERE id = ? AND company_id = ?').run(req.params.id, req.user.companyId);
    res.json({ message: 'Bank account deleted' });
  } catch (err) { next(err); } finally { db.close(); }
});

// ─── GST SETTINGS ─────────────────────────────────────────────────────────────

router.get('/gst-settings', (req, res, next) => {
  const db = getDb();
  try {
    const row = db.prepare('SELECT * FROM company_gst_settings WHERE company_id = ?').get(req.user.companyId);
    res.json(row || {});
  } catch (err) { next(err); } finally { db.close(); }
});

router.put('/gst-settings', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const {
      registration_type, place_of_supply, state_code, default_gst_rate,
      reverse_charge_applicable, hsn_sac_mandatory, composition_scheme_rate,
      is_gst_registered, inclusive_pricing,
    } = req.body;
    upsertGstSettings(db, companyId, {
      registration_type, place_of_supply, state_code, default_gst_rate,
      reverse_charge_applicable, hsn_sac_mandatory, composition_scheme_rate,
      is_gst_registered, inclusive_pricing,
    });
    res.json({ message: 'GST settings saved' });
  } catch (err) { next(err); } finally { db.close(); }
});

// ─── FINANCIAL SETTINGS ───────────────────────────────────────────────────────

router.get('/financial-settings', (req, res, next) => {
  const db = getDb();
  try {
    const row = db.prepare('SELECT * FROM company_financial_settings WHERE company_id = ?').get(req.user.companyId);
    res.json(row || {});
  } catch (err) { next(err); } finally { db.close(); }
});

router.put('/financial-settings', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { currency, financial_year_start_month, timezone, accounting_method, invoice_prefix, purchase_prefix, credit_note_prefix, decimal_precision } = req.body;
    upsertFinSettings(db, companyId, { currency, financial_year_start_month, timezone, accounting_method, invoice_prefix, purchase_prefix, credit_note_prefix, decimal_precision });
    res.json({ message: 'Financial settings saved' });
  } catch (err) { next(err); } finally { db.close(); }
});

// ─── BRANDING ─────────────────────────────────────────────────────────────────

router.get('/branding', (req, res, next) => {
  const db = getDb();
  try {
    const row = db.prepare('SELECT * FROM company_branding WHERE company_id = ?').get(req.user.companyId);
    res.json(row || {});
  } catch (err) { next(err); } finally { db.close(); }
});

router.put('/branding', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const { logo_url, signature_url, stamp_url, invoice_footer, brand_color, theme } = req.body;
    upsertBranding(db, req.user.companyId, { logo_url, signature_url, stamp_url, invoice_footer, brand_color, theme });
    res.json({ message: 'Branding saved' });
  } catch (err) { next(err); } finally { db.close(); }
});

// ─── SECURITY SETTINGS ────────────────────────────────────────────────────────

router.get('/security', (req, res, next) => {
  const db = getDb();
  try {
    const row = db.prepare('SELECT * FROM company_security_settings WHERE company_id = ?').get(req.user.companyId);
    res.json(row || {});
  } catch (err) { next(err); } finally { db.close(); }
});

router.put('/security', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { two_factor_enabled, password_policy, session_timeout_minutes, login_restrictions } = req.body;
    const fields = {
      two_factor_enabled,
      password_policy: password_policy != null ? JSON.stringify(password_policy) : undefined,
      session_timeout_minutes,
      login_restrictions: login_restrictions != null ? JSON.stringify(login_restrictions) : undefined,
    };
    const clean = Object.fromEntries(Object.entries(fields).filter(([_, v]) => v !== undefined));
    const existing = db.prepare('SELECT id FROM company_security_settings WHERE company_id = ?').get(companyId);
    if (existing) {
      const sets = Object.keys(clean).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE company_security_settings SET ${sets}, updated_at = datetime('now') WHERE company_id = ?`)
        .run(...Object.values(clean), companyId);
    } else {
      const cols = ['company_id', ...Object.keys(clean)].join(', ');
      const placeholders = Array(Object.keys(clean).length + 1).fill('?').join(', ');
      db.prepare(`INSERT INTO company_security_settings (${cols}) VALUES (${placeholders})`)
        .run(companyId, ...Object.values(clean));
    }
    res.json({ message: 'Security settings saved' });
  } catch (err) { next(err); } finally { db.close(); }
});

// ─── SETUP PROGRESS ───────────────────────────────────────────────────────────

// GET /api/company/setup-progress — returns all 6 steps with explicit status
router.get('/setup-progress', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const steps = db.prepare(
      'SELECT step_number, status, completed_at FROM company_setup_progress WHERE company_id = ? ORDER BY step_number'
    ).all(companyId);

    const company = db.prepare('SELECT setup_completed FROM companies WHERE id = ?').get(companyId);

    // Compute completion percentage from explicit states (Resolution 2)
    const completedCount = steps.filter(s => s.status === 'completed').length;
    const completionPct = Math.round((completedCount / 6) * 100);

    res.json({
      steps,
      completionPct,
      setupCompleted: !!company?.setup_completed,
    });
  } catch (err) { next(err); } finally { db.close(); }
});

// ─── LICENSE REQUIREMENTS (lookup, no hardcoding) ─────────────────────────────
router.get('/license-requirements', (req, res, next) => {
  const db = getDb();
  try {
    const { category } = req.query;
    if (!category) return res.status(400).json({ error: 'category query param required' });
    const rows = db.prepare(
      'SELECT license_type, is_mandatory, description FROM license_category_map WHERE business_category = ?'
    ).all(category);
    res.json(rows);
  } catch (err) { next(err); } finally { db.close(); }
});

// ─── EXPIRY ALERT DISMISS ─────────────────────────────────────────────────────
router.post('/licenses/alerts/:id/dismiss', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    db.prepare(`
      UPDATE license_expiry_alerts SET is_dismissed = 1, dismissed_at = datetime('now')
      WHERE id = ? AND company_id = ?
    `).run(req.params.id, req.user.companyId);
    res.json({ message: 'Alert dismissed' });
  } catch (err) { next(err); } finally { db.close(); }
});

// ─── SETUP WIZARD STEP ENDPOINTS ─────────────────────────────────────────────

// Step 1: GSTIN / PAN — required
router.post('/setup/gstin', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { gstin, pan } = req.body;

    if (!gstin && !pan) {
      return res.status(400).json({ error: 'At least one of GSTIN or PAN is required' });
    }
    if (gstin) {
      const g = validateGSTIN(gstin);
      if (!g.valid) return res.status(400).json({ error: g.error });
    }
    if (pan) {
      const p = validatePAN(pan);
      if (!p.valid) return res.status(400).json({ error: p.error });
    }
    if (gstin && pan) {
      const cross = validateGSTINMatchesPAN(gstin, pan);
      if (!cross.valid) return res.status(400).json({ error: cross.error });
    }

    const stateInfo = gstin ? getStateFromGSTIN(gstin) : null;

    db.prepare('UPDATE companies SET gstin = COALESCE(?, gstin), pan = COALESCE(?, pan) WHERE id = ?')
      .run(gstin || null, pan || null, companyId);

    if (stateInfo) {
      upsertGstSettings(db, companyId, { state_code: stateInfo.stateCode, place_of_supply: stateInfo.stateName });
    }
    markStep(db, companyId, 1, 'completed');
    res.json({ message: 'GSTIN/PAN saved', stateInfo });
  } catch (err) { next(err); } finally { db.close(); }
});

// Step 2: Registered Address
router.post('/setup/address', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { skip, ...addressData } = req.body;

    if (skip) {
      markStep(db, companyId, 2, 'skipped');
      return res.json({ message: 'Step 2 skipped' });
    }

    const { address_line1, city, state, pincode } = addressData;
    if (!address_line1 || !city || !state || !pincode) {
      return res.status(400).json({ error: 'address_line1, city, state, pincode are required' });
    }

    // Upsert the registered address
    const existing = db.prepare("SELECT id FROM company_addresses WHERE company_id = ? AND address_type = 'registered'").get(companyId);
    if (existing) {
      db.prepare(`
        UPDATE company_addresses SET address_line1=?, address_line2=?, city=?, district=?, state=?, pincode=?
        WHERE id = ?
      `).run(address_line1, addressData.address_line2||null, city, addressData.district||null, state, pincode, existing.id);
    } else {
      db.prepare(`
        INSERT INTO company_addresses (company_id, address_type, address_line1, address_line2, city, district, state, pincode, is_primary)
        VALUES (?, 'registered', ?, ?, ?, ?, ?, ?, 1)
      `).run(companyId, address_line1, addressData.address_line2||null, city, addressData.district||null, state, pincode);
    }
    markStep(db, companyId, 2, 'completed');
    res.json({ message: 'Address saved' });
  } catch (err) { next(err); } finally { db.close(); }
});

// Step 3: Industry & Category
router.post('/setup/industry', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { skip, industry, business_category } = req.body;
    if (skip) {
      markStep(db, companyId, 3, 'skipped');
      return res.json({ message: 'Step 3 skipped' });
    }
    db.prepare('UPDATE companies SET industry = COALESCE(?, industry), business_category = COALESCE(?, business_category) WHERE id = ?')
      .run(industry || null, business_category || null, companyId);
    markStep(db, companyId, 3, 'completed');
    // Return the license requirements for the chosen category so frontend can render Step 4
    const licenseReqs = business_category
      ? db.prepare('SELECT license_type, is_mandatory, description FROM license_category_map WHERE business_category = ?').all(business_category)
      : [];
    res.json({ message: 'Industry saved', licenseRequirements: licenseReqs });
  } catch (err) { next(err); } finally { db.close(); }
});

// Step 4: Licenses
router.post('/setup/licenses', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { skip, licenses } = req.body;
    if (skip) {
      markStep(db, companyId, 4, 'skipped');
      return res.json({ message: 'Step 4 skipped' });
    }
    if (Array.isArray(licenses)) {
      const insertStmt = db.prepare(`
        INSERT INTO company_licenses (company_id, license_type, license_number, expiry_date)
        VALUES (?, ?, ?, ?)
      `);
      for (const lic of licenses) {
        if (lic.license_number && lic.license_type) {
          const v = validateLicenseNumber(lic.license_type, lic.license_number);
          if (!v.valid) return res.status(400).json({ error: `${lic.license_type}: ${v.error}` });
          insertStmt.run(companyId, lic.license_type, lic.license_number, lic.expiry_date || null);
        }
      }
    }
    markStep(db, companyId, 4, 'completed');
    res.json({ message: 'Licenses saved' });
  } catch (err) { next(err); } finally { db.close(); }
});

// Step 5: Invoice basics + primary bank account
router.post('/setup/invoice', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { skip, invoice_prefix, default_gst_rate, bank } = req.body;
    if (skip) {
      markStep(db, companyId, 5, 'skipped');
      return res.json({ message: 'Step 5 skipped' });
    }
    if (invoice_prefix || default_gst_rate != null) {
      upsertFinSettings(db, companyId, { invoice_prefix: invoice_prefix || 'INV' });
      if (default_gst_rate != null) {
        upsertGstSettings(db, companyId, { default_gst_rate });
      }
    }
    if (bank && bank.bank_name && bank.account_number && bank.ifsc) {
      // Remove any existing primary
      db.prepare('UPDATE company_bank_accounts SET is_primary = 0 WHERE company_id = ?').run(companyId);
      db.prepare(`
        INSERT INTO company_bank_accounts (company_id, bank_name, account_holder_name, account_number, ifsc, branch_name, is_primary, show_on_invoice)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1)
      `).run(companyId, bank.bank_name, bank.account_holder_name || '', bank.account_number, bank.ifsc, bank.branch_name || null);
    }
    markStep(db, companyId, 5, 'completed');
    res.json({ message: 'Invoice basics saved' });
  } catch (err) { next(err); } finally { db.close(); }
});

// Step 6: Branding (skippable, no validation required)
router.post('/setup/branding', requireSettingsManage, (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { skip, logo_url, brand_color } = req.body;
    if (skip) {
      markStep(db, companyId, 6, 'skipped');
    } else {
      upsertBranding(db, companyId, { logo_url: logo_url || null, brand_color: brand_color || '#2563EB' });
      markStep(db, companyId, 6, 'completed');
    }
    // Mark setup as completed regardless (wizard finished)
    db.prepare("UPDATE companies SET setup_completed = 1 WHERE id = ?").run(companyId);
    res.json({ message: 'Setup complete' });
  } catch (err) { next(err); } finally { db.close(); }
});

// ─── VALIDATE GSTIN (lightweight, for real-time frontend check) ───────────────
router.post('/validate/gstin', (req, res) => {
  const { gstin } = req.body;
  const result = validateGSTIN(gstin);
  const stateInfo = result.valid ? getStateFromGSTIN(gstin) : null;
  res.json({ ...result, stateInfo });
});

router.post('/validate/pan', (req, res) => {
  const { pan } = req.body;
  res.json(validatePAN(pan));
});

module.exports = router;
