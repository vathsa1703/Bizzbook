// ============================================================================
// Compliance seed data — India (IN).
// This is DATA, not logic. Adding a new country/state/industry rule means adding
// an entry here (or POSTing to /api/compliance/rules) — never a code change.
// seedCompliance(db) is idempotent: rules are keyed by their unique `code`, and
// conditions/documents are only inserted when a rule is first created, so admin
// edits made later via the API are never clobbered on restart.
// ============================================================================

const CATEGORIES = [
  { key: 'tax',         name: 'Taxes',                 icon: 'Landmark',   sort_order: 1 },
  { key: 'filings',     name: 'Government Filings',    icon: 'FileText',   sort_order: 2 },
  { key: 'licenses',    name: 'Licenses',              icon: 'BadgeCheck', sort_order: 3 },
  { key: 'renewals',    name: 'Renewals',              icon: 'RefreshCw',  sort_order: 4 },
  { key: 'employee',    name: 'Employee Compliance',   icon: 'Users',      sort_order: 5 },
  { key: 'meetings',    name: 'Meetings',              icon: 'Gavel',      sort_order: 6 },
  { key: 'operational', name: 'Operational',           icon: 'Settings',   sort_order: 7 },
  { key: 'documents',   name: 'Documents',             icon: 'FolderLock', sort_order: 8 },
];

