// ============================================================================
// Growth Service — Business Growth Hub
// Uses BizBook's standard synchronous DatabaseSync pattern (getDb()).
// All operations scoped to companyId for multi-tenant isolation.
// ============================================================================
'use strict';

const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/db');
const {
  FUNDING_TYPES,
  GOVERNMENT_SCHEMES,
  IPO_CHECKLIST_TEMPLATE,
  ROADMAP_TEMPLATE,
  DUE_DILIGENCE_TEMPLATE,
} = require('../data/growthSeedData');

// ── Shared DB helper: run inside a try/finally getDb()/db.close() block ──────
// Each exported function opens+closes its own db connection (same pattern as
// complianceService, marketingService, etc.)

// ── 1. Reference Data Seeding ─────────────────────────────────────────────────

function seedReferenceData() {
  const db = getDb();
  try {
    // Seed funding_types if empty
    const ftCount = db.prepare('SELECT COUNT(*) as cnt FROM funding_types').get();
    if (!ftCount || ftCount.cnt === 0) {
      const stmt = db.prepare(
        `INSERT INTO funding_types
          (country_code, name, category, description, eligibility, advantages, disadvantages,
           typical_amount_min, typical_amount_max, typical_amount_unit, dilution_level,
           risk_level, timeline_days_min, timeline_days_max, required_documents,
           how_to_apply, official_resources, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      );
      for (const ft of FUNDING_TYPES) {
        stmt.run(
          ft.country_code ?? null, ft.name, ft.category, ft.description,
          ft.eligibility, ft.advantages, ft.disadvantages,
          ft.typical_amount_min ?? null, ft.typical_amount_max ?? null, ft.typical_amount_unit,
          ft.dilution_level, ft.risk_level, ft.timeline_days_min ?? null, ft.timeline_days_max ?? null,
          ft.required_documents, ft.how_to_apply, ft.official_resources, ft.sort_order
        );
      }
      console.log('[GrowthService] Seeded funding_types:', FUNDING_TYPES.length);
    }

    // Seed government_schemes if empty
    const gsCount = db.prepare('SELECT COUNT(*) as cnt FROM government_schemes').get();
    if (!gsCount || gsCount.cnt === 0) {
      const stmt = db.prepare(
        `INSERT INTO government_schemes
          (country_code, region, name, short_name, category, administering_body, description,
           eligibility, benefits, documents_required, application_process, official_links,
           deadline_type, deadline_notes, max_benefit_amount, benefit_unit, benefit_type, tags, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      );
      for (const gs of GOVERNMENT_SCHEMES) {
        stmt.run(
          gs.country_code, gs.region ?? null, gs.name, gs.short_name ?? null, gs.category,
          gs.administering_body, gs.description, gs.eligibility, gs.benefits,
          gs.documents_required, gs.application_process, gs.official_links,
          gs.deadline_type, gs.deadline_notes ?? null, gs.max_benefit_amount ?? null,
          gs.benefit_unit ?? 'INR', gs.benefit_type, gs.tags, gs.sort_order
        );
      }
      console.log('[GrowthService] Seeded government_schemes:', GOVERNMENT_SCHEMES.length);
    }
  } finally { db.close(); }
}

// ── 2. Growth Profile ─────────────────────────────────────────────────────────

// Same logic as getOrCreateProfile, but operates on an already-open connection
// so callers composing multiple reads (e.g. the dashboard) don't each pay for
// their own getDb() (which re-execs the full schema on every open).
function getOrCreateProfileWithDb(db, companyId) {
  let profile = db.prepare('SELECT * FROM growth_profiles WHERE company_id = ?').get(companyId);
  if (!profile) {
    db.prepare('INSERT OR IGNORE INTO growth_profiles (company_id) VALUES (?)').run(companyId);
    profile = db.prepare('SELECT * FROM growth_profiles WHERE company_id = ?').get(companyId);
  }
  return profile;
}

function getOrCreateProfile(companyId) {
  const db = getDb();
  try { return getOrCreateProfileWithDb(db, companyId); }
  finally { db.close(); }
}

function updateProfile(companyId, data) {
  const db = getDb();
  try {
    db.prepare('INSERT OR IGNORE INTO growth_profiles (company_id) VALUES (?)').run(companyId);
    const fields = [
      'stage', 'country_code', 'currency_code', 'currency_symbol',
      'annual_revenue', 'ebitda', 'total_assets', 'growth_rate_pct',
      'industry_vertical', 'target_raise_amount', 'target_raise_currency',
      'raise_purpose', 'notes',
    ];
    const allowed = {};
    for (const f of fields) {
      if (data[f] !== undefined) allowed[f] = data[f];
    }
    if (Object.keys(allowed).length > 0) {
      const setClause = Object.keys(allowed).map(k => `${k} = ?`).join(', ');
      db.prepare(
        `UPDATE growth_profiles SET ${setClause}, updated_at = datetime('now') WHERE company_id = ?`
      ).run(...Object.values(allowed), companyId);
    }
    return db.prepare('SELECT * FROM growth_profiles WHERE company_id = ?').get(companyId);
  } finally { db.close(); }
}

// ── 3. Readiness Scores ───────────────────────────────────────────────────────

// Same logic as computeReadiness, but operates on an already-open connection
// (see getOrCreateProfileWithDb for why).
function computeReadinessWithDb(db, companyId) {
    const profile = db.prepare('SELECT * FROM growth_profiles WHERE company_id = ?').get(companyId) || {};

    // Funding Readiness
    let fundingScore = 0;
    const fundingItems = [];

    if (profile.annual_revenue > 0) { fundingScore += 20; fundingItems.push({ label: 'Revenue declared', done: true }); }
    else fundingItems.push({ label: 'Add annual revenue in Growth Profile', done: false });

    const investorCnt = db.prepare('SELECT COUNT(*) as cnt FROM investors WHERE company_id = ? AND deleted_at IS NULL').get(companyId);
    if (investorCnt?.cnt > 0) { fundingScore += 15; fundingItems.push({ label: 'Investor pipeline started', done: true }); }
    else fundingItems.push({ label: 'Add potential investors', done: false });

    const deckCnt = db.prepare('SELECT COUNT(*) as cnt FROM pitch_decks WHERE company_id = ?').get(companyId);
    if (deckCnt?.cnt > 0) { fundingScore += 20; fundingItems.push({ label: 'Pitch deck uploaded', done: true }); }
    else fundingItems.push({ label: 'Upload a pitch deck', done: false });

    const shCnt = db.prepare('SELECT COUNT(*) as cnt FROM shareholders WHERE company_id = ? AND deleted_at IS NULL').get(companyId);
    if (shCnt?.cnt > 0) { fundingScore += 15; fundingItems.push({ label: 'Cap table structured', done: true }); }
    else fundingItems.push({ label: 'Set up cap table', done: false });

    const valCnt = db.prepare('SELECT COUNT(*) as cnt FROM valuations WHERE company_id = ?').get(companyId);
    if (valCnt?.cnt > 0) { fundingScore += 15; fundingItems.push({ label: 'Valuation calculated', done: true }); }
    else fundingItems.push({ label: 'Run a valuation estimate', done: false });

    if (profile.target_raise_amount > 0) { fundingScore += 15; fundingItems.push({ label: 'Fundraising target set', done: true }); }
    else fundingItems.push({ label: 'Set your fundraising target', done: false });

    // IPO Readiness
    const ipoItems = db.prepare('SELECT status, is_mandatory FROM ipo_checklist_items WHERE company_id = ?').all(companyId);
    let ipoScore = 0;
    if (ipoItems.length > 0) {
      const mandatory = ipoItems.filter(i => i.is_mandatory).length;
      const mandatoryDone = ipoItems.filter(i => i.is_mandatory && i.status === 'Complete').length;
      ipoScore = mandatory > 0 ? Math.round((mandatoryDone / mandatory) * 100) : 0;
    }

    // Document / Due Diligence Readiness
    const ddItems = db.prepare('SELECT status, is_required FROM due_diligence_documents WHERE company_id = ?').all(companyId);
    let ddScore = 0;
    if (ddItems.length > 0) {
      const req = ddItems.filter(i => i.is_required);
      const uploaded = req.filter(i => ['Uploaded', 'Verified'].includes(i.status));
      ddScore = req.length > 0 ? Math.round((uploaded.length / req.length) * 100) : 0;
    }

    // Roadmap Score
    const roadmapItems = db.prepare('SELECT status FROM growth_tasks WHERE company_id = ? AND is_template = 0').all(companyId);
    let roadmapScore = 0;
    if (roadmapItems.length > 0) {
      const done = roadmapItems.filter(i => i.status === 'Complete').length;
      roadmapScore = Math.round((done / roadmapItems.length) * 100);
    }

    return {
      funding: Math.min(fundingScore, 100),
      ipo: ipoScore,
      dueDiligence: ddScore,
      roadmap: roadmapScore,
      overall: Math.round((Math.min(fundingScore, 100) + ipoScore + ddScore + roadmapScore) / 4),
      fundingItems,
    };
}

function computeReadiness(companyId) {
  const db = getDb();
  try { return computeReadinessWithDb(db, companyId); }
  finally { db.close(); }
}

// Dashboard composes profile + readiness + several counts + latest valuation.
// Each of those used to be a separate exported call (each opening its own
// getDb() connection — 8 opens for one page load, and getDb() re-execs the
// full schema on every open). Batching them onto one connection here removes
// that overhead without touching any of the underlying queries or arithmetic;
// output shape is identical to the previous route-level composition.
function getDashboardData(companyId) {
  const db = getDb();
  try {
    const profile = getOrCreateProfileWithDb(db, companyId);
    const readiness = computeReadinessWithDb(db, companyId);
    const counts = {
      investors: (db.prepare('SELECT COUNT(*) as cnt FROM investors WHERE company_id = ? AND deleted_at IS NULL').get(companyId)?.cnt || 0),
      rounds: (db.prepare('SELECT COUNT(*) as cnt FROM investment_rounds WHERE company_id = ?').get(companyId)?.cnt || 0),
      shareholders: (db.prepare('SELECT COUNT(*) as cnt FROM shareholders WHERE company_id = ? AND deleted_at IS NULL').get(companyId)?.cnt || 0),
      pitchDecks: (db.prepare('SELECT COUNT(*) as cnt FROM pitch_decks WHERE company_id = ?').get(companyId)?.cnt || 0),
      partnerships: (db.prepare('SELECT COUNT(*) as cnt FROM partnerships WHERE company_id = ? AND deleted_at IS NULL').get(companyId)?.cnt || 0),
    };
    const latestValuation = db.prepare('SELECT * FROM valuations WHERE company_id = ? ORDER BY created_at DESC LIMIT 1').get(companyId) || null;
    return { profile, readiness, counts, latestValuation };
  } finally { db.close(); }
}

// ── 4. Cap Table ──────────────────────────────────────────────────────────────

function getCapTable(companyId) {
  const db = getDb();
  try {
    const shareholders = db.prepare(
      `SELECT s.*, i.name as investor_name, i.type as investor_type, r.round_name
       FROM shareholders s
       LEFT JOIN investors i ON s.investor_id = i.id
       LEFT JOIN investment_rounds r ON s.round_id = r.id
       WHERE s.company_id = ? AND s.deleted_at IS NULL
       ORDER BY s.ownership_pct DESC`
    ).all(companyId);

    const totalShares = shareholders.reduce((sum, s) => sum + (s.shares || 0), 0);
    const totalInvestment = shareholders.reduce((sum, s) => sum + (s.investment_amount || 0), 0);

    const table = shareholders.map(s => ({
      ...s,
      computed_pct: totalShares > 0 ? (s.shares / totalShares) * 100 : s.ownership_pct,
      voting_power: s.shares * (s.voting_multiplier || 1),
    }));

    return { shareholders: table, totalShares, totalInvestment };
  } finally { db.close(); }
}

// ── 5. Equity Dilution Simulation (pure math — no DB writes) ─────────────────

function simulateDilution(currentShareholders, newRaiseAmount, newInvestorPct, roundName = 'New Round') {
  if (newInvestorPct <= 0 || newInvestorPct >= 100) {
    throw new Error('New investor percentage must be between 0 and 100');
  }
  const dilutionFactor = 1 - (newInvestorPct / 100);
  const preTable = currentShareholders.map(s => ({
    name: s.name, type: s.type, shares: s.shares,
    ownership_pct: s.computed_pct ?? s.ownership_pct,
  }));
  const postTable = preTable.map(s => ({
    ...s,
    post_pct: s.ownership_pct * dilutionFactor,
    dilution_delta: -(s.ownership_pct * (newInvestorPct / 100)),
  }));
  postTable.push({
    name: 'New Investor', type: 'Investor', shares: 0, ownership_pct: 0,
    post_pct: newInvestorPct, dilution_delta: newInvestorPct, is_new: true,
  });
  const impliedValuation = newRaiseAmount / (newInvestorPct / 100);
  const preMoneyValuation = impliedValuation - newRaiseAmount;
  return { roundName, newRaiseAmount, newInvestorPct, preMoneyValuation, postMoneyValuation: impliedValuation, preDilutionTable: preTable, postDilutionTable: postTable };
}

// ── 6. Valuation Engine ───────────────────────────────────────────────────────

function getRevenueFromSales(companyId) {
  const db = getDb();
  try {
    const result = db.prepare(
      `SELECT COALESCE(SUM(revenue), 0) as total_revenue
       FROM sales WHERE company_id = ? AND strftime('%Y', sale_date) = strftime('%Y', 'now')`
    ).get(companyId);
    return result?.total_revenue || 0;
  } catch { return 0; } finally { db.close(); }
}

function computeValuationRange(companyId, method, inputs = {}) {
  const profile = getOrCreateProfile(companyId);
  const liveRevenue = getRevenueFromSales(companyId);
  const revenue = inputs.annual_revenue ?? profile.annual_revenue ?? liveRevenue;
  const ebitda = inputs.ebitda ?? profile.ebitda ?? 0;
  const totalAssets = inputs.total_assets ?? profile.total_assets ?? 0;
  const growthRate = (inputs.growth_rate_pct ?? profile.growth_rate_pct ?? 30) / 100;

  let low = 0, mid = 0, high = 0;
  let assumptions = {};

  switch (method) {
    case 'Revenue Multiple': {
      const lm = inputs.low_multiple ?? 2, mm = inputs.mid_multiple ?? 3.5, hm = inputs.high_multiple ?? 5;
      low = revenue * lm; mid = revenue * mm; high = revenue * hm;
      assumptions = { revenue, low_multiple: lm, mid_multiple: mm, high_multiple: hm };
      break;
    }
    case 'EBITDA Multiple': {
      const lm = inputs.low_multiple ?? 5, mm = inputs.mid_multiple ?? 8, hm = inputs.high_multiple ?? 12;
      low = ebitda * lm; mid = ebitda * mm; high = ebitda * hm;
      assumptions = { ebitda, low_multiple: lm, mid_multiple: mm, high_multiple: hm };
      break;
    }
    case 'DCF': {
      const discountRate = inputs.discount_rate ?? 0.20;
      const terminalGrowth = inputs.terminal_growth ?? 0.03;
      const fcfMargin = inputs.fcf_margin ?? 0.15;
      let projRev = revenue;
      const projRevs = [];
      for (let yr = 1; yr <= 5; yr++) {
        projRev = projRev * (1 + growthRate * (1 - (yr - 1) * 0.05));
        projRevs.push(projRev);
      }
      const pvFcf = projRevs.reduce((s, r, i) => s + (r * fcfMargin) / Math.pow(1 + discountRate, i + 1), 0);
      const tvPv = (projRevs[4] * fcfMargin * (1 + terminalGrowth)) / ((discountRate - terminalGrowth) * Math.pow(1 + discountRate, 5));
      mid = pvFcf + tvPv; low = mid * 0.7; high = mid * 1.4;
      assumptions = { revenue, growthRate, discountRate, fcfMargin, terminalGrowth };
      break;
    }
    case 'Asset Based': {
      low = totalAssets * 0.8; mid = totalAssets; high = totalAssets * 1.3;
      assumptions = { total_assets: totalAssets };
      break;
    }
    case 'Comparable': {
      const cm = inputs.comparable_multiple ?? 4;
      low = revenue * (cm * 0.8); mid = revenue * cm; high = revenue * (cm * 1.3);
      assumptions = { revenue, comparable_multiple: cm };
      break;
    }
    default:
      throw new Error(`Unknown valuation method: ${method}`);
  }

  return {
    method, value_low: Math.round(low), value_mid: Math.round(mid), value_high: Math.round(high),
    inputs_json: JSON.stringify(inputs), assumptions_json: JSON.stringify(assumptions),
  };
}

// ── 7. IPO Checklist Initialization ──────────────────────────────────────────

function initIpoChecklist(companyId) {
  const db = getDb();
  try {
    const existing = db.prepare('SELECT COUNT(*) as cnt FROM ipo_checklist_items WHERE company_id = ?').get(companyId);
    if (existing?.cnt > 0) return { message: 'Already initialized', count: existing.cnt };
    const stmt = db.prepare(
      `INSERT INTO ipo_checklist_items (company_id, category, title, description, is_mandatory, sort_order)
       VALUES (?,?,?,?,?,?)`
    );
    for (const item of IPO_CHECKLIST_TEMPLATE) {
      stmt.run(companyId, item.category, item.title, item.description ?? null, item.is_mandatory, item.sort_order);
    }
    return { message: 'IPO checklist initialized', count: IPO_CHECKLIST_TEMPLATE.length };
  } finally { db.close(); }
}

// ── 8. Roadmap Initialization ─────────────────────────────────────────────────

function initRoadmap(companyId) {
  const db = getDb();
  try {
    const existing = db.prepare('SELECT COUNT(*) as cnt FROM growth_tasks WHERE company_id = ? AND is_template = 0').get(companyId);
    if (existing?.cnt > 0) return { message: 'Roadmap has tasks', count: existing.cnt };
    const stmt = db.prepare(
      `INSERT INTO growth_tasks (company_id, stage, title, description, category, priority, sort_order, is_template)
       VALUES (?,?,?,?,?,?,?,0)`
    );
    for (const task of ROADMAP_TEMPLATE) {
      stmt.run(companyId, task.stage, task.title, task.description, task.category, task.priority, task.sort_order);
    }
    return { message: 'Roadmap initialized', count: ROADMAP_TEMPLATE.length };
  } finally { db.close(); }
}

// ── 9. Due Diligence Initialization ──────────────────────────────────────────

function initDueDiligence(companyId) {
  const db = getDb();
  try {
    const existing = db.prepare('SELECT COUNT(*) as cnt FROM due_diligence_documents WHERE company_id = ?').get(companyId);
    if (existing?.cnt > 0) return { message: 'Already initialized', count: existing.cnt };
    const stmt = db.prepare(
      `INSERT INTO due_diligence_documents (company_id, category, title, description, is_required, sort_order)
       VALUES (?,?,?,?,?,?)`
    );
    for (const item of DUE_DILIGENCE_TEMPLATE) {
      stmt.run(companyId, item.category, item.title, item.description ?? null, item.is_required, item.sort_order);
    }
    return { message: 'Due diligence initialized', count: DUE_DILIGENCE_TEMPLATE.length };
  } finally { db.close(); }
}

// ── 10. AI Advisor Context Builder ────────────────────────────────────────────

function buildAdvisorContext(companyId) {
  const db = getDb();
  try {
    const profile = db.prepare('SELECT * FROM growth_profiles WHERE company_id = ?').get(companyId) || {};
    const readiness = computeReadiness(companyId);
    const capTable = getCapTable(companyId);
    const investorCnt = db.prepare('SELECT COUNT(*) as cnt FROM investors WHERE company_id = ? AND deleted_at IS NULL').get(companyId);
    const activeRound = db.prepare("SELECT * FROM investment_rounds WHERE company_id = ? AND status = 'Open' LIMIT 1").get(companyId);
    const latestVal = db.prepare('SELECT * FROM valuations WHERE company_id = ? ORDER BY created_at DESC LIMIT 1').get(companyId);

    const sym = profile.currency_symbol || '₹';
    const fmt = (n) => (n || 0).toLocaleString();

    return `You are the AI Growth Advisor for BizBook. You help businesses plan growth, raise funding, manage equity, prepare for IPOs, and find government schemes.

Company Context:
- Stage: ${profile.stage || 'Not set'}
- Country: ${profile.country_code || 'IN'}
- Annual Revenue: ${sym}${fmt(profile.annual_revenue)}
- EBITDA: ${sym}${fmt(profile.ebitda)}
- Industry: ${profile.industry_vertical || 'Not specified'}
- Target Raise: ${sym}${fmt(profile.target_raise_amount)} for ${profile.raise_purpose || 'Not specified'}

Growth Readiness Scores:
- Overall: ${readiness.overall}%
- Funding Readiness: ${readiness.funding}%
- IPO Readiness: ${readiness.ipo}%
- Document Readiness: ${readiness.dueDiligence}%

Cap Table: ${capTable.shareholders.length} shareholders, ${sym}${fmt(capTable.totalInvestment)} raised total
Top holders: ${capTable.shareholders.slice(0, 5).map(s => `${s.name} (${((s.computed_pct || s.ownership_pct || 0)).toFixed(1)}%)`).join(', ') || 'None yet'}

Investor Pipeline: ${investorCnt?.cnt || 0} investors tracked
Active Round: ${activeRound ? `${activeRound.round_name} — ${sym}${fmt(activeRound.raised_amount)} of ${sym}${fmt(activeRound.target_amount)} raised` : 'None open'}
Latest Valuation: ${latestVal ? `${sym}${fmt(latestVal.value_mid)} mid-point (${latestVal.method})` : 'Not estimated yet'}

Answer concisely and practically. Reference specific actions in BizBook's Growth Hub. Tailor advice to the company's stage, country (${profile.country_code || 'IN'}), and context above.`;
  } finally { db.close(); }
}

// ── 11. File Upload Directory ─────────────────────────────────────────────────

function getUploadDir(companyId, subfolder) {
  const dir = path.join(__dirname, '../../data/uploads/growth', String(companyId), subfolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── 12. Direct DB helpers for routes (synchronous) ───────────────────────────
// Routes call these for simple one-off queries without needing a full service fn.

function dbRun(sql, params = []) {
  const db = getDb();
  try { return db.prepare(sql).run(...params); }
  finally { db.close(); }
}

function dbGet(sql, params = []) {
  const db = getDb();
  try { return db.prepare(sql).get(...params) || null; }
  finally { db.close(); }
}

function dbAll(sql, params = []) {
  const db = getDb();
  try { return db.prepare(sql).all(...params) || []; }
  finally { db.close(); }
}

module.exports = {
  seedReferenceData,
  getOrCreateProfile,
  updateProfile,
  computeReadiness,
  getDashboardData,
  getCapTable,
  simulateDilution,
  computeValuationRange,
  initIpoChecklist,
  initRoadmap,
  initDueDiligence,
  buildAdvisorContext,
  getUploadDir,
  // DB helpers for routes
  run: dbRun,
  get: dbGet,
  all: dbAll,
};
