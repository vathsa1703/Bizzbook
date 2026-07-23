'use strict';
// =============================================================================
// backend/src/services/gstEngine.js
//
// THE single GST calculation engine for this application.
//
// Rules:
//   • This is the ONLY place where CGST / SGST / IGST is computed.
//   • No route, exporter, or report may independently calculate tax.
//   • All calculations operate on pre-validated, normalized inputs.
//   • Callers receive enriched line objects + invoice-level totals ready
//     for direct INSERT into the database.
//
// Public API:
//   resolveStateCode(value)          → '29' | null
//   getStateByCode(code)             → { code, name, gstin_prefix } | null
//   determineTransactionType(c, cu)  → 'intrastate' | 'interstate' | 'unknown'
//   calculateLineGST(opts)           → { taxable_value, cgst, sgst, igst, cess, gst_amount, total }
//   buildInvoiceTotals(opts)         → { lines, totals, isInterstate, transactionType }
//   validateInvoiceInput(opts)       → { valid: bool, errors: [], warnings: [] }
// =============================================================================

const path = require('path');
const { dbGet } = require('../config/dbEngine');

// ─── State Master ─────────────────────────────────────────────────────────────
// Single import. Every other module that needs state data must use these helpers.

const GST_STATES = require('../data/gstStates.json');

// code → entry  (fast lookup)
const BY_CODE = Object.fromEntries(GST_STATES.map(s => [s.code, s]));

// lowercase name → code  (for backward-compat with free-text state names)
const BY_NAME = Object.fromEntries(
  GST_STATES.flatMap(s => [
    [s.name.toLowerCase(), s.code],
    // common alternate spellings
    ...(s.name === 'Odisha'           ? [['orissa', s.code]]                         : []),
    ...(s.name === 'Uttarakhand'      ? [['uttaranchal', s.code]]                    : []),
    ...(s.name === 'Puducherry'       ? [['pondicherry', s.code]]                    : []),
    ...(s.name === 'Jammu & Kashmir'  ? [['jammu and kashmir', s.code]]              : []),
  ])
);

/**
 * Resolve any state representation to a canonical 2-digit code string.
 *  - '29'        → '29'
 *  - 'Karnataka' → '29'
 *  - '9'         → '09'  (pad single digit)
 *  - null / ''   → null
 */
function resolveStateCode(value) {
  if (!value) return null;
  const v = String(value).trim();
  // Already a 2-digit numeric code
  if (/^\d{1,2}$/.test(v)) {
    const padded = v.padStart(2, '0');
    return BY_CODE[padded] ? padded : null;
  }
  return BY_NAME[v.toLowerCase()] || null;
}

/**
 * Look up a state entry by its 2-digit code.
 * Returns { code, name, gstin_prefix } or null.
 */
function getStateByCode(code) {
  if (!code) return null;
  return BY_CODE[String(code).padStart(2, '0')] || null;
}

/**
 * Return the full states array (used by the API endpoint).
 */
function getAllStates() {
  return GST_STATES;
}

// ─── Company Profile Resolution ────────────────────────────────────────────────
//
// `company_settings` is deprecated (see schema.sql) — the canonical source for a
// company's GST-relevant profile is `companies` + `company_gst_settings`. This is
// the single place that resolves it; no route or service should query those
// tables directly for tax-calculation purposes.

/**
 * Resolve the full company profile — GST-calculation fields plus the display
 * fields needed for invoice snapshots/PDFs and GST filing exports — scoped by
 * company_id. This is the single canonical resolver; nothing else should query
 * companies / company_gst_settings / company_branding / company_addresses
 * directly for this purpose.
 *
 * @param {object} db
 * @param {number} companyId
 * @returns {{
 *   gstin: string, state_code: string|null,
 *   is_gst_registered: number|null, inclusive_pricing: number|null,
 *   name: string, legal_name: string, trade_name: string, pan: string,
 *   state_name: string, address: string, pincode: string,
 *   phone: string, email: string, logo: string,
 * }}
 */
