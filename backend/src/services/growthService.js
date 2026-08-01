// ============================================================================
// Growth Service — Business Growth Hub
// Phase 2: dual-engine (SQLite + Postgres) via config/dbEngine.js's executor
// abstraction. Each exported function opens/uses one connection (or the
// shared Postgres pool) via withExecutor/withTxExecutor — same lifecycle
// guarantee the original getDb()/db.close() pattern had.
// All operations scoped to companyId for multi-tenant isolation.
// ============================================================================
'use strict';

const path = require('path');
const fs = require('fs');
const { dbGet, dbAll, withExecutor, withTxExecutor } = require('../config/dbEngine');
const pgDb = require('../config/pgDb');
const {
  FUNDING_TYPES,
  GOVERNMENT_SCHEMES,
  INVESTOR_DIRECTORY,
  IPO_CHECKLIST_TEMPLATE,
  ROADMAP_TEMPLATE,
  DUE_DILIGENCE_TEMPLATE,
} = require('../data/growthSeedData');

// ── Shared DB helper: each function runs via withExecutor (plain connection)
// or withTxExecutor (atomic transaction) against Postgres. See
// config/dbEngine.js for the executor shape ({engine, get, all, run, insert}).

// INSERT OR IGNORE has no direct Postgres equivalent (ON CONFLICT DO NOTHING
// instead) — this is the one upsert pattern this file needs twice
// (getOrCreateProfileWithDb / updateProfile), both against growth_profiles's
// UNIQUE(company_id).
function insertIgnoreProfileSql(x) {
  return 'INSERT INTO growth_profiles (company_id) VALUES (?) ON CONFLICT (company_id) DO NOTHING';
}

// ── 1. Reference Data Seeding ─────────────────────────────────────────────────

// withTxExecutor (not withExecutor): each seed loop runs many sequential
// INSERTs against a single connection with no wrapping transaction, so a
// process interrupted mid-loop (e.g. server restart during nodemon dev)
// commits a partial set on SQLite. The idempotent COUNT-check above treats
// "some rows exist" as "already seeded" and never retries, so a partial seed
// gets stuck forever. Wrapping in a transaction makes it all-or-nothing.
async function seedReferenceData() {
  return withTxExecutor(async (x) => {
    // Seed funding_types if empty
    const ftCount = await x.get('SELECT COUNT(*) as cnt FROM funding_types');
    if (!ftCount || ftCount.cnt === 0) {
      for (const ft of FUNDING_TYPES) {
        await x.run(
          `INSERT INTO funding_types
            (country_code, name, category, description, eligibility, advantages, disadvantages,
             typical_amount_min, typical_amount_max, typical_amount_unit, dilution_level,
             risk_level, timeline_days_min, timeline_days_max, required_documents,
             how_to_apply, official_resources, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            ft.country_code ?? null, ft.name, ft.category, ft.description,
            ft.eligibility, ft.advantages, ft.disadvantages,
            ft.typical_amount_min ?? null, ft.typical_amount_max ?? null, ft.typical_amount_unit,
            ft.dilution_level, ft.risk_level, ft.timeline_days_min ?? null, ft.timeline_days_max ?? null,
            ft.required_documents, ft.how_to_apply, ft.official_resources, ft.sort_order,
          ]
        );
      }
      console.log('[GrowthService] Seeded funding_types:', FUNDING_TYPES.length);
    }

    // Seed government_schemes if empty
    const gsCount = await x.get('SELECT COUNT(*) as cnt FROM government_schemes');
    if (!gsCount || gsCount.cnt === 0) {
      for (const gs of GOVERNMENT_SCHEMES) {
        await x.run(
          `INSERT INTO government_schemes
            (country_code, region, name, short_name, category, administering_body, description,
             eligibility, benefits, documents_required, application_process, official_links,
             deadline_type, deadline_notes, max_benefit_amount, benefit_unit, benefit_type, tags, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            gs.country_code, gs.region ?? null, gs.name, gs.short_name ?? null, gs.category,
            gs.administering_body, gs.description, gs.eligibility, gs.benefits,
            gs.documents_required, gs.application_process, gs.official_links,
            gs.deadline_type, gs.deadline_notes ?? null, gs.max_benefit_amount ?? null,
            gs.benefit_unit ?? 'INR', gs.benefit_type, gs.tags, gs.sort_order,
          ]
        );
      }
      console.log('[GrowthService] Seeded government_schemes:', GOVERNMENT_SCHEMES.length);
    }
  });
}

