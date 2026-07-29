/**
 * Company Registration & Profile API
 * All endpoints read from satellite tables ONLY (company_settings is deprecated).
 * Resolution 1: no dual-read from company_settings anywhere in this file.
 */
const express = require('express');
const { getDb } = require('../config/db');
const { requirePermission } = require('../middleware/auth');
const { dbGet, dbAll, engine } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');
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

const {
  upsertGstSettings, upsertFinSettings, upsertBranding,
  upsertGstSettingsAsync, upsertFinSettingsAsync, upsertBrandingAsync,
} = require('../services/companyProfileService');

// SQLite-only sync helper, used by the setup/* handlers' SQLite branch.
function markStep(db, companyId, stepNumber, status) {
  db.prepare(`
    INSERT INTO company_setup_progress (company_id, step_number, status, completed_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(company_id, step_number) DO UPDATE SET
      status = excluded.status,
      completed_at = excluded.completed_at
  `).run(companyId, stepNumber, status);
}

// Postgres-only twin of markStep above. ON CONFLICT ... DO UPDATE SET ... =
// excluded.col is standard SQL supported identically by both engines (unlike
// SQLite's INSERT OR IGNORE, which has no Postgres equivalent) -- only the
// datetime('now') literal needs an engine-specific replacement (now()).
async function markStepAsync(companyId, stepNumber, status) {
  await dbGet(`
    INSERT INTO company_setup_progress (company_id, step_number, status, completed_at)
    VALUES (?, ?, ?, now())
    ON CONFLICT(company_id, step_number) DO UPDATE SET
      status = excluded.status,
      completed_at = excluded.completed_at
  `, [companyId, stepNumber, status]);
}

// ─── GET /api/company/profile ─────────────────────────────────────────────────
// Returns complete company profile assembled from satellite tables only.
router.get('/profile', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;

    const company = await dbGet('SELECT * FROM companies WHERE id = ?', [companyId]);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const gstSettings      = (await dbGet('SELECT * FROM company_gst_settings WHERE company_id = ?', [companyId])) || {};
    const finSettings      = (await dbGet('SELECT * FROM company_financial_settings WHERE company_id = ?', [companyId])) || {};
    const branding         = (await dbGet('SELECT * FROM company_branding WHERE company_id = ?', [companyId])) || {};
    const subscription     = (await dbGet('SELECT * FROM company_subscriptions WHERE company_id = ?', [companyId])) || {};
    const securitySettings = (await dbGet('SELECT * FROM company_security_settings WHERE company_id = ?', [companyId])) || {};
    const addresses        = await dbAll('SELECT * FROM company_addresses WHERE company_id = ? ORDER BY is_primary DESC', [companyId]);
    const bankAccounts     = await dbAll('SELECT * FROM company_bank_accounts WHERE company_id = ? ORDER BY is_primary DESC', [companyId]);
    const licenses         = await dbAll('SELECT * FROM company_licenses WHERE company_id = ? ORDER BY created_at DESC', [companyId]);
    const setupProgress    = await dbAll('SELECT step_number, status, completed_at FROM company_setup_progress WHERE company_id = ? ORDER BY step_number', [companyId]);
    // is_dismissed is BOOLEAN under Postgres, 0/1 under SQLite -- bound as a
    // parameter (not a literal in the SQL text) so the same 0 works on both.
    const expiryAlerts     = await dbAll('SELECT * FROM license_expiry_alerts WHERE company_id = ? AND is_dismissed = ? ORDER BY days_until_expiry ASC', [companyId, 0]);

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
  }
});

// ─── PUT /api/company/profile ─────────────────────────────────────────────────
router.put('/profile', requireSettingsManage, async (req, res, next) => {
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

    const nowExpr = engine() === 'postgres' ? 'now()' : "datetime('now')";
    await dbGet(`
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
        updated_at            = ${nowExpr}
      WHERE id = ?
    `, [
      business_name, legal_business_name, trade_name, business_type, business_category,
      nic_code, date_of_incorporation, registration_type, pan, gstin, phone, website,
      industry, business_size_bracket, turnover_bracket,
      companyId
    ]);

    res.json({ message: 'Company profile updated' });
  } catch (err) {
    next(err);
  }
});

// ─── ADDRESSES ───────────────────────────────────────────────────────────────

