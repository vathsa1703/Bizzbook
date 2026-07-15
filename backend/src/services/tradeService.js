// ============================================================================
// Trade Service — Import & Export Intelligence. All logic & SQL lives here.
// Routes stay thin. Mirrors complianceService.js's structure exactly.
//
// Profile: reuses complianceService.getProfile/saveProfile directly — Trade
// does NOT have its own profile table. Same business_compliance_profile row,
// extended with import_enabled/export_enabled/is_manufacturer/is_trader/
// is_service_provider/iec_number (see complianceService.js PROFILE_FIELDS).
// ============================================================================

const { getDb } = require('../config/db');
const { seedTrade } = require('../db/tradeSeed');
const engine = require('./tradeRuleEngine');
const complianceService = require('./complianceService');

function today() { return new Date(new Date().toISOString().slice(0, 10)); }
function daysBetween(fromStr) {
  if (!fromStr) return null;
  const d = new Date(String(fromStr).slice(0, 10));
  return Math.round((d - today()) / 86400000);
}
function logEvent(db, companyId, { requirementId = null, guidelineId = null, eventType, detail = null }) {
  db.prepare(
    'INSERT INTO trade_events (company_id, requirement_id, guideline_id, event_type, detail) VALUES (?, ?, ?, ?, ?)'
  ).run(companyId, requirementId, guidelineId, eventType, detail);
}
function safeJson(s) { try { return JSON.parse(s); } catch (_) { return []; } }

// Defensive, idempotent seed so the module works even if migration 27 hasn't
// run for some reason. seedTrade is keyed by guideline code, so this is a
// no-op once seeded.
function ensureSeed(db) {
  const row = db.prepare('SELECT COUNT(*) AS c FROM trade_guidelines').get();
  if (!row || row.c === 0) seedTrade(db);
}

// ── Profile (reused from Compliance — same table) ────────────────────────────
const getProfile = complianceService.getProfile;
const saveProfile = complianceService.saveProfile;

// ── Guideline catalog (public, read-only browse) ─────────────────────────────
function getGuidelines({ category, country } = {}) {
  const db = getDb();
  try {
    ensureSeed(db);
    let sql = 'SELECT * FROM trade_guidelines WHERE is_active = 1';
    const params = [];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (country) { sql += ' AND country = ?'; params.push(country); }
    sql += ' ORDER BY category, title';
    const rows = db.prepare(sql).all(...params);
    return rows.map(r => ({ ...r, faq: r.faq_json ? safeJson(r.faq_json) : [] }));
  } finally { db.close(); }
}

function getGuidelineDetail(id) {
  const db = getDb();
  try {
    const g = db.prepare('SELECT * FROM trade_guidelines WHERE id = ?').get(id);
    if (!g) return { error: 'not_found' };
    const conditions = db.prepare('SELECT attribute, operator, value FROM trade_rule_conditions WHERE guideline_id = ?').all(id);
    const documents = db.prepare('SELECT doc_name, is_required FROM trade_documents WHERE guideline_id = ?').all(id);
    return { guideline: { ...g, faq: g.faq_json ? safeJson(g.faq_json) : [] }, conditions, documents };
  } finally { db.close(); }
}