function getCompanyGstProfile(db, companyId) {
  const company = db.prepare(
    'SELECT name, gstin, pan, legal_business_name, trade_name, phone, email FROM companies WHERE id = ?'
  ).get(companyId) || {};
  const gstSettings = db.prepare(
    'SELECT state_code, is_gst_registered, inclusive_pricing FROM company_gst_settings WHERE company_id = ?'
  ).get(companyId) || {};
  const branding = db.prepare(
    'SELECT logo_url FROM company_branding WHERE company_id = ?'
  ).get(companyId) || {};
  const address = db.prepare(`
    SELECT * FROM company_addresses WHERE company_id = ?
    ORDER BY (address_type = 'registered') DESC, is_primary DESC, id ASC
    LIMIT 1
  `).get(companyId) || {};

  const stateCode = resolveStateCode(gstSettings.state_code) || resolveStateCode(address.state);
  const stateEntry = stateCode ? getStateByCode(stateCode) : null;
  const addressLine = [address.address_line1, address.address_line2, address.city, address.district]
    .filter(Boolean)
    .join(', ');

  return {
    // Tax-calculation fields
    gstin: (company.gstin || '').trim().toUpperCase(),
    state_code: stateCode,
    is_gst_registered: gstSettings.is_gst_registered,
    inclusive_pricing: gstSettings.inclusive_pricing,
    // Display / filing fields
    name: company.name || '',
    legal_name: company.legal_business_name || company.name || '',
    trade_name: company.trade_name || company.name || '',
    pan: company.pan || (company.gstin ? company.gstin.slice(2, 12) : ''),
    state_name: stateEntry ? stateEntry.name : (address.state || ''),
    address: addressLine,
    pincode: address.pincode || '',
    phone: company.phone || '',
    email: company.email || '',
    logo: branding.logo_url || '',
  };
}

// Phase 2: async twin of getCompanyGstProfile, for callers that need to run on
// either SQLite or Postgres (currently only sales.js). Uses dbEngine.js's
// dbGet, which already dispatches per DB_ENGINE — so this one function works
// correctly against both engines with no branching of its own. The original
// sync getCompanyGstProfile(db, companyId) above is UNCHANGED and still used
// as-is by purchases.js and gstFilingService.js, which remain SQLite-only
// until their own Phase 2 module commits; forcing this function to be async
// would have made it a Promise for every caller, and gstFilingService.js's
// buildGstrData() (routes/gstFiling.js's entry point) is not async today —
// rippling that change now would reach into a module not scheduled yet.
// Once purchases.js and gstFilingService.js are migrated, the sync version
// above can be deleted and every caller unified onto this one.
async function getCompanyGstProfileAsync(companyId) {
  const company = await dbGet(
    'SELECT name, gstin, pan, legal_business_name, trade_name, phone, email FROM companies WHERE id = ?',
    [companyId]
  ) || {};
  const gstSettings = await dbGet(
    'SELECT state_code, is_gst_registered, inclusive_pricing FROM company_gst_settings WHERE company_id = ?',
    [companyId]
  ) || {};
  const branding = await dbGet(
    'SELECT logo_url FROM company_branding WHERE company_id = ?',
    [companyId]
  ) || {};
  const address = await dbGet(`
    SELECT * FROM company_addresses WHERE company_id = ?
    ORDER BY (address_type = 'registered') DESC, is_primary DESC, id ASC
    LIMIT 1
  `, [companyId]) || {};

  const stateCode = resolveStateCode(gstSettings.state_code) || resolveStateCode(address.state);
  const stateEntry = stateCode ? getStateByCode(stateCode) : null;
  const addressLine = [address.address_line1, address.address_line2, address.city, address.district]
    .filter(Boolean)
    .join(', ');

  return {
    // Tax-calculation fields
    gstin: (company.gstin || '').trim().toUpperCase(),
    state_code: stateCode,
    is_gst_registered: gstSettings.is_gst_registered,
    inclusive_pricing: gstSettings.inclusive_pricing,
    // Display / filing fields
    name: company.name || '',
    legal_name: company.legal_business_name || company.name || '',
    trade_name: company.trade_name || company.name || '',
    pan: company.pan || (company.gstin ? company.gstin.slice(2, 12) : ''),
    state_name: stateEntry ? stateEntry.name : (address.state || ''),
    address: addressLine,
    pincode: address.pincode || '',
    phone: company.phone || '',
    email: company.email || '',
    logo: branding.logo_url || '',
  };
}