router.get('/addresses', async (req, res, next) => {
  try {
    const rows = await dbAll('SELECT * FROM company_addresses WHERE company_id = ? ORDER BY is_primary DESC, id ASC', [req.user.companyId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/addresses', requireSettingsManage, async (req, res, next) => {
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

    let insertedId;
    if (engine() === 'postgres') {
      insertedId = await withTransaction(async (tx) => {
        if (is_primary) {
          await tx.query('UPDATE company_addresses SET is_primary = ? WHERE company_id = ?', [false, companyId]);
        }
        const row = await tx.getOne(`
          INSERT INTO company_addresses (company_id, address_type, address_line1, address_line2, city, district, state, country, pincode, gstin, is_primary)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
        `, [companyId, address_type, address_line1, address_line2 || null, city, district || null, state, country || 'India', pincode, gstin || null, is_primary ? 1 : 0]);
        return row.id;
      });
    } else {
      const db = getDb();
      try {
        db.exec('BEGIN TRANSACTION');
        if (is_primary) {
          db.prepare('UPDATE company_addresses SET is_primary = 0 WHERE company_id = ?').run(companyId);
        }
        const result = db.prepare(`
          INSERT INTO company_addresses (company_id, address_type, address_line1, address_line2, city, district, state, country, pincode, gstin, is_primary)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(companyId, address_type, address_line1, address_line2 || null, city, district || null, state, country || 'India', pincode, gstin || null, is_primary ? 1 : 0);
        db.exec('COMMIT');
        insertedId = result.lastInsertRowid;
      } catch (txErr) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw txErr;
      } finally { db.close(); }
    }

    res.status(201).json({ id: insertedId, message: 'Address added' });
  } catch (err) {
    next(err);
  }
});

router.put('/addresses/:id', requireSettingsManage, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { id } = req.params;
    const { address_type, address_line1, address_line2, city, district, state, country, pincode, gstin, is_primary } = req.body;
    if (gstin) {
      const g = validateGSTIN(gstin);
      if (!g.valid) return res.status(400).json({ error: g.error });
    }

    if (engine() === 'postgres') {
      await withTransaction(async (tx) => {
        if (is_primary) {
          await tx.query('UPDATE company_addresses SET is_primary = ? WHERE company_id = ?', [false, companyId]);
        }
        await tx.query(`
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
        `, [address_type, address_line1, address_line2, city, district, state, country, pincode, gstin, is_primary != null ? (is_primary ? 1 : 0) : null, id, companyId]);
      });
    } else {
      const db = getDb();
      try {
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
      } catch (txErr) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw txErr;
      } finally { db.close(); }
    }

    res.json({ message: 'Address updated' });
  } catch (err) {
    next(err);
  }
});

router.delete('/addresses/:id', requireSettingsManage, async (req, res, next) => {
  try {
    await dbGet('DELETE FROM company_addresses WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    res.json({ message: 'Address deleted' });
  } catch (err) { next(err); }
});

// ─── LICENSES ────────────────────────────────────────────────────────────────

router.get('/licenses', async (req, res, next) => {
  try {
    const rows = await dbAll('SELECT * FROM company_licenses WHERE company_id = ? ORDER BY created_at DESC', [req.user.companyId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/licenses', requireSettingsManage, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { license_type, license_number, issuing_authority, issue_date, expiry_date, document_url } = req.body;
    if (!license_type) return res.status(400).json({ error: 'license_type is required' });
    if (license_number) {
      const v = validateLicenseNumber(license_type, license_number);
      if (!v.valid) return res.status(400).json({ error: v.error });
    }
    const row = await dbGet(`
      INSERT INTO company_licenses (company_id, license_type, license_number, issuing_authority, issue_date, expiry_date, document_url)
      VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
    `, [companyId, license_type, license_number || null, issuing_authority || null, issue_date || null, expiry_date || null, document_url || null]);
    res.status(201).json({ id: row.id, message: 'License added' });
  } catch (err) { next(err); }
});

router.put('/licenses/:id', requireSettingsManage, async (req, res, next) => {
  try {
    const { license_type, license_number, issuing_authority, issue_date, expiry_date, status, document_url } = req.body;
    if (license_number && license_type) {
      const v = validateLicenseNumber(license_type, license_number);
      if (!v.valid) return res.status(400).json({ error: v.error });
    }
    const nowExpr = engine() === 'postgres' ? 'now()' : "datetime('now')";
    await dbGet(`
      UPDATE company_licenses SET
        license_type = COALESCE(?, license_type),
        license_number = COALESCE(?, license_number),
        issuing_authority = COALESCE(?, issuing_authority),
        issue_date = COALESCE(?, issue_date),
        expiry_date = COALESCE(?, expiry_date),
        status = COALESCE(?, status),
        document_url = COALESCE(?, document_url),
        updated_at = ${nowExpr}
      WHERE id = ? AND company_id = ?
    `, [license_type, license_number, issuing_authority, issue_date, expiry_date, status, document_url, req.params.id, req.user.companyId]);
    res.json({ message: 'License updated' });
  } catch (err) { next(err); }
});

router.delete('/licenses/:id', requireSettingsManage, async (req, res, next) => {
  try {
    await dbGet('DELETE FROM company_licenses WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    res.json({ message: 'License deleted' });
  } catch (err) { next(err); }
});

// GET /api/company/licenses/expiring — licenses expiring within 30 days
router.get('/licenses/expiring', async (req, res, next) => {
  try {
    // SQLite has no DATE type -- julianday() diffs two date-like strings.
    // Postgres's expiry_date is a native DATE column, so plain date
    // subtraction against CURRENT_DATE already yields an integer day count
    // with no time-of-day component. The SQLite side wraps both operands in
    // date(...) for the same reason: bare julianday('now') includes the
    // current time-of-day as a fraction, which CAST(...AS INTEGER) then
    // truncates -- e.g. a license 10 calendar days out would compute as 9
    // once it's past midnight, silently 1 lower than Postgres's answer for
    // the identical data depending what time the request happens to run.
    // date(...) strips the time-of-day first so both engines answer with
    // the same whole-calendar-day count regardless of current time.
    const sql = engine() === 'postgres'
      ? `
        SELECT *, (expiry_date - CURRENT_DATE) AS days_until_expiry
        FROM company_licenses
        WHERE company_id = ?
          AND expiry_date IS NOT NULL
          AND (expiry_date - CURRENT_DATE) BETWEEN 0 AND 30
        ORDER BY expiry_date ASC
      `
      : `
        SELECT *, CAST(julianday(date(expiry_date)) - julianday(date('now')) AS INTEGER) AS days_until_expiry
        FROM company_licenses
        WHERE company_id = ?
          AND expiry_date IS NOT NULL
          AND julianday(date(expiry_date)) - julianday(date('now')) BETWEEN 0 AND 30
        ORDER BY expiry_date ASC
      `;
    const rows = await dbAll(sql, [req.user.companyId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// ─── BANK ACCOUNTS ───────────────────────────────────────────────────────────

router.get('/bank-accounts', async (req, res, next) => {
  try {
    const rows = await dbAll('SELECT * FROM company_bank_accounts WHERE company_id = ? ORDER BY is_primary DESC', [req.user.companyId]);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/bank-accounts', requireSettingsManage, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { bank_name, account_holder_name, account_number, ifsc, branch_name, upi_id, is_primary, show_on_invoice } = req.body;
    if (!bank_name || !account_holder_name || !account_number || !ifsc) {
      return res.status(400).json({ error: 'bank_name, account_holder_name, account_number, and ifsc are required' });
    }

    let insertedId;
    if (engine() === 'postgres') {
      insertedId = await withTransaction(async (tx) => {
        if (is_primary) {
          await tx.query('UPDATE company_bank_accounts SET is_primary = ? WHERE company_id = ?', [false, companyId]);
        }
        const row = await tx.getOne(`
          INSERT INTO company_bank_accounts (company_id, bank_name, account_holder_name, account_number, ifsc, branch_name, upi_id, is_primary, show_on_invoice)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
        `, [companyId, bank_name, account_holder_name, account_number, ifsc, branch_name || null, upi_id || null, is_primary ? 1 : 0, show_on_invoice !== false ? 1 : 0]);
        return row.id;
      });
    } else {
      const db = getDb();
      try {
        db.exec('BEGIN TRANSACTION');
        if (is_primary) {
          db.prepare('UPDATE company_bank_accounts SET is_primary = 0 WHERE company_id = ?').run(companyId);
        }
        const result = db.prepare(`
          INSERT INTO company_bank_accounts (company_id, bank_name, account_holder_name, account_number, ifsc, branch_name, upi_id, is_primary, show_on_invoice)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(companyId, bank_name, account_holder_name, account_number, ifsc, branch_name || null, upi_id || null, is_primary ? 1 : 0, show_on_invoice !== false ? 1 : 0);
        db.exec('COMMIT');
        insertedId = result.lastInsertRowid;
      } catch (txErr) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw txErr;
      } finally { db.close(); }
    }

    res.status(201).json({ id: insertedId, message: 'Bank account added' });
  } catch (err) {
    next(err);
  }
});

router.put('/bank-accounts/:id', requireSettingsManage, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { bank_name, account_holder_name, account_number, ifsc, branch_name, upi_id, is_primary, show_on_invoice } = req.body;

    if (engine() === 'postgres') {
      await withTransaction(async (tx) => {
        if (is_primary) {
          await tx.query('UPDATE company_bank_accounts SET is_primary = ? WHERE company_id = ?', [false, companyId]);
        }
        await tx.query(`
          UPDATE company_bank_accounts SET
            bank_name = COALESCE(?, bank_name),
            account_holder_name = COALESCE(?, account_holder_name),
            account_number = COALESCE(?, account_number),
            ifsc = COALESCE(?, ifsc),
            branch_name = COALESCE(?, branch_name),
            upi_id = COALESCE(?, upi_id),
            is_primary = COALESCE(?, is_primary),
            show_on_invoice = COALESCE(?, show_on_invoice)
          WHERE id = ? AND company_id = ?
        `, [bank_name, account_holder_name, account_number, ifsc, branch_name, upi_id,
            is_primary != null ? (is_primary ? 1 : 0) : null,
            show_on_invoice != null ? (show_on_invoice ? 1 : 0) : null,
            req.params.id, companyId]);
      });
    } else {
      const db = getDb();
      try {
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
      } catch (txErr) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw txErr;
      } finally { db.close(); }
    }

    res.json({ message: 'Bank account updated' });
  } catch (err) {
    next(err);
  }
});