// ── Recompute: materialize applicable guidelines into trade_requirements ────
// Additive & safe: new applicable guidelines are inserted, guidelines no
// longer applicable are marked 'not_applicable' (never deleted).
function recompute(companyId) {
  const db = getDb();
  try {
    ensureSeed(db);
    const profile = db.prepare('SELECT * FROM business_compliance_profile WHERE company_id = ?').get(companyId);
    if (!profile) return { error: 'No business profile set. Complete onboarding first.' };

    const applicable = engine.computeApplicable(db, profile);
    const applicableIds = new Set(applicable.map(a => a.guideline.id));

    db.exec('BEGIN TRANSACTION');
    try {
      const findReq = db.prepare('SELECT * FROM trade_requirements WHERE company_id = ? AND guideline_id = ?');
      const insReq = db.prepare(`
        INSERT INTO trade_requirements (company_id, guideline_id, status, next_due_date, due_date)
        VALUES (?, ?, 'pending', ?, ?)
      `);
      const reviveReq = db.prepare(`
        UPDATE trade_requirements SET status = 'pending', next_due_date = ?, due_date = ?, updated_at = datetime('now')
        WHERE id = ?
      `);
      let added = 0, revived = 0;
      for (const { guideline, nextDueDate } of applicable) {
        const existing = findReq.get(companyId, guideline.id);
        if (!existing) {
          insReq.run(companyId, guideline.id, nextDueDate, nextDueDate);
          added++;
        } else if (existing.status === 'not_applicable') {
          reviveReq.run(nextDueDate, nextDueDate, existing.id);
          revived++;
        }
      }

      const currentReqs = db.prepare("SELECT id, guideline_id, status FROM trade_requirements WHERE company_id = ? AND status != 'not_applicable'").all(companyId);
      let removed = 0;
      for (const r of currentReqs) {
        if (!applicableIds.has(r.guideline_id)) {
          db.prepare("UPDATE trade_requirements SET status = 'not_applicable', updated_at = datetime('now') WHERE id = ?").run(r.id);
          removed++;
        }
      }

      db.prepare(`
        UPDATE trade_requirements SET status = 'overdue'
        WHERE company_id = ? AND status IN ('pending','in_progress')
          AND next_due_date IS NOT NULL AND next_due_date < date('now')
      `).run(companyId);

      logEvent(db, companyId, { eventType: 'recomputed', detail: `applicable=${applicable.length} added=${added} revived=${revived} deactivated=${removed}` });
      db.exec('COMMIT');
      return { applicable: applicable.length, added, revived, deactivated: removed };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } finally { db.close(); }
}

function _requirementsQuery(db, companyId, { category, status, includeInactive } = {}) {
  let sql = `
    SELECT r.*, g.code, g.title, g.description, g.category, g.department, g.official_website,
           g.mandatory, g.frequency, g.priority, g.penalty_info, g.ai_explanation,
           g.fees, g.processing_time, g.renewal_requirement,
           (SELECT COUNT(*) FROM trade_documents d WHERE d.guideline_id = g.id AND d.is_required = 1) AS required_docs,
           (SELECT COUNT(DISTINCT c.doc_name) FROM trade_checklists c WHERE c.requirement_id = r.id AND c.is_current = 1) AS uploaded_docs,
           (SELECT COUNT(*) FROM trade_checklists c WHERE c.requirement_id = r.id AND c.is_current = 1 AND c.expiry_date IS NOT NULL AND c.expiry_date < date('now')) AS expired_docs
    FROM trade_requirements r
    JOIN trade_guidelines g ON g.id = r.guideline_id
    WHERE r.company_id = ?`;
  const params = [companyId];
  if (!includeInactive) sql += " AND r.status != 'not_applicable'";
  if (category) { sql += ' AND g.category = ?'; params.push(category); }
  if (status) { sql += ' AND r.status = ?'; params.push(status); }
  sql += ' ORDER BY (r.next_due_date IS NULL), r.next_due_date ASC';
  return db.prepare(sql).all(...params).map(row => ({
    ...row,
    daysRemaining: daysBetween(row.next_due_date),
    missingDocs: Math.max(0, (row.required_docs || 0) - (row.uploaded_docs || 0)),
  }));
}

function getRequirements(companyId, filters = {}) {
  const db = getDb();
  try { return _requirementsQuery(db, companyId, filters); }
  finally { db.close(); }
}

// Health of a single requirement in [0,1] — mirrors complianceService.itemHealth.
function requirementHealth(item) {
  let due = 1;
  if (item.status === 'completed') {
    due = 1;
  } else if (item.status === 'overdue') {
    due = 0;
  } else {
    const dr = daysBetween(item.next_due_date);
    if (dr != null && dr < 0) due = 0;
  }
  if (due === 0) return 0;

  const req = item.required_docs || 0;
  if (req <= 0) return item.status === 'completed' ? 1 : 0.7;
  const have = Math.max(0, (item.uploaded_docs || 0) - (item.expired_docs || 0));
  const docCoverage = Math.min(1, have / req);
  return 0.7 + 0.3 * docCoverage;
}

function getOverview(companyId) {
  const db = getDb();
  try {
    const items = _requirementsQuery(db, companyId, {});
    const profile = db.prepare('SELECT * FROM business_compliance_profile WHERE company_id = ?').get(companyId) || null;

    const importItems = items.filter(i => ['import', 'registration', 'licensing'].includes(i.category));
    const exportItems = items.filter(i => ['export', 'registration', 'licensing'].includes(i.category));
    const scoreOf = (arr) => arr.length ? Math.round((arr.reduce((s, i) => s + requirementHealth(i), 0) / arr.length) * 100) : 100;
    const importScore = scoreOf(importItems);
    const exportScore = scoreOf(exportItems);
    const overallScore = items.length ? Math.round((items.reduce((s, i) => s + requirementHealth(i), 0) / items.length) * 100) : 100;

    const iecReq = items.find(i => i.code === 'TRADE_IEC');
    const iec = {
      applicable: !!iecReq,
      registered: !!(profile && profile.iec_number),
      iec_number: profile ? profile.iec_number : null,
      status: iecReq ? iecReq.status : null,
    };

    const missingRegistrations = items.filter(i => i.category === 'registration' && i.status !== 'completed').length;
    const missingDocuments = items.reduce((s, i) => s + (i.missingDocs || 0), 0);
    const pendingApplications = items.filter(i => i.status === 'in_progress').length;
    const upcomingRenewals = items
      .filter(i => i.next_due_date && i.daysRemaining != null && i.daysRemaining >= 0 && i.daysRemaining <= 60 && i.status !== 'completed')
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 20)
      .map(i => ({ id: i.id, code: i.code, title: i.title, category: i.category, next_due_date: i.next_due_date, daysRemaining: i.daysRemaining, status: i.status }));

    const recentActivity = db.prepare(`
      SELECT e.event_type, e.detail, e.created_at, g.title
      FROM trade_events e LEFT JOIN trade_guidelines g ON g.id = e.guideline_id
      WHERE e.company_id = ? ORDER BY e.created_at DESC LIMIT 8
    `).all(companyId);

    return {
      profileConfigured: !!profile,
      importReady: importScore, exportReady: exportScore, overallScore,
      iec, missingRegistrations, missingDocuments, pendingApplications, upcomingRenewals,
      counts: { total: items.length, completed: items.filter(i => i.status === 'completed').length, overdue: items.filter(i => requirementHealth(i) === 0).length },
      recentActivity,
      computedAt: profile?.computed_at || null,
    };
  } finally { db.close(); }
}

