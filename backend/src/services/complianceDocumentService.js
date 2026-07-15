// ============================================================================
// Compliance Document Vault — versioned document management.
// Files are stored on disk under data/compliance/<companyId>/ (same disk-storage
// approach as the OCR upload route). Metadata lives in compliance_item_documents.
// Replacing a document keeps history: the old row's is_current flips to 0 and a
// new row is inserted with version+1.
// ============================================================================

const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/db');

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'compliance');

function companyDir(companyId) {
  const d = path.join(DATA_DIR, String(companyId));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function logEvent(db, companyId, itemId, eventType, detail) {
  try {
    db.prepare('INSERT INTO compliance_events (company_id, item_id, event_type, detail) VALUES (?, ?, ?, ?)')
      .run(companyId, itemId, eventType, detail);
  } catch (_) { /* non-fatal */ }
}

// Record a file that multer has already saved to disk. `file` is the multer file.
function recordUpload(companyId, itemId, { file, docName, documentType, expiryDate, uploadedBy }) {
  const db = getDb();
  try {
    const item = db.prepare('SELECT id FROM business_compliance_items WHERE id = ? AND company_id = ?').get(itemId, companyId);
    if (!item) { try { fs.unlinkSync(file.path); } catch (_) {} return { error: 'not_found' }; }

    const slot = docName || file.originalname;
    db.exec('BEGIN TRANSACTION');
    try {
      // Version handling: supersede the previous current doc for the same slot.
      const prev = db.prepare(
        'SELECT id, version FROM compliance_item_documents WHERE item_id = ? AND doc_name = ? AND is_current = 1'
      ).get(itemId, slot);
      let version = 1;
      if (prev) {
        db.prepare('UPDATE compliance_item_documents SET is_current = 0 WHERE id = ?').run(prev.id);
        version = (prev.version || 1) + 1;
      }
      const info = db.prepare(`
        INSERT INTO compliance_item_documents
          (company_id, item_id, doc_name, document_type, file_path, original_name, mime_type, file_size,
           uploaded_by, status, expiry_date, version, is_current)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?, 1)
      `).run(
        companyId, itemId, slot, documentType || null, file.path, file.originalname,
        file.mimetype || null, file.size || null, uploadedBy || null, expiryDate || null, version
      );
      logEvent(db, companyId, itemId, 'document_uploaded', `${slot} v${version}`);
      db.exec('COMMIT');
      return db.prepare('SELECT * FROM compliance_item_documents WHERE id = ?').get(info.lastInsertRowid);
    } catch (e) {
      db.exec('ROLLBACK');
      try { fs.unlinkSync(file.path); } catch (_) {}
      throw e;
    }
  } finally { db.close(); }
}

function listDocuments(companyId, itemId, { includeHistory = false } = {}) {
  const db = getDb();
  try {
    const cols = 'id, item_id, doc_name, document_type, original_name, mime_type, file_size, status, expiry_date, verified, verification_notes, version, is_current, uploaded_at';
    const sql = includeHistory
      ? `SELECT ${cols} FROM compliance_item_documents WHERE company_id = ? AND item_id = ? ORDER BY doc_name, version DESC`
      : `SELECT ${cols} FROM compliance_item_documents WHERE company_id = ? AND item_id = ? AND is_current = 1 ORDER BY doc_name`;
    return db.prepare(sql).all(companyId, itemId);
  } finally { db.close(); }
}

// Returns the DB row incl. file_path — caller streams the file.
function getForDownload(companyId, docId) {
  const db = getDb();
  try {
    return db.prepare('SELECT * FROM compliance_item_documents WHERE id = ? AND company_id = ?').get(docId, companyId) || null;
  } finally { db.close(); }
}

function deleteDocument(companyId, docId) {
  const db = getDb();
  try {
    const doc = db.prepare('SELECT * FROM compliance_item_documents WHERE id = ? AND company_id = ?').get(docId, companyId);
    if (!doc) return { error: 'not_found' };
    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare('DELETE FROM compliance_item_documents WHERE id = ?').run(docId);
      // Promote the newest remaining version of the same slot to current.
      if (doc.is_current) {
        const next = db.prepare(
          'SELECT id FROM compliance_item_documents WHERE item_id = ? AND doc_name = ? ORDER BY version DESC LIMIT 1'
        ).get(doc.item_id, doc.doc_name);
        if (next) db.prepare('UPDATE compliance_item_documents SET is_current = 1 WHERE id = ?').run(next.id);
      }
      logEvent(db, companyId, doc.item_id, 'document_deleted', doc.doc_name);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    if (doc.file_path) { try { fs.unlinkSync(doc.file_path); } catch (_) {} }
    return { deleted: true };
  } finally { db.close(); }
}

function updateDocument(companyId, docId, patch = {}) {
  const db = getDb();
  try {
    const doc = db.prepare('SELECT id, item_id FROM compliance_item_documents WHERE id = ? AND company_id = ?').get(docId, companyId);
    if (!doc) return { error: 'not_found' };
    const sets = [], params = [];
    if (patch.verified !== undefined) { sets.push('verified = ?'); params.push(patch.verified ? 1 : 0); }
    if (patch.verification_notes !== undefined) { sets.push('verification_notes = ?'); params.push(patch.verification_notes); }
    if (patch.expiry_date !== undefined) { sets.push('expiry_date = ?'); params.push(patch.expiry_date); }
    if (patch.document_type !== undefined) { sets.push('document_type = ?'); params.push(patch.document_type); }
    if (!sets.length) return db.prepare('SELECT * FROM compliance_item_documents WHERE id = ?').get(docId);
    db.prepare(`UPDATE compliance_item_documents SET ${sets.join(', ')} WHERE id = ?`).run(...params, docId);
    logEvent(db, companyId, doc.item_id, 'document_verified', patch.verified ? 'verified' : 'updated');
    return db.prepare('SELECT * FROM compliance_item_documents WHERE id = ?').get(docId);
  } finally { db.close(); }
}

// Company-wide document status counts (for the dashboard).
function documentSummary(companyId) {
  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date < date('now') THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) AS verified
      FROM compliance_item_documents
      WHERE company_id = ? AND is_current = 1
    `).get(companyId);
    return { total: row.total || 0, expired: row.expired || 0, verified: row.verified || 0 };
  } finally { db.close(); }
}

module.exports = {
  companyDir, recordUpload, listDocuments, getForDownload, deleteDocument, updateDocument, documentSummary,
};
