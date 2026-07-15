// backend/src/exporters/gstCsvExporter.js
//
// Generates per-section CSV files for GSTR-1, bundled as a ZIP archive.
// Uses Node.js built-in zlib + archiver-free approach via Buffer manipulation.
// Returns a Buffer ready to be streamed as application/zip.

'use strict';

const { Readable, PassThrough } = require('stream');

// ─── CSV serialisation ───────────────────────────────────────────────────────

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  // Wrap in quotes if it contains comma, quote, or newline
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCsv(values) {
  return values.map(escapeCsv).join(',');
}

function buildCsv(headers, rows, rowMapper) {
  const lines = [rowToCsv(headers)];
  for (const row of rows) {
    lines.push(rowToCsv(rowMapper(row)));
  }
  return lines.join('\r\n') + '\r\n';
}

// ─── Per-section CSV builders ─────────────────────────────────────────────────

function b2bCsv(rows) {
  return buildCsv(
    [
      'GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice Date',
      'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate',
      'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount',
    ],
    rows,
    r => [
      r.gstin, r.receiver_name, r.invoice_number, r.invoice_date,
      r.invoice_value, r.place_of_supply, r.reverse_charge, r.applicable_tax_rate,
      r.invoice_type, r.ecommerce_gstin, r.rate, r.taxable_value, r.cess,
    ],
  );
}

function b2clCsv(rows) {
  return buildCsv(
    [
      'Invoice Number', 'Invoice Date', 'Invoice Value', 'Place Of Supply',
      'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN',
    ],
    rows,
    r => [
      r.invoice_number, r.invoice_date, r.invoice_value, r.place_of_supply,
      r.applicable_tax_rate, r.rate, r.taxable_value, r.cess, r.ecommerce_gstin,
    ],
  );
}

function b2csCsv(rows) {
  return buildCsv(
    ['Type', 'Place Of Supply', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
    rows,
    r => [r.type, r.place_of_supply, r.rate, r.taxable_value, r.cess, r.ecommerce_gstin],
  );
}

function hsnCsv(rows) {
  return buildCsv(
    [
      'HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value',
      'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount',
      'State/UT Tax Amount', 'Cess Amount',
    ],
    rows,
    r => [
      r.hsn_code, r.description, r.uqc, r.total_quantity, r.total_value,
      r.taxable_value, r.igst, r.cgst, r.sgst, r.cess,
    ],
  );
}

function docsCsv(rows) {
  return buildCsv(
    ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'],
    rows,
    r => [r.nature, r.sr_from, r.sr_to, r.total, r.cancelled],
  );
}

// ─── Simple ZIP builder (no external deps) ───────────────────────────────────
// Uses the 'archiver' API if available, or falls back to a plain ZIP built with
// Node.js built-in zlib. We use the archiver pattern via a self-contained
// implementation below that works with what is already installed.

// Since 'archiver' is not in package.json, we build a minimal ZIP using
// Node.js built-in Zlib's deflateRaw + a hand-written Local File Header.

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function uint32LE(n) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}
function uint16LE(n) {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(n & 0xFFFF, 0);
  return b;
}

function dosDateTime(d = new Date()) {
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date: dosDate, time: dosTime };
}

const zlib = require('zlib');

function deflateSync(buf) {
  // Use deflateRaw (method 8) with default compression
  return zlib.deflateRawSync(buf);
}

/**
 * Build a valid ZIP archive in memory from an array of { name, content } entries.
 * @param {Array<{name: string, content: Buffer|string}>} files
 * @returns {Buffer}
 */
function buildZip(files) {
  const localHeaders = [];
  let offset = 0;

  const chunks = [];
  const { date: dosDate, time: dosTime } = dosDateTime();

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const dataBuf = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content, 'utf8');

    const compressed = deflateSync(dataBuf);
    const crc       = crc32(dataBuf);
    const uncompLen = dataBuf.length;
    const compLen   = compressed.length;

    // Local File Header
    const lfh = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x03, 0x04]), // signature
      uint16LE(20),              // version needed
      uint16LE(0),               // flags
      uint16LE(8),               // method: deflate
      uint16LE(dosTime),
      uint16LE(dosDate),
      uint32LE(crc),
      uint32LE(compLen),
      uint32LE(uncompLen),
      uint16LE(nameBuf.length),  // file name length
      uint16LE(0),               // extra field length
      nameBuf,
    ]);

    localHeaders.push({ nameBuf, crc, compLen, uncompLen, offset, dosDate, dosTime });
    offset += lfh.length + compLen;

    chunks.push(lfh, compressed);
  }

  // Central Directory
  const cdChunks = [];
  for (const h of localHeaders) {
    const cde = Buffer.concat([
      Buffer.from([0x50, 0x4B, 0x01, 0x02]), // signature
      uint16LE(20),              // version made by
      uint16LE(20),              // version needed
      uint16LE(0),               // flags
      uint16LE(8),               // method
      uint16LE(h.dosTime),
      uint16LE(h.dosDate),
      uint32LE(h.crc),
      uint32LE(h.compLen),
      uint32LE(h.uncompLen),
      uint16LE(h.nameBuf.length),
      uint16LE(0),               // extra
      uint16LE(0),               // comment
      uint16LE(0),               // disk start
      uint16LE(0),               // internal attr
      uint32LE(0),               // external attr
      uint32LE(h.offset),
      h.nameBuf,
    ]);
    cdChunks.push(cde);
  }

  const cd = Buffer.concat(cdChunks);
  const cdOffset = offset;

  // End of Central Directory
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4B, 0x05, 0x06]),
    uint16LE(0),                       // disk number
    uint16LE(0),                       // disk with cd
    uint16LE(localHeaders.length),     // entries on disk
    uint16LE(localHeaders.length),     // total entries
    uint32LE(cd.length),
    uint32LE(cdOffset),
    uint16LE(0),                       // comment length
  ]);

  return Buffer.concat([...chunks, cd, eocd]);
}

// ─── Main export function ────────────────────────────────────────────────────

/**
 * Generate a ZIP buffer containing one CSV file per GSTR-1 section.
 * @param {object} gstrData — output of gstFilingService.buildGstrData()
 * @returns {Buffer}
 */
function generateGstrCsvZip(gstrData) {
  const { b2b, b2cl, b2cs, hsn, docs, meta } = gstrData;
  const period = (meta.period || 'export').replace('/', '_');

  const files = [
    { name: `GSTR1_${period}_b2b.csv`,  content: b2bCsv(b2b)   },
    { name: `GSTR1_${period}_b2cl.csv`, content: b2clCsv(b2cl) },
    { name: `GSTR1_${period}_b2cs.csv`, content: b2csCsv(b2cs) },
    { name: `GSTR1_${period}_hsn.csv`,  content: hsnCsv(hsn)   },
    { name: `GSTR1_${period}_docs.csv`, content: docsCsv(docs) },
  ];

  return buildZip(files);
}

module.exports = { generateGstrCsvZip };