function getRequirementDetail(companyId, requirementId) {
  const db = getDb();
  try {
    const rows = _requirementsQuery(db, companyId, { includeInactive: true });
    const item = rows.find(r => r.id === Number(requirementId));
    if (!item) return { error: 'not_found' };
    const requiredDocs = db.prepare('SELECT doc_name, is_required FROM trade_documents WHERE guideline_id = ?').all(item.guideline_id);
    const uploaded = db.prepare(
      'SELECT id, doc_name, original_name, mime_type, file_size, status, expiry_date, verified, version, uploaded_at FROM trade_checklists WHERE requirement_id = ? AND is_current = 1'
    ).all(requirementId);
    const uploadedByName = {};
    for (const d of uploaded) uploadedByName[d.doc_name] = d;
    const docSlots = requiredDocs.map(rd => ({ doc_name: rd.doc_name, is_required: rd.is_required, document: uploadedByName[rd.doc_name] || null }));
    return { item, requiredDocs, uploaded, docSlots };
  } finally { db.close(); }
}

function updateRequirement(companyId, requirementId, patch = {}) {
  const db = getDb();
  try {
    const item = db.prepare('SELECT r.*, g.frequency, g.renewal_interval_months FROM trade_requirements r JOIN trade_guidelines g ON g.id = r.guideline_id WHERE r.id = ? AND r.company_id = ?').get(requirementId, companyId);
    if (!item) return { error: 'not_found' };

    const sets = [];
    const params = [];
    if (patch.status) { sets.push('status = ?'); params.push(patch.status); }
    if (patch.notes !== undefined) { sets.push('notes = ?'); params.push(patch.notes); }

    if (patch.status === 'completed') {
      sets.push('completed_at = ?'); params.push(new Date().toISOString());
      const nextDue = engine.computeNextDueDate({ frequency: item.frequency, renewal_interval_months: item.renewal_interval_months }, new Date(), new Date());
      if (nextDue) { sets.push('next_due_date = ?'); params.push(nextDue); }
    }
    sets.push("updated_at = datetime('now')");
    db.prepare(`UPDATE trade_requirements SET ${sets.join(', ')} WHERE id = ?`).run(...params, requirementId);
    logEvent(db, companyId, { requirementId, guidelineId: item.guideline_id, eventType: 'status_changed', detail: patch.status || 'edited' });
    return db.prepare('SELECT * FROM trade_requirements WHERE id = ?').get(requirementId);
  } finally { db.close(); }
}

