// backend/src/exporters/gstJsonExporter.js
//
// Generates the GSTN API–compatible JSON structure for GSTR-1 upload.
// The output follows the GST Portal JSON schema (version GST3.0.4).
// File size is checked against the 5 MB portal limit.

'use strict';

const JSON_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB

/**
 * Group an array by a key function.
 * @param {Array} arr
 * @param {Function} keyFn
 * @returns {Map}
 */
function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

function roundTwo(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ─── Section builders ─────────────────────────────────────────────────────────

/**
 * B2B: grouped by recipient GSTIN (ctin)
 */
function buildB2bJson(b2bRows) {
  const byGstin = groupBy(b2bRows, r => r.gstin);
  const result  = [];

  for (const [ctin, invRows] of byGstin) {
    // Group rows back by invoice_number (one invoice may have multiple rate rows)
    const byInvoice = groupBy(invRows, r => r.invoice_number);
    const invList   = [];

    for (const [invNo, rateRows] of byInvoice) {
      const first = rateRows[0];
      invList.push({
        inum:  invNo,
        idt:   first.invoice_date,
        val:   roundTwo(first.invoice_value),
        pos:   first.place_of_supply,
        rchrg: first.reverse_charge || 'N',
        inv_typ: mapInvoiceType(first.invoice_type),
        etin:  first.ecommerce_gstin || undefined,
        itms:  rateRows.map(r => ({
          num:  1,
          itm_det: {
            rt:   roundTwo(r.rate),
            txval: roundTwo(r.taxable_value),
            iamt: roundTwo(r.igst || 0),
            camt: roundTwo(r.cgst || 0),
            samt: roundTwo(r.sgst || 0),
            csamt: roundTwo(r.cess || 0),
          },
        })),
      });
    }

    result.push({ ctin, inv: invList });
  }

  return result;
}

/**
 * B2CL: grouped by Place of Supply (pos)
 */
function buildB2clJson(b2clRows) {
  const byPos = groupBy(b2clRows, r => r.place_of_supply);
  const result = [];

  for (const [pos, invRows] of byPos) {
    const byInvoice = groupBy(invRows, r => r.invoice_number);
    const invList   = [];

    for (const [invNo, rateRows] of byInvoice) {
      const first = rateRows[0];
      invList.push({
        inum: invNo,
        idt:  first.invoice_date,
        val:  roundTwo(first.invoice_value),
        etin: first.ecommerce_gstin || undefined,
        itms: rateRows.map(r => ({
          num: 1,
          itm_det: {
            rt:    roundTwo(r.rate),
            txval: roundTwo(r.taxable_value),
            iamt:  roundTwo(r.igst || 0),
            camt:  roundTwo(r.cgst || 0),
            samt:  roundTwo(r.sgst || 0),
            csamt: roundTwo(r.cess || 0),
          },
        })),
      });
    }

    result.push({ pos, inv: invList });
  }

  return result;
}

/**
 * B2CS: array of aggregated entries
 */
function buildB2csJson(b2csRows) {
  return b2csRows.map(r => ({
    sply_tp: r.type === 'E' ? 'INTER' : 'INTRA',
    pos:     r.place_of_supply,
    typ:     r.type || 'OE',
    rt:      roundTwo(r.rate),
    txval:   roundTwo(r.taxable_value),
    iamt:    roundTwo(r.igst || 0),
    camt:    roundTwo(r.cgst || 0),
    samt:    roundTwo(r.sgst || 0),
    csamt:   roundTwo(r.cess || 0),
    etin:    r.ecommerce_gstin || undefined,
  }));
}

/**
 * HSN summary
 */
function buildHsnJson(hsnRows) {
  return {
    data: hsnRows.map((r, idx) => ({
      num:  idx + 1,
      hsn_sc: r.hsn_code,
      desc:   r.description || '',
      uqc:    r.uqc         || 'NOS',
      qty:    roundTwo(r.total_quantity),
      val:    roundTwo(r.total_value),
      txval:  roundTwo(r.taxable_value),
      iamt:   roundTwo(r.igst),
      camt:   roundTwo(r.cgst),
      samt:   roundTwo(r.sgst),
      csamt:  roundTwo(r.cess || 0),
    })),
  };
}

/**
 * Document issue summary
 */
function buildDocIssueJson(docsRows) {
  return {
    doc_det: docsRows.map((r, idx) => ({
      doc_num:  idx + 1,
      doc_typ:  r.nature,
      docs: [{
        num:       1,
        from:      r.sr_from,
        to:        r.sr_to,
        totnum:    r.total,
        cancel:    r.cancelled || 0,
        net_issue: r.total - (r.cancelled || 0),
      }],
    })),
  };
}

function mapInvoiceType(t) {
  const m = {
    'Regular':              'R',
    'SEZ with payment':     'SEWP',
    'SEZ without payment':  'SEWOP',
    'Deemed Export':        'DE',
  };
  return m[t] || 'R';
}

/**
 * Derive the filing period string "MMYYYY" from the meta.period "MM/YYYY".
 */
function buildFp(metaPeriod) {
  if (!metaPeriod || metaPeriod === '--/----') return '';
  const [mm, yyyy] = metaPeriod.split('/');
  return `${mm}${yyyy}`;
}

// ─── Main export function ────────────────────────────────────────────────────

/**
 * Generate the GSTN-compatible JSON string for GSTR-1 portal upload.
 * @param {object} gstrData — output of gstFilingService.buildGstrData()
 * @returns {{ json: string, sizeBytes: number, overLimit: boolean }}
 */
function generateGstrJson(gstrData) {
  const { b2b, b2cl, b2cs, hsn, docs, meta, company } = gstrData;

  const payload = {
    gstin:     company.gstin,
    fp:        buildFp(meta.period),
    gt:        0,           // gross turnover — optional, omitted
    cur_gt:    0,           // current period gross turnover — optional
    version:   'GST3.0.4',
    hash:      'hash',      // placeholder; real portal computes this server-side
    b2b:       buildB2bJson(b2b),
    b2cl:      buildB2clJson(b2cl),
    b2cs:      buildB2csJson(b2cs),
    hsn:       buildHsnJson(hsn),
    doc_issue: buildDocIssueJson(docs),
  };

  // Remove empty arrays to keep the file lean
  if (!payload.b2b.length)               delete payload.b2b;
  if (!payload.b2cl.length)              delete payload.b2cl;
  if (!payload.b2cs.length)              delete payload.b2cs;
  if (!payload.hsn.data.length)          delete payload.hsn;
  if (!payload.doc_issue.doc_det.length) delete payload.doc_issue;

  const json      = JSON.stringify(payload, null, 2);
  const sizeBytes = Buffer.byteLength(json, 'utf8');

  return {
    json,
    sizeBytes,
    overLimit: sizeBytes > JSON_SIZE_LIMIT,
    limitBytes: JSON_SIZE_LIMIT,
  };
}

module.exports = { generateGstrJson };
