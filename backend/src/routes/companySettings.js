/**
 * Legacy flat Company Settings API (GstSettings.jsx).
 * company_settings is deprecated (see schema.sql) — this route now composes
 * its flat response from the canonical satellite tables (companies,
 * company_gst_settings, company_branding, company_addresses) via
 * companyProfileService, matching routes/company.js's Resolution 1 pattern.
 * No dual-read/write of company_settings.
 */
const express = require('express');
const { requirePermission } = require('../middleware/auth');
const { dbGet } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

const router = express.Router();

// GET company settings — scoped to authenticated user's company
router.get('/', async (req, res, next) => {
  try {
    if (!req.user?.companyId) {
      return res.status(400).json({ error: 'companyId missing from token' });
    }
    const companyId = req.user.companyId;

    const company  = (await dbGet('SELECT * FROM companies WHERE id = ?', [companyId])) || {};
    const gst       = (await dbGet('SELECT * FROM company_gst_settings WHERE company_id = ?', [companyId])) || {};
    const branding  = (await dbGet('SELECT * FROM company_branding WHERE company_id = ?', [companyId])) || {};
    const address   = (await dbGet("SELECT * FROM company_addresses WHERE company_id = ? AND address_type = 'registered'", [companyId]))
      || (await dbGet('SELECT * FROM company_addresses WHERE company_id = ? ORDER BY is_primary DESC, id ASC', [companyId]))
      || {};

    res.json({
      gstin:        company.gstin || '',
      state:        gst.place_of_supply || '',
      default_hsn_prefix: gst.default_hsn_prefix || '',
      company_name: company.name || '',
      address:      address.address_line1 || '',
      phone:        company.phone || '',
      email:        company.email || '',
      logo:         branding.logo_url || '',
      legal_name:   company.legal_business_name || '',
      trade_name:   company.trade_name || '',
      pan:          company.pan || '',
      state_code:   gst.state_code || '',
      pincode:      address.pincode || '',
      is_gst_registered: gst.is_gst_registered != null ? gst.is_gst_registered : 1,
      inclusive_pricing: gst.inclusive_pricing != null ? gst.inclusive_pricing : 1,
    });
  } catch (err) {
    next(err);
  }
});

// PUT update company settings — scoped to authenticated user's company
router.put('/', requirePermission('settings.manage'), async (req, res, next) => {
  try {
    if (!req.user?.companyId) {
      return res.status(400).json({ error: 'companyId missing from token' });
    }
    const companyId = req.user.companyId;
    const {
      gstin            = null,
      state            = null,
      default_hsn_prefix = null,
      company_name     = null,
      address          = null,
      phone            = null,
      email            = null,
      logo             = null,
      legal_name       = null,
      trade_name       = null,
      pan              = null,
      state_code       = null,
      pincode          = null,
      is_gst_registered = null,
      inclusive_pricing = null,
    } = req.body;

    // upsertGstSettings/upsertBranding overwrite whatever fields they're given (no COALESCE),
    // so only pass fields the caller actually sent — mirrors the COALESCE-skip-null semantics
    // the old flat company_settings UPDATE had.
    const gstFields = Object.fromEntries(Object.entries({
      place_of_supply:   state,
      default_hsn_prefix,
      state_code,
      is_gst_registered: is_gst_registered != null ? (is_gst_registered ? 1 : 0) : null,
      inclusive_pricing: inclusive_pricing != null ? (inclusive_pricing ? 1 : 0) : null,
    }).filter(([_, v]) => v != null));

    await withTransaction(async (tx) => {
        await tx.query(`
          UPDATE companies SET
            gstin               = COALESCE(?, gstin),
            name                = COALESCE(?, name),
            phone               = COALESCE(?, phone),
            email               = COALESCE(?, email),
            legal_business_name = COALESCE(?, legal_business_name),
            trade_name          = COALESCE(?, trade_name),
            pan                 = COALESCE(?, pan),
            updated_at          = now()
          WHERE id = ?
        `, [gstin, company_name, phone, email, legal_name, trade_name, pan, companyId]);

        // Inlined via tx.query/tx.getOne rather than calling
        // upsertGstSettingsAsync/upsertBrandingAsync: those twins go
        // through dbEngine.js's dbGet, which acquires its own connection
        // from the pool independently of `tx` -- calling them here would
        // silently execute outside this transaction, breaking atomicity
        // with the companies UPDATE and address upsert below. The SQLite
        // branch doesn't have this risk since upsertGstSettings/
        // upsertBranding take the same `db` handle that's already inside
        // this function's db.exec('BEGIN TRANSACTION').
        if (Object.keys(gstFields).length > 0) {
          const existingGst = await tx.getOne('SELECT id FROM company_gst_settings WHERE company_id = ?', [companyId]);
          if (existingGst) {
            const sets = Object.keys(gstFields).map(k => `${k} = ?`).join(', ');
            await tx.query(`UPDATE company_gst_settings SET ${sets}, updated_at = now() WHERE company_id = ?`, [...Object.values(gstFields), companyId]);
          } else {
            const cols = ['company_id', ...Object.keys(gstFields)].join(', ');
            const placeholders = Array(Object.keys(gstFields).length + 1).fill('?').join(', ');
            await tx.query(`INSERT INTO company_gst_settings (${cols}) VALUES (${placeholders})`, [companyId, ...Object.values(gstFields)]);
          }
        }

        if (logo != null) {
          const existingBranding = await tx.getOne('SELECT id FROM company_branding WHERE company_id = ?', [companyId]);
          if (existingBranding) {
            await tx.query('UPDATE company_branding SET logo_url = ?, updated_at = now() WHERE company_id = ?', [logo, companyId]);
          } else {
            await tx.query('INSERT INTO company_branding (company_id, logo_url) VALUES (?, ?)', [companyId, logo]);
          }
        }

        if (address != null || pincode != null || state != null) {
          const existingAddr = await tx.getOne("SELECT id FROM company_addresses WHERE company_id = ? AND address_type = 'registered'", [companyId]);
          if (existingAddr) {
            await tx.query(`
              UPDATE company_addresses SET
                address_line1 = COALESCE(?, address_line1),
                state         = COALESCE(?, state),
                pincode       = COALESCE(?, pincode)
              WHERE id = ?
            `, [address, state, pincode, existingAddr.id]);
          } else if (address && state && pincode) {
            // A registered address needs city too; without one yet, skip creating an incomplete row —
            // Setup Wizard step 2 (routes/company.js) is the primary path for creating this row.
            const cityFallback = state;
            // is_primary bound as a parameter, not a literal 1 -- Postgres
            // rejects a literal integer against a BOOLEAN column even
            // though the identical value works fine as a bound parameter
            // (same fix already applied in routes/company.js).
            await tx.query(`
              INSERT INTO company_addresses (company_id, address_type, address_line1, city, state, pincode, is_primary)
              VALUES (?, 'registered', ?, ?, ?, ?, ?)
            `, [companyId, address, cityFallback, state, pincode, 1]);
          }
        }
      });

    res.json({ message: 'Company settings saved' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