router.delete('/bank-accounts/:id', requireSettingsManage, async (req, res, next) => {
  try {
    await dbGet('DELETE FROM company_bank_accounts WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    res.json({ message: 'Bank account deleted' });
  } catch (err) { next(err); }
});

// ─── GST SETTINGS ─────────────────────────────────────────────────────────────

router.get('/gst-settings', async (req, res, next) => {
  try {
    const row = await dbGet('SELECT * FROM company_gst_settings WHERE company_id = ?', [req.user.companyId]);
    res.json(row || {});
  } catch (err) { next(err); }
});

router.put('/gst-settings', requireSettingsManage, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const {
      registration_type, place_of_supply, state_code, default_gst_rate,
      reverse_charge_applicable, hsn_sac_mandatory, composition_scheme_rate,
      is_gst_registered, inclusive_pricing,
    } = req.body;
    const fields = {
      registration_type, place_of_supply, state_code, default_gst_rate,
      reverse_charge_applicable, hsn_sac_mandatory, composition_scheme_rate,
      is_gst_registered, inclusive_pricing,
    };
    if (engine() === 'postgres') {
      await upsertGstSettingsAsync(companyId, fields);
    } else {
      const db = getDb();
      try { upsertGstSettings(db, companyId, fields); } finally { db.close(); }
    }
    res.json({ message: 'GST settings saved' });
  } catch (err) { next(err); }
});