// Curated, browsable reference list of real investor firms/funds (Task 1) —
// same idempotent COUNT-check-then-insert shape as seedReferenceData above,
// kept as its own function/export since it targets a different table
// (investor_directory, migration 30) and is called separately from
// routes/growth.js's module-load block.
// withTxExecutor for the same all-or-nothing reason as seedReferenceData above.
async function seedInvestorDirectory() {
  return withTxExecutor(async (x) => {
    const idCount = await x.get('SELECT COUNT(*) as cnt FROM investor_directory');
    if (!idCount || idCount.cnt === 0) {
      for (const inv of INVESTOR_DIRECTORY) {
        await x.run(
          `INSERT INTO investor_directory
            (name, org_type, focus_sectors, investment_stage, ticket_size_min, ticket_size_max,
             region, country_code, website_url, contact_info, description, notable_portfolio, sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            inv.name, inv.org_type ?? null, inv.focus_sectors ?? null, inv.investment_stage ?? null,
            inv.ticket_size_min ?? null, inv.ticket_size_max ?? null, inv.region ?? null,
            inv.country_code ?? 'IN', inv.website_url ?? null, inv.contact_info ?? null,
            inv.description ?? null, inv.notable_portfolio ?? null, inv.sort_order ?? 0,
          ]
        );
      }
      console.log('[GrowthService] Seeded investor_directory:', INVESTOR_DIRECTORY.length);
    }
  });
}

// ── 2. Growth Profile ─────────────────────────────────────────────────────────

// Same logic as getOrCreateProfile, but operates on an already-open executor
// so callers composing multiple reads (e.g. the dashboard) don't each pay for
// their own withExecutor (a fresh SQLite handle re-execs the full schema on
// every open; a fresh Postgres call re-borrows from the pool).
async function getOrCreateProfileWithDb(x, companyId) {
  let profile = await x.get('SELECT * FROM growth_profiles WHERE company_id = ?', [companyId]);
  if (!profile) {
    await x.run(insertIgnoreProfileSql(x), [companyId]);
    profile = await x.get('SELECT * FROM growth_profiles WHERE company_id = ?', [companyId]);
  }
  return profile;
}

async function getOrCreateProfile(companyId) {
  return withExecutor((x) => getOrCreateProfileWithDb(x, companyId));
}

async function updateProfile(companyId, data) {
  return withExecutor(async (x) => {
    await x.run(insertIgnoreProfileSql(x), [companyId]);
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
      const nowExpr = 'now()';
      await x.run(
        `UPDATE growth_profiles SET ${setClause}, updated_at = ${nowExpr} WHERE company_id = ?`,
        [...Object.values(allowed), companyId]
      );
    }
    return x.get('SELECT * FROM growth_profiles WHERE company_id = ?', [companyId]);
  });
}

// ── 3. Readiness Scores ───────────────────────────────────────────────────────

// Same logic as computeReadiness, but operates on an already-open executor
// (see getOrCreateProfileWithDb for why).
async function computeReadinessWithDb(x, companyId) {
  const profile = (await x.get('SELECT * FROM growth_profiles WHERE company_id = ?', [companyId])) || {};

  // Funding Readiness
  let fundingScore = 0;
  const fundingItems = [];

  if (profile.annual_revenue > 0) { fundingScore += 20; fundingItems.push({ label: 'Revenue declared', done: true }); }
  else fundingItems.push({ label: 'Add annual revenue in Growth Profile', done: false });

  const investorCnt = await x.get('SELECT COUNT(*) as cnt FROM investors WHERE company_id = ? AND deleted_at IS NULL', [companyId]);
  if (investorCnt?.cnt > 0) { fundingScore += 15; fundingItems.push({ label: 'Investor pipeline started', done: true }); }
  else fundingItems.push({ label: 'Add potential investors', done: false });

  const deckCnt = await x.get('SELECT COUNT(*) as cnt FROM pitch_decks WHERE company_id = ?', [companyId]);
  if (deckCnt?.cnt > 0) { fundingScore += 20; fundingItems.push({ label: 'Pitch deck uploaded', done: true }); }
  else fundingItems.push({ label: 'Upload a pitch deck', done: false });

  const shCnt = await x.get('SELECT COUNT(*) as cnt FROM shareholders WHERE company_id = ? AND deleted_at IS NULL', [companyId]);
  if (shCnt?.cnt > 0) { fundingScore += 15; fundingItems.push({ label: 'Cap table structured', done: true }); }
  else fundingItems.push({ label: 'Set up cap table', done: false });

  const valCnt = await x.get('SELECT COUNT(*) as cnt FROM valuations WHERE company_id = ?', [companyId]);
  if (valCnt?.cnt > 0) { fundingScore += 15; fundingItems.push({ label: 'Valuation calculated', done: true }); }
  else fundingItems.push({ label: 'Run a valuation estimate', done: false });

  if (profile.target_raise_amount > 0) { fundingScore += 15; fundingItems.push({ label: 'Fundraising target set', done: true }); }
  else fundingItems.push({ label: 'Set your fundraising target', done: false });

  // IPO Readiness
  const ipoItems = await x.all('SELECT status, is_mandatory FROM ipo_checklist_items WHERE company_id = ?', [companyId]);
  let ipoScore = 0;
  if (ipoItems.length > 0) {
    const mandatory = ipoItems.filter(i => i.is_mandatory).length;
    const mandatoryDone = ipoItems.filter(i => i.is_mandatory && i.status === 'Complete').length;
    ipoScore = mandatory > 0 ? Math.round((mandatoryDone / mandatory) * 100) : 0;
  }

  // Document / Due Diligence Readiness
  const ddItems = await x.all('SELECT status, is_required FROM due_diligence_documents WHERE company_id = ?', [companyId]);
  let ddScore = 0;
  if (ddItems.length > 0) {
    const req = ddItems.filter(i => i.is_required);
    const uploaded = req.filter(i => ['Uploaded', 'Verified'].includes(i.status));
    ddScore = req.length > 0 ? Math.round((uploaded.length / req.length) * 100) : 0;
  }

  // Roadmap Score (is_template bound as a param, not a literal, so the
  // comparison works against Postgres's real BOOLEAN column too)
  const roadmapItems = await x.all('SELECT status FROM growth_tasks WHERE company_id = ? AND is_template = ?', [companyId, 0]);
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

async function computeReadiness(companyId) {
  return withExecutor((x) => computeReadinessWithDb(x, companyId));
}

// Dashboard composes profile + readiness + several counts + latest valuation.
// Batched onto one executor so a single page load doesn't pay for 8 separate
// connections; output shape is identical to the previous route-level
// composition.
async function getDashboardData(companyId) {
  return withExecutor(async (x) => {
    const profile = await getOrCreateProfileWithDb(x, companyId);
    const readiness = await computeReadinessWithDb(x, companyId);
    const counts = {
      investors: (await x.get('SELECT COUNT(*) as cnt FROM investors WHERE company_id = ? AND deleted_at IS NULL', [companyId]))?.cnt || 0,
      rounds: (await x.get('SELECT COUNT(*) as cnt FROM investment_rounds WHERE company_id = ?', [companyId]))?.cnt || 0,
      shareholders: (await x.get('SELECT COUNT(*) as cnt FROM shareholders WHERE company_id = ? AND deleted_at IS NULL', [companyId]))?.cnt || 0,
      pitchDecks: (await x.get('SELECT COUNT(*) as cnt FROM pitch_decks WHERE company_id = ?', [companyId]))?.cnt || 0,
      partnerships: (await x.get('SELECT COUNT(*) as cnt FROM partnerships WHERE company_id = ? AND deleted_at IS NULL', [companyId]))?.cnt || 0,
    };
    const latestValuation = (await x.get('SELECT * FROM valuations WHERE company_id = ? ORDER BY created_at DESC LIMIT 1', [companyId])) || null;
    return { profile, readiness, counts, latestValuation };
  });
}

// ── 4. Cap Table ──────────────────────────────────────────────────────────────

async function getCapTable(companyId) {
  return withExecutor(async (x) => {
    const shareholders = await x.all(
      `SELECT s.*, i.name as investor_name, i.type as investor_type, r.round_name
       FROM shareholders s
       LEFT JOIN investors i ON s.investor_id = i.id
       LEFT JOIN investment_rounds r ON s.round_id = r.id
       WHERE s.company_id = ? AND s.deleted_at IS NULL
       ORDER BY s.ownership_pct DESC`,
      [companyId]
    );

    const totalShares = shareholders.reduce((sum, s) => sum + (s.shares || 0), 0);
    const totalInvestment = shareholders.reduce((sum, s) => sum + (s.investment_amount || 0), 0);

    const table = shareholders.map(s => ({
      ...s,
      computed_pct: totalShares > 0 ? (s.shares / totalShares) * 100 : s.ownership_pct,
      voting_power: s.shares * (s.voting_multiplier || 1),
    }));

    return { shareholders: table, totalShares, totalInvestment };
  });
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

async function getRevenueFromSales(companyId) {
  try {
    return await withExecutor(async (x) => {
      // strftime('%Y', ...) is SQLite-only; Postgres equivalent is
      // TO_CHAR(date_col, 'YYYY') over the real DATE column (see
      // metricsService.js's getRevenueTrends for the same pattern).
      const yearMatch = "TO_CHAR(sale_date, 'YYYY') = TO_CHAR(now(), 'YYYY')";
      const result = await x.get(
        `SELECT COALESCE(SUM(revenue), 0) as total_revenue FROM sales WHERE company_id = ? AND ${yearMatch}`,
        [companyId]
      );
      return result?.total_revenue || 0;
    });
  } catch { return 0; }
}

async function computeValuationRange(companyId, method, inputs = {}) {
  const profile = await getOrCreateProfile(companyId);
  const liveRevenue = await getRevenueFromSales(companyId);
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

async function initIpoChecklist(companyId) {
  return withExecutor(async (x) => {
    const existing = await x.get('SELECT COUNT(*) as cnt FROM ipo_checklist_items WHERE company_id = ?', [companyId]);
    if (existing?.cnt > 0) return { message: 'Already initialized', count: existing.cnt };
    for (const item of IPO_CHECKLIST_TEMPLATE) {
      await x.run(
        `INSERT INTO ipo_checklist_items (company_id, category, title, description, is_mandatory, sort_order)
         VALUES (?,?,?,?,?,?)`,
        [companyId, item.category, item.title, item.description ?? null, item.is_mandatory, item.sort_order]
      );
    }
    return { message: 'IPO checklist initialized', count: IPO_CHECKLIST_TEMPLATE.length };
  });
}

// ── 8. Roadmap Initialization ─────────────────────────────────────────────────

async function initRoadmap(companyId) {
  return withExecutor(async (x) => {
    const existing = await x.get('SELECT COUNT(*) as cnt FROM growth_tasks WHERE company_id = ? AND is_template = ?', [companyId, 0]);
    if (existing?.cnt > 0) return { message: 'Roadmap has tasks', count: existing.cnt };
    for (const task of ROADMAP_TEMPLATE) {
      await x.run(
        `INSERT INTO growth_tasks (company_id, stage, title, description, category, priority, sort_order, is_template)
         VALUES (?,?,?,?,?,?,?,?)`,
        [companyId, task.stage, task.title, task.description, task.category, task.priority, task.sort_order, 0]
      );
    }
    return { message: 'Roadmap initialized', count: ROADMAP_TEMPLATE.length };
  });
}

// ── 9. Due Diligence Initialization ──────────────────────────────────────────

async function initDueDiligence(companyId) {
  return withExecutor(async (x) => {
    const existing = await x.get('SELECT COUNT(*) as cnt FROM due_diligence_documents WHERE company_id = ?', [companyId]);
    if (existing?.cnt > 0) return { message: 'Already initialized', count: existing.cnt };
    for (const item of DUE_DILIGENCE_TEMPLATE) {
      await x.run(
        `INSERT INTO due_diligence_documents (company_id, category, title, description, is_required, sort_order)
         VALUES (?,?,?,?,?,?)`,
        [companyId, item.category, item.title, item.description ?? null, item.is_required, item.sort_order]
      );
    }
    return { message: 'Due diligence initialized', count: DUE_DILIGENCE_TEMPLATE.length };
  });
}

// ── 10. AI Advisor Context Builder ────────────────────────────────────────────

async function buildAdvisorContext(companyId) {
  return withExecutor(async (x) => {
    const profile = (await x.get('SELECT * FROM growth_profiles WHERE company_id = ?', [companyId])) || {};
    // These two call back into computeReadiness/getCapTable, which each open
    // their own executor — matches the original's connection usage exactly
    // (buildAdvisorContext never routed those two through its own `db`).
    const readiness = await computeReadiness(companyId);
    const capTable = await getCapTable(companyId);
    const investorCnt = await x.get('SELECT COUNT(*) as cnt FROM investors WHERE company_id = ? AND deleted_at IS NULL', [companyId]);
    const activeRound = await x.get("SELECT * FROM investment_rounds WHERE company_id = ? AND status = 'Open' LIMIT 1", [companyId]);
    const latestVal = await x.get('SELECT * FROM valuations WHERE company_id = ? ORDER BY created_at DESC LIMIT 1', [companyId]);

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

Answer concisely and practically. Reference specific actions in BizBook's Growth Hub. Tailor advice to the company's stage, country (${profile.country_code || 'IN'}), and context above.

When asked about attracting investors or fundraising strategy: ground your advice in the specific
readiness-score components above rather than generic fundraising tips. Walk through each unmet item
in Funding Readiness (revenue declared, investor pipeline started, pitch deck uploaded, cap table
structured, valuation calculated, fundraising target set) and recommend the single most impactful
missing one as the concrete next step — e.g. if "Pitch deck uploaded" is not done, say that's the next
step to do first, before anything else. Don't give generic "network more, tell a good story" advice
when there's a concrete gap you can see directly in this company's own data above.

If asked where to find investors, or which investors to approach: BizBook has an Investor Directory
(Growth Hub → Investor Directory) listing real, well-known India-focused VC firms, angel networks,
accelerators, and government funds with their typical stage, ticket size, and focus sectors. Point the
user to it by name ("check the Investor Directory in the Growth Hub") for "where do I find investors"
style questions — you do not have live access to that list yourself (no direct database access here),
so don't invent or recommend specific investor names/firms yourself; only mention that the Directory is
the place to browse them.`;
  });
}

// ── 11. File Upload Directory ─────────────────────────────────────────────────

function getUploadDir(companyId, subfolder) {
  const dir = path.join(__dirname, '../../data/uploads/growth', String(companyId), subfolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── 12. Direct DB helpers for routes (async) ─────────────────────────────────
// Routes call these for simple one-off queries without needing a full service
// fn. get/all delegate straight to dbEngine.js's dbGet/dbAll (identical
// engine dispatch). run() is a local addition: dbEngine.js only exposes
// get/all at the top level (run/insert live inside the executor abstraction),
// and routes/growth.js reads `.lastInsertRowid` off ~20 svc.run() call sites,
// so this keeps that field name stable across both engines instead of
// touching every call site. For Postgres INSERTs it auto-appends `RETURNING
// id` (unless the caller already added one) and maps the returned row's `id`
// back onto `.lastInsertRowid`, mirroring dbEngine.js's own sqliteExecutor/
// pgExecutor.run() field mapping.
async function dbRun(sql, params = []) {
  const isInsert = /^\s*insert\b/i.test(sql);
  const text = isInsert && !/returning/i.test(sql) ? `${sql} RETURNING id` : sql;
  const result = await pgDb.query(text, params);
  return { lastInsertRowid: result.rows[0]?.id ?? null, changes: result.rowCount };
}

module.exports = {
  seedReferenceData,
  seedInvestorDirectory,
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
