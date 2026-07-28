// ============================================================================
// Compliance Service — all compliance business logic & SQL lives here.
// Routes stay thin. Deterministic: scores, due dates and copilot answers are
// computed from structured data, never guessed. (LLM is only a last-resort
// fallback for free-text questions, and never invents legal requirements.)
//
// Phase 2 dual-engine: every exported function is async and runs through
// config/dbEngine.js's withExecutor/withTxExecutor so it works on both SQLite
// and Postgres, gated by process.env.DB_ENGINE. See dbEngine.js's own header
// comment for the shared {get,all,run,insert} executor shape.
// ============================================================================

const { dbGet, dbAll, withExecutor, withTxExecutor, isOn } = require('../config/dbEngine');
const { seedCompliance } = require('../db/complianceSeed');
const engine = require('./complianceRuleEngine');

// NOTE: business_compliance_profile is shared with the Trade module
// (services/tradeService.js reuses getProfile/saveProfile directly rather than
// duplicating profile persistence) — the import_enabled..iec_number fields
// below exist for Trade's rule engine, not Compliance's.
const PROFILE_FIELDS = [
  'country', 'state', 'entity_type', 'industry', 'gst_registered', 'annual_turnover',
  'employee_count', 'import_export', 'fssai_required', 'drug_license', 'has_factory',
  'multiple_branches', 'msme', 'startup_registered',
  'import_enabled', 'export_enabled', 'is_manufacturer', 'is_trader', 'is_service_provider', 'iec_number',
];
const BOOL_FIELDS = new Set([
  'gst_registered', 'import_export', 'fssai_required', 'drug_license', 'has_factory',
  'multiple_branches', 'msme', 'startup_registered',
  'import_enabled', 'export_enabled', 'is_manufacturer', 'is_trader', 'is_service_provider',
]);

function today() { return new Date(new Date().toISOString().slice(0, 10)); }
function daysBetween(fromStr) {
  if (!fromStr) return null;
  const d = new Date(String(fromStr).slice(0, 10));
  return Math.round((d - today()) / 86400000);
}

// datetime('now')/date('now') are SQLite-only; Postgres equivalents are
// now()/CURRENT_DATE. Both forms are plain SQL text (no bound params), so this
// mirrors credits.js's inline `today` pattern rather than dbEngine.js's dateSub
// (which is for the two-arg date(?, '-N days') form only).
function sqlNow(x) { return x.engine === 'postgres' ? 'now()' : "datetime('now')"; }
function sqlToday(x) { return x.engine === 'postgres' ? 'CURRENT_DATE' : "date('now')"; }

async function logEvent(x, companyId, { itemId = null, ruleId = null, eventType, detail = null }) {
  await x.run(
    'INSERT INTO compliance_events (company_id, item_id, rule_id, event_type, detail) VALUES (?, ?, ?, ?, ?)',
    [companyId, itemId, ruleId, eventType, detail]
  );
}

// Defensive, idempotent seed so the module works even if migration 21 hasn't run
// for some reason. seedCompliance is keyed by rule code, so this is a no-op once seeded.
//
// Postgres note: seedCompliance (src/db/complianceSeed.js) is written directly
// against node:sqlite's synchronous db.prepare() API and is out of scope for this
// Phase 2 conversion pass. On Postgres, bootstrapPostgresSchema() (config/pgDb.js)
// only replays schema.postgres.sql's DDL and does not run this seed, so an empty
// compliance_rules table cannot be defensively re-seeded here — flagged for a
// follow-up (either a dual-engine complianceSeed.js, or a Postgres-side seed step
// wired into the bootstrap).
async function ensureSeed() {
  return withExecutor(async (x) => {
    const row = await x.get('SELECT COUNT(*) AS c FROM compliance_rules', []);
    if (row && Number(row.c) === 0) {
      if (x.engine === 'postgres') {
        console.warn('[complianceService] compliance_rules is empty on Postgres and cannot be auto-seeded here (complianceSeed.js is SQLite-only).');
        return;
      }
      const { getDb } = require('../config/db');
      const db = getDb();
      try { seedCompliance(db); } finally { db.close(); }
    }
  });
}

