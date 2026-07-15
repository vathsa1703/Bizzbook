// ============================================================================
// Trade Rule Engine — the "brain" for Import & Export Intelligence.
// Pure, deterministic, data-driven — mirrors complianceRuleEngine.js exactly.
// Given a business profile (the SAME business_compliance_profile Compliance
// uses, extended with import_enabled/export_enabled/is_manufacturer/is_trader/
// is_service_provider/iec_number) and the guideline set (trade_guidelines +
// trade_rule_conditions loaded from the DB), it decides which guidelines apply
// and when each is next due. Contains NO hardcoded guidelines — those live
// entirely in the trade_guidelines / trade_rule_conditions tables.
// ============================================================================

const BOOL_ATTRS = new Set([
  'gst_registered', 'import_export', 'fssai_required', 'drug_license', 'has_factory',
  'multiple_branches', 'msme', 'startup_registered',
  'import_enabled', 'export_enabled', 'is_manufacturer', 'is_trader', 'is_service_provider',
  // Derived (computed from the raw profile below, not stored columns):
  'trade_active', 'goods_trader',
]);
const NUMERIC_ATTRS = new Set(['annual_turnover', 'employee_count']);

function toBool(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

// Adds derived boolean attributes the rule set can condition on, without
// requiring a stored column for each. trade_active = imports OR exports.
// goods_trader = manufactures OR trades physical goods (used to keep
// goods-specific requirements like RCMC/EPC/Shipping docs off pure service
// businesses that happen to export/import).
function normalizeProfile(profile) {
  return {
    ...profile,
    trade_active: toBool(profile.import_enabled) || toBool(profile.export_enabled),
    goods_trader: toBool(profile.is_manufacturer) || toBool(profile.is_trader),
  };
}

// Evaluate a single condition row against the (normalized) profile. Unknown
// attributes fail closed (return false) so a malformed rule never becomes
// accidentally applicable.
function evaluateCondition(profile, cond) {
  const attr = cond.attribute;
  const op = cond.operator;
  const raw = profile[attr];

  if (BOOL_ATTRS.has(attr)) {
    const val = toBool(raw);
    if (op === 'is_true') return val === true;
    if (op === 'is_false') return val === false;
    if (op === 'eq') return val === toBool(cond.value);
    if (op === 'neq') return val !== toBool(cond.value);
    return false;
  }

  if (NUMERIC_ATTRS.has(attr)) {
    const a = Number(raw || 0);
    const b = Number(cond.value || 0);
    switch (op) {
      case 'gt':  return a > b;
      case 'gte': return a >= b;
      case 'lt':  return a < b;
      case 'lte': return a <= b;
      case 'eq':  return a === b;
      case 'neq': return a !== b;
      default:    return false;
    }
  }

  // String attributes (entity_type, industry, state, country, business_type...)
  const a = (raw == null ? '' : String(raw)).trim().toLowerCase();
  const b = (cond.value == null ? '' : String(cond.value)).trim().toLowerCase();
  switch (op) {
    case 'eq':  return a === b;
    case 'neq': return a !== b;
    case 'in':  return b.split(',').map(s => s.trim().toLowerCase()).includes(a);
    default:    return false;
  }
}

// A guideline applies when country matches, its state is null or matches, and
// ALL of its conditions pass (AND semantics). No conditions => applies to
// everyone in that country/state.
function isRuleApplicable(rule, conditions, profile) {
  if (rule.country && profile.country &&
      String(rule.country).toUpperCase() !== String(profile.country).toUpperCase()) {
    return false;
  }
  if (rule.state && profile.state &&
      String(rule.state).trim().toLowerCase() !== String(profile.state).trim().toLowerCase()) {
    return false;
  }
  if (rule.state && !profile.state) return false;
  return (conditions || []).every(c => evaluateCondition(profile, c));
}

// ── Date helpers (local, formatted as YYYY-MM-DD; no TZ drift) ───────────────
function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function daysInMonth(year, month1) { return new Date(year, month1, 0).getDate(); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); }

function nextPeriodicDue(from, periodMonths, anchorDay, anchorMonth) {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 24; i++) {
    const probe = new Date(from.getFullYear(), from.getMonth() + i, 1);
    const m1 = probe.getMonth() + 1;
    if (anchorMonth) {
      if ((((m1 - anchorMonth) % periodMonths) + periodMonths) % periodMonths !== 0) continue;
    } else if (i % periodMonths !== 0) {
      continue;
    }
    const day = Math.min(anchorDay, daysInMonth(probe.getFullYear(), m1));
    const candidate = new Date(probe.getFullYear(), m1 - 1, day);
    if (candidate >= today) return candidate;
  }
  return addMonths(today, periodMonths);
}

const PERIOD_MONTHS = { monthly: 1, quarterly: 3, half_yearly: 6, annual: 12 };

// Compute the next due date for a guideline. `lastDate` is the last
// completion/renewal date (used for 'renewal' frequency). Returns
// 'YYYY-MM-DD' or null (one_time).
function computeNextDueDate(rule, fromDate = new Date(), lastDate = null) {
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const freq = rule.frequency;

  if (freq === 'one_time') return null;

  if (freq === 'renewal') {
    const months = rule.renewal_interval_months || 12;
    const base = lastDate ? new Date(lastDate) : from;
    return fmt(addMonths(base, months));
  }

  const period = PERIOD_MONTHS[freq];
  if (!period) return null;
  const anchorDay = rule.due_day || 15;
  const anchorMonth = rule.due_month || null;
  return fmt(nextPeriodicDue(from, period, anchorDay, anchorMonth));
}

// Load active guidelines for a country and attach their conditions.
function loadGuidelinesForCountry(db, country = 'IN') {
  const guidelines = db.prepare(
    'SELECT * FROM trade_guidelines WHERE is_active = 1 AND country = ?'
  ).all(country);
  const condStmt = db.prepare('SELECT attribute, operator, value FROM trade_rule_conditions WHERE guideline_id = ?');
  for (const g of guidelines) g._conditions = condStmt.all(g.id);
  return guidelines;
}

// Main entry: return the list of applicable guidelines (with a computed
// next_due_date) for a given profile. Does not touch company tables — that's
// the service's job.
function computeApplicable(db, profile) {
  const normalized = normalizeProfile(profile);
  const guidelines = loadGuidelinesForCountry(db, profile.country || 'IN');
  const applicable = [];
  for (const guideline of guidelines) {
    if (isRuleApplicable(guideline, guideline._conditions, normalized)) {
      applicable.push({ guideline, nextDueDate: computeNextDueDate(guideline) });
    }
  }
  return applicable;
}

module.exports = {
  toBool,
  normalizeProfile,
  evaluateCondition,
  isRuleApplicable,
  computeNextDueDate,
  loadGuidelinesForCountry,
  computeApplicable,
};