// ─── FINANCIAL SETTINGS ───────────────────────────────────────────────────────

router.get('/financial-settings', async (req, res, next) => {
  try {
    const row = await dbGet('SELECT * FROM company_financial_settings WHERE company_id = ?', [req.user.companyId]);
    res.json(row || {});
  } catch (err) { next(err); }
});

router.put('/financial-settings', requireSettingsManage, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { currency, financial_year_start_month, timezone, accounting_method, invoice_prefix, purchase_prefix, credit_note_prefix, decimal_precision } = req.body;
    const fields = { currency, financial_year_start_month, timezone, accounting_method, invoice_prefix, purchase_prefix, credit_note_prefix, decimal_precision };
    if (engine() === 'postgres') {
      await upsertFinSettingsAsync(companyId, fields);
    } else {
      const db = getDb();
      try { upsertFinSettings(db, companyId, fields); } finally { db.close(); }
    }
    res.json({ message: 'Financial settings saved' });
  } catch (err) { next(err); }
});

// ─── BRANDING ─────────────────────────────────────────────────────────────────

router.get('/branding', async (req, res, next) => {
  try {
    const row = await dbGet('SELECT * FROM company_branding WHERE company_id = ?', [req.user.companyId]);
    res.json(row || {});
  } catch (err) { next(err); }
});

