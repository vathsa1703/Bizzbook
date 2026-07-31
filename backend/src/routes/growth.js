// ============================================================================
// Business Growth Hub — API Routes
// Mounted at /api/growth (auth + branchAuth + rbac applied globally in app.js)
// Phase 2: growthService's helpers are now async (dual-engine SQLite/Postgres
// via config/dbEngine.js) — every handler below is async and awaits them.
// ============================================================================
'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const svc = require('../services/growthService');
const aiService = require('../services/aiService');
const { growthAdvisorRateLimit } = require('../middleware/aiRateLimit');

const isAdmin = (req) => ['admin', 'OWNER', 'MANAGER'].includes(req.user.role);

// datetime('now') is SQLite-only; Postgres's *_at columns are TIMESTAMPTZ, so
// now() is the direct equivalent (same pattern as routes/credits.js's `today`).
const nowExpr = () => 'now()';

// ── Multer upload factory ─────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

function createUpload(subfolder) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        try { cb(null, svc.getUploadDir(req.user.companyId, subfolder)); }
        catch (e) { cb(e); }
      },
      filename: (req, file, cb) => {
        const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}_${safe}`);
      },
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        const err = new Error(`Unsupported file type: ${file.mimetype}`);
        err.status = 400;
        return cb(err);
      }
      cb(null, true);
    },
  });
}

const uploadDeck    = createUpload('pitch-decks');
const uploadDd      = createUpload('due-diligence');
const uploadIpo     = createUpload('ipo-documents');
const uploadPartner = createUpload('partnerships');

// ── Auto-seed reference data on module load (idempotent) ─────────────────────
// seedReferenceData() is async now (dual-engine) — module load can't await it,
// so errors are caught via .catch() instead of the previous sync try/catch.
svc.seedReferenceData().catch((e) => {
  console.error('[GrowthRoute] Seed error (non-fatal):', e.message);
});
svc.seedInvestorDirectory().catch((e) => {
  console.error('[GrowthRoute] Investor directory seed error (non-fatal):', e.message);
});

// ── Response helpers ──────────────────────────────────────────────────────────
function ok(res, data) { res.json({ success: true, ...data }); }
function fail(res, e, code = 500) {
  console.error('[GrowthRoute]', e.message || e);
  res.status(code).json({ success: false, error: e.message || 'Internal error' });
}

// ── Access gate ────────────────────────────────────────────────────────────────
// The Growth Hub nav entry itself is admin-only (frontend/src/pages/More.jsx:
// `isAdmin && <Growth Hub link>`, same role set as isAdmin() above) — cap table,
// investor pipeline, valuations and fundraising data are not meant to be visible
// or editable by regular employees. That intent wasn't enforced on the API, so a
// logged-in employee could read/write all of it via direct requests. Enforcing it
// here (once, for the whole router) matches the existing nav-level access model
// instead of adding a new permission scheme.
router.use((req, res, next) => {
  if (!isAdmin(req)) return res.status(403).json({ success: false, error: 'Forbidden: Growth Hub is restricted to owners/managers.', code: 'FORBIDDEN' });
  next();
});

// ════════════════════════════════════════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════════════════════════════════════════

router.get('/profile', async (req, res) => {
  try { ok(res, { profile: await svc.getOrCreateProfile(req.user.companyId) }); }
  catch (e) { fail(res, e); }
});

router.put('/profile', async (req, res) => {
  try { ok(res, { profile: await svc.updateProfile(req.user.companyId, req.body || {}) }); }
  catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD & READINESS
// ════════════════════════════════════════════════════════════════════════════

router.get('/dashboard', async (req, res) => {
  try {
    // Single connection for profile + readiness + counts + latest valuation
    // (was 8 separate getDb() opens). Same queries, same output shape.
    ok(res, await svc.getDashboardData(req.user.companyId));
  } catch (e) { fail(res, e); }
});

router.get('/readiness', async (req, res) => {
  try { ok(res, { readiness: await svc.computeReadiness(req.user.companyId) }); }
  catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// FUNDING TYPES
// ════════════════════════════════════════════════════════════════════════════

router.get('/funding-types', async (req, res) => {
  try {
    const { country, category } = req.query;
    // is_active is a real BOOLEAN column on Postgres — bind 1 as a param
    // instead of splicing a literal `= 1` into the SQL text (Postgres has no
    // implicit integer->boolean cast for a bare literal, but accepts '1' as
    // boolean input when bound as a parameter).
    let sql = 'SELECT * FROM funding_types WHERE is_active = ?';
    const params = [1];
    if (country) { sql += ' AND (country_code IS NULL OR country_code = ?)'; params.push(country); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY sort_order, name';
    ok(res, { fundingTypes: await svc.all(sql, params) });
  } catch (e) { fail(res, e); }
});

router.get('/funding-types/:id', async (req, res) => {
  try {
    const ft = await svc.get('SELECT * FROM funding_types WHERE id = ?', [req.params.id]);
    if (!ft) return res.status(404).json({ error: 'Not found' });
    ok(res, { fundingType: ft });
  } catch (e) { fail(res, e); }
});

router.post('/funding-types', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const d = req.body;
    if (!d.name || !d.category) return res.status(400).json({ error: 'name and category are required' });
    const r = await svc.run(
      `INSERT INTO funding_types (country_code,name,category,description,eligibility,advantages,disadvantages,
        typical_amount_min,typical_amount_max,typical_amount_unit,dilution_level,risk_level,
        timeline_days_min,timeline_days_max,required_documents,how_to_apply,official_resources)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.country_code??null,d.name,d.category,d.description,d.eligibility,d.advantages,d.disadvantages,
       d.typical_amount_min??null,d.typical_amount_max??null,d.typical_amount_unit??'INR',
       d.dilution_level,d.risk_level,d.timeline_days_min??null,d.timeline_days_max??null,
       d.required_documents,d.how_to_apply,d.official_resources]
    );
    ok(res, { id: r.lastInsertRowid });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// GOVERNMENT SCHEMES
