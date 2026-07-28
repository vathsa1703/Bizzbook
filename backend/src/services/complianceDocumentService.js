// ============================================================================
// Compliance Document Vault — versioned document management.
// Files are stored on disk under data/compliance/<companyId>/ (same disk-storage
// approach as the OCR upload route). Metadata lives in compliance_item_documents.
// Replacing a document keeps history: the old row's is_current flips to 0 and a
// new row is inserted with version+1.
//
// Phase 2 dual-engine: exported functions are async and go through
// config/dbEngine.js's dbGet/dbAll/withExecutor/withTxExecutor.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { dbGet, dbAll, withExecutor, withTxExecutor } = require('../config/dbEngine');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'compliance');

function companyDir(companyId) {
  const d = path.join(DATA_DIR, String(companyId));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

async function logEvent(x, companyId, itemId, eventType, detail) {
  try {
    await x.run('INSERT INTO compliance_events (company_id, item_id, event_type, detail) VALUES (?, ?, ?, ?)',
      [companyId, itemId, eventType, detail]);
  } catch (_) { /* non-fatal */ }
}

// Record a file that multer has already saved to disk. `file` is the multer file.
async function recordUpload(companyId, itemId, { file, docName, documentType, expiryDate, uploadedBy }) {
  const item = await dbGet('SELECT id FROM business_compliance_items WHERE id = ? AND company_id = ?', [itemId, companyId]);
  if (!item) { try { fs.unlinkSync(file.path); } catch (_) {} return { error: 'not_found' }; }

  const slot = docName || file.originalname;
  try {
    return await withTxExecutor(async (x) => {
      // Version handling: supersede the previous current doc for the same slot.
      const prev = await x.get(
        'SELECT id, version FROM compliance_item_documents WHERE item_id = ? AND doc_name = ? AND is_current = TRUE',
        [itemId, slot]
      );
      let version = 1;
      if (prev) {
        await x.run('UPDATE compliance_item_documents SET is_current = FALSE WHERE id = ?', [prev.id]);
        version = (prev.version || 1) + 1;
      }
      const docId = await x.insert(`
        INSERT INTO compliance_item_documents
          (company_id, item_id, doc_name, document_type, file_path, original_name, mime_type, file_size,
           uploaded_by, status, expiry_date, version, is_current)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?, TRUE)
      `, [
        companyId, itemId, slot, documentType || null, file.path, file.originalname,
        file.mimetype || null, file.size || null, uploadedBy || null, expiryDate || null, version
      ]);
      await logEvent(x, companyId, itemId, 'document_uploaded', `${slot} v${version}`);
      return x.get('SELECT * FROM compliance_item_documents WHERE id = ?', [docId]);
    });
  } catch (e) {
    try { fs.unlinkSync(file.path); } catch (_) {}
    throw e;
  }
}

async function listDocuments(companyId, itemId, { includeHistory = false } = {}) {
  const cols = 'id, item_id, doc_name, document_type, original_name, mime_type, file_size, status, expiry_date, verified, verification_notes, version, is_current, uploaded_at';
  const sql = includeHistory
    ? `SELECT ${cols} FROM compliance_item_documents WHERE company_id = ? AND item_id = ? ORDER BY doc_name, version DESC`
    : `SELECT ${cols} FROM compliance_item_documents WHERE company_id = ? AND item_id = ? AND is_current = TRUE ORDER BY doc_name`;
  return dbAll(sql, [companyId, itemId]);
}

// Returns the DB row incl. file_path — caller streams the file.
async function getForDownload(companyId, docId) {
  return dbGet('SELECT * FROM compliance_item_documents WHERE id = ? AND company_id = ?', [docId, companyId]);
}

async function deleteDocument(companyId, docId) {
  const doc = await dbGet('SELECT * FROM compliance_item_documents WHERE id = ? AND company_id = ?', [docId, companyId]);
  if (!doc) return { error: 'not_found' };
  await withTxExecutor(async (x) => {
    await x.run('DELETE FROM compliance_item_documents WHERE id = ?', [docId]);
    // Promote the newest remaining version of the same slot to current.
    if (doc.is_current) {
      const next = await x.get(
        'SELECT id FROM compliance_item_documents WHERE item_id = ? AND doc_name = ? ORDER BY version DESC LIMIT 1',
        [doc.item_id, doc.doc_name]
      );
      if (next) await x.run('UPDATE compliance_item_documents SET is_current = TRUE WHERE id = ?', [next.id]);
    }
    await logEvent(x, companyId, doc.item_id, 'document_deleted', doc.doc_name);
  });
  if (doc.file_path) { try { fs.unlinkSync(doc.file_path); } catch (_) {} }
  return { deleted: true };
}

async function updateDocument(companyId, docId, patch = {}) {
  return withExecutor(async (x) => {
    const doc = await x.get('SELECT id, item_id FROM compliance_item_documents WHERE id = ? AND company_id = ?', [docId, companyId]);
    if (!doc) return { error: 'not_found' };
    const sets = [], params = [];
    if (patch.verified !== undefined) { sets.push('verified = ?'); params.push(patch.verified ? 1 : 0); }
    if (patch.verification_notes !== undefined) { sets.push('verification_notes = ?'); params.push(patch.verification_notes); }
    if (patch.expiry_date !== undefined) { sets.push('expiry_date = ?'); params.push(patch.expiry_date); }
    if (patch.document_type !== undefined) { sets.push('document_type = ?'); params.push(patch.document_type); }
    if (!sets.length) return x.get('SELECT * FROM compliance_item_documents WHERE id = ?', [docId]);
    await x.run(`UPDATE compliance_item_documents SET ${sets.join(', ')} WHERE id = ?`, [...params, docId]);
    await logEvent(x, companyId, doc.item_id, 'document_verified', patch.verified ? 'verified' : 'updated');
    return x.get('SELECT * FROM compliance_item_documents WHERE id = ?', [docId]);
  });
}

// Company-wide document status counts (for the dashboard).
async function documentSummary(companyId) {
  return withExecutor(async (x) => {
    // date('now') is SQLite-only; Postgres's expiry_date is a native DATE column,
    // so CURRENT_DATE is the direct equivalent (same pattern as credits.js).
    const todaySql = x.engine === 'postgres' ? 'CURRENT_DATE' : "date('now')";
    const row = await x.get(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date < ${todaySql} THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN verified = TRUE THEN 1 ELSE 0 END) AS verified
      FROM compliance_item_documents
      WHERE company_id = ? AND is_current = TRUE
    `, [companyId]);
    return { total: row.total || 0, expired: row.expired || 0, verified: row.verified || 0 };
  });
}

module.exports = {
  companyDir, recordUpload, listDocuments, getForDownload, deleteDocument, updateDocument, documentSummary,
};