// Each rule: { ...columns, conditions: [{attribute, operator, value}], documents: ['..'] }
const RULES = [
  // ── Taxes / GST ──────────────────────────────────────────────────────────
  {
    code: 'IN_GSTR1', country: 'IN', title: 'GSTR-1 (Outward Supplies Return)',
    description: 'Monthly statement of outward supplies (sales) filed on the GST portal.',
    category_key: 'tax', department: 'GSTN / CBIC', portal_url: 'https://www.gst.gov.in',
    mandatory: 1, frequency: 'monthly', due_day: 11, grace_period_days: 0,
    penalty_info: '₹50/day late fee (₹20/day for nil returns), plus 18% p.a. interest.',
    priority: 'high',
    ai_explanation: 'Because your business is GST-registered, you must report all sales invoices monthly in GSTR-1 by the 11th of the following month.',
    conditions: [{ attribute: 'gst_registered', operator: 'is_true', value: null }],
    documents: ['Sales Invoices', 'Credit/Debit Notes', 'GST Certificate'],
  },
  {
    code: 'IN_GSTR3B', country: 'IN', title: 'GSTR-3B (Summary Return & Tax Payment)',
    description: 'Monthly summary return with net GST liability and input tax credit.',
    category_key: 'tax', department: 'GSTN / CBIC', portal_url: 'https://www.gst.gov.in',
    mandatory: 1, frequency: 'monthly', due_day: 20, grace_period_days: 0,
    penalty_info: '₹50/day late fee (₹20/day nil) + 18% p.a. interest on tax due.',
    priority: 'critical',
    ai_explanation: 'GSTR-3B is where you actually pay your monthly GST. Due by the 20th of the following month for GST-registered businesses.',
    conditions: [{ attribute: 'gst_registered', operator: 'is_true', value: null }],
    documents: ['Purchase Invoices', 'Sales Summary', 'ITC Ledger'],
  },
  {
    code: 'IN_GSTR9', country: 'IN', title: 'GSTR-9 (Annual GST Return)',
    description: 'Annual consolidated GST return. Mandatory above ₹2 crore turnover.',
    category_key: 'filings', department: 'GSTN / CBIC', portal_url: 'https://www.gst.gov.in',
    mandatory: 1, frequency: 'annual', due_month: 12, due_day: 31, grace_period_days: 0,
    penalty_info: '₹200/day (capped at 0.5% of turnover).', priority: 'high',
    ai_explanation: 'Your turnover crosses ₹2 crore, so the annual reconciliation return GSTR-9 is mandatory, due 31 December.',
    conditions: [
      { attribute: 'gst_registered', operator: 'is_true', value: null },
      { attribute: 'annual_turnover', operator: 'gt', value: '20000000' },
    ],
    documents: ['All GSTR-1 filings', 'All GSTR-3B filings', 'Audited Financials'],
  },
  {
    code: 'IN_ITR', country: 'IN', title: 'Income Tax Return (ITR)',
    description: 'Annual income tax return for the business/entity.',
    category_key: 'tax', department: 'Income Tax Department', portal_url: 'https://www.incometax.gov.in',
    mandatory: 1, frequency: 'annual', due_month: 7, due_day: 31, grace_period_days: 0,
    penalty_info: 'Up to ₹5,000 late fee u/s 234F + interest u/s 234A.', priority: 'high',
    ai_explanation: 'Every business must file an annual income tax return. Non-audit cases are due 31 July.',
    conditions: [],
    documents: ['PAN', 'Financial Statements', 'Bank Statements', 'TDS Certificates'],
  },
  {
    code: 'IN_ADVANCE_TAX', country: 'IN', title: 'Advance Tax (Quarterly)',
    description: 'Pay-as-you-earn income tax in four instalments across the year.',
    category_key: 'tax', department: 'Income Tax Department', portal_url: 'https://www.incometax.gov.in',
    mandatory: 1, frequency: 'quarterly', due_day: 15, grace_period_days: 0,
    penalty_info: 'Interest u/s 234B & 234C on shortfall.', priority: 'medium',
    ai_explanation: 'If your tax liability exceeds ₹10,000/year, advance tax is payable in quarterly instalments (Jun/Sep/Dec/Mar).',
    conditions: [{ attribute: 'annual_turnover', operator: 'gt', value: '1000000' }],
    documents: ['Profit Estimate', 'Previous ITR'],
  },
  {
    code: 'IN_TDS_RETURN', country: 'IN', title: 'TDS Return (Quarterly)',
    description: 'Quarterly return of tax deducted at source on salaries/payments.',
    category_key: 'filings', department: 'Income Tax Department (TRACES)', portal_url: 'https://www.tdscpc.gov.in',
    mandatory: 1, frequency: 'quarterly', due_day: 31, grace_period_days: 0,
    penalty_info: '₹200/day u/s 234E until filed, plus penalty u/s 271H.', priority: 'high',
    ai_explanation: 'With employees on payroll, you deduct TDS and must file quarterly TDS returns (Form 24Q/26Q).',
    conditions: [{ attribute: 'employee_count', operator: 'gt', value: '0' }],
    documents: ['Salary Register', 'PAN of Deductees', 'Challan Details'],
  },
  {
    code: 'IN_PROF_TAX', country: 'IN', title: 'Professional Tax Return',
    description: 'State professional tax on salaries/trades (state-dependent).',
    category_key: 'tax', department: 'State Commercial Tax Dept', portal_url: null,
    mandatory: 0, frequency: 'monthly', due_day: 20, grace_period_days: 0,
    penalty_info: 'State-specific penalty & interest on delayed payment.', priority: 'medium',
    ai_explanation: 'Most states levy professional tax on employers with staff. Rates and due dates vary by state.',
    conditions: [{ attribute: 'employee_count', operator: 'gt', value: '0' }],
    documents: ['Employee Salary Register', 'PT Registration Certificate'],
  },

  // ── Employee compliance ──────────────────────────────────────────────────
  {
    code: 'IN_EPF', country: 'IN', title: 'EPF (Provident Fund) Contribution',
    description: 'Monthly PF contribution & ECR filing. Mandatory at 20+ employees.',
    category_key: 'employee', department: 'EPFO', portal_url: 'https://www.epfindia.gov.in',
    mandatory: 1, frequency: 'monthly', due_day: 15, grace_period_days: 0,
    penalty_info: 'Damages u/s 14B (5–25% p.a.) + interest u/s 7Q.', priority: 'high',
    ai_explanation: 'You employ 20 or more people, so EPF registration and monthly contributions (by the 15th) are mandatory.',
    conditions: [{ attribute: 'employee_count', operator: 'gte', value: '20' }],
    documents: ['ECR File', 'Employee UAN List', 'PF Challan'],
  },
  {
    code: 'IN_ESI', country: 'IN', title: 'ESIC Contribution',
    description: 'Employee State Insurance monthly contribution. Mandatory at 10+ employees.',
    category_key: 'employee', department: 'ESIC', portal_url: 'https://www.esic.gov.in',
    mandatory: 1, frequency: 'monthly', due_day: 15, grace_period_days: 0,
    penalty_info: 'Interest 12% p.a. + damages up to 25%.', priority: 'high',
    ai_explanation: 'With 10 or more employees, ESIC registration and monthly contributions (by the 15th) are required.',
    conditions: [{ attribute: 'employee_count', operator: 'gte', value: '10' }],
    documents: ['Employee IP Numbers', 'ESI Challan', 'Wage Register'],
  },

  // ── Licenses & renewals ──────────────────────────────────────────────────
  {
    code: 'IN_FSSAI', country: 'IN', title: 'FSSAI Food License Renewal',
    description: 'Food safety license/registration — renew before expiry.',
    category_key: 'licenses', department: 'FSSAI', portal_url: 'https://foscos.fssai.gov.in',
    mandatory: 1, frequency: 'renewal', renewal_interval_months: 12, grace_period_days: 30,
    penalty_info: 'Operating on an expired licence: fine up to ₹5 lakh.', priority: 'high',
    ai_explanation: 'Any business handling food needs a valid FSSAI licence; it must be renewed before expiry (1–5 year terms).',
    conditions: [{ attribute: 'fssai_required', operator: 'is_true', value: null }],
    documents: ['FSSAI Certificate', 'Layout Plan', 'Water Test Report'],
  },
  {
    code: 'IN_TRADE_LICENSE', country: 'IN', title: 'Trade License Renewal',
    description: 'Municipal trade license authorising the business to operate locally.',
    category_key: 'licenses', department: 'Local Municipal Corporation', portal_url: null,
    mandatory: 1, frequency: 'renewal', renewal_interval_months: 12, grace_period_days: 30,
    penalty_info: 'Municipal penalty; risk of sealing premises.', priority: 'medium',
    ai_explanation: 'Local bodies require a trade licence for commercial premises, typically renewed every financial year.',
    conditions: [{ attribute: 'industry', operator: 'in', value: 'Retail,Restaurant,Manufacturing,Pharmacy,Wholesale' }],
    documents: ['Trade License Certificate', 'Property Tax Receipt', 'Rent Agreement'],
  },
  {
    code: 'IN_SHOP_ESTABLISHMENT', country: 'IN', title: 'Shop & Establishment Registration',
    description: 'Registration under the state Shops & Establishments Act.',
    category_key: 'licenses', department: 'State Labour Department', portal_url: null,
    mandatory: 1, frequency: 'renewal', renewal_interval_months: 12, grace_period_days: 30,
    penalty_info: 'State-specific fine for operating unregistered.', priority: 'medium',
    ai_explanation: 'Almost every commercial establishment with employees must register under the Shops & Establishments Act of its state.',
    conditions: [],
    documents: ['Shop & Establishment Certificate', 'Address Proof', 'Owner ID'],
  },
  {
    code: 'IN_FIRE_NOC', country: 'IN', title: 'Fire Safety NOC Renewal',
    description: 'Fire department No-Objection-Certificate for the premises.',
    category_key: 'renewals', department: 'State Fire & Emergency Services', portal_url: null,
    mandatory: 1, frequency: 'renewal', renewal_interval_months: 12, grace_period_days: 15,
    penalty_info: 'Premises can be sealed; liability on fire incidents.', priority: 'high',
    ai_explanation: 'Restaurants, factories and larger premises need a valid Fire NOC, renewed periodically after inspection.',
    conditions: [{ attribute: 'industry', operator: 'in', value: 'Restaurant,Manufacturing,Healthcare' }],
    documents: ['Fire NOC Certificate', 'Building Plan', 'Fire Equipment List'],
  },
  {
    code: 'IN_DRUG_LICENSE', country: 'IN', title: 'Drug License Renewal',
    description: 'Retail/wholesale drug licence from the State Drug Control authority.',
    category_key: 'licenses', department: 'State Drugs Control Department', portal_url: null,
    mandatory: 1, frequency: 'renewal', renewal_interval_months: 24, grace_period_days: 30,
    penalty_info: 'Selling drugs without a valid licence is a punishable offence.', priority: 'critical',
    ai_explanation: 'Pharmacies must hold a valid drug licence (Form 20/21); renew before expiry to keep selling medicines legally.',
    conditions: [{ attribute: 'drug_license', operator: 'is_true', value: null }],
    documents: ['Drug License', 'Pharmacist Registration', 'Premises Proof'],
  },
  {
    code: 'IN_FACTORY_LICENSE', country: 'IN', title: 'Factory License Renewal',
    description: 'Registration/licence under the Factories Act for manufacturing units.',
    category_key: 'renewals', department: 'State Directorate of Factories & Boilers', portal_url: null,
    mandatory: 1, frequency: 'renewal', renewal_interval_months: 12, grace_period_days: 30,
    penalty_info: 'Penalty under the Factories Act; risk of closure.', priority: 'high',
    ai_explanation: 'A registered factory must hold a valid factory licence and renew it annually.',
    conditions: [{ attribute: 'has_factory', operator: 'is_true', value: null }],
    documents: ['Factory License', 'Building Stability Certificate', 'Worker Register'],
  },
  {
    code: 'IN_POLLUTION_CTO', country: 'IN', title: 'Pollution Control Consent (CTO) Renewal',
    description: 'Consent to Operate from the State Pollution Control Board.',
    category_key: 'renewals', department: 'State Pollution Control Board', portal_url: null,
    mandatory: 1, frequency: 'renewal', renewal_interval_months: 12, grace_period_days: 30,
    penalty_info: 'Environmental penalties; risk of closure notice.', priority: 'medium',
    ai_explanation: 'Manufacturing units need a valid Consent to Operate from the Pollution Control Board.',
    conditions: [{ attribute: 'has_factory', operator: 'is_true', value: null }],
    documents: ['CTO Certificate', 'Effluent Test Reports'],
  },
  {
    code: 'IN_IEC_UPDATE', country: 'IN', title: 'IEC Annual Update',
    description: 'Import Export Code must be electronically updated every year.',
    category_key: 'filings', department: 'DGFT', portal_url: 'https://www.dgft.gov.in',
    mandatory: 1, frequency: 'annual', due_month: 6, due_day: 30, grace_period_days: 0,
    penalty_info: 'IEC gets deactivated if not updated between April–June.', priority: 'medium',
    ai_explanation: 'Businesses that import/export hold an IEC, which must be confirmed/updated annually (Apr–Jun) or it is deactivated.',
    conditions: [{ attribute: 'import_export', operator: 'is_true', value: null }],
    documents: ['IEC Certificate', 'PAN', 'Bank Details'],
  },
  {
    code: 'IN_UDYAM', country: 'IN', title: 'Udyam (MSME) Registration',
    description: 'One-time MSME registration on the Udyam portal.',
    category_key: 'licenses', department: 'Ministry of MSME', portal_url: 'https://udyamregistration.gov.in',
    mandatory: 0, frequency: 'one_time', grace_period_days: 0,
    penalty_info: 'No penalty, but required to claim MSME benefits/subsidies.', priority: 'low',
    ai_explanation: 'Registering as an MSME (Udyam) unlocks priority lending, subsidies and protection against delayed payments.',
    conditions: [{ attribute: 'msme', operator: 'is_true', value: null }],
    documents: ['Aadhaar', 'PAN', 'Bank Account Details'],
  },

  // ── Company statutory filings & meetings (entity-driven) ─────────────────
  {
    code: 'IN_ROC_AOC4', country: 'IN', title: 'ROC Annual Filing — AOC-4 (Financials)',
    description: 'Filing of annual financial statements with the Registrar of Companies.',
    category_key: 'filings', department: 'MCA / Registrar of Companies', portal_url: 'https://www.mca.gov.in',
    mandatory: 1, frequency: 'annual', due_month: 10, due_day: 30, grace_period_days: 0,
    penalty_info: '₹100/day of delay, no upper cap.', priority: 'high',
    ai_explanation: 'Registered companies must file audited financials (AOC-4) with the ROC within 30 days of the AGM.',
    conditions: [{ attribute: 'entity_type', operator: 'in', value: 'Private Limited,OPC,Public Limited' }],
    documents: ['Audited Balance Sheet', 'Board Report', 'Auditor Report'],
  },
  {
    code: 'IN_ROC_MGT7', country: 'IN', title: 'ROC Annual Return — MGT-7',
    description: 'Annual return of the company filed with the Registrar of Companies.',
    category_key: 'filings', department: 'MCA / Registrar of Companies', portal_url: 'https://www.mca.gov.in',
    mandatory: 1, frequency: 'annual', due_month: 11, due_day: 29, grace_period_days: 0,
    penalty_info: '₹100/day of delay, no upper cap.', priority: 'high',
    ai_explanation: 'Companies file the annual return MGT-7 within 60 days of the AGM.',
    conditions: [{ attribute: 'entity_type', operator: 'in', value: 'Private Limited,OPC,Public Limited' }],
    documents: ['Shareholding Pattern', 'List of Directors', 'AGM Minutes'],
  },
  {
    code: 'IN_AGM', country: 'IN', title: 'Annual General Meeting (AGM)',
    description: 'Statutory annual general meeting of shareholders.',
    category_key: 'meetings', department: 'MCA (Companies Act 2013)', portal_url: 'https://www.mca.gov.in',
    mandatory: 1, frequency: 'annual', due_month: 9, due_day: 30, grace_period_days: 0,
    penalty_info: 'Fine up to ₹1 lakh + ₹5,000/day continuing default.', priority: 'high',
    ai_explanation: 'Companies must hold an AGM each year within 6 months of the financial year end (by 30 September).',
    conditions: [{ attribute: 'entity_type', operator: 'in', value: 'Private Limited,Public Limited' }],
    documents: ['Notice of AGM', 'AGM Minutes', 'Attendance Register'],
  },
  {
    code: 'IN_BOARD_MEETING', country: 'IN', title: 'Board Meeting (Quarterly)',
    description: 'Companies must hold a minimum number of board meetings each year.',
    category_key: 'meetings', department: 'MCA (Companies Act 2013)', portal_url: 'https://www.mca.gov.in',
    mandatory: 1, frequency: 'quarterly', due_day: 30, grace_period_days: 0,
    penalty_info: 'Penalty for gap exceeding 120 days between meetings.', priority: 'medium',
    ai_explanation: 'A company must hold at least 4 board meetings a year with no more than 120 days between two meetings.',
    conditions: [{ attribute: 'entity_type', operator: 'in', value: 'Private Limited,OPC,Public Limited' }],
    documents: ['Board Meeting Notice', 'Minutes', 'Attendance Register', 'Resolutions'],
  },
  {
    code: 'IN_LLP_FORM11', country: 'IN', title: 'LLP Annual Return — Form 11',
    description: 'Annual return of the LLP filed with the ROC.',
    category_key: 'filings', department: 'MCA / Registrar of Companies', portal_url: 'https://www.mca.gov.in',
    mandatory: 1, frequency: 'annual', due_month: 5, due_day: 30, grace_period_days: 0,
    penalty_info: '₹100/day of delay, no upper cap.', priority: 'high',
    ai_explanation: 'Every LLP files Form 11 (annual return) by 30 May, regardless of turnover.',
    conditions: [{ attribute: 'entity_type', operator: 'eq', value: 'LLP' }],
    documents: ['Partner Details', 'Contribution Details'],
  },
  {
    code: 'IN_LLP_FORM8', country: 'IN', title: 'LLP Statement of Accounts — Form 8',
    description: 'Statement of accounts & solvency of the LLP filed with the ROC.',
    category_key: 'filings', department: 'MCA / Registrar of Companies', portal_url: 'https://www.mca.gov.in',
    mandatory: 1, frequency: 'annual', due_month: 10, due_day: 30, grace_period_days: 0,
    penalty_info: '₹100/day of delay, no upper cap.', priority: 'high',
    ai_explanation: 'Every LLP files Form 8 (statement of accounts & solvency) by 30 October.',
    conditions: [{ attribute: 'entity_type', operator: 'eq', value: 'LLP' }],
    documents: ['Statement of Accounts', 'Solvency Declaration'],
  },
];