// ════════════════════════════════════════════════════════════════════════════

router.get('/schemes', async (req, res) => {
  try {
    const { country, category, search, region } = req.query;
    // See /funding-types above for why is_active is bound as a param.
    let sql = 'SELECT * FROM government_schemes WHERE is_active = ?';
    const params = [1];
    if (country)   { sql += ' AND country_code = ?'; params.push(country); }
    if (category)  { sql += ' AND category = ?'; params.push(category); }
    if (region)    { sql += ' AND (region IS NULL OR region = ?)'; params.push(region); }
    if (search)    {
      sql += ' AND (name LIKE ? OR short_name LIKE ? OR description LIKE ? OR tags LIKE ?)';
      const s = `%${search}%`; params.push(s, s, s, s);
    }
    sql += ' ORDER BY sort_order, name';
    ok(res, { schemes: await svc.all(sql, params) });
  } catch (e) { fail(res, e); }
});

router.get('/schemes/:id', async (req, res) => {
  try {
    const s = await svc.get('SELECT * FROM government_schemes WHERE id = ?', [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Not found' });
    ok(res, { scheme: s });
  } catch (e) { fail(res, e); }
});

router.post('/schemes', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const d = req.body;
    if (!d.name || !d.category) return res.status(400).json({ error: 'name and category are required' });
    const r = await svc.run(
      `INSERT INTO government_schemes (country_code,region,name,short_name,category,administering_body,description,
        eligibility,benefits,documents_required,application_process,official_links,
        deadline_type,deadline_notes,max_benefit_amount,benefit_unit,benefit_type,tags)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.country_code,d.region??null,d.name,d.short_name??null,d.category,d.administering_body,d.description,
       d.eligibility,d.benefits,d.documents_required,d.application_process,d.official_links,
       d.deadline_type,d.deadline_notes??null,d.max_benefit_amount??null,d.benefit_unit??'INR',d.benefit_type,d.tags]
    );
    ok(res, { id: r.lastInsertRowid });
  } catch (e) { fail(res, e); }
});

// PUT /schemes/:id — admin correction/update. This is the practical way this
// app keeps government_schemes "current": there is no live government data
// feed to poll, so freshness comes from a human admin editing a scheme and
// this bumping last_verified_at to now() as a record of that manual check.
router.put('/schemes/:id', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const d = req.body;
    const fields = ['country_code','region','name','short_name','category','administering_body','description',
      'eligibility','benefits','documents_required','application_process','official_links',
      'deadline_type','deadline_notes','max_benefit_amount','benefit_unit','benefit_type','tags','sort_order','is_active'];
    const updates = {};
    for (const f of fields) if (d[f] !== undefined) updates[f] = d[f];
    const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const setClause = set ? `${set}, ` : '';
    await svc.run(
      `UPDATE government_schemes SET ${setClause}last_verified_at = ${nowExpr()}, updated_at = ${nowExpr()} WHERE id = ?`,
      [...Object.values(updates), req.params.id]
    );
    const scheme = await svc.get('SELECT * FROM government_schemes WHERE id = ?', [req.params.id]);
    if (!scheme) return res.status(404).json({ error: 'Not found' });
    ok(res, { scheme });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// INVESTOR DIRECTORY (curated reference list of real investor firms/funds —
// NOT the per-company Investors CRM below. Read-only, admin-curated data,
// mirrors GOVERNMENT_SCHEMES's shape/conventions.)
// ════════════════════════════════════════════════════════════════════════════

router.get('/investor-directory', async (req, res) => {
  try {
    const { sector, stage, org_type, region, search } = req.query;
    // is_active bound as a param — see /funding-types above for why.
    let sql = 'SELECT * FROM investor_directory WHERE is_active = ?';
    const params = [1];
    if (org_type) { sql += ' AND org_type = ?'; params.push(org_type); }
    if (stage)    { sql += ' AND investment_stage = ?'; params.push(stage); }
    if (region)   { sql += ' AND (region IS NULL OR region = ?)'; params.push(region); }
    if (sector)   { sql += ' AND focus_sectors LIKE ?'; params.push(`%${sector}%`); }
    if (search)   {
      sql += ' AND (name LIKE ? OR description LIKE ? OR focus_sectors LIKE ?)';
      const s = `%${search}%`; params.push(s, s, s);
    }
    sql += ' ORDER BY sort_order, name';
    ok(res, { investorDirectory: await svc.all(sql, params) });
  } catch (e) { fail(res, e); }
});

router.get('/investor-directory/:id', async (req, res) => {
  try {
    const inv = await svc.get('SELECT * FROM investor_directory WHERE id = ?', [req.params.id]);
    if (!inv) return res.status(404).json({ error: 'Not found' });
    ok(res, { investor: inv });
  } catch (e) { fail(res, e); }
});

// POST /investor-directory — admin-only correction/addition, mirrors POST /schemes.
router.post('/investor-directory', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const d = req.body;
    if (!d.name) return res.status(400).json({ error: 'name is required' });
    const r = await svc.run(
      `INSERT INTO investor_directory
        (name,org_type,focus_sectors,investment_stage,ticket_size_min,ticket_size_max,
         region,country_code,website_url,contact_info,description,notable_portfolio,sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.name,d.org_type??null,d.focus_sectors?JSON.stringify(d.focus_sectors):null,d.investment_stage??null,
       d.ticket_size_min??null,d.ticket_size_max??null,d.region??null,d.country_code??'IN',
       d.website_url??null,d.contact_info??null,d.description??null,
       d.notable_portfolio?JSON.stringify(d.notable_portfolio):null,d.sort_order??0]
    );
    ok(res, { id: r.lastInsertRowid });
  } catch (e) { fail(res, e); }
});

