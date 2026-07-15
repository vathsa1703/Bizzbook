// ============================================================================
// Compliance Rule Engine — the "brain".
// Pure, deterministic, data-driven. Given a business profile and the rule set
// (rules + conditions loaded from the DB), it decides which rules apply and when
// each is next due. It contains NO hardcoded rules — those live entirely in the
// compliance_rules / compliance_rule_conditions tables.
// ============================================================================

const BOOL_ATTRS = new Set([
  'gst_registered', 'import_export', 'fssai_required', 'drug_license',
  'has_factory', 'multiple_branches', 'msme', 'startup_registered',
]);
const NUMERIC_ATTRS = new Set(['annual_turnover', 'employee_count']);

function toBool(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

// Evaluate a single condition row against the profile. Unknown attributes fail
// closed (return false) so a malformed rule never becomes accidentally applicable.
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

  // String attributes (entity_type, industry, state, country, ...)
  const a = (raw == null ? '' : String(raw)).trim().toLowerCase();
  const b = (cond.value == null ? '' : String(cond.value)).trim().toLowerCase();
  switch (op) {
    case 'eq':  return a === b;
    case 'neq': return a !== b;
    case 'in':  return b.split(',').map(s => s.trim().toLowerCase()).includes(a);
    default:    return false;
  }
}

// A rule applies when country matches, its state is null or matches, and ALL of
// its conditions pass (AND semantics). No conditions => applies to everyone in
// that country/state.
function isRuleApplicable(rule, conditions, profile) {
  if (rule.country && profile.country &&
      String(rule.country).toUpperCase() !== String(profile.country).toUpperCase()) {
    return false;
  }
  if (rule.state && profile.state &&
      String(rule.state).trim().toLowerCase() !== String(profile.state).trim().toLowerCase()) {
    return false;
  }
  if (rule.state && !profile.state) return false; // rule targets a state, profile has none
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
    const m1 = probe.getMonth() + 1; // 1..12
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

// Compute the next due date for a rule. `lastDate` is the last completion/renewal
// date (used for 'renewal' frequency). Returns 'YYYY-MM-DD' or null (one_time).
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

// Load active rules for a country and attach their conditions.
function loadRulesForCountry(db, country = 'IN') {
  const rules = db.prepare(
    'SELECT * FROM compliance_rules WHERE is_active = 1 AND country = ?'
  ).all(country);
  const condStmt = db.prepare('SELECT attribute, operator, value FROM compliance_rule_conditions WHERE rule_id = ?');
  for (const r of rules) r._conditions = condStmt.all(r.id);
  return rules;
}

// Main entry: return the list of applicable rules (with a computed next_due_date)
// for a given profile. Does not touch company tables — that's the service's job.
function computeApplicable(db, profile) {
  const rules = loadRulesForCountry(db, profile.country || 'IN');
  const applicable = [];
  for (const rule of rules) {
    if (isRuleApplicable(rule, rule._conditions, profile)) {
      applicable.push({ rule, nextDueDate: computeNextDueDate(rule) });
    }
  }
  return applicable;
}

module.exports = {
  evaluateCondition,
  isRuleApplicable,
  computeNextDueDate,
  loadRulesForCountry,
  computeApplicable,
};