// ─── Transaction Type ─────────────────────────────────────────────────────────

/**
 * Determine whether a transaction is intrastate or interstate.
 *
 * @param {string|null} companyStateCode  2-digit code of the selling company
 * @param {string|null} customerStateCode 2-digit code of the buyer
 * @returns {'intrastate'|'interstate'|'unknown'}
 */
function determineTransactionType(companyStateCode, customerStateCode) {
  const c  = resolveStateCode(companyStateCode);
  const cu = resolveStateCode(customerStateCode);
  if (!c || !cu) return 'unknown';
  return c === cu ? 'intrastate' : 'interstate';
}

// ─── Round helper ─────────────────────────────────────────────────────────────

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ─── Line-level GST calculation ───────────────────────────────────────────────

/**
 * Calculate GST for a single invoice line.
 *
 * @param {{
 *   taxableValue : number,   // quantity × rate (pre-discount)
 *   gstRate      : number,   // percentage, e.g. 18
 *   cessRate     : number,   // percentage, e.g. 0 | 1 | 22
 *   isInterstate : boolean,
 * }} opts
 *
 * @returns {{
 *   taxable_value : number,
 *   gst_amount    : number,
 *   cgst          : number,
 *   sgst          : number,
 *   igst          : number,
 *   cess          : number,
 *   total         : number,   // taxable_value + gst_amount + cess
 * }}
 */
function calculateLineGST({ taxableValue, gstRate = 0, cessRate = 0, isInterstate, isInclusive = false }) {
  let tv, gst, cess;
  
  if (isInclusive) {
    const totalGross = r2(taxableValue);
    const totalRate = 100 + gstRate + cessRate;
    
    // Calculate GST and CESS directly from gross to minimize rounding errors
    gst = r2((totalGross * gstRate) / totalRate);
    cess = r2((totalGross * cessRate) / totalRate);
    
    // Back-calculate taxable value to ensure total exactly matches gross
    tv = r2(totalGross - gst - cess);
  } else {
    tv = r2(taxableValue);
    gst = r2(tv * gstRate / 100);
    cess = r2(tv * cessRate / 100);
  }

  let cgst = 0, sgst = 0, igst = 0;
  if (isInterstate) {
    igst = gst;
  } else {
    cgst = r2(gst / 2);
    sgst = r2(gst - cgst); // avoids floating-point drift
  }

  return {
    taxable_value : tv,
    gst_amount    : gst,
    cgst,
    sgst,
    igst,
    cess,
    total         : r2(tv + gst + cess),
  };
}

// ─── Item Enrichment ────────────────────────────────────────────────────────────

/**
 * Enriches raw items with GST metadata from the Product Master and GST Master.
 * Logic:
 *   - Fetch product fields (hsn_code, use_custom_gst, gst_rate, uqc, cess_rate).
 *   - Fetch HSN master fields using hsn_code.
 *   - If use_custom_gst === 1, use product's custom fields.
 *   - Else, use HSN master's fields.
 *   - If HSN is missing in master, values fall back to null/0 (caught by validator later).
 *
 * @param {object} db - Database connection
 * @param {Array} items - Array of { product_id, quantity, revenue } (or similar raw data)
 * @returns {Array} - Array of enriched items ready for buildInvoiceTotals
 */
