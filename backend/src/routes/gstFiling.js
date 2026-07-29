// backend/src/routes/gstFiling.js
//
// API routes for the GST Filing Export module.
// Completely separate from /api/export (the internal analytics workbook).
//
// Endpoints:
//   GET /api/gst-filing/preview   — JSON health report + classified counts
//   GET /api/gst-filing/excel     — Official GSTR-1 Excel workbook (.xlsx)
//   GET /api/gst-filing/csv       — ZIP of per-section CSV files
//   GET /api/gst-filing/json      — GSTN-compatible JSON for portal upload

'use strict';

const express  = require('express');
const { buildGstrData }     = require('../services/gstFilingService');
const { generateGstrExcel } = require('../exporters/gstExcelExporter');
const { generateGstrCsvZip }= require('../exporters/gstCsvExporter');
const { generateGstrJson }  = require('../exporters/gstJsonExporter');

const router = express.Router();

// ─── Period parsing helper ───────────────────────────────────────────────────

function parsePeriod(query) {
  const month = query.month ? parseInt(query.month, 10) : null;
  const year  = query.year  ? parseInt(query.year,  10) : null;

  if (month !== null && (isNaN(month) || month < 1 || month > 12)) {
    return { error: 'month must be between 1 and 12' };
  }
  if (year !== null && (isNaN(year) || year < 2017 || year > 2100)) {
    return { error: 'year must be a valid 4-digit year (2017 onward)' };
  }

  return { month: month || undefined, year: year || undefined };
}

// ─── GET /api/gst-filing/preview ────────────────────────────────────────────
//
// Returns a JSON object with:
//  - company info (to verify GST registration completeness)
//  - health report (validation warnings, counts)
//  - summary counts per section (b2b, b2cl, b2cs, hsn lines)
//  - can_export flag

router.get('/preview', async (req, res, next) => {
  try {
    const period = parsePeriod(req.query);
    if (period.error) return res.status(400).json({ error: period.error });

    const data = await buildGstrData({ ...period, companyId: req.user.companyId });

    // Company GST readiness check
    const c = data.company;
    const missingCompanyFields = [];
    if (!c.gstin)      missingCompanyFields.push('GSTIN');
    if (!c.legal_name) missingCompanyFields.push('Legal Name');
    if (!c.state_code) missingCompanyFields.push('State Code');
    if (!c.pan)        missingCompanyFields.push('PAN');

    const companyReady = missingCompanyFields.length === 0;

    res.json({
      period:   data.meta.period,
      company: {
        ...data.company,
        ready:          companyReady,
        missing_fields: missingCompanyFields,
      },
      health:   data.health,
      summary: {
        b2b_invoices:  data.b2b.length,
        b2cl_invoices: data.b2cl.length,
        b2cs_entries:  data.b2cs.length,
        hsn_lines:     data.hsn.length,
        doc_lines:     data.docs.length,
        b2b_taxable:   data.b2b.reduce((s, r) => s + r.taxable_value, 0),
        b2cl_taxable:  data.b2cl.reduce((s, r) => s + r.taxable_value, 0),
        b2cs_taxable:  data.b2cs.reduce((s, r) => s + r.taxable_value, 0),
      },
      can_export: data.health.can_export && companyReady,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/gst-filing/excel ───────────────────────────────────────────────

router.get('/excel', async (req, res, next) => {
  try {
    const period = parsePeriod(req.query);
    if (period.error) return res.status(400).json({ error: period.error });

    const data = await buildGstrData({ ...period, companyId: req.user.companyId });

    if (!data.health.can_export) {
      return res.status(422).json({
        error:    'Cannot export: critical validation errors exist',
        health:   data.health,
        warnings: data.health.warnings.filter(w =>
          ['invalid_gstin','tax_mismatch','duplicate'].includes(w.type)
        ),
      });
    }

    const buffer   = await generateGstrExcel(data);
    const gstin    = (data.company.gstin || 'UNKNOWN').replace(/[^A-Z0-9]/g, '');
    const period2  = (data.meta.period || 'export').replace('/', '_');
    const filename = `GSTR1_${gstin}_${period2}.xlsx`;

    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/gst-filing/csv ─────────────────────────────────────────────────

router.get('/csv', async (req, res, next) => {
  try {
    const period = parsePeriod(req.query);
    if (period.error) return res.status(400).json({ error: period.error });

    const data = await buildGstrData({ ...period, companyId: req.user.companyId });

    if (!data.health.can_export) {
      return res.status(422).json({
        error:  'Cannot export: critical validation errors exist',
        health: data.health,
      });
    }

    const zipBuf  = generateGstrCsvZip(data);
    const gstin   = (data.company.gstin || 'UNKNOWN').replace(/[^A-Z0-9]/g, '');
    const period2 = (data.meta.period || 'export').replace('/', '_');
    const filename = `GSTR1_${gstin}_${period2}_CSV.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(zipBuf);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/gst-filing/json ────────────────────────────────────────────────

router.get('/json', async (req, res, next) => {
  try {
    const period = parsePeriod(req.query);
    if (period.error) return res.status(400).json({ error: period.error });

    const data = await buildGstrData({ ...period, companyId: req.user.companyId });

    if (!data.health.can_export) {
      return res.status(422).json({
        error:  'Cannot export: critical validation errors exist',
        health: data.health,
      });
    }

    const { json, sizeBytes, overLimit, limitBytes } = generateGstrJson(data);

    if (overLimit) {
      return res.status(422).json({
        error: `JSON file exceeds the 5 MB GSTN portal limit (${(sizeBytes / 1024 / 1024).toFixed(2)} MB). Split the data into smaller monthly batches or reduce invoice count per export.`,
        size_mb: (sizeBytes / 1024 / 1024).toFixed(2),
        limit_mb: (limitBytes / 1024 / 1024).toFixed(0),
      });
    }

    const gstin    = (data.company.gstin || 'UNKNOWN').replace(/[^A-Z0-9]/g, '');
    const period2  = (data.meta.period || 'export').replace('/', '_');
    const filename = `GSTR1_${gstin}_${period2}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(json);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