// Government Resource Center data, keyed by rule code. Applied idempotently
// (only fills columns that are still NULL) so admin edits are never overwritten.
const RESOURCES = {
  IN_GSTR1:   { processing_fee: '₹0 (online filing)', typical_timeline: 'Immediate (self-filed)', guide_url: 'https://tutorial.gst.gov.in/', forms: [{ name: 'GSTR-1', url: 'https://www.gst.gov.in' }] },
  IN_GSTR3B:  { processing_fee: '₹0 (plus tax due)', typical_timeline: 'Immediate (self-filed)', guide_url: 'https://tutorial.gst.gov.in/', forms: [{ name: 'GSTR-3B', url: 'https://www.gst.gov.in' }] },
  IN_GSTR9:   { processing_fee: '₹0 (online filing)', typical_timeline: 'Self-filed', guide_url: 'https://tutorial.gst.gov.in/', forms: [{ name: 'GSTR-9', url: 'https://www.gst.gov.in' }] },
  IN_ITR:     { processing_fee: '₹0 (self-filed)', typical_timeline: 'Immediate; refund 20–45 days', guide_url: 'https://www.incometax.gov.in/iec/foportal/help', forms: [{ name: 'ITR Forms', url: 'https://www.incometax.gov.in' }] },
  IN_TDS_RETURN: { processing_fee: '₹0', typical_timeline: 'Self-filed', guide_url: 'https://www.tdscpc.gov.in', forms: [{ name: 'Form 24Q/26Q', url: 'https://www.tdscpc.gov.in' }] },
  IN_EPF:     { processing_fee: '₹0 (plus contribution)', typical_timeline: 'Immediate (ECR upload)', guide_url: 'https://www.epfindia.gov.in', forms: [{ name: 'ECR', url: 'https://unifiedportal-emp.epfindia.gov.in' }] },
  IN_ESI:     { processing_fee: '₹0 (plus contribution)', typical_timeline: 'Immediate', guide_url: 'https://www.esic.gov.in', forms: [{ name: 'ESI Challan', url: 'https://www.esic.gov.in' }] },
  IN_FSSAI:   { processing_fee: '₹100–₹7,500 by tier', typical_timeline: '7–60 working days', guide_url: 'https://foscos.fssai.gov.in', forms: [{ name: 'Form A/B', url: 'https://foscos.fssai.gov.in' }] },
  IN_TRADE_LICENSE: { processing_fee: 'State/municipal-specific', typical_timeline: '7–30 working days', guide_url: null, forms: [] },
  IN_SHOP_ESTABLISHMENT: { processing_fee: 'State-specific (₹100–₹10,000)', typical_timeline: '1–15 working days', guide_url: null, forms: [] },
  IN_DRUG_LICENSE: { processing_fee: '₹1,500–₹3,000', typical_timeline: '30–45 working days', guide_url: null, forms: [{ name: 'Form 19/20/21', url: null }] },
  IN_FIRE_NOC: { processing_fee: 'State-specific', typical_timeline: '15–30 working days', guide_url: null, forms: [] },
  IN_IEC_UPDATE: { processing_fee: '₹0 (annual update)', typical_timeline: 'Immediate (online)', guide_url: 'https://www.dgft.gov.in', forms: [{ name: 'IEC Profile', url: 'https://www.dgft.gov.in' }] },
  IN_UDYAM:   { processing_fee: '₹0 (free)', typical_timeline: 'Immediate (Aadhaar OTP)', guide_url: 'https://udyamregistration.gov.in', forms: [{ name: 'Udyam Registration', url: 'https://udyamregistration.gov.in' }] },
  IN_ROC_AOC4: { processing_fee: '₹300–₹600 (by capital)', typical_timeline: 'Self-filed', guide_url: 'https://www.mca.gov.in', forms: [{ name: 'AOC-4', url: 'https://www.mca.gov.in' }] },
  IN_ROC_MGT7: { processing_fee: '₹300–₹600 (by capital)', typical_timeline: 'Self-filed', guide_url: 'https://www.mca.gov.in', forms: [{ name: 'MGT-7', url: 'https://www.mca.gov.in' }] },
};