function enrichItems(db, items) {
  const prodStmt = db.prepare(
    'SELECT id, name, hsn_code, use_custom_gst, gst_rate, uqc, cess_rate FROM products WHERE id = ?'
  );
  const hsnStmt = db.prepare(
    'SELECT hsn_code, gst_rate, uqc, cess_rate FROM gst_hsn_master WHERE hsn_code = ?'
  );

  return items.map(item => {
    const prod = prodStmt.get(item.product_id) || {};
    const hsnMaster = prod.hsn_code ? hsnStmt.get(prod.hsn_code) || {} : {};
    
    const qty = Number(item.quantity) || 0;
    const rate = qty > 0 ? (Number(item.revenue) || 0) / qty : 0;

    let finalGstRate = 0;
    let finalUqc = 'NOS';
    let finalCessRate = 0;

    if (prod.use_custom_gst) {
      finalGstRate = prod.gst_rate != null ? Number(prod.gst_rate) : 0;
      finalUqc = prod.uqc || 'NOS';
      finalCessRate = prod.cess_rate != null ? Number(prod.cess_rate) : 0;
    } else {
      finalGstRate = hsnMaster.gst_rate != null ? Number(hsnMaster.gst_rate) : 0;
      finalUqc = hsnMaster.uqc || 'NOS';
      finalCessRate = hsnMaster.cess_rate != null ? Number(hsnMaster.cess_rate) : 0;
    }

    return {
      product_id   : item.product_id,
      product_name : prod.name || '',
      hsn_code     : prod.hsn_code || '',
      gst_rate     : finalGstRate,
      cess_rate    : finalCessRate,
      uqc          : finalUqc,
      quantity     : qty,
      rate         : rate,
    };
  });
}

// Phase 2: async twin of enrichItems, same reasoning as getCompanyGstProfileAsync
// above — used only by sales.js so far. Sequential (not Promise.all) to match
// the original's per-item ordering exactly; item count per sale is small.
async function enrichItemsAsync(items) {
  const enriched = [];
  for (const item of items) {
    const prod = await dbGet(
      'SELECT id, name, hsn_code, use_custom_gst, gst_rate, uqc, cess_rate FROM products WHERE id = ?',
      [item.product_id]
    ) || {};
    const hsnMaster = prod.hsn_code
      ? (await dbGet('SELECT hsn_code, gst_rate, uqc, cess_rate FROM gst_hsn_master WHERE hsn_code = ?', [prod.hsn_code])) || {}
      : {};

    const qty = Number(item.quantity) || 0;
    const rate = qty > 0 ? (Number(item.revenue) || 0) / qty : 0;

    let finalGstRate = 0;
    let finalUqc = 'NOS';
    let finalCessRate = 0;

    if (prod.use_custom_gst) {
      finalGstRate = prod.gst_rate != null ? Number(prod.gst_rate) : 0;
      finalUqc = prod.uqc || 'NOS';
      finalCessRate = prod.cess_rate != null ? Number(prod.cess_rate) : 0;
    } else {
      finalGstRate = hsnMaster.gst_rate != null ? Number(hsnMaster.gst_rate) : 0;
      finalUqc = hsnMaster.uqc || 'NOS';
      finalCessRate = hsnMaster.cess_rate != null ? Number(hsnMaster.cess_rate) : 0;
    }

    enriched.push({
      product_id   : item.product_id,
      product_name : prod.name || '',
      hsn_code     : prod.hsn_code || '',
      gst_rate     : finalGstRate,
      cess_rate    : finalCessRate,
      uqc          : finalUqc,
      quantity     : qty,
      rate         : rate,
    });
  }
  return enriched;
}

// ─── Invoice-level totals ─────────────────────────────────────────────────────