router.put('/branding', requireSettingsManage, async (req, res, next) => {
  try {
    const { logo_url, signature_url, stamp_url, invoice_footer, brand_color, theme } = req.body;
    const fields = { logo_url, signature_url, stamp_url, invoice_footer, brand_color, theme };
    if (engine() === 'postgres') {
      await upsertBrandingAsync(req.user.companyId, fields);
    } else {
      const db = getDb();
      try { upsertBranding(db, req.user.companyId, fields); } finally { db.close(); }
    }
    res.json({ message: 'Branding saved' });
  } catch (err) { next(err); }
});

// ─── SECURITY SETTINGS ────────────────────────────────────────────────────────

router.get('/security', async (req, res, next) => {
  try {
    const row = await dbGet('SELECT * FROM company_security_settings WHERE company_id = ?', [req.user.companyId]);
    res.json(row || {});
  } catch (err) { next(err); }
});

router.put('/security', requireSettingsManage, async (req, res, next) => {
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
    const nowExpr = engine() === 'postgres' ? 'now()' : "datetime('now')";
    const existing = await dbGet('SELECT id FROM company_security_settings WHERE company_id = ?', [companyId]);
    if (existing) {
      const sets = Object.keys(clean).map(k => `${k} = ?`).join(', ');
      await dbGet(`UPDATE company_security_settings SET ${sets}, updated_at = ${nowExpr} WHERE company_id = ?`, [...Object.values(clean), companyId]);
    } else {
      const cols = ['company_id', ...Object.keys(clean)].join(', ');
      const placeholders = Array(Object.keys(clean).length + 1).fill('?').join(', ');
      await dbGet(`INSERT INTO company_security_settings (${cols}) VALUES (${placeholders})`, [companyId, ...Object.values(clean)]);
    }
    res.json({ message: 'Security settings saved' });
  } catch (err) { next(err); }
});

// ─── SETUP PROGRESS ───────────────────────────────────────────────────────────

// GET /api/company/setup-progress — returns all 6 steps with explicit status
router.get('/setup-progress', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const steps = await dbAll(
      'SELECT step_number, status, completed_at FROM company_setup_progress WHERE company_id = ? ORDER BY step_number', [companyId]
    );

    const company = await dbGet('SELECT setup_completed FROM companies WHERE id = ?', [companyId]);

    // Compute completion percentage from explicit states (Resolution 2)
    const completedCount = steps.filter(s => s.status === 'completed').length;
    const completionPct = Math.round((completedCount / 6) * 100);

    res.json({
      steps,
      completionPct,
      setupCompleted: !!company?.setup_completed,
    });
  } catch (err) { next(err); }
});