// PUT /investor-directory/:id — admin correction, same pattern as PUT /schemes/:id
// but investor_directory has no last_verified_at column (no freshness-tracking
// requirement was specified for it), so only updated_at is bumped.
router.put('/investor-directory/:id', async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const d = req.body;
    const fields = ['name','org_type','investment_stage','ticket_size_min','ticket_size_max',
      'region','country_code','website_url','contact_info','description','sort_order','is_active'];
    const updates = {};
    for (const f of fields) if (d[f] !== undefined) updates[f] = d[f];
    if (d.focus_sectors !== undefined) updates.focus_sectors = JSON.stringify(d.focus_sectors);
    if (d.notable_portfolio !== undefined) updates.notable_portfolio = JSON.stringify(d.notable_portfolio);
    if (Object.keys(updates).length > 0) {
      const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await svc.run(`UPDATE investor_directory SET ${set}, updated_at = ${nowExpr()} WHERE id = ?`,
        [...Object.values(updates), req.params.id]);
    }
    const investor = await svc.get('SELECT * FROM investor_directory WHERE id = ?', [req.params.id]);
    if (!investor) return res.status(404).json({ error: 'Not found' });
    ok(res, { investor });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// INVESTORS
// ════════════════════════════════════════════════════════════════════════════

router.get('/investors', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM investors WHERE company_id = ? AND deleted_at IS NULL';
    const params = [req.user.companyId];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY updated_at DESC';
    ok(res, { investors: await svc.all(sql, params) });
  } catch (e) { fail(res, e); }
});

router.get('/investors/:id', async (req, res) => {
  try {
    const inv = await svc.get('SELECT * FROM investors WHERE id = ? AND company_id = ? AND deleted_at IS NULL', [req.params.id, req.user.companyId]);
    if (!inv) return res.status(404).json({ error: 'Not found' });
    ok(res, { investor: inv });
  } catch (e) { fail(res, e); }
});

router.post('/investors', async (req, res) => {
  try {
    const d = req.body;
    if (!d.name) return res.status(400).json({ error: 'name is required' });
    const r = await svc.run(
      `INSERT INTO investors (company_id,name,type,firm,email,phone,linkedin_url,website_url,
        country_code,focus_sectors,ticket_size_min,ticket_size_max,ticket_currency,status,
        stage_notes,last_contact_date,next_follow_up,introduced_by,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.companyId,d.name,d.type??null,d.firm??null,d.email??null,d.phone??null,
       d.linkedin_url??null,d.website_url??null,d.country_code??null,
       d.focus_sectors?JSON.stringify(d.focus_sectors):null,
       d.ticket_size_min??null,d.ticket_size_max??null,d.ticket_currency??'INR',
       d.status??'Prospect',d.stage_notes??null,d.last_contact_date??null,
       d.next_follow_up??null,d.introduced_by??null,d.notes??null]
    );
    ok(res, { investor: await svc.get('SELECT * FROM investors WHERE id = ?', [r.lastInsertRowid]) });
  } catch (e) { fail(res, e); }
});

router.put('/investors/:id', async (req, res) => {
  try {
    const d = req.body;
    const fields = ['name','type','firm','email','phone','linkedin_url','website_url','country_code',
      'status','stage_notes','last_contact_date','next_follow_up','introduced_by','notes',
      'ticket_size_min','ticket_size_max','ticket_currency'];
    const updates = {};
    for (const f of fields) if (d[f] !== undefined) updates[f] = d[f];
    if (d.focus_sectors !== undefined) updates.focus_sectors = JSON.stringify(d.focus_sectors);
    if (Object.keys(updates).length > 0) {
      const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await svc.run(`UPDATE investors SET ${set}, updated_at = ${nowExpr()} WHERE id = ? AND company_id = ?`,
        [...Object.values(updates), req.params.id, req.user.companyId]);
    }
    ok(res, { investor: await svc.get('SELECT * FROM investors WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]) });
  } catch (e) { fail(res, e); }
});

router.delete('/investors/:id', async (req, res) => {
  try {
    await svc.run(`UPDATE investors SET deleted_at = ${nowExpr()} WHERE id = ? AND company_id = ?`, [req.params.id, req.user.companyId]);
    ok(res, { message: 'Investor removed' });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// INVESTMENT ROUNDS
// ════════════════════════════════════════════════════════════════════════════

router.get('/rounds', async (req, res) => {
  try {
    ok(res, { rounds: await svc.all(
      `SELECT r.*, i.name as lead_investor_name FROM investment_rounds r
       LEFT JOIN investors i ON r.lead_investor_id = i.id
       WHERE r.company_id = ? ORDER BY r.round_date DESC, r.created_at DESC`,
      [req.user.companyId]
    )});
  } catch (e) { fail(res, e); }
});

router.post('/rounds', async (req, res) => {
  try {
    const d = req.body;
    if (!d.round_name) return res.status(400).json({ error: 'round_name is required' });
    const r = await svc.run(
      `INSERT INTO investment_rounds (company_id,round_name,round_type,target_amount,raised_amount,
        currency_code,pre_money_valuation,post_money_valuation,round_date,close_date,status,lead_investor_id,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.companyId,d.round_name,d.round_type??'Equity',d.target_amount??null,d.raised_amount??0,
       d.currency_code??'INR',d.pre_money_valuation??null,d.post_money_valuation??null,
       d.round_date??null,d.close_date??null,d.status??'Planning',d.lead_investor_id??null,d.notes??null]
    );
    ok(res, { round: await svc.get('SELECT * FROM investment_rounds WHERE id = ?', [r.lastInsertRowid]) });
  } catch (e) { fail(res, e); }
});