/**
 * Process all line items for an invoice and return enriched lines + header totals.
 *
 * @param {{
 *   items: Array<{
 *     product_id    : number,
 *     quantity      : number,
 *     rate          : number,   // unit price
 *     gst_rate      : number,   // from product master
 *     cess_rate     : number,   // from product master (default 0)
 *     hsn_code      : string,
 *     uqc           : string,
 *     product_name  : string,
 *   }>,
 *   companyStateCode  : string,
 *   customerStateCode : string,
 * }} opts
 *
 * @returns {{
 *   lines          : Array,   // enriched, ready for invoice_items INSERT
 *   totals         : object,  // ready for invoices UPDATE
 *   transactionType: string,
 *   isInterstate   : boolean,
 * }}
 */
function buildInvoiceTotals({ items, companyStateCode, customerStateCode, isInclusive = false }) {
  const txType     = determineTransactionType(companyStateCode, customerStateCode);
  const isInterstate = txType === 'interstate';
  // 'unknown' falls back to interstate (safer — IGST is recoverable; wrong CGST/SGST split is not)
  const applyInterstate = isInterstate || txType === 'unknown';

  const lines = items.map((item, idx) => {
    const quantity     = Number(item.quantity)  || 0;
    const rate         = Number(item.rate)      || 0;
    const gstRate      = Number(item.gst_rate)  || 0;
    const cessRate     = Number(item.cess_rate) || 0;
    const grossValue   = r2(quantity * rate);

    const tax = calculateLineGST({
      taxableValue: grossValue,
      gstRate,
      cessRate,
      isInterstate: applyInterstate,
      isInclusive
    });

    return {
      // identity
      line_index    : idx,
      product_id    : item.product_id,
      product_name  : item.product_name  || '',
      hsn_code      : item.hsn_code      || '',
      uqc           : item.uqc           || 'NOS',
      // quantities
      quantity,
      rate,
      gst_rate      : gstRate,
      cess_rate     : cessRate,
      // tax (calculated)
      ...tax,
    };
  });

  // Aggregate header totals
  const totals = lines.reduce(
    (acc, l) => ({
      subtotal      : r2(acc.subtotal      + l.taxable_value),
      taxable_value : r2(acc.taxable_value + l.taxable_value),
      cgst          : r2(acc.cgst          + l.cgst),
      sgst          : r2(acc.sgst          + l.sgst),
      igst          : r2(acc.igst          + l.igst),
      cess          : r2(acc.cess          + l.cess),
      grand_total   : r2(acc.grand_total   + l.total),
    }),
    { subtotal: 0, taxable_value: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, grand_total: 0 }
  );

  return { lines, totals, transactionType: txType, isInterstate: applyInterstate };
}

// ─── Validation ───────────────────────────────────────────────────────────────

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const HSN_REGEX   = /^[0-9]{4}([0-9]{2}([0-9]{2})?)?$/;

const VALID_GST_RATES   = new Set([0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28]);
const VALID_UQC         = new Set([
  'BAG','BAL','BDL','BKL','BOU','BOX','BTL','BUN','CAN','CBM','CCM','CMS',
  'CTN','DOZ','DRM','GGK','GMS','GRS','GYD','KGS','KLR','KME','LTR','MTR',
  'MTS','NOS','OTH','PAC','PCS','PRS','QTL','ROL','SET','SQF','SQM','SQY',
  'TBS','TGM','THD','TON','TUB','UGS','UNT','YDS',
]);