// ─── LICENSE REQUIREMENTS (lookup, no hardcoding) ─────────────────────────────
router.get('/license-requirements', async (req, res, next) => {
  try {
    const { category } = req.query;
    if (!category) return res.status(400).json({ error: 'category query param required' });
    const rows = await dbAll(
      'SELECT license_type, is_mandatory, description FROM license_category_map WHERE business_category = ?', [category]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ─── EXPIRY ALERT DISMISS ─────────────────────────────────────────────────────
router.post('/licenses/alerts/:id/dismiss', requireSettingsManage, async (req, res, next) => {
  try {
    const nowExpr = engine() === 'postgres' ? 'now()' : "datetime('now')";
    await dbGet(`
      UPDATE license_expiry_alerts SET is_dismissed = ?, dismissed_at = ${nowExpr}
      WHERE id = ? AND company_id = ?
    `, [1, req.params.id, req.user.companyId]);
    res.json({ message: 'Alert dismissed' });
  } catch (err) { next(err); }
});

// ─── SETUP WIZARD STEP ENDPOINTS ─────────────────────────────────────────────
// Note: steps 2, 4, and 5 below are NOT wrapped in an explicit transaction --
// this was already the case before Phase 2 (each does 1-2 independent
// statements, e.g. an address upsert followed by a separate markStep call).
// Pre-existing gap, not introduced or fixed by this conversion; preserved as-is
// per the same "flag, don't fix mid-migration" call made for stock.js.

// Step 1: GSTIN / PAN — required
router.post('/setup/gstin', requireSettingsManage, async (req, res, next) => {
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

    await dbGet('UPDATE companies SET gstin = COALESCE(?, gstin), pan = COALESCE(?, pan) WHERE id = ?', [gstin || null, pan || null, companyId]);

    if (engine() === 'postgres') {
      if (stateInfo) {
        await upsertGstSettingsAsync(companyId, { state_code: stateInfo.stateCode, place_of_supply: stateInfo.stateName });
      }
      await markStepAsync(companyId, 1, 'completed');
    } else {
      const db = getDb();
      try {
        if (stateInfo) {
          upsertGstSettings(db, companyId, { state_code: stateInfo.stateCode, place_of_supply: stateInfo.stateName });
        }
        markStep(db, companyId, 1, 'completed');
      } finally { db.close(); }
    }

    res.json({ message: 'GSTIN/PAN saved', stateInfo });
  } catch (err) { next(err); }
});

// Step 2: Registered Address
router.post('/setup/address', requireSettingsManage, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { skip, ...addressData } = req.body;

    if (skip) {
      if (engine() === 'postgres') { await markStepAsync(companyId, 2, 'skipped'); }
      else { const db = getDb(); try { markStep(db, companyId, 2, 'skipped'); } finally { db.close(); } }
      return res.json({ message: 'Step 2 skipped' });
    }

    const { address_line1, city, state, pincode } = addressData;
    if (!address_line1 || !city || !state || !pincode) {
      return res.status(400).json({ error: 'address_line1, city, state, pincode are required' });
    }

    // Upsert the registered address
    const existing = await dbGet("SELECT id FROM company_addresses WHERE company_id = ? AND address_type = 'registered'", [companyId]);
    if (existing) {
      await dbGet(`
        UPDATE company_addresses SET address_line1=?, address_line2=?, city=?, district=?, state=?, pincode=?
        WHERE id = ?
      `, [address_line1, addressData.address_line2 || null, city, addressData.district || null, state, pincode, existing.id]);
    } else {
      // is_primary bound as a parameter, not embedded as a SQL literal --
      // Postgres rejects a literal integer against a BOOLEAN column even
      // though the identical value works fine as a bound parameter.
      await dbGet(`
        INSERT INTO company_addresses (company_id, address_type, address_line1, address_line2, city, district, state, pincode, is_primary)
        VALUES (?, 'registered', ?, ?, ?, ?, ?, ?, ?)
      `, [companyId, address_line1, addressData.address_line2 || null, city, addressData.district || null, state, pincode, 1]);
    }

    if (engine() === 'postgres') { await markStepAsync(companyId, 2, 'completed'); }
    else { const db = getDb(); try { markStep(db, companyId, 2, 'completed'); } finally { db.close(); } }

    res.json({ message: 'Address saved' });
  } catch (err) { next(err); }
});

// Step 3: Industry & Category
router.post('/setup/industry', requireSettingsManage, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { skip, industry, business_category } = req.body;
    if (skip) {
      if (engine() === 'postgres') { await markStepAsync(companyId, 3, 'skipped'); }
      else { const db = getDb(); try { markStep(db, companyId, 3, 'skipped'); } finally { db.close(); } }
      return res.json({ message: 'Step 3 skipped' });
    }
    await dbGet('UPDATE companies SET industry = COALESCE(?, industry), business_category = COALESCE(?, business_category) WHERE id = ?', [industry || null, business_category || null, companyId]);

    if (engine() === 'postgres') { await markStepAsync(companyId, 3, 'completed'); }
    else { const db = getDb(); try { markStep(db, companyId, 3, 'completed'); } finally { db.close(); } }

    // Return the license requirements for the chosen category so frontend can render Step 4
    const licenseReqs = business_category
      ? await dbAll('SELECT license_type, is_mandatory, description FROM license_category_map WHERE business_category = ?', [business_category])
      : [];
    res.json({ message: 'Industry saved', licenseRequirements: licenseReqs });
  } catch (err) { next(err); }
});

