// backend/src/services/gstFilingService.js
//
// Core data-extraction and invoice-classification service for the GST Filing
// Export module. This service only reads; it never writes to the DB.
// All GST calculations use pre-stored values from invoices + invoice_items.
// State resolution and validation helpers are imported from gstEngine.

'use strict';

const { dbAll, engine } = require('../config/dbEngine');
const {
  resolveStateCode,
  isValidGSTIN,
  getAllStates,
  getCompanyGstProfileAsync,
} = require('./gstEngine');

const B2CL_THRESHOLD = 250000; // ₹2,50,000

function isValidHSN(str) {
  return typeof str === 'string' && /^[0-9]{4}([0-9]{2}([0-9]{2})?)?$/.test(str.trim());
}

/**
 * Format ISO date string (YYYY-MM-DD) → "dd-Mmm-YYYY" required by GSTN.
 * e.g. "2025-04-14" → "14-Apr-2025"
 */
function formatGSTDate(isoDate) {
  if (!isoDate) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  const mo = months[parseInt(m, 10) - 1] || m;
  return `${d.padStart(2,'0')}-${mo}-${y}`;
}

function roundTwo(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ─── Company Info ────────────────────────────────────────────────────────────
//
// Delegates to gstEngine.getCompanyGstProfile — the single canonical resolver
// for company profile data (companies + company_gst_settings + company_addresses).
// `company_settings` is deprecated (see schema.sql) and must not be read here;
// it is also not scoped by company_id in any consistent way historically.

async function getCompanyInfo(companyId) {
  const profile = await getCompanyGstProfileAsync(companyId);
  return {
    gstin:       profile.gstin,
    legal_name:  profile.legal_name,
    trade_name:  profile.trade_name,
    pan:         profile.pan,
    state_code:  profile.state_code,
    state_name:  profile.state_name,
    address:     profile.address,
    pincode:     profile.pincode,
  };
}

// ─── Invoice Fetcher ─────────────────────────────────────────────────────────

/**
 * Load all invoices (with items + customer + product info) for a given period,
 * scoped to a single company — GSTR-1 filing must never mix tenants.
 * period: { month: 1-12, year: 4-digit }  — both optional (returns all if omitted)
 */
async function fetchInvoices({ month, year, companyId } = {}) {
  let dateFilter = '';
  const params = [];
  const isPg = engine() === 'postgres';

  // strftime() is SQLite-only; Postgres's invoice_date is a native DATE
  // column, so TO_CHAR(...) does the equivalent YYYY-MM/YYYY string format.
  if (year && month) {
    const mm = String(month).padStart(2, '0');
    dateFilter = isPg ? `AND TO_CHAR(i.invoice_date, 'YYYY-MM') = ?` : `AND strftime('%Y-%m', i.invoice_date) = ?`;
    params.push(`${year}-${mm}`);
  } else if (year) {
    dateFilter = isPg ? `AND TO_CHAR(i.invoice_date, 'YYYY') = ?` : `AND strftime('%Y', i.invoice_date) = ?`;
    params.push(String(year));
  }

  const companyFilter = `AND i.company_id = ?`;
  params.push(companyId);

  const invoices = await dbAll(`
    SELECT
      i.id, i.invoice_number, i.invoice_date, i.grand_total,
      i.taxable_value, i.cgst, i.sgst, i.igst,
      i.place_of_supply, i.reverse_charge, i.invoice_type, i.ecommerce_gstin,
      i.status, i.payment_status,
      c.id         AS customer_id,
      c.name       AS customer_name,
      c.gstin      AS customer_gstin,
      c.state      AS customer_state,
      c.state_code AS customer_state_code,
      c.billing_address AS customer_address
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    WHERE 1=1 ${dateFilter} ${companyFilter}
    ORDER BY i.invoice_date, i.invoice_number
  `, params);

  // Attach line items + HSN info
  const itemsSql = `
    SELECT
      ii.id, ii.invoice_id, ii.quantity, ii.rate,
      ii.taxable_value, ii.cgst, ii.sgst, ii.igst, ii.total,
      p.name       AS product_name,
      p.hsn_code,
      p.gst_rate,
      p.uqc
    FROM invoice_items ii
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = ?
  `;

  const result = [];
  for (const inv of invoices) {
    result.push({ ...inv, items: await dbAll(itemsSql, [inv.id]) });
  }
  return result;
}

// ─── Classification ───────────────────────────────────────────────────────────

/**
 * Classify an invoice into a GSTR-1 section.
 * Returns one of: 'b2b' | 'b2cl' | 'b2cs' | 'skip'
 */
function classifyInvoice(inv, companyStateCode) {
  const gstin = (inv.customer_gstin || '').trim().toUpperCase();
  const hasGSTIN = isValidGSTIN(gstin);

  if (hasGSTIN) return 'b2b';

  // B2C — determine Large vs Small
  const igstApplied = roundTwo(inv.igst) > 0;
  const grandTotal  = roundTwo(inv.grand_total);
  const isInterState = igstApplied; // IGST implies interstate

  if (isInterState && grandTotal > B2CL_THRESHOLD) return 'b2cl';
  return 'b2cs';
}

// ─── HSN Aggregation ──────────────────────────────────────────────────────────

function buildHsnSummary(invoices) {
  const map = new Map(); // key: hsn_code

  for (const inv of invoices) {
    for (const item of inv.items) {
      const hsn = (item.hsn_code || '').trim();
      if (!hsn) continue;

      if (!map.has(hsn)) {
        map.set(hsn, {
          hsn_code:      hsn,
          description:   item.product_name || '',
          uqc:           item.uqc          || 'NOS',
          total_quantity: 0,
          total_value:   0,
          taxable_value: 0,
          igst:          0,
          cgst:          0,
          sgst:          0,
          cess:          0,
        });
      }

      const entry = map.get(hsn);
      entry.total_quantity += Number(item.quantity) || 0;
      entry.total_value    += roundTwo(item.total);
      entry.taxable_value  += roundTwo(item.taxable_value);
      entry.igst           += roundTwo(item.igst);
      entry.cgst           += roundTwo(item.cgst);
      entry.sgst           += roundTwo(item.sgst);
    }
  }

  const result = Array.from(map.values()).map(e => ({
    ...e,
    total_quantity: roundTwo(e.total_quantity),
    // Strictly compute total_value as taxable + all taxes to reconcile with GSTN requirements
    total_value:    roundTwo(e.taxable_value + e.cgst + e.sgst + e.igst + e.cess),
    taxable_value:  roundTwo(e.taxable_value),
    igst:           roundTwo(e.igst),
    cgst:           roundTwo(e.cgst),
    sgst:           roundTwo(e.sgst),
    cess:           roundTwo(e.cess),
  }));

  console.log('--- HSN SUMMARY AUDIT ---');
  for (const r of result) {
    const computedTotal = roundTwo(r.taxable_value + r.cgst + r.sgst + r.igst + r.cess);
    console.log(`HSN: ${r.hsn_code}`);
    console.log(`  Sum of item.total (Exported val): ${r.total_value}`);
    console.log(`  Sum of taxable values: ${r.taxable_value}`);
    console.log(`  Sum of CGST: ${r.cgst}`);
    console.log(`  Sum of SGST: ${r.sgst}`);
    console.log(`  Sum of IGST: ${r.igst}`);
    console.log(`  Sum of CESS: ${r.cess}`);
    console.log(`  Computed total (Taxable+Taxes): ${computedTotal}`);
    if (r.total_value !== computedTotal) {
      console.log(`  [!] DISCREPANCY: Exported val (${r.total_value}) !== Computed total (${computedTotal})`);
    } else {
      console.log(`  [+] MATCH: Exported val matches Computed total.`);
    }
  }
  console.log('-------------------------');

  return result;
}

// ─── Document Summary ─────────────────────────────────────────────────────────

function buildDocSummary(invoices) {
  if (!invoices.length) return [];
  const nums = invoices
    .map(i => i.invoice_number)
    .filter(Boolean)
    .sort();
  return [{
    nature:     'Invoices for outward supply',
    sr_from:    nums[0] || '',
    sr_to:      nums[nums.length - 1] || '',
    total:      nums.length,
    cancelled:  0,
  }];
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateInvoices(invoices, companyInfo) {
  const warnings = [];
  const seenNumbers = new Set();

  let missingGSTINCount  = 0;
  let missingHSNCount    = 0;
  let invalidStateCount  = 0;
  let taxMismatchCount   = 0;
  let duplicateNumCount  = 0;
  let validCount         = 0;

  for (const inv of invoices) {
    const gstin = (inv.customer_gstin || '').trim().toUpperCase();
    const hasGSTIN = gstin.length > 0;
    const validGSTIN = isValidGSTIN(gstin);
    const section = classifyInvoice(inv, companyInfo.state_code);

    let invOk = true;

    // B2B invoices must have valid GSTIN
    if (section === 'b2b' && !validGSTIN) {
      warnings.push({ invoice: inv.invoice_number, type: 'invalid_gstin', message: `Invalid GSTIN format: "${gstin}"` });
      invOk = false;
    }

    // Missing GSTIN but classified as B2B (non-critical for B2C)
    if (hasGSTIN && !validGSTIN) {
      missingGSTINCount++;
    }

    // Check all items for HSN
    const missingHSN = inv.items.filter(it => !it.hsn_code || !isValidHSN(it.hsn_code));
    if (missingHSN.length > 0) {
      missingHSNCount++;
      warnings.push({ invoice: inv.invoice_number, type: 'missing_hsn', message: `${missingHSN.length} item(s) missing valid HSN code` });
      invOk = false;
    }

    // Validate Place of Supply
    const pos = resolveStateCode(inv.place_of_supply || inv.customer_state_code || inv.customer_state);
    if (!pos) {
      invalidStateCount++;
      warnings.push({ invoice: inv.invoice_number, type: 'invalid_pos', message: 'Cannot determine Place of Supply (missing customer state)' });
      invOk = false;
    }

    // Tax consistency check: cgst+sgst or igst, not both
    const hasCGST  = roundTwo(inv.cgst) > 0;
    const hasSGST  = roundTwo(inv.sgst) > 0;
    const hasIGST  = roundTwo(inv.igst) > 0;
    if ((hasCGST || hasSGST) && hasIGST) {
      taxMismatchCount++;
      warnings.push({ invoice: inv.invoice_number, type: 'tax_mismatch', message: 'Invoice has both IGST and CGST/SGST — only one should apply' });
      invOk = false;
    }

    // Duplicate invoice numbers
    if (inv.invoice_number) {
      if (seenNumbers.has(inv.invoice_number)) {
        duplicateNumCount++;
        warnings.push({ invoice: inv.invoice_number, type: 'duplicate', message: 'Duplicate invoice number detected' });
        invOk = false;
      }
      seenNumbers.add(inv.invoice_number);
    }

    if (invOk) validCount++;
  }

  const criticalErrors = warnings.filter(w =>
    ['invalid_gstin','tax_mismatch','duplicate','missing_hsn'].includes(w.type)
  );

  return {
    total:            invoices.length,
    valid:            validCount,
    missing_gstin:    missingGSTINCount,
    missing_hsn:      missingHSNCount,
    invalid_pos:      invalidStateCount,
    tax_mismatch:     taxMismatchCount,
    duplicate_numbers: duplicateNumCount,
    warnings,
    can_export:       criticalErrors.length === 0,
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Build the complete GSTR-1 dataset for a given period, scoped to one company.
 *
 * @param {{ month?: number, year?: number, companyId: number }} period
 * @returns {{
 *   meta, company, health,
 *   b2b, b2cl, b2cs, hsn, docs
 * }}
 */
async function buildGstrData(period = {}) {
  if (!period.companyId) {
    throw new Error('buildGstrData requires a companyId — GST filing data must be tenant-scoped.');
  }
  const company      = await getCompanyInfo(period.companyId);
  const allInvoices  = await fetchInvoices(period);

  const b2b  = [];
    const b2cl = [];
    const b2csMap = new Map(); // key: `${stateCode}_${rate}`

    console.log('--- INVOICE CLASSIFICATION AUDIT ---');
    console.log(`Total invoices to process: ${allInvoices.length}`);

    for (const inv of allInvoices) {
      const section = classifyInvoice(inv, company.state_code);
      
      const pos = resolveStateCode(
        inv.place_of_supply || inv.customer_state_code || inv.customer_state
      ) || '';

      console.log(`Invoice: ${inv.invoice_number}`);
      console.log(`  Customer GSTIN: ${inv.customer_gstin}`);
      console.log(`  Customer State Code: ${inv.customer_state_code || inv.customer_state}`);
      console.log(`  Company State Code: ${company.state_code}`);
      console.log(`  Place of Supply: ${pos}`);
      console.log(`  Transaction Type (Status): ${inv.status}`);
      console.log(`  Invoice Value (Grand Total): ${inv.grand_total}`);
      console.log(`  --> Classified as: ${section}`);

      // We skip cancelled or draft invoices for return sections (but they count towards DOCS).
      if (['cancelled', 'draft'].includes((inv.status || '').toLowerCase())) {
        console.log(`  --> SKIPPED: Invoice status is ${inv.status}.`);
        continue;
      }

      const rateGroups = new Map();
      for (const item of inv.items) {
        // NOTE: We should ideally resolve from Unified GST Engine here, but for now we fallback to 0 if missing.
        const rate = roundTwo(item.gst_rate || 0);
        if (!rateGroups.has(rate)) {
          rateGroups.set(rate, { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
        }
        const g = rateGroups.get(rate);
        g.taxable += roundTwo(item.taxable_value);
        g.cgst    += roundTwo(item.cgst);
        g.sgst    += roundTwo(item.sgst);
        g.igst    += roundTwo(item.igst);
      }

      if (rateGroups.size === 0) {
        const fallbackRate = 0;
        rateGroups.set(fallbackRate, {
          taxable: roundTwo(inv.taxable_value),
          cgst:    roundTwo(inv.cgst),
          sgst:    roundTwo(inv.sgst),
          igst:    roundTwo(inv.igst),
        });
      }

      console.log(`  Rate Groups:`, Array.from(rateGroups.keys()));

      if (section === 'b2b') {
        for (const [rate, tax] of rateGroups) {
          b2b.push({
            gstin:             (inv.customer_gstin || '').trim().toUpperCase(),
            receiver_name:     inv.customer_name  || '',
            invoice_number:    inv.invoice_number || '',
            invoice_date:      formatGSTDate(inv.invoice_date),
            invoice_value:     roundTwo(inv.grand_total),
            place_of_supply:   pos,
            reverse_charge:    inv.reverse_charge || 'N',
            applicable_tax_rate: '',
            invoice_type:      inv.invoice_type   || 'Regular',
            ecommerce_gstin:   inv.ecommerce_gstin || '',
            rate,
            taxable_value:     roundTwo(tax.taxable),
            cgst:              roundTwo(tax.cgst),
            sgst:              roundTwo(tax.sgst),
            igst:              roundTwo(tax.igst),
            cess:              0,
          });
        }
        console.log(`  --> Added to B2B`);
      } else if (section === 'b2cl') {
        for (const [rate, tax] of rateGroups) {
          b2cl.push({
            invoice_number:    inv.invoice_number || '',
            invoice_date:      formatGSTDate(inv.invoice_date),
            invoice_value:     roundTwo(inv.grand_total),
            place_of_supply:   pos,
            applicable_tax_rate: '',
            rate,
            taxable_value:     roundTwo(tax.taxable),
            cgst:              roundTwo(tax.cgst),
            sgst:              roundTwo(tax.sgst),
            igst:              roundTwo(tax.igst),
            cess:              0,
            ecommerce_gstin:   inv.ecommerce_gstin || '',
          });
        }
        console.log(`  --> Added to B2CL`);
      } else {
        for (const [rate, tax] of rateGroups) {
          const key = `${pos}_${rate}`;
          if (!b2csMap.has(key)) {
            b2csMap.set(key, {
              type:           'OE',
              place_of_supply: pos,
              rate,
              taxable_value:  0,
              cgst:           0,
              sgst:           0,
              igst:           0,
              cess:           0,
              ecommerce_gstin: '',
            });
          }
          const row = b2csMap.get(key);
          row.taxable_value = roundTwo(row.taxable_value + tax.taxable);
          row.cgst          = roundTwo(row.cgst + tax.cgst);
          row.sgst          = roundTwo(row.sgst + tax.sgst);
          row.igst          = roundTwo(row.igst + tax.igst);
        }
        console.log(`  --> Added to B2CS`);
      }
    }
    console.log('------------------------------------');

    const b2cs = Array.from(b2csMap.values());
    const validInvoices = allInvoices.filter(i => !['cancelled', 'draft'].includes((i.status || '').toLowerCase()));
    const hsn  = buildHsnSummary(validInvoices);
    const docs = buildDocSummary(allInvoices);
    const health = validateInvoices(allInvoices, company);

    const mm   = period.month ? String(period.month).padStart(2, '0') : '--';
    const yyyy = period.year  || '----';

    return {
      meta: {
        period:       `${mm}/${yyyy}`,
        generated_at: new Date().toISOString(),
        gstin:        company.gstin,
      },
      company,
      health,
      b2b,
      b2cl,
      b2cs,
      hsn,
      docs,
    };
}

module.exports = {
  buildGstrData,
  formatGSTDate,
  resolveStateCode,
  isValidGSTIN
};
