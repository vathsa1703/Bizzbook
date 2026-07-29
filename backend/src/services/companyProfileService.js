/**
 * Shared upsert helpers for the company profile satellite tables
 * (company_gst_settings, company_financial_settings, company_branding).
 * These are the canonical write path for company profile data —
 * company_settings is deprecated (see schema.sql). Used by both
 * routes/company.js (Company Profile / Setup Wizard) and
 * routes/companySettings.js (legacy GST Settings screen, same underlying data).
 */

const { dbGet } = require('../config/dbEngine');

function upsertGstSettings(db, companyId, fields) {
  const existing = db.prepare('SELECT id FROM company_gst_settings WHERE company_id = ?').get(companyId);
  if (existing) {
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE company_gst_settings SET ${sets}, updated_at = datetime('now') WHERE company_id = ?`)
      .run(...Object.values(fields), companyId);
  } else {
    const cols = ['company_id', ...Object.keys(fields)].join(', ');
    const placeholders = Array(Object.keys(fields).length + 1).fill('?').join(', ');
    db.prepare(`INSERT INTO company_gst_settings (${cols}) VALUES (${placeholders})`)
      .run(companyId, ...Object.values(fields));
  }
}

function upsertFinSettings(db, companyId, fields) {
  const existing = db.prepare('SELECT id FROM company_financial_settings WHERE company_id = ?').get(companyId);
  if (existing) {
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE company_financial_settings SET ${sets}, updated_at = datetime('now') WHERE company_id = ?`)
      .run(...Object.values(fields), companyId);
  } else {
    const cols = ['company_id', ...Object.keys(fields)].join(', ');
    const placeholders = Array(Object.keys(fields).length + 1).fill('?').join(', ');
    db.prepare(`INSERT INTO company_financial_settings (${cols}) VALUES (${placeholders})`)
      .run(companyId, ...Object.values(fields));
  }
}

function upsertBranding(db, companyId, fields) {
  const existing = db.prepare('SELECT id FROM company_branding WHERE company_id = ?').get(companyId);
  if (existing) {
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE company_branding SET ${sets}, updated_at = datetime('now') WHERE company_id = ?`)
      .run(...Object.values(fields), companyId);
  } else {
    const cols = ['company_id', ...Object.keys(fields)].join(', ');
    const placeholders = Array(Object.keys(fields).length + 1).fill('?').join(', ');
    db.prepare(`INSERT INTO company_branding (${cols}) VALUES (${placeholders})`)
      .run(companyId, ...Object.values(fields));
  }
}

// Postgres-only twins of the three upserts above, used by routes/company.js's
// Postgres path. Not merged into the originals: those take a raw synchronous
// SQLite db handle and are also still called by routes/companySettings.js,
// which hasn't been converted yet. Kept as literal ? placeholders here (not
// SQL text) so dbEngine.js's dbGet handles the ? -> $n conversion itself --
// no dialect differences to branch on, since column names are always drawn
// from a fixed, code-controlled `fields` object, never user input.
async function upsertGstSettingsAsync(companyId, fields) {
  const existing = await dbGet('SELECT id FROM company_gst_settings WHERE company_id = ?', [companyId]);
  if (existing) {
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    await dbGet(`UPDATE company_gst_settings SET ${sets}, updated_at = now() WHERE company_id = ?`, [...Object.values(fields), companyId]);
  } else {
    const cols = ['company_id', ...Object.keys(fields)].join(', ');
    const placeholders = Array(Object.keys(fields).length + 1).fill('?').join(', ');
    await dbGet(`INSERT INTO company_gst_settings (${cols}) VALUES (${placeholders})`, [companyId, ...Object.values(fields)]);
  }
}

async function upsertFinSettingsAsync(companyId, fields) {
  const existing = await dbGet('SELECT id FROM company_financial_settings WHERE company_id = ?', [companyId]);
  if (existing) {
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    await dbGet(`UPDATE company_financial_settings SET ${sets}, updated_at = now() WHERE company_id = ?`, [...Object.values(fields), companyId]);
  } else {
    const cols = ['company_id', ...Object.keys(fields)].join(', ');
    const placeholders = Array(Object.keys(fields).length + 1).fill('?').join(', ');
    await dbGet(`INSERT INTO company_financial_settings (${cols}) VALUES (${placeholders})`, [companyId, ...Object.values(fields)]);
  }
}

async function upsertBrandingAsync(companyId, fields) {
  const existing = await dbGet('SELECT id FROM company_branding WHERE company_id = ?', [companyId]);
  if (existing) {
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    await dbGet(`UPDATE company_branding SET ${sets}, updated_at = now() WHERE company_id = ?`, [...Object.values(fields), companyId]);
  } else {
    const cols = ['company_id', ...Object.keys(fields)].join(', ');
    const placeholders = Array(Object.keys(fields).length + 1).fill('?').join(', ');
    await dbGet(`INSERT INTO company_branding (${cols}) VALUES (${placeholders})`, [companyId, ...Object.values(fields)]);
  }
}

module.exports = {
  upsertGstSettings, upsertFinSettings, upsertBranding,
  upsertGstSettingsAsync, upsertFinSettingsAsync, upsertBrandingAsync,
};