// ── Admin: guideline CRUD (data-driven, no code changes) ─────────────────────
function listGuidelinesAdmin({ country } = {}) {
  const db = getDb();
  try {
    ensureSeed(db);
    let sql = 'SELECT * FROM trade_guidelines';
    const params = [];
    if (country) { sql += ' WHERE country = ?'; params.push(country); }
    sql += ' ORDER BY country, category, code';
    const rows = db.prepare(sql).all(...params);
    const condStmt = db.prepare('SELECT id, attribute, operator, value FROM trade_rule_conditions WHERE guideline_id = ?');
    const docStmt = db.prepare('SELECT id, doc_name, is_required FROM trade_documents WHERE guideline_id = ?');
    for (const g of rows) { g.conditions = condStmt.all(g.id); g.documents = docStmt.all(g.id); g.faq = g.faq_json ? safeJson(g.faq_json) : []; }
    return rows;
  } finally { db.close(); }
}

const GUIDELINE_COLUMNS = [
  'code', 'country', 'category', 'title', 'description', 'department', 'authority_id',
  'official_website', 'fees', 'processing_time', 'renewal_requirement', 'penalty_info',
  'ai_explanation', 'frequency', 'renewal_interval_months', 'mandatory', 'priority', 'is_active',
];

function createGuideline(data) {
  const db = getDb();
  try {
    if (!data.code || !data.title || !data.category || !data.frequency) {
      return { error: 'code, title, category and frequency are required' };
    }
    const cols = GUIDELINE_COLUMNS.filter(c => data[c] !== undefined);
    db.exec('BEGIN TRANSACTION');
    try {
      const info = db.prepare(`INSERT INTO trade_guidelines (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...cols.map(c => data[c]));
      const guidelineId = info.lastInsertRowid;
      for (const c of (data.conditions || [])) {
        db.prepare('INSERT INTO trade_rule_conditions (guideline_id, attribute, operator, value) VALUES (?, ?, ?, ?)')
          .run(guidelineId, c.attribute, c.operator, c.value ?? null);
      }
      for (const d of (data.documents || [])) {
        const name = typeof d === 'string' ? d : d.doc_name;
        db.prepare('INSERT INTO trade_documents (guideline_id, doc_name, is_required) VALUES (?, ?, ?)')
          .run(guidelineId, name, (typeof d === 'object' && d.is_required === 0) ? 0 : 1);
      }
      db.exec('COMMIT');
      return { id: guidelineId };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } finally { db.close(); }
}

function updateGuideline(id, data) {
  const db = getDb();
  try {
    const cols = GUIDELINE_COLUMNS.filter(c => data[c] !== undefined && c !== 'code');
    if (cols.length) {
      db.prepare(`UPDATE trade_guidelines SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
        .run(...cols.map(c => data[c]), id);
    }
    if (Array.isArray(data.conditions)) {
      db.prepare('DELETE FROM trade_rule_conditions WHERE guideline_id = ?').run(id);
      for (const c of data.conditions) {
        db.prepare('INSERT INTO trade_rule_conditions (guideline_id, attribute, operator, value) VALUES (?, ?, ?, ?)')
          .run(id, c.attribute, c.operator, c.value ?? null);
      }
    }
    return db.prepare('SELECT * FROM trade_guidelines WHERE id = ?').get(id);
  } finally { db.close(); }
}

function deleteGuideline(id) {
  const db = getDb();
  try {
    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare('DELETE FROM trade_rule_conditions WHERE guideline_id = ?').run(id);
      db.prepare('DELETE FROM trade_documents WHERE guideline_id = ?').run(id);
      db.prepare('DELETE FROM trade_guidelines WHERE id = ?').run(id);
      db.exec('COMMIT');
      return { deleted: true };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } finally { db.close(); }
}

// ── Reference data (read-only browse) ────────────────────────────────────────
function getAuthorities() {
  const db = getDb();
  try { return db.prepare('SELECT * FROM trade_authorities ORDER BY name').all(); }
  finally { db.close(); }
}

function getCountries() {
  const db = getDb();
  try {
    return db.prepare('SELECT * FROM trade_countries WHERE is_active = 1 ORDER BY country_name').all().map(c => ({
      ...c,
      requirements: c.requirements_json ? safeJson(c.requirements_json) : [],
      restricted_products: c.restricted_products_json ? safeJson(c.restricted_products_json) : [],
      standards: c.standards_json ? safeJson(c.standards_json) : [],
      official_links: c.official_links_json ? safeJson(c.official_links_json) : [],
    }));
  } finally { db.close(); }
}

function getCountryDetail(code) {
  const db = getDb();
  try {
    const c = db.prepare('SELECT * FROM trade_countries WHERE country_code = ?').get(code);
    if (!c) return { error: 'not_found' };
    return {
      ...c,
      requirements: c.requirements_json ? safeJson(c.requirements_json) : [],
      restricted_products: c.restricted_products_json ? safeJson(c.restricted_products_json) : [],
      standards: c.standards_json ? safeJson(c.standards_json) : [],
      official_links: c.official_links_json ? safeJson(c.official_links_json) : [],
    };
  } finally { db.close(); }
}

// ── Document checklist (Document Vault integration) ──────────────────────────
// Mirrors complianceDocumentService.js's upload/version/verify/delete pattern.
const path = require('path');
const fs = require('fs');

function companyDir(companyId) {
  const dir = path.join(__dirname, '../../data/trade', String(companyId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function recordUpload(companyId, requirementId, { file, docName, expiryDate, uploadedBy }) {
  const db = getDb();
  try {
    const req = db.prepare('SELECT id FROM trade_requirements WHERE id = ? AND company_id = ?').get(requirementId, companyId);
    if (!req) return { error: 'not_found' };
    db.exec('BEGIN TRANSACTION');
    try {
      const prevVersion = db.prepare('SELECT MAX(version) v FROM trade_checklists WHERE requirement_id = ? AND doc_name = ?').get(requirementId, docName)?.v || 0;
      db.prepare('UPDATE trade_checklists SET is_current = 0 WHERE requirement_id = ? AND doc_name = ? AND is_current = 1').run(requirementId, docName);
      const info = db.prepare(`
        INSERT INTO trade_checklists (requirement_id, company_id, doc_name, original_name, file_path, mime_type, file_size, status, expiry_date, version, is_current, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?, 1, ?)
      `).run(requirementId, companyId, docName, file.originalname, file.path, file.mimetype, file.size, expiryDate || null, prevVersion + 1, uploadedBy || null);
      logEvent(db, companyId, { requirementId, eventType: 'document_uploaded', detail: docName });
      db.exec('COMMIT');
      return db.prepare('SELECT * FROM trade_checklists WHERE id = ?').get(info.lastInsertRowid);
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } finally { db.close(); }
}

function listChecklistDocuments(companyId, requirementId, { includeHistory = false } = {}) {
  const db = getDb();
  try {
    let sql = 'SELECT * FROM trade_checklists WHERE requirement_id = ? AND company_id = ?';
    if (!includeHistory) sql += ' AND is_current = 1';
    sql += ' ORDER BY doc_name, version DESC';
    return db.prepare(sql).all(requirementId, companyId);
  } finally { db.close(); }
}

function getDocumentForDownload(companyId, docId) {
  const db = getDb();
  try { return db.prepare('SELECT * FROM trade_checklists WHERE id = ? AND company_id = ?').get(docId, companyId) || null; }
  finally { db.close(); }
}

function updateDocument(companyId, docId, patch = {}) {
  const db = getDb();
  try {
    const doc = db.prepare('SELECT * FROM trade_checklists WHERE id = ? AND company_id = ?').get(docId, companyId);
    if (!doc) return { error: 'not_found' };
    const sets = [];
    const params = [];
    if (patch.verified !== undefined) { sets.push('verified = ?', "status = 'verified'"); params.push(patch.verified ? 1 : 0); }
    if (patch.verification_notes !== undefined) { sets.push('verification_notes = ?'); params.push(patch.verification_notes); }
    if (patch.expiry_date !== undefined) { sets.push('expiry_date = ?'); params.push(patch.expiry_date); }
    if (!sets.length) return doc;
    db.prepare(`UPDATE trade_checklists SET ${sets.join(', ')} WHERE id = ?`).run(...params, docId);
    return db.prepare('SELECT * FROM trade_checklists WHERE id = ?').get(docId);
  } finally { db.close(); }
}

function deleteDocument(companyId, docId) {
  const db = getDb();
  try {
    const doc = db.prepare('SELECT * FROM trade_checklists WHERE id = ? AND company_id = ?').get(docId, companyId);
    if (!doc) return { error: 'not_found' };
    if (doc.file_path && fs.existsSync(doc.file_path)) fs.unlinkSync(doc.file_path);
    db.prepare('DELETE FROM trade_checklists WHERE id = ?').run(docId);
    return { deleted: true };
  } finally { db.close(); }
}

// ── AI Trade Copilot — structured-data first, never hallucinate ─────────────
// Mirrors complianceService.js's copilot exactly: regex-routed intents over
// real rows, no LLM call, no invented numbers.
const TRADE_KEYWORDS = ['iec', 'icegate', 'customs', 'ad code', 'rcmc', 'epc', 'lut', 'export', 'import',
  'bis', 'fssai', 'cdsco', 'drug', 'quarantine', 'licen', 'certificate of origin', 'hsn', 'duty', 'duties',
  'dgft', 'shipping bill', 'bill of entry'];

const COUNTRY_ALIASES = [
  { code: 'US', names: ['usa', 'us', 'united states', 'america'] },
  { code: 'EU', names: ['eu', 'europe', 'european union', 'germany', 'france', 'italy'] },
  { code: 'AE', names: ['gcc', 'middle east', 'uae', 'dubai', 'saudi'] },
  { code: 'AU', names: ['australia', 'aussie'] },
  { code: 'SG', names: ['singapore'] },
];

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Word-boundary match — plain q.includes('us') would false-positive inside
// "australia"; short aliases like 'us'/'eu'/'sg' need \b to only match whole words.
function matchCountryCode(q) {
  for (const c of COUNTRY_ALIASES) {
    if (c.names.some(n => new RegExp(`\\b${escapeRegex(n)}\\b`, 'i').test(q))) return c.code;
  }
  return null;
}

function matchGuidelines(items, q) {
  const hits = TRADE_KEYWORDS.filter(k => q.includes(k));
  if (!hits.length) return [];
  return items.filter(it => hits.some(h => it.title.toLowerCase().includes(h) || (it.code || '').toLowerCase().includes(h.replace(/\s/g, ''))));
}

// Best-effort keyword-overlap match against real seeded Q&A pairs — direct,
// grounded answers for exactly-phrased questions before falling back to the
// coarser intent patterns below.
function matchFaq(db, q) {
  const rows = db.prepare("SELECT title, faq_json FROM trade_guidelines WHERE faq_json IS NOT NULL AND faq_json != '[]'").all();
  const qWords = q.split(/\W+/).filter(w => w.length > 3);
  if (!qWords.length) return null;
  let best = null, bestScore = 0;
  for (const row of rows) {
    for (const f of safeJson(row.faq_json)) {
      const fq = String(f.q || '').toLowerCase();
      const score = qWords.filter(w => fq.includes(w)).length;
      if (score > bestScore) { bestScore = score; best = { ...f, guideline: row.title }; }
    }
  }
  return bestScore >= 2 ? best : null;
}

function copilot(companyId, question) {
  const db = getDb();
  try {
    ensureSeed(db);
    const q = String(question || '').toLowerCase();
    const pick = (arr, msg) => ({ source: 'structured', answer: msg(arr), items: arr.slice(0, 12) });

    const items = _requirementsQuery(db, companyId, {});
    if (!items.length) {
      return { source: 'structured', answer: 'No trade requirements yet. Complete your import/export profile (enable Import/Export, and tell us if you manufacture or trade goods) so I can work out what applies to your business.', items: [] };
    }
    const matched = matchGuidelines(items, q);

    // Country-specific: "what do I need to export to USA?" / "can I export to Germany?"
    const countryCode = matchCountryCode(q);
    if (countryCode && /(export|import|ship|sell|countr|duty|duties|require|need|restrict|standard)/.test(q)) {
      const c = db.prepare('SELECT * FROM trade_countries WHERE country_code = ?').get(countryCode);
      if (!c) return { source: 'structured', answer: `I don't have destination data for that country yet.`, items: [] };
      const reqs = safeJson(c.requirements_json);
      const restricted = safeJson(c.restricted_products_json);
      const standards = safeJson(c.standards_json);
      return {
        source: 'structured',
        answer: `${c.country_name}: ${reqs.length ? `requirements — ${reqs.join(', ')}. ` : ''}`
          + `${c.import_duties_notes ? `Duties: ${c.import_duties_notes}. ` : ''}`
          + `${standards.length ? `Standards: ${standards.join(', ')}. ` : ''}`
          + `${restricted.length ? `Restricted/controlled products: ${restricted.join(', ')}. ` : ''}`
          + `${c.shipping_notes ? `Shipping: ${c.shipping_notes}.` : ''}`,
        items: [],
      };
    }

    // "how do I renew/apply for my IEC?" — grounded, step-by-step from guideline data.
    if (/(how (do|to|can).*(renew|apply|file|get)|renew.*(how|process)|process to)/.test(q) && matched.length) {
      const r = matched[0];
      return {
        source: 'structured',
        answer: `To handle "${r.title}": file with ${r.department || 'the relevant authority'}${r.official_website ? ` via ${r.official_website}` : ''}. `
          + `${r.fees ? `Fees: ${r.fees}. ` : ''}${r.processing_time ? `Typical time: ${r.processing_time}. ` : ''}`
          + `${r.renewal_requirement ? `Renewal: ${r.renewal_requirement}. ` : ''}`
          + `Required documents: ${r.required_docs || 0} item(s) — see the item's Documents tab.`,
        items: matched.slice(0, 4),
      };
    }
    // "what happens if I miss GST filing?" — penalty from guideline data.
    if (/(what happens|if i miss|miss.*(deadline|filing|renewal)|penalt|late fee|fine)/.test(q) && matched.length) {
      return pick(matched, a => a.map(x => `${x.title}: ${x.penalty_info || 'penalties may apply for late/non-compliance.'}`).join(' | '));
    }
    // "explain IEC" / "what is RCMC" / "why do I need this"
    if (/(explain|what is|tell me about|why.*(need|file))/.test(q) && matched.length) {
      return pick(matched, a => a.map(x => `${x.title}: ${x.ai_explanation || x.description || ''}${x.department ? ` (Authority: ${x.department}.)` : ''}`).join(' | '));
    }
    // "what documents are missing?"
    if (/(document|proof|upload|paperwork)/.test(q)) {
      const missing = items.filter(it => it.missingDocs > 0);
      return pick(missing, a => a.length
        ? `${a.length} item(s) need documents: ${a.map(x => `${x.title} (${x.missingDocs} missing)`).join('; ')}.`
        : 'All required documents have been uploaded. Nothing missing.');
    }
    // "what do I need to file this month?"
    if (/(this month|due this month|file.*month|month.*due|what should i do)/.test(q)) {
      const inMonth = items.filter(it => it.daysRemaining != null && it.daysRemaining >= 0 && it.daysRemaining <= 31 && it.status !== 'completed');
      return pick(inMonth, a => a.length
        ? `You have ${a.length} item(s) due within the next 31 days: ${a.map(x => `${x.title} (in ${x.daysRemaining}d)`).join('; ')}.`
        : 'Nothing is due in the next month. You are on track.');
    }
    // "what expires next?" / renewals
    if (/(expire|expiry|renew|renewal|next month|expires next)/.test(q)) {
      const soon = items.filter(it => (it.frequency === 'renewal' || it.category === 'licensing') && it.daysRemaining != null && it.daysRemaining <= 90 && it.status !== 'completed');
      return pick(soon, a => a.length
        ? `${a.length} licence/renewal(s) coming up: ${a.map(x => `${x.title} (in ${x.daysRemaining}d)`).join('; ')}.`
        : 'No licences or renewals are due in the next 90 days.');
    }
    // "which registrations/licenses do I need?"
    if (/(licen|regist)/.test(q)) {
      const lic = items.filter(it => (it.category === 'registration' || it.category === 'licensing') && it.status !== 'completed');
      return pick(lic, a => a.length ? `Registrations/licences to action: ${a.map(x => x.title).join('; ')}.` : 'All your trade registrations/licences are marked complete.');
    }
    // "which laws/rules apply to me?" / mandatory
    if (/(which law|what law|apply to me|mandatory|required|must|compulsor|all requirement|everything)/.test(q)) {
      const mand = items.filter(it => it.mandatory === 1);
      return pick(mand, a => `${a.length} obligations apply to your import/export business: ${a.map(x => x.title).join('; ')}.`);
    }

    // FAQ fallback — grounded answer for phrased questions that don't fit any
    // structured intent above (tried last so it can't shadow the specific branches).
    const faq = matchFaq(db, q);
    if (faq) {
      return { source: 'structured', answer: `${faq.a} (Re: ${faq.guideline})`, items: [] };
    }

    // No structured rule matched — say so honestly instead of guessing with a
    // generic status summary that wouldn't actually address the question.
    return { source: 'structured', answer: "This topic is not currently available in the BizBook knowledge base.", items: [] };
  } finally { db.close(); }
}

module.exports = {
  ensureSeed, getProfile, saveProfile,
  getGuidelines, getGuidelineDetail,
  recompute, getRequirements, getOverview, getRequirementDetail, updateRequirement,
  listGuidelinesAdmin, createGuideline, updateGuideline, deleteGuideline,
  getAuthorities, getCountries, getCountryDetail,
  companyDir, recordUpload, listChecklistDocuments, getDocumentForDownload, updateDocument, deleteDocument,
  copilot,
};