function seedResources(db) {
  const upd = db.prepare(`
    UPDATE compliance_rules
    SET processing_fee   = COALESCE(processing_fee, ?),
        typical_timeline = COALESCE(typical_timeline, ?),
        guide_url        = COALESCE(guide_url, ?),
        forms_json       = COALESCE(forms_json, ?)
    WHERE code = ?
  `);
  let applied = 0;
  for (const [code, r] of Object.entries(RESOURCES)) {
    upd.run(r.processing_fee || null, r.typical_timeline || null, r.guide_url || null,
      r.forms ? JSON.stringify(r.forms) : null, code);
    applied++;
  }
  return applied;
}

function seedCompliance(db) {
  // 1. Categories
  const insCat = db.prepare(
    'INSERT OR IGNORE INTO compliance_categories (key, name, icon, sort_order) VALUES (?, ?, ?, ?)'
  );
  for (const c of CATEGORIES) insCat.run(c.key, c.name, c.icon, c.sort_order);

  // 2. Rules (+ conditions + documents), only when the rule is first created.
  const findRule = db.prepare('SELECT id FROM compliance_rules WHERE code = ?');
  const insRule = db.prepare(`
    INSERT INTO compliance_rules
      (code, country, state, title, description, category_key, department, portal_url, reference_url,
       mandatory, frequency, renewal_interval_months, due_day, due_month, grace_period_days,
       penalty_info, priority, ai_explanation, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const insCond = db.prepare(
    'INSERT INTO compliance_rule_conditions (rule_id, attribute, operator, value) VALUES (?, ?, ?, ?)'
  );
  const insDoc = db.prepare(
    'INSERT INTO compliance_rule_documents (rule_id, doc_name, is_required) VALUES (?, ?, 1)'
  );

  let created = 0;
  for (const r of RULES) {
    if (findRule.get(r.code)) continue; // already seeded — respect any admin edits
    const info = insRule.run(
      r.code, r.country || 'IN', r.state || null, r.title, r.description || null,
      r.category_key, r.department || null, r.portal_url || null, r.reference_url || null,
      r.mandatory != null ? r.mandatory : 1, r.frequency,
      r.renewal_interval_months || null, r.due_day || null, r.due_month || null,
      r.grace_period_days || 0, r.penalty_info || null, r.priority || 'medium',
      r.ai_explanation || null
    );
    const ruleId = info.lastInsertRowid;
    for (const c of (r.conditions || [])) insCond.run(ruleId, c.attribute, c.operator, c.value);
    for (const d of (r.documents || [])) insDoc.run(ruleId, d);
    created++;
  }
  seedResources(db); // fill Government Resource Center fields
  return { categories: CATEGORIES.length, rulesCreated: created, rulesTotal: RULES.length };
}

module.exports = { seedCompliance, seedResources, CATEGORIES, RULES, RESOURCES };