/**
 * Validate all inputs before persisting an invoice.
 * Returns { valid, errors, warnings } — does NOT throw.
 *
 * @param {{
 *   companyGstin      : string,
 *   companyStateCode  : string,
 *   customerGstin     : string | null,
 *   customerStateCode : string | null,
 *   invoiceNumber     : string,
 *   invoiceDate       : string,
 *   items             : Array<{ product_id, hsn_code, gst_rate, uqc, quantity, rate }>,
 *   existingInvoiceNumbers : Set<string>,   // for duplicate check
 * }} opts
 *
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateInvoiceInput({
  companyGstin,
  companyStateCode,
  customerGstin,
  customerStateCode,
  invoiceNumber,
  invoiceDate,
  items = [],
  existingInvoiceNumbers = new Set(),
}) {
  const errors   = [];
  const warnings = [];

  // ── Company ────────────────────────────────────────────────────────────────
  if (!companyGstin || !GSTIN_REGEX.test(companyGstin.trim().toUpperCase())) {
    errors.push('Company GSTIN is missing or invalid. Configure it in GST Settings.');
  }
  if (!resolveStateCode(companyStateCode)) {
    errors.push('Company state is not configured. Set it in GST Settings.');
  }

  // ── Customer ───────────────────────────────────────────────────────────────
  if (customerGstin) {
    if (!GSTIN_REGEX.test(customerGstin.trim().toUpperCase())) {
      errors.push(`Customer GSTIN "${customerGstin}" is invalid (wrong format).`);
    }
  }
  const customerCodeResolved = resolveStateCode(customerStateCode);
  if (!customerCodeResolved) {
    errors.push('Customer state is missing — Place of Supply cannot be determined. Invoice creation blocked.');
  }

  // ── Invoice metadata ───────────────────────────────────────────────────────
  if (!invoiceNumber || !invoiceNumber.trim()) {
    errors.push('Invoice number is required.');
  } else if (existingInvoiceNumbers.has(invoiceNumber.trim())) {
    errors.push(`Duplicate invoice number: "${invoiceNumber}".`);
  }
  if (!invoiceDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
    errors.push('Invoice date is required in YYYY-MM-DD format.');
  }

  // ── Items ──────────────────────────────────────────────────────────────────
  if (!items.length) {
    errors.push('Invoice must contain at least one line item.');
  }

  items.forEach((item, i) => {
    const label = `Item ${i + 1}`;

    if (!item.product_id) {
      errors.push(`${label}: product_id is required.`);
    }
    if (!item.hsn_code || !HSN_REGEX.test(String(item.hsn_code).trim())) {
      errors.push(`${label}: HSN code is missing or invalid. HSN is mandatory for GST invoices.`);
    }
    if (item.gst_rate === undefined || item.gst_rate === null) {
      errors.push(`${label}: GST rate is missing. Must be set on the product.`);
    } else if (!VALID_GST_RATES.has(Number(item.gst_rate))) {
      errors.push(`${label}: GST rate ${item.gst_rate}% is non-standard. Allowed slabs: 0, 5, 12, 18, 28.`);
    }
    if (item.uqc && !VALID_UQC.has(String(item.uqc).toUpperCase())) {
      warnings.push(`${label}: UQC "${item.uqc}" is not in the GSTN-approved list.`);
    }
    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0) {
      errors.push(`${label}: quantity must be a positive number.`);
    }
    const rate = Number(item.rate);
    if (isNaN(rate) || rate < 0) {
      errors.push(`${label}: unit rate cannot be negative.`);
    }
    if (qty > 0 && rate === 0) {
      warnings.push(`${label}: unit rate is zero — taxable value will be ₹0.`);
    }
  });

  return {
    valid    : errors.length === 0,
    errors,
    warnings,
  };
}

// ─── GSTIN Validation Helper ──────────────────────────────────────────────────

/**
 * Returns true if the given string is a valid 15-character Indian GSTIN.
 * This is the single authoritative implementation — all modules must import
 * this function rather than duplicating the regex.
 */
function isValidGSTIN(v) {
  return typeof v === 'string' && GSTIN_REGEX.test(v.trim().toUpperCase());
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // State helpers
  GST_STATES,
  getAllStates,
  resolveStateCode,
  getStateByCode,
  getCompanyGstProfile,
  getCompanyGstProfileAsync,

  // Classification
  determineTransactionType,

  // Calculation
  calculateLineGST,
  enrichItems,
  enrichItemsAsync,
  buildInvoiceTotals,

  // Validation
  validateInvoiceInput,
  isValidGSTIN,
  GSTIN_REGEX,
  HSN_REGEX,
};