router.put('/rounds/:id', async (req, res) => {
  try {
    const d = req.body;
    const fields = ['round_name','round_type','target_amount','raised_amount','currency_code',
      'pre_money_valuation','post_money_valuation','round_date','close_date','status','lead_investor_id','notes'];
    const updates = {};
    for (const f of fields) if (d[f] !== undefined) updates[f] = d[f];
    if (Object.keys(updates).length > 0) {
      const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await svc.run(`UPDATE investment_rounds SET ${set}, updated_at = ${nowExpr()} WHERE id = ? AND company_id = ?`,
        [...Object.values(updates), req.params.id, req.user.companyId]);
    }
    ok(res, { round: await svc.get('SELECT * FROM investment_rounds WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]) });
  } catch (e) { fail(res, e); }
});

router.delete('/rounds/:id', async (req, res) => {
  try {
    await svc.run('DELETE FROM investment_rounds WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    ok(res, { message: 'Round deleted' });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// CAP TABLE & SHAREHOLDERS
// ════════════════════════════════════════════════════════════════════════════

router.get('/cap-table', async (req, res) => {
  try { ok(res, await svc.getCapTable(req.user.companyId)); }
  catch (e) { fail(res, e); }
});

router.get('/shareholders', async (req, res) => {
  try {
    ok(res, { shareholders: await svc.all(
      `SELECT s.*, r.round_name, i.name as investor_name FROM shareholders s
       LEFT JOIN investment_rounds r ON s.round_id = r.id
       LEFT JOIN investors i ON s.investor_id = i.id
       WHERE s.company_id = ? AND s.deleted_at IS NULL ORDER BY s.ownership_pct DESC`,
      [req.user.companyId]
    )});
  } catch (e) { fail(res, e); }
});

router.post('/shareholders', async (req, res) => {
  try {
    const d = req.body;
    if (!d.name) return res.status(400).json({ error: 'name is required' });
    const r = await svc.run(
      `INSERT INTO shareholders (company_id,round_id,investor_id,name,type,email,share_class,shares,
        ownership_pct,investment_amount,currency_code,price_per_share,voting_rights,voting_multiplier,
        anti_dilution,issue_date,vesting_start,vesting_months,cliff_months,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.companyId,d.round_id??null,d.investor_id??null,d.name,d.type??'Founder',
       d.email??null,d.share_class??'Ordinary',d.shares??0,d.ownership_pct??0,
       d.investment_amount??0,d.currency_code??'INR',d.price_per_share??null,
       d.voting_rights??1,d.voting_multiplier??1.0,d.anti_dilution??0,
       d.issue_date??null,d.vesting_start??null,d.vesting_months??null,d.cliff_months??12,d.notes??null]
    );
    ok(res, { shareholder: await svc.get('SELECT * FROM shareholders WHERE id = ?', [r.lastInsertRowid]) });
  } catch (e) { fail(res, e); }
});

router.put('/shareholders/:id', async (req, res) => {
  try {
    const d = req.body;
    const fields = ['name','type','email','share_class','shares','ownership_pct','investment_amount',
      'currency_code','price_per_share','voting_rights','voting_multiplier','anti_dilution',
      'issue_date','vesting_start','vesting_months','cliff_months','notes','round_id','investor_id'];
    const updates = {};
    for (const f of fields) if (d[f] !== undefined) updates[f] = d[f];
    if (Object.keys(updates).length > 0) {
      const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await svc.run(`UPDATE shareholders SET ${set}, updated_at = ${nowExpr()} WHERE id = ? AND company_id = ?`,
        [...Object.values(updates), req.params.id, req.user.companyId]);
    }
    ok(res, { shareholder: await svc.get('SELECT * FROM shareholders WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]) });
  } catch (e) { fail(res, e); }
});

router.delete('/shareholders/:id', async (req, res) => {
  try {
    await svc.run(`UPDATE shareholders SET deleted_at = ${nowExpr()} WHERE id = ? AND company_id = ?`, [req.params.id, req.user.companyId]);
    ok(res, { message: 'Shareholder removed' });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// EQUITY TRANSACTIONS
// ════════════════════════════════════════════════════════════════════════════

router.get('/equity-transactions', async (req, res) => {
  try {
    ok(res, { transactions: await svc.all(
      `SELECT t.*, s.name as shareholder_name FROM equity_transactions t
       LEFT JOIN shareholders s ON t.shareholder_id = s.id
       WHERE t.company_id = ? ORDER BY t.transaction_date DESC, t.created_at DESC`,
      [req.user.companyId]
    )});
  } catch (e) { fail(res, e); }
});

router.post('/equity-transactions', async (req, res) => {
  try {
    const d = req.body;
    if (!d.transaction_type) return res.status(400).json({ error: 'transaction_type is required' });
    const r = await svc.run(
      `INSERT INTO equity_transactions (company_id,shareholder_id,transaction_type,shares_delta,
        price_per_share,total_value,from_shareholder_id,round_id,transaction_date,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.companyId,d.shareholder_id??null,d.transaction_type,d.shares_delta??0,
       d.price_per_share??null,d.total_value??null,d.from_shareholder_id??null,
       d.round_id??null,d.transaction_date??null,d.notes??null]
    );
    ok(res, { id: r.lastInsertRowid });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// DILUTION SIMULATION (stateless)
// ════════════════════════════════════════════════════════════════════════════

router.post('/simulate-dilution', async (req, res) => {
  try {
    const { newRaiseAmount, newInvestorPct, roundName } = req.body;
    if (!newRaiseAmount || !newInvestorPct) return res.status(400).json({ error: 'newRaiseAmount and newInvestorPct required' });
    const capTable = await svc.getCapTable(req.user.companyId);
    ok(res, svc.simulateDilution(capTable.shareholders, newRaiseAmount, newInvestorPct, roundName));
  } catch (e) { fail(res, e, 400); }
});

// ════════════════════════════════════════════════════════════════════════════
// VALUATIONS
// ════════════════════════════════════════════════════════════════════════════

router.get('/valuations', async (req, res) => {
  try {
    ok(res, { valuations: await svc.all(
      'SELECT * FROM valuations WHERE company_id = ? ORDER BY valuation_date DESC, created_at DESC',
      [req.user.companyId]
    )});
  } catch (e) { fail(res, e); }
});

router.post('/valuations', async (req, res) => {
  try {
    const { method, inputs, notes, currency_code } = req.body;
    if (!method) return res.status(400).json({ error: 'method is required' });
    const computed = await svc.computeValuationRange(req.user.companyId, method, inputs || {});
    const r = await svc.run(
      `INSERT INTO valuations (company_id,method,value_low,value_mid,value_high,currency_code,inputs_json,assumptions_json,notes)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.companyId,computed.method,computed.value_low,computed.value_mid,computed.value_high,
       currency_code??'INR',computed.inputs_json,computed.assumptions_json,notes??null]
    );
    ok(res, { valuation: await svc.get('SELECT * FROM valuations WHERE id = ?', [r.lastInsertRowid]), computed });
  } catch (e) { fail(res, e); }
});

router.delete('/valuations/:id', async (req, res) => {
  try {
    await svc.run('DELETE FROM valuations WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    ok(res, { message: 'Valuation deleted' });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// IPO CHECKLIST
// ════════════════════════════════════════════════════════════════════════════

router.get('/ipo-checklist', async (req, res) => {
  try {
    const cid = req.user.companyId;
    await svc.initIpoChecklist(cid);
    const items = await svc.all('SELECT * FROM ipo_checklist_items WHERE company_id = ? ORDER BY category, sort_order', [cid]);
    const mandatory = items.filter(i => i.is_mandatory).length;
    const mandatoryComplete = items.filter(i => i.is_mandatory && i.status === 'Complete').length;
    const score = mandatory > 0 ? Math.round((mandatoryComplete / mandatory) * 100) : 0;
    const grouped = items.reduce((acc, item) => { (acc[item.category] ??= []).push(item); return acc; }, {});
    ok(res, { items, grouped, total: items.length, mandatory, complete: items.filter(i => i.status==='Complete').length, mandatoryComplete, score });
  } catch (e) { fail(res, e); }
});

router.patch('/ipo-checklist/:id', async (req, res) => {
  try {
    const d = req.body;
    const updates = {};
    for (const f of ['status','assigned_to','target_date','completed_date','notes']) {
      if (d[f] !== undefined) updates[f] = d[f];
    }
    if (updates.status === 'Complete' && !updates.completed_date) updates.completed_date = new Date().toISOString().split('T')[0];
    if (Object.keys(updates).length > 0) {
      const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await svc.run(`UPDATE ipo_checklist_items SET ${set}, updated_at = ${nowExpr()} WHERE id = ? AND company_id = ?`,
        [...Object.values(updates), req.params.id, req.user.companyId]);
    }
    ok(res, { item: await svc.get('SELECT * FROM ipo_checklist_items WHERE id = ?', [req.params.id]) });
  } catch (e) { fail(res, e); }
});

router.post('/ipo-checklist/:id/documents', uploadIpo.array('files', 10), async (req, res) => {
  try {
    const saved = [];
    for (const file of (req.files || [])) {
      const r = await svc.run(
        `INSERT INTO ipo_documents (company_id,checklist_item_id,filename,original_name,mimetype,size_bytes,path,uploaded_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [req.user.companyId,req.params.id,file.filename,file.originalname,file.mimetype,file.size,file.path,req.user.userId]
      );
      saved.push({ id: r.lastInsertRowid, filename: file.filename, original_name: file.originalname });
    }
    ok(res, { documents: saved });
  } catch (e) { fail(res, e); }
});

// GET /ipo-checklist/:id/documents — list documents uploaded against one checklist
// item (upload/replace/delete/download in the IPO Readiness UI needs this; the
// upload route above never had a matching list endpoint).
router.get('/ipo-checklist/:id/documents', async (req, res) => {
  try {
    const documents = await svc.all(
      'SELECT id, filename, original_name, mimetype, size_bytes, created_at FROM ipo_documents WHERE checklist_item_id = ? AND company_id = ? ORDER BY created_at DESC',
      [req.params.id, req.user.companyId]
    );
    ok(res, { documents });
  } catch (e) { fail(res, e); }
});

// GET /ipo-documents/:docId/download
router.get('/ipo-documents/:docId/download', async (req, res) => {
  try {
    const doc = await svc.get('SELECT * FROM ipo_documents WHERE id = ? AND company_id = ?', [req.params.docId, req.user.companyId]);
    if (!doc || !doc.path) return res.status(404).json({ error: 'Document not found' });
    res.download(doc.path, doc.original_name || doc.filename);
  } catch (e) { fail(res, e); }
});

// DELETE /ipo-documents/:docId
router.delete('/ipo-documents/:docId', async (req, res) => {
  try {
    const doc = await svc.get('SELECT * FROM ipo_documents WHERE id = ? AND company_id = ?', [req.params.docId, req.user.companyId]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.path && fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
    await svc.run('DELETE FROM ipo_documents WHERE id = ? AND company_id = ?', [req.params.docId, req.user.companyId]);
    ok(res, { message: 'Document deleted' });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// PARTNERSHIPS & SPONSORSHIPS
// ════════════════════════════════════════════════════════════════════════════

router.get('/partnerships', async (req, res) => {
  try {
    const { type, status } = req.query;
    let sql = 'SELECT * FROM partnerships WHERE company_id = ? AND deleted_at IS NULL';
    const params = [req.user.companyId];
    if (type)   { sql += ' AND type = ?'; params.push(type); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY updated_at DESC';
    ok(res, { partnerships: await svc.all(sql, params) });
  } catch (e) { fail(res, e); }
});

router.post('/partnerships', uploadPartner.single('contract'), async (req, res) => {
  try {
    const d = req.body;
    if (!d.partner_name) return res.status(400).json({ error: 'partner_name is required' });
    const r = await svc.run(
      `INSERT INTO partnerships (company_id,type,partner_name,contact_name,contact_email,contact_phone,
        website_url,country_code,status,value_amount,currency_code,value_type,start_date,end_date,
        renewal_date,contract_file,description,tags,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.companyId,d.type??'Partnership',d.partner_name,d.contact_name??null,
       d.contact_email??null,d.contact_phone??null,d.website_url??null,d.country_code??null,
       d.status??'Prospect',d.value_amount??null,d.currency_code??'INR',d.value_type??null,
       d.start_date??null,d.end_date??null,d.renewal_date??null,req.file?.path??null,
       d.description??null,d.tags?JSON.stringify(d.tags):null,d.notes??null]
    );
    ok(res, { partnership: await svc.get('SELECT * FROM partnerships WHERE id = ?', [r.lastInsertRowid]) });
  } catch (e) { fail(res, e); }
});

router.put('/partnerships/:id', async (req, res) => {
  try {
    const d = req.body;
    const fields = ['type','partner_name','contact_name','contact_email','contact_phone','website_url',
      'country_code','status','value_amount','currency_code','value_type','start_date','end_date','renewal_date','description','notes'];
    const updates = {};
    for (const f of fields) if (d[f] !== undefined) updates[f] = d[f];
    if (d.tags !== undefined) updates.tags = JSON.stringify(d.tags);
    if (Object.keys(updates).length > 0) {
      const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await svc.run(`UPDATE partnerships SET ${set}, updated_at = ${nowExpr()} WHERE id = ? AND company_id = ?`,
        [...Object.values(updates), req.params.id, req.user.companyId]);
    }
    ok(res, { partnership: await svc.get('SELECT * FROM partnerships WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]) });
  } catch (e) { fail(res, e); }
});

router.delete('/partnerships/:id', async (req, res) => {
  try {
    await svc.run(`UPDATE partnerships SET deleted_at = ${nowExpr()} WHERE id = ? AND company_id = ?`, [req.params.id, req.user.companyId]);
    ok(res, { message: 'Partnership removed' });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// PITCH DECKS
// ════════════════════════════════════════════════════════════════════════════

router.get('/pitch-decks', async (req, res) => {
  try {
    ok(res, { pitchDecks: await svc.all('SELECT * FROM pitch_decks WHERE company_id = ? ORDER BY is_current DESC, updated_at DESC', [req.user.companyId]) });
  } catch (e) { fail(res, e); }
});

router.post('/pitch-decks', uploadDeck.single('file'), async (req, res) => {
  try {
    const d = req.body;
    if (!d.title) return res.status(400).json({ error: 'title is required' });
    // is_current bound as a param (1/0), not spliced as a literal into the SQL
    // text — Postgres's is_current is a real BOOLEAN column with no implicit
    // cast from a bare integer literal (see growthService.js's is_template fix
    // for the same issue).
    const r = await svc.run(
      `INSERT INTO pitch_decks (company_id,title,deck_type,version,filename,original_name,mimetype,
        size_bytes,path,description,is_current,uploaded_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.companyId,d.title,d.deck_type??'Pitch Deck',d.version??'v1.0',
       req.file?.filename??null,req.file?.originalname??null,req.file?.mimetype??null,
       req.file?.size??null,req.file?.path??null,d.description??null,1,req.user.userId]
    );
    await svc.run(`UPDATE pitch_decks SET is_current = ? WHERE company_id = ? AND deck_type = ? AND id != ?`,
      [0, req.user.companyId, d.deck_type??'Pitch Deck', r.lastInsertRowid]);
    ok(res, { pitchDeck: await svc.get('SELECT * FROM pitch_decks WHERE id = ?', [r.lastInsertRowid]) });
  } catch (e) { fail(res, e); }
});

router.delete('/pitch-decks/:id', async (req, res) => {
  try {
    const deck = await svc.get('SELECT * FROM pitch_decks WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    if (deck?.path && fs.existsSync(deck.path)) fs.unlinkSync(deck.path);
    await svc.run('DELETE FROM pitch_decks WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    ok(res, { message: 'Pitch deck deleted' });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// DUE DILIGENCE
// ════════════════════════════════════════════════════════════════════════════

router.get('/due-diligence', async (req, res) => {
  try {
    const cid = req.user.companyId;
    await svc.initDueDiligence(cid);
    const items = await svc.all('SELECT * FROM due_diligence_documents WHERE company_id = ? ORDER BY category, sort_order', [cid]);
    const required = items.filter(i => i.is_required).length;
    const uploaded = items.filter(i => ['Uploaded','Verified'].includes(i.status)).length;
    const missing  = items.filter(i => i.is_required && i.status === 'Missing').length;
    const grouped  = items.reduce((acc, item) => { (acc[item.category] ??= []).push(item); return acc; }, {});
    ok(res, { items, grouped, total: items.length, required, uploaded, missing });
  } catch (e) { fail(res, e); }
});

router.patch('/due-diligence/:id', uploadDd.single('file'), async (req, res) => {
  try {
    const d = req.body;
    const updates = {};
    for (const f of ['status','notes','expiry_date']) if (d[f] !== undefined) updates[f] = d[f];
    if (req.file) {
      Object.assign(updates, {
        filename: req.file.filename, original_name: req.file.originalname,
        mimetype: req.file.mimetype, size_bytes: req.file.size,
        path: req.file.path, uploaded_by: req.user.userId,
      });
      if (!updates.status) updates.status = 'Uploaded';
    }
    if (Object.keys(updates).length > 0) {
      const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await svc.run(`UPDATE due_diligence_documents SET ${set}, updated_at = ${nowExpr()} WHERE id = ? AND company_id = ?`,
        [...Object.values(updates), req.params.id, req.user.companyId]);
    }
    ok(res, { item: await svc.get('SELECT * FROM due_diligence_documents WHERE id = ?', [req.params.id]) });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// GROWTH ROADMAP
// ════════════════════════════════════════════════════════════════════════════

router.get('/roadmap', async (req, res) => {
  try {
    const cid = req.user.companyId;
    await svc.initRoadmap(cid);
    // is_template bound as a param (see growthService.js's computeReadinessWithDb
    // for the same fix) rather than a literal `= 0` — Postgres's is_template is
    // a real BOOLEAN column and has no implicit cast from a bare integer literal.
    const tasks = await svc.all('SELECT * FROM growth_tasks WHERE company_id = ? AND is_template = ? ORDER BY sort_order, created_at', [cid, 0]);
    const stages = [...new Set(tasks.map(t => t.stage).filter(Boolean))];
    ok(res, { tasks, total: tasks.length, complete: tasks.filter(t=>t.status==='Complete').length, inProgress: tasks.filter(t=>t.status==='In Progress').length, stages });
  } catch (e) { fail(res, e); }
});

router.post('/roadmap', async (req, res) => {
  try {
    const d = req.body;
    if (!d.title) return res.status(400).json({ error: 'title is required' });
    const r = await svc.run(
      `INSERT INTO growth_tasks (company_id,stage,title,description,category,priority,target_date,assigned_to,sort_order) VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.companyId,d.stage??null,d.title,d.description??null,d.category??'Milestone',d.priority??'Medium',d.target_date??null,d.assigned_to??null,d.sort_order??99]
    );
    ok(res, { task: await svc.get('SELECT * FROM growth_tasks WHERE id = ?', [r.lastInsertRowid]) });
  } catch (e) { fail(res, e); }
});

router.patch('/roadmap/:id', async (req, res) => {
  try {
    const d = req.body;
    const updates = {};
    for (const f of ['stage','title','description','category','status','priority','target_date','completed_date','assigned_to','sort_order']) {
      if (d[f] !== undefined) updates[f] = d[f];
    }
    if (updates.status === 'Complete' && !updates.completed_date) updates.completed_date = new Date().toISOString().split('T')[0];
    if (Object.keys(updates).length > 0) {
      const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await svc.run(`UPDATE growth_tasks SET ${set}, updated_at = ${nowExpr()} WHERE id = ? AND company_id = ?`,
        [...Object.values(updates), req.params.id, req.user.companyId]);
    }
    ok(res, { task: await svc.get('SELECT * FROM growth_tasks WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]) });
  } catch (e) { fail(res, e); }
});

router.delete('/roadmap/:id', async (req, res) => {
  try {
    await svc.run('DELETE FROM growth_tasks WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    ok(res, { message: 'Task deleted' });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// AI GROWTH ADVISOR
// ════════════════════════════════════════════════════════════════════════════

router.post('/advisor', growthAdvisorRateLimit, async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    const cid = req.user.companyId;
    const sid = sessionId || `growth_${cid}_${Date.now()}`;
    const systemPrompt = await svc.buildAdvisorContext(cid);

    // Fetch history
    const historyRows = await svc.all(
      `SELECT role, content FROM growth_advisor_sessions WHERE company_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT 20`,
      [cid, sid]
    );
    const history = historyRows.reverse().map(h => ({ role: h.role, content: h.content }));

    await svc.run(`INSERT INTO growth_advisor_sessions (company_id,user_id,session_id,role,content) VALUES (?,?,?,?,?)`,
      [cid, req.user.userId, sid, 'user', message]);

    let aiResponse = 'The AI Growth Advisor is temporarily unavailable. Please try again shortly.';
    try {
      // Routed through the shared aiService client (respects OPENAI_BASE_URL/
      // CHAT_MODEL like every other AI call in the app) instead of constructing
      // a separate OpenAI client hardcoded to gpt-4o-mini against api.openai.com.
      const completionText = await aiService.chatCompletion(
        [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }],
        { maxTokens: 800, temperature: 0.7 }
      );
      aiResponse = completionText || aiResponse;
    } catch (aiErr) {
      console.error('[GrowthAdvisor] AI error:', aiErr.message);
      aiResponse = `Great question! While the AI service is warming up, here are key steps based on your profile: focus on completing your pitch deck, setting up your cap table, and running a valuation estimate — these are the foundations investors look for.`;
    }

    await svc.run(`INSERT INTO growth_advisor_sessions (company_id,user_id,session_id,role,content) VALUES (?,?,?,?,?)`,
      [cid, req.user.userId, sid, 'assistant', aiResponse]);
    ok(res, { message: aiResponse, sessionId: sid });
  } catch (e) { fail(res, e); }
});

router.get('/advisor/history', async (req, res) => {
  try {
    const { sessionId } = req.query;
    let sql = 'SELECT * FROM growth_advisor_sessions WHERE company_id = ?';
    const params = [req.user.companyId];
    if (sessionId) { sql += ' AND session_id = ?'; params.push(sessionId); }
    sql += ' ORDER BY created_at ASC';
    ok(res, { history: await svc.all(sql, params) });
  } catch (e) { fail(res, e); }
});

// ════════════════════════════════════════════════════════════════════════════
// NOTES
// ════════════════════════════════════════════════════════════════════════════

router.get('/notes', async (req, res) => {
  try {
    const { entity_type, entity_id } = req.query;
    let sql = 'SELECT * FROM growth_notes WHERE company_id = ?';
    const params = [req.user.companyId];
    if (entity_type) { sql += ' AND entity_type = ?'; params.push(entity_type); }
    if (entity_id)   { sql += ' AND entity_id = ?'; params.push(entity_id); }
    sql += ' ORDER BY created_at DESC';
    ok(res, { notes: await svc.all(sql, params) });
  } catch (e) { fail(res, e); }
});

router.post('/notes', async (req, res) => {
  try {
    const { entity_type, entity_id, body } = req.body;
    if (!body) return res.status(400).json({ error: 'body is required' });
    const r = await svc.run(
      'INSERT INTO growth_notes (company_id,entity_type,entity_id,body,author_id) VALUES (?,?,?,?,?)',
      [req.user.companyId, entity_type??null, entity_id??null, body, req.user.userId]
    );
    ok(res, { id: r.lastInsertRowid });
  } catch (e) { fail(res, e); }
});

router.put('/notes/:id', async (req, res) => {
  try {
    const { body } = req.body;
    if (!body) return res.status(400).json({ error: 'body is required' });
    await svc.run('UPDATE growth_notes SET body = ? WHERE id = ? AND company_id = ?', [body, req.params.id, req.user.companyId]);
    ok(res, { note: await svc.get('SELECT * FROM growth_notes WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]) });
  } catch (e) { fail(res, e); }
});

router.delete('/notes/:id', async (req, res) => {
  try {
    await svc.run('DELETE FROM growth_notes WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    ok(res, { message: 'Note deleted' });
  } catch (e) { fail(res, e); }
});

// ── Upload error normalization ──────────────────────────────────────────────
// Multer errors (oversized file, rejected mime type) throw past the individual
// route handlers' try/catch and would otherwise fall through to the global 500
// handler. Normalize them to a clean 400 here, same as the rest of this router.
router.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 25MB).' : err.message;
    return res.status(400).json({ success: false, error: message, code: err.code });
  }
  next(err);
});

module.exports = router;