async function getCategories() {
  return dbAll('SELECT key, name, icon, sort_order FROM compliance_categories ORDER BY sort_order', []);
}

async function getProfile(companyId) {
  return dbGet('SELECT * FROM business_compliance_profile WHERE company_id = ?', [companyId]);
}

async function saveProfile(companyId, data) {
  return withExecutor(async (x) => {
    const existing = await x.get('SELECT company_id FROM business_compliance_profile WHERE company_id = ?', [companyId]);
    const clean = {};
    for (const f of PROFILE_FIELDS) {
      if (data[f] === undefined) continue;
      clean[f] = BOOL_FIELDS.has(f) ? (data[f] ? 1 : 0)
        : (f === 'annual_turnover' || f === 'employee_count') ? Number(data[f] || 0)
        : data[f];
    }
    if (existing) {
      const cols = Object.keys(clean);
      if (cols.length) {
        const setSql = cols.map(c => `${c} = ?`).join(', ');
        await x.run(`UPDATE business_compliance_profile SET ${setSql}, updated_at = ${sqlNow(x)} WHERE company_id = ?`,
          [...cols.map(c => clean[c]), companyId]);
      }
    } else {
      clean.country = clean.country || 'IN';
      const cols = Object.keys(clean);
      await x.run(`INSERT INTO business_compliance_profile (company_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
        [companyId, ...cols.map(c => clean[c])]);
    }
    return x.get('SELECT * FROM business_compliance_profile WHERE company_id = ?', [companyId]);
  });
}

// Loads applicable rules for a profile via the shared executor. Mirrors
// complianceRuleEngine.js's loadRulesForCountry()+computeApplicable() exactly,
// but reads through `x` instead of a raw sqlite `db.prepare()` handle, since
// complianceRuleEngine.js (out of scope for this conversion) is SQLite-only.
// The actual rule-evaluation logic (isRuleApplicable/computeNextDueDate) is NOT
// duplicated — those pure, db-free functions are still called from
// complianceRuleEngine.js, so there is exactly one source of truth for how a
// rule is judged applicable.
async function loadApplicableRules(x, profile) {
  const rules = await x.all('SELECT * FROM compliance_rules WHERE is_active = ? AND country = ?', [1, profile.country || 'IN']);
  const applicable = [];
  for (const rule of rules) {
    const conditions = await x.all('SELECT attribute, operator, value FROM compliance_rule_conditions WHERE rule_id = ?', [rule.id]);
    if (engine.isRuleApplicable(rule, conditions, profile)) {
      applicable.push({ rule, nextDueDate: engine.computeNextDueDate(rule) });
    }
  }
  return applicable;
}

// Materialize applicable rules into business_compliance_items. Additive & safe:
// new applicable rules are inserted, rules no longer applicable are marked
// 'not_applicable' (never deleted, so history/tracking is preserved).
async function recompute(companyId) {
  await ensureSeed();
  const profile = await dbGet('SELECT * FROM business_compliance_profile WHERE company_id = ?', [companyId]);
  if (!profile) return { error: 'No compliance profile set. Complete onboarding first.' };

  const applicable = await withExecutor((x) => loadApplicableRules(x, profile));
  const applicableRuleIds = new Set(applicable.map(a => a.rule.id));

  return withTxExecutor(async (x) => {
    let added = 0, revived = 0;
    for (const { rule, nextDueDate } of applicable) {
      const existing = await x.get('SELECT * FROM business_compliance_items WHERE company_id = ? AND rule_id = ?', [companyId, rule.id]);
      if (!existing) {
        await x.run(`
          INSERT INTO business_compliance_items (company_id, rule_id, status, next_due_date, due_date)
          VALUES (?, ?, 'pending', ?, ?)
        `, [companyId, rule.id, nextDueDate, nextDueDate]);
        added++;
      } else if (existing.status === 'not_applicable') {
        await x.run(`
          UPDATE business_compliance_items SET status = 'pending', next_due_date = ?, due_date = ?, updated_at = ${sqlNow(x)}
          WHERE id = ?
        `, [nextDueDate, nextDueDate, existing.id]);
        revived++;
      }
    }

    // Mark items whose rule is no longer applicable.
    const currentItems = await x.all("SELECT id, rule_id, status FROM business_compliance_items WHERE company_id = ? AND status != 'not_applicable'", [companyId]);
    let removed = 0;
    for (const it of currentItems) {
      if (!applicableRuleIds.has(it.rule_id)) {
        await x.run(`UPDATE business_compliance_items SET status = 'not_applicable', updated_at = ${sqlNow(x)} WHERE id = ?`, [it.id]);
        removed++;
      }
    }

    // Refresh overdue flags for active, non-completed items.
    await x.run(`
      UPDATE business_compliance_items
      SET status = 'overdue'
      WHERE company_id = ? AND status IN ('pending','in_progress')
        AND next_due_date IS NOT NULL AND next_due_date < ${sqlToday(x)}
    `, [companyId]);

    await x.run(`UPDATE business_compliance_profile SET computed_at = ${sqlNow(x)} WHERE company_id = ?`, [companyId]);
    await logEvent(x, companyId, { eventType: 'recomputed', detail: `applicable=${applicable.length} added=${added} revived=${revived} deactivated=${removed}` });
    return { applicable: applicable.length, added, revived, deactivated: removed };
  });
}

async function _itemsQuery(x, companyId, { category, status, includeInactive, limit, offset } = {}) {
  // Correlated subqueries compute per-item document status in a single query
  // (avoids N+1 when scoring many items).
  let sql = `
    SELECT i.*, r.code, r.title, r.description, r.category_key, r.department, r.portal_url,
           r.reference_url, r.mandatory, r.frequency, r.priority, r.penalty_info,
           r.ai_explanation, r.grace_period_days, r.processing_fee, r.typical_timeline,
           r.forms_json, r.guide_url, c.name AS category_name,
           (SELECT COUNT(*) FROM compliance_rule_documents rd WHERE rd.rule_id = r.id AND rd.is_required = TRUE) AS required_docs,
           (SELECT COUNT(DISTINCT d.doc_name) FROM compliance_item_documents d WHERE d.item_id = i.id AND d.is_current = TRUE) AS uploaded_docs,
           (SELECT COUNT(*) FROM compliance_item_documents d WHERE d.item_id = i.id AND d.is_current = TRUE AND d.expiry_date IS NOT NULL AND d.expiry_date < ${sqlToday(x)}) AS expired_docs
    FROM business_compliance_items i
    JOIN compliance_rules r ON r.id = i.rule_id
    LEFT JOIN compliance_categories c ON c.key = r.category_key
    WHERE i.company_id = ?`;
  const params = [companyId];
  if (!includeInactive) sql += " AND i.status != 'not_applicable'";
  if (category) { sql += ' AND r.category_key = ?'; params.push(category); }
  if (status) { sql += ' AND i.status = ?'; params.push(status); }
  sql += ' ORDER BY (i.next_due_date IS NULL), i.next_due_date ASC';
  if (limit != null) { sql += ' LIMIT ? OFFSET ?'; params.push(Number(limit), Number(offset || 0)); }
  const rows = await x.all(sql, params);
  return rows.map(row => ({
    ...row,
    daysRemaining: daysBetween(row.next_due_date),
    missingDocs: Math.max(0, (row.required_docs || 0) - (row.uploaded_docs || 0)),
    forms: row.forms_json ? safeJson(row.forms_json) : [],
  }));
}
function safeJson(s) { try { return JSON.parse(s); } catch (_) { return []; } }

async function getItems(companyId, filters = {}) {
  return withExecutor((x) => _itemsQuery(x, companyId, filters));
}

// Health of a single item in [0,1]. Two dimensions:
//  • deadline: overdue/expired => 0
//  • documents: required proofs missing/expired reduces health (30% weight), so
//    an on-track item with no uploaded proofs sits at 0.7 — signalling "upload
//    your documents" without punishing as harshly as a missed filing.
function itemHealth(item) {
  let due = 1;
  if (item.status === 'completed') {
    if (item.expiry_date && daysBetween(item.expiry_date) < 0) due = 0;
  } else if (item.status === 'overdue') {
    due = 0;
  } else {
    const dr = daysBetween(item.next_due_date);
    if (dr != null && dr < 0) due = 0;
  }
  if (due === 0) return 0;

  const req = item.required_docs || 0;
  if (req <= 0) return 1;
  const have = Math.max(0, (item.uploaded_docs || 0) - (item.expired_docs || 0));
  const docCoverage = Math.min(1, have / req);
  return 0.7 + 0.3 * docCoverage;
}

async function getOverview(companyId) {
  return withExecutor(async (x) => {
    const items = await _itemsQuery(x, companyId, {});
    const profile = await x.get('SELECT * FROM business_compliance_profile WHERE company_id = ?', [companyId]);

    // Per-category + overall score.
    const cats = await x.all('SELECT key, name, icon, sort_order FROM compliance_categories ORDER BY sort_order', []);
    const byCat = {};
    for (const c of cats) byCat[c.key] = { key: c.key, name: c.name, icon: c.icon, total: 0, healthSum: 0, overdue: 0 };

    let totalHealth = 0;
    for (const it of items) {
      const h = itemHealth(it);
      totalHealth += h;
      const bucket = byCat[it.category_key] || (byCat[it.category_key] = { key: it.category_key, name: it.category_name || it.category_key, total: 0, healthSum: 0, overdue: 0 });
      bucket.total++;
      bucket.healthSum += h;
      if (h === 0) bucket.overdue++;
    }
    const overallScore = items.length ? Math.round((totalHealth / items.length) * 100) : 100;
    const breakdown = Object.values(byCat)
      .filter(b => b.total > 0)
      .map(b => ({ key: b.key, name: b.name, icon: b.icon, score: Math.round((b.healthSum / b.total) * 100), total: b.total, overdue: b.overdue }));

    // Upcoming deadlines: overdue OR due within 60 days.
    const deadlines = items
      .filter(it => it.next_due_date && it.daysRemaining != null && it.daysRemaining <= 60 && it.status !== 'completed')
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 20)
      .map(it => ({
        id: it.id, code: it.code, title: it.title, category_key: it.category_key,
        priority: it.priority, next_due_date: it.next_due_date, daysRemaining: it.daysRemaining,
        status: it.daysRemaining < 0 ? 'overdue' : it.status, frequency: it.frequency,
      }));

    const counts = {
      total: items.length,
      overdue: items.filter(it => itemHealth(it) === 0).length,
      completed: items.filter(it => it.status === 'completed').length,
      dueSoon: items.filter(it => it.daysRemaining != null && it.daysRemaining >= 0 && it.daysRemaining <= 15).length,
      missingDocuments: items.filter(it => it.missingDocs > 0).length,
      expiredDocuments: items.reduce((s, it) => s + (it.expired_docs || 0), 0),
    };

    // Licenses/renewals expiring within 30 days (for the "expiring soon" card).
    const licensesExpiringSoon = items
      .filter(it => (it.category_key === 'licenses' || it.category_key === 'renewals') && it.daysRemaining != null && it.daysRemaining <= 30 && it.status !== 'completed')
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .map(it => ({ id: it.id, title: it.title, daysRemaining: it.daysRemaining, next_due_date: it.next_due_date }));

    // Recent activity from the audit trail.
    const recentActivity = await x.all(`
      SELECT e.event_type, e.detail, e.created_at, r.title
      FROM compliance_events e LEFT JOIN compliance_rules r ON r.id = e.rule_id
      WHERE e.company_id = ? ORDER BY e.created_at DESC LIMIT 8
    `, [companyId]);

    return {
      profileConfigured: !!profile, overallScore, breakdown, deadlines, counts,
      licensesExpiringSoon, recentActivity,
      computedAt: profile?.computed_at || null,
    };
  });
}

// Full detail for one item: tracking state + rule resources + required docs +
// uploaded documents. Powers the item drawer / Government Resource Center.
async function getItemDetail(companyId, itemId) {
  return withExecutor(async (x) => {
    const rows = await _itemsQuery(x, companyId, { includeInactive: true });
    const item = rows.find(r => r.id === Number(itemId));
    if (!item) return { error: 'not_found' };
    const requiredDocs = await x.all('SELECT doc_name, is_required FROM compliance_rule_documents WHERE rule_id = ?', [item.rule_id]);
    const uploaded = await x.all(
      'SELECT id, doc_name, original_name, mime_type, file_size, status, expiry_date, verified, version, uploaded_at FROM compliance_item_documents WHERE item_id = ? AND is_current = TRUE',
      [itemId]
    );
    const uploadedByName = {};
    for (const d of uploaded) uploadedByName[d.doc_name] = d;
    const docSlots = requiredDocs.map(rd => ({ doc_name: rd.doc_name, is_required: rd.is_required, document: uploadedByName[rd.doc_name] || null }));
    return { item, requiredDocs, uploaded, docSlots };
  });
}

async function updateItem(companyId, itemId, patch = {}) {
  return withExecutor(async (x) => {
    const item = await x.get(
      'SELECT i.*, r.frequency, r.renewal_interval_months, r.due_day, r.due_month FROM business_compliance_items i JOIN compliance_rules r ON r.id = i.rule_id WHERE i.id = ? AND i.company_id = ?',
      [itemId, companyId]
    );
    if (!item) return { error: 'not_found' };

    const sets = [];
    const params = [];
    if (patch.status) { sets.push('status = ?'); params.push(patch.status); }
    if (patch.notes !== undefined) { sets.push('notes = ?'); params.push(patch.notes); }
    if (patch.issue_date !== undefined) { sets.push('issue_date = ?'); params.push(patch.issue_date); }
    if (patch.expiry_date !== undefined) { sets.push('expiry_date = ?'); params.push(patch.expiry_date); }

    // Marking complete advances recurring/renewal items to their next cycle.
    if (patch.status === 'completed') {
      const nowIso = new Date().toISOString();
      sets.push('completed_at = ?', 'last_renewed_at = ?');
      params.push(nowIso, nowIso);
      const nextDue = engine.computeNextDueDate(
        { frequency: item.frequency, renewal_interval_months: item.renewal_interval_months, due_day: item.due_day, due_month: item.due_month },
        new Date(), new Date()
      );
      if (nextDue) { sets.push('next_due_date = ?'); params.push(nextDue); }
    }
    sets.push(`updated_at = ${sqlNow(x)}`);
    await x.run(`UPDATE business_compliance_items SET ${sets.join(', ')} WHERE id = ?`, [...params, itemId]);
    await logEvent(x, companyId, { itemId, ruleId: item.rule_id, eventType: 'status_changed', detail: patch.status || 'edited' });
    return x.get('SELECT * FROM business_compliance_items WHERE id = ?', [itemId]);
  });
}

// ── Admin: rule CRUD (lets admins add/edit rules with no code change) ────────
async function listRules({ country } = {}) {
  return withExecutor(async (x) => {
    let sql = 'SELECT * FROM compliance_rules';
    const params = [];
    if (country) { sql += ' WHERE country = ?'; params.push(country); }
    sql += ' ORDER BY country, category_key, code';
    const rules = await x.all(sql, params);
    for (const r of rules) {
      r.conditions = await x.all('SELECT id, attribute, operator, value FROM compliance_rule_conditions WHERE rule_id = ?', [r.id]);
      r.documents = await x.all('SELECT id, doc_name, is_required FROM compliance_rule_documents WHERE rule_id = ?', [r.id]);
    }
    return rules;
  });
}

const RULE_COLUMNS = [
  'code', 'country', 'state', 'title', 'description', 'category_key', 'department', 'portal_url',
  'reference_url', 'mandatory', 'frequency', 'renewal_interval_months', 'due_day', 'due_month',
  'grace_period_days', 'penalty_info', 'priority', 'ai_explanation', 'is_active',
];

async function createRule(data) {
  if (!data.code || !data.title || !data.category_key || !data.frequency) {
    return { error: 'code, title, category_key and frequency are required' };
  }
  return withTxExecutor(async (x) => {
    const cols = RULE_COLUMNS.filter(c => data[c] !== undefined);
    const ruleId = await x.insert(
      `INSERT INTO compliance_rules (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map(c => data[c])
    );
    for (const c of (data.conditions || [])) {
      await x.run('INSERT INTO compliance_rule_conditions (rule_id, attribute, operator, value) VALUES (?, ?, ?, ?)',
        [ruleId, c.attribute, c.operator, c.value ?? null]);
    }
    for (const d of (data.documents || [])) {
      const name = typeof d === 'string' ? d : d.doc_name;
      await x.run('INSERT INTO compliance_rule_documents (rule_id, doc_name, is_required) VALUES (?, ?, ?)',
        [ruleId, name, (typeof d === 'object' && d.is_required === 0) ? 0 : 1]);
    }
    return { id: ruleId };
  });
}

async function updateRule(id, data) {
  return withExecutor(async (x) => {
    const cols = RULE_COLUMNS.filter(c => data[c] !== undefined && c !== 'code');
    if (cols.length) {
      await x.run(`UPDATE compliance_rules SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = ${sqlNow(x)} WHERE id = ?`,
        [...cols.map(c => data[c]), id]);
    }
    if (Array.isArray(data.conditions)) {
      await x.run('DELETE FROM compliance_rule_conditions WHERE rule_id = ?', [id]);
      for (const c of data.conditions) {
        await x.run('INSERT INTO compliance_rule_conditions (rule_id, attribute, operator, value) VALUES (?, ?, ?, ?)',
          [id, c.attribute, c.operator, c.value ?? null]);
      }
    }
    return x.get('SELECT * FROM compliance_rules WHERE id = ?', [id]);
  });
}

async function deleteRule(id) {
  return withTxExecutor(async (x) => {
    await x.run('DELETE FROM compliance_rule_conditions WHERE rule_id = ?', [id]);
    await x.run('DELETE FROM compliance_rule_documents WHERE rule_id = ?', [id]);
    await x.run('DELETE FROM compliance_rules WHERE id = ?', [id]);
    return { deleted: true };
  });
}

// ── AI Compliance Copilot — structured-data first, never hallucinate ─────────
const RULE_KEYWORDS = ['gstr', 'gst', 'fssai', 'tds', 'epf', 'esic', 'esi', 'income tax', 'itr', 'advance tax',
  'trade', 'fire', 'drug', 'factory', 'pollution', 'iec', 'udyam', 'msme', 'aoc', 'mgt', 'roc', 'agm',
  'board', 'llp', 'professional tax', 'shop'];

function matchRules(items, q) {
  const hits = RULE_KEYWORDS.filter(k => q.includes(k));
  if (!hits.length) return [];
  return items.filter(it => hits.some(h => it.title.toLowerCase().includes(h) || (it.code || '').toLowerCase().includes(h.replace(/\s/g, ''))));
}

async function copilot(companyId, question) {
  return withExecutor(async (x) => {
    const q = String(question || '').toLowerCase();
    const items = await _itemsQuery(x, companyId, {});
    if (!items.length) {
      return { source: 'structured', answer: 'No compliance items yet. Complete your compliance profile so I can work out what applies to your business.', items: [] };
    }
    const pick = (arr, msg) => ({ source: 'structured', answer: msg(arr), items: arr.slice(0, 12) });
    const matched = matchRules(items, q);

    // "how do I renew my FSSAI?" — grounded, step-by-step from resource data.
    if (/(how (do|to|can).*(renew|apply|file|get)|renew.*(how|process)|process to)/.test(q) && matched.length) {
      const r = matched[0];
      const forms = (r.forms || []).map(f => f.name).join(', ');
      return {
        source: 'structured',
        answer: `To handle "${r.title}": file with ${r.department || 'the relevant department'}${r.portal_url ? ` via ${r.portal_url}` : ''}. `
          + `${r.processing_fee ? `Fee: ${r.processing_fee}. ` : ''}${r.typical_timeline ? `Typical time: ${r.typical_timeline}. ` : ''}`
          + `${forms ? `Forms: ${forms}. ` : ''}${r.guide_url ? `Official guide: ${r.guide_url}. ` : ''}`
          + `Required documents: ${(items.find(i => i.id === r.id)?.required_docs || 0)} item(s) — see the item's Documents tab.`,
        items: matched.slice(0, 4),
      };
    }
    // "what happens if I miss GST?" — penalty from rule data.
    if (/(what happens|if i miss|miss.*(deadline|filing|return)|penalt|late fee|fine)/.test(q) && matched.length) {
      return pick(matched, a => a.map(x2 => `${x2.title}: ${x2.penalty_info || 'penalties may apply for late/non-compliance.'}`).join(' | '));
    }
    // "explain this filing" / "explain GSTR-3B"
    if (/(explain|what is|tell me about|why.*(need|file))/.test(q) && matched.length) {
      return pick(matched, a => a.map(x2 => `${x2.title}: ${x2.ai_explanation || x2.description || ''}${x2.department ? ` (Authority: ${x2.department}.)` : ''}`).join(' | '));
    }
    // "what documents are missing?"
    if (/(document|proof|upload|paperwork)/.test(q)) {
      const missing = items.filter(it => it.missingDocs > 0);
      return pick(missing, a => a.length
        ? `${a.length} item(s) need documents: ${a.map(x2 => `${x2.title} (${x2.missingDocs} missing)`).join('; ')}.`
        : 'All required documents have been uploaded. Nothing missing.');
    }
    // "what do I need to file this month?"
    if (/(this month|due this month|file.*month|month.*due|what should i do)/.test(q)) {
      const inMonth = items.filter(it => it.daysRemaining != null && it.daysRemaining >= 0 && it.daysRemaining <= 31 && it.status !== 'completed');
      return pick(inMonth, a => a.length
        ? `You have ${a.length} item(s) due within the next 31 days: ${a.map(x2 => `${x2.title} (in ${x2.daysRemaining}d)`).join('; ')}.`
        : 'Nothing is due in the next month. You are on track.');
    }
    // "what expires next?" / renewals
    if (/(expire|expiry|renew|renewal|next month|expires next)/.test(q)) {
      const soon = items.filter(it => (it.frequency === 'renewal' || it.category_key === 'renewals' || it.category_key === 'licenses') && it.daysRemaining != null && it.daysRemaining <= 90 && it.status !== 'completed');
      return pick(soon, a => a.length
        ? `${a.length} licence/renewal(s) coming up: ${a.map(x2 => `${x2.title} (in ${x2.daysRemaining}d)`).join('; ')}.`
        : 'No licences or renewals are due in the next 90 days.');
    }
    // "what licenses am I missing?"
    if (/(licen|register)/.test(q)) {
      const lic = items.filter(it => (it.category_key === 'licenses' || it.category_key === 'renewals') && it.status !== 'completed');
      return pick(lic, a => a.length ? `Licences/permits to action: ${a.map(x2 => x2.title).join('; ')}.` : 'All your licences are marked complete.');
    }
    // "can I hire more employees?" / employee thresholds
    if (/(hire|employee|staff|payroll|pf|esi|headcount)/.test(q)) {
      const emp = items.filter(it => it.category_key === 'employee' || /tds|professional tax/i.test(it.title));
      return pick(emp, a => a.length
        ? `Employee-related obligations currently applicable: ${a.map(x2 => `${x2.title} — ${x2.ai_explanation || ''}`.trim()).join(' | ')}. Crossing 20 staff triggers EPF; 10 staff triggers ESIC.`
        : 'At your current headcount no PF/ESI applies. Crossing 10 employees triggers ESIC, and 20 employees triggers EPF, plus TDS/Professional Tax on payroll.');
    }
    // "which laws apply to me?" / mandatory
    if (/(which law|what law|apply to me|mandatory|required|must|compulsor|all compliance|everything)/.test(q)) {
      const mand = items.filter(it => isOn(it.mandatory));
      return pick(mand, a => `${a.length} obligations apply to your business: ${a.map(x2 => x2.title).join('; ')}.`);
    }

    // Default: prioritised upcoming summary.
    const upcoming = items.filter(it => it.status !== 'completed').sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999));
    return pick(upcoming, a => `You have ${a.length} open compliance item(s). Most urgent: ${a.slice(0, 5).map(x2 => `${x2.title}${x2.daysRemaining != null ? ` (in ${x2.daysRemaining}d)` : ''}`).join('; ')}.`);
  });
}

module.exports = {
  getCategories, getProfile, saveProfile, recompute, getItems, getOverview, getItemDetail, updateItem,
  listRules, createRule, updateRule, deleteRule, copilot, ensureSeed,
};