// Step 4: Licenses
router.post('/setup/licenses', requireSettingsManage, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { skip, licenses } = req.body;
    if (skip) {
      if (engine() === 'postgres') { await markStepAsync(companyId, 4, 'skipped'); }
      else { const db = getDb(); try { markStep(db, companyId, 4, 'skipped'); } finally { db.close(); } }
      return res.json({ message: 'Step 4 skipped' });
    }
    if (Array.isArray(licenses)) {
      for (const lic of licenses) {
        if (lic.license_number && lic.license_type) {
          const v = validateLicenseNumber(lic.license_type, lic.license_number);
          if (!v.valid) return res.status(400).json({ error: `${lic.license_type}: ${v.error}` });
          await dbGet(`
            INSERT INTO company_licenses (company_id, license_type, license_number, expiry_date)
            VALUES (?, ?, ?, ?)
          `, [companyId, lic.license_type, lic.license_number, lic.expiry_date || null]);
        }
      }
    }
    if (engine() === 'postgres') { await markStepAsync(companyId, 4, 'completed'); }
    else { const db = getDb(); try { markStep(db, companyId, 4, 'completed'); } finally { db.close(); } }
    res.json({ message: 'Licenses saved' });
  } catch (err) { next(err); }
});

// Step 5: Invoice basics + primary bank account
router.post('/setup/invoice', requireSettingsManage, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { skip, invoice_prefix, default_gst_rate, bank } = req.body;
    if (skip) {
      if (engine() === 'postgres') { await markStepAsync(companyId, 5, 'skipped'); }
      else { const db = getDb(); try { markStep(db, companyId, 5, 'skipped'); } finally { db.close(); } }
      return res.json({ message: 'Step 5 skipped' });
    }
    if (invoice_prefix || default_gst_rate != null) {
      if (engine() === 'postgres') {
        await upsertFinSettingsAsync(companyId, { invoice_prefix: invoice_prefix || 'INV' });
        if (default_gst_rate != null) {
          await upsertGstSettingsAsync(companyId, { default_gst_rate });
        }
      } else {
        const db = getDb();
        try {
          upsertFinSettings(db, companyId, { invoice_prefix: invoice_prefix || 'INV' });
          if (default_gst_rate != null) {
            upsertGstSettings(db, companyId, { default_gst_rate });
          }
        } finally { db.close(); }
      }
    }
    if (bank && bank.bank_name && bank.account_number && bank.ifsc) {
      // Remove any existing primary, then insert the new one as primary.
      // is_primary/show_on_invoice bound as parameters (see setup/address
      // above for why a literal 1 against these BOOLEAN columns fails on
      // Postgres).
      await dbGet('UPDATE company_bank_accounts SET is_primary = ? WHERE company_id = ?', [0, companyId]);
      await dbGet(`
        INSERT INTO company_bank_accounts (company_id, bank_name, account_holder_name, account_number, ifsc, branch_name, is_primary, show_on_invoice)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [companyId, bank.bank_name, bank.account_holder_name || '', bank.account_number, bank.ifsc, bank.branch_name || null, 1, 1]);
    }
    if (engine() === 'postgres') { await markStepAsync(companyId, 5, 'completed'); }
    else { const db = getDb(); try { markStep(db, companyId, 5, 'completed'); } finally { db.close(); } }
    res.json({ message: 'Invoice basics saved' });
  } catch (err) { next(err); }
});

// Step 6: Branding (skippable, no validation required)
router.post('/setup/branding', requireSettingsManage, async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { skip, logo_url, brand_color } = req.body;
    if (skip) {
      if (engine() === 'postgres') { await markStepAsync(companyId, 6, 'skipped'); }
      else { const db = getDb(); try { markStep(db, companyId, 6, 'skipped'); } finally { db.close(); } }
    } else {
      if (engine() === 'postgres') {
        await upsertBrandingAsync(companyId, { logo_url: logo_url || null, brand_color: brand_color || '#2563EB' });
        await markStepAsync(companyId, 6, 'completed');
      } else {
        const db = getDb();
        try {
          upsertBranding(db, companyId, { logo_url: logo_url || null, brand_color: brand_color || '#2563EB' });
          markStep(db, companyId, 6, 'completed');
        } finally { db.close(); }
      }
    }
    // Mark setup as completed regardless (wizard finished). Bound as a
    // parameter, not a literal 1 -- setup_completed is BOOLEAN on Postgres.
    await dbGet('UPDATE companies SET setup_completed = ? WHERE id = ?', [1, companyId]);
    res.json({ message: 'Setup complete' });
  } catch (err) { next(err); }
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
