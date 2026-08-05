// backend/src/exporters/gstExcelExporter.js
//
// Generates an official GST Offline Utility–compatible Excel workbook (.xlsx)
// from the structured data produced by gstFilingService.buildGstrData().
// Column order and sheet names exactly match the GSTN offline tool requirements.
// Does NOT touch the existing internal gst-workbook route.

'use strict';

const ExcelJS = require('exceljs');

// ─── Style helpers ───────────────────────────────────────────────────────────

const HEADER_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } };
const HEADER_FONT  = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 };
const HEADER_ALIGN = { horizontal: 'center', vertical: 'middle', wrapText: true };
const CELL_FONT    = { name: 'Arial', size: 10 };
const NUM_FMT      = '#,##0.00';

function styleHeader(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell(cell => {
    cell.fill      = HEADER_FILL;
    cell.font      = HEADER_FONT;
    cell.alignment = HEADER_ALIGN;
    cell.border    = {
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
}

function styleDataRows(sheet, numericCols = []) {
  sheet.eachRow((row, rn) => {
    if (rn === 1) return;
    row.eachCell(cell => {
      cell.font      = CELL_FONT;
      cell.alignment = { vertical: 'middle' };
    });
    numericCols.forEach(col => {
      const cell = row.getCell(col);
      if (cell.value !== null && cell.value !== '') {
        cell.numFmt = NUM_FMT;
      }
    });
  });
}

function addNote(sheet, message) {
  const noteRow = sheet.addRow([message]);
  noteRow.font = { italic: true, color: { argb: 'FF6B7280' }, size: 9, name: 'Arial' };
  sheet.mergeCells(`A${noteRow.number}:M${noteRow.number}`);
}

// ─── Sheet builders ──────────────────────────────────────────────────────────

function buildB2BSheet(wb, b2bRows) {
  const sheet = wb.addWorksheet('b2b');
  sheet.columns = [
    { header: 'GSTIN/UIN of Recipient',     key: 'gstin',               width: 20 },
    { header: 'Receiver Name',              key: 'receiver_name',       width: 25 },
    { header: 'Invoice Number',             key: 'invoice_number',      width: 18 },
    { header: 'Invoice Date',               key: 'invoice_date',        width: 14 },
    { header: 'Invoice Value',              key: 'invoice_value',       width: 14 },
    { header: 'Place Of Supply',            key: 'place_of_supply',     width: 14 },
    { header: 'Reverse Charge',             key: 'reverse_charge',      width: 13 },
    { header: 'Applicable % of Tax Rate',   key: 'applicable_tax_rate', width: 14 },
    { header: 'Invoice Type',               key: 'invoice_type',        width: 20 },
    { header: 'E-Commerce GSTIN',           key: 'ecommerce_gstin',     width: 20 },
    { header: 'Rate',                       key: 'rate',                width: 8  },
    { header: 'Taxable Value',              key: 'taxable_value',       width: 14 },
    { header: 'Cess Amount',                key: 'cess',                width: 12 },
  ];

  b2bRows.forEach(r => sheet.addRow(r));
  styleHeader(sheet);
  styleDataRows(sheet, ['invoice_value', 'taxable_value', 'cess', 'rate']);
  return sheet;
}

function buildB2CLSheet(wb, b2clRows) {
  const sheet = wb.addWorksheet('b2cl');
  sheet.columns = [
    { header: 'Invoice Number',             key: 'invoice_number',      width: 18 },
    { header: 'Invoice Date',               key: 'invoice_date',        width: 14 },
    { header: 'Invoice Value',              key: 'invoice_value',       width: 14 },
    { header: 'Place Of Supply',            key: 'place_of_supply',     width: 14 },
    { header: 'Applicable % of Tax Rate',   key: 'applicable_tax_rate', width: 14 },
    { header: 'Rate',                       key: 'rate',                width: 8  },
    { header: 'Taxable Value',              key: 'taxable_value',       width: 14 },
    { header: 'Cess Amount',                key: 'cess',                width: 12 },
    { header: 'E-Commerce GSTIN',           key: 'ecommerce_gstin',     width: 20 },
  ];

  b2clRows.forEach(r => sheet.addRow(r));
  styleHeader(sheet);
  styleDataRows(sheet, ['invoice_value', 'taxable_value', 'cess', 'rate']);
  return sheet;
}

function buildB2CSSheet(wb, b2csRows) {
  const sheet = wb.addWorksheet('b2cs');
  sheet.columns = [
    { header: 'Type',              key: 'type',            width: 12 },
    { header: 'Place Of Supply',   key: 'place_of_supply', width: 14 },
    { header: 'Rate',              key: 'rate',            width: 8  },
    { header: 'Taxable Value',     key: 'taxable_value',   width: 14 },
    { header: 'Cess Amount',       key: 'cess',            width: 12 },
    { header: 'E-Commerce GSTIN',  key: 'ecommerce_gstin', width: 20 },
  ];

  b2csRows.forEach(r => sheet.addRow(r));
  styleHeader(sheet);
  styleDataRows(sheet, ['taxable_value', 'cess', 'rate']);
  return sheet;
}

function buildHSNSheet(wb, hsnRows) {
  const sheet = wb.addWorksheet('hsn');
  sheet.columns = [
    { header: 'HSN',                     key: 'hsn_code',       width: 12 },
    { header: 'Description',             key: 'description',    width: 30 },
    { header: 'UQC',                     key: 'uqc',            width: 8  },
    { header: 'Total Quantity',          key: 'total_quantity',  width: 14 },
    { header: 'Total Value',             key: 'total_value',     width: 14 },
    { header: 'Taxable Value',           key: 'taxable_value',   width: 14 },
    { header: 'Integrated Tax Amount',   key: 'igst',            width: 14 },
    { header: 'Central Tax Amount',      key: 'cgst',            width: 14 },
    { header: 'State/UT Tax Amount',     key: 'sgst',            width: 14 },
    { header: 'Cess Amount',             key: 'cess',            width: 12 },
  ];

  hsnRows.forEach(r => sheet.addRow(r));
  styleHeader(sheet);
  styleDataRows(sheet, ['total_quantity','total_value','taxable_value','igst','cgst','sgst','cess']);
  return sheet;
}

function buildDocsSheet(wb, docsRows) {
  const sheet = wb.addWorksheet('docs');
  sheet.columns = [
    { header: 'Nature of Document', key: 'nature',    width: 35 },
    { header: 'Sr. No. From',       key: 'sr_from',   width: 20 },
    { header: 'Sr. No. To',         key: 'sr_to',     width: 20 },
    { header: 'Total Number',       key: 'total',     width: 12 },
    { header: 'Cancelled',          key: 'cancelled', width: 12 },
  ];

  docsRows.forEach(r => sheet.addRow(r));
  styleHeader(sheet);
  styleDataRows(sheet);
  return sheet;
}

// Empty placeholder sheets required by the GSTN tool
function addEmptySheet(wb, name) {
  wb.addWorksheet(name);
}

// ─── Main export function ────────────────────────────────────────────────────

/**
 * Generate the official GSTR-1 Excel workbook buffer.
 * @param {object} gstrData — output of gstFilingService.buildGstrData()
 * @returns {Promise<Buffer>}
 */
async function generateGstrExcel(gstrData) {
  const { b2b, b2cl, b2cs, hsn, docs } = gstrData;

  const wb = new ExcelJS.Workbook();
  wb.creator  = 'ORUDINA GST Filing Module';
  wb.created  = new Date();
  wb.modified = new Date();

  // Required sheets in order
  buildB2BSheet(wb, b2b);
  buildB2CLSheet(wb, b2cl);
  buildB2CSSheet(wb, b2cs);
  addEmptySheet(wb, 'cdnr');    // Credit/Debit Notes (Registered) — future
  addEmptySheet(wb, 'cdnur');   // Credit/Debit Notes (Unregistered) — future
  addEmptySheet(wb, 'exp');     // Exports — future
  addEmptySheet(wb, 'at');      // Advance Tax — future
  addEmptySheet(wb, 'atadj');   // Advance Adjustments — future
  addEmptySheet(wb, 'exemp');   // Nil/Exempt — future
  buildHSNSheet(wb, hsn);
  buildDocsSheet(wb, docs);

  return wb.xlsx.writeBuffer();
}

module.exports = { generateGstrExcel };
