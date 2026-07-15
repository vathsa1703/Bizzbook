/**
 * Legacy flat Company Settings API (GstSettings.jsx).
 * company_settings is deprecated (see schema.sql) — this route now composes
 * its flat response from the canonical satellite tables (companies,
 * company_gst_settings, company_branding, company_addresses) via
 * companyProfileService, matching routes/company.js's Resolution 1 pattern.
 * No dual-read/write of company_settings.
 */
const express = require('express');
const { getDb } = require('../config/db');
const { requirePermission } = require('../middleware/auth');
const { upsertGstSettings, upsertBranding } = require('../services/companyProfileService');

const router = express.Router();

// GET company settings — scoped to authenticated user's company
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    if (!req.user?.companyId) {
      return res.status(400).json({ error: 'companyId missing from token' });
    }
    const companyId = req.user.companyId;

    const company  = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId) || {};
    const gst       = db.prepare('SELECT * FROM company_gst_settings WHERE company_id = ?').get(companyId) || {};
    const branding  = db.prepare('SELECT * FROM company_branding WHERE company_id = ?').get(companyId) || {};
    const address   = db.prepare("SELECT * FROM company_addresses WHERE company_id = ? AND address_type = 'registered'").get(companyId)
      || db.prepare('SELECT * FROM company_addresses WHERE company_id = ? ORDER BY is_primary DESC, id ASC').get(companyId)
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
  } finally {
    db.close();
  }
});

// PUT update company settings — scoped to authenticated user's company
router.put('/', requirePermission('settings.manage'), (req, res, next) => {
  const db = getDb();
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

    db.exec('BEGIN TRANSACTION');

    db.prepare(`
      UPDATE companies SET
        gstin               = COALESCE(?, gstin),
        name                = COALESCE(?, name),
        phone               = COALESCE(?, phone),
        email               = COALESCE(?, email),
        legal_business_name = COALESCE(?, legal_business_name),
        trade_name          = COALESCE(?, trade_name),
        pan                 = COALESCE(?, pan),
        updated_at          = datetime('now')
      WHERE id = ?
    `).run(gstin, company_name, phone, email, legal_name, trade_name, pan, companyId);

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
    if (Object.keys(gstFields).length > 0) {
      upsertGstSettings(db, companyId, gstFields);
    }

    if (logo != null) {
      upsertBranding(db, companyId, { logo_url: logo });
    }

    if (address != null || pincode != null || state != null) {
      const existingAddr = db.prepare("SELECT id FROM company_addresses WHERE company_id = ? AND address_type = 'registered'").get(companyId);
      if (existingAddr) {
        db.prepare(`
          UPDATE company_addresses SET
            address_line1 = COALESCE(?, address_line1),
            state         = COALESCE(?, state),
            pincode       = COALESCE(?, pincode)
          WHERE id = ?
        `).run(address, state, pincode, existingAddr.id);
      } else if (address && state && pincode) {
        // A registered address needs city too; without one yet, skip creating an incomplete row —
        // Setup Wizard step 2 (routes/company.js) is the primary path for creating this row.
        const cityFallback = state;
        db.prepare(`
          INSERT INTO company_addresses (company_id, address_type, address_line1, city, state, pincode, is_primary)
          VALUES (?, 'registered', ?, ?, ?, ?, 1)
        `).run(companyId, address, cityFallback, state, pincode);
      }
    }

    db.exec('COMMIT');
    res.json({ message: 'Company settings saved' });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
