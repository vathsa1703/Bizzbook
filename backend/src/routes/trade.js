// ============================================================================
// Import & Export Intelligence API
// Mounted at /api/trade (auth + branchAuth + rbac applied globally in app.js).
// Thin controllers — all logic lives in tradeService. Mirrors routes/compliance.js.
// ============================================================================
const express = require('express');
const multer = require('multer');
const router = express.Router();
const svc = require('../services/tradeService');

const isAdmin = (req) => ['admin', 'OWNER', 'MANAGER'].includes(req.user.role);

// Document Vault upload — disk storage under data/trade/<companyId>/, mirroring
// the compliance/growth upload routes. 15MB cap; PDFs/images/Office docs.
const ALLOWED_MIME = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const storage = multer.diskStorage({
  destination: (req, file, cb) => { try { cb(null, svc.companyDir(req.user.companyId)); } catch (e) { cb(e); } },
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype) && !file.mimetype.startsWith('image/')) {
      const err = new Error(`Unsupported file type: ${file.mimetype}`);
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

// ── Business profile (shared with Compliance) ────────────────────────────────
router.get('/profile', (req, res) => {
  try { res.json({ profile: svc.getProfile(req.user.companyId) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/profile', (req, res) => {
  try {
    const profile = svc.saveProfile(req.user.companyId, req.body || {});
    const result = svc.recompute(req.user.companyId);
    res.json({ profile, recompute: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/recompute', (req, res) => {
  try {
    const result = svc.recompute(req.user.companyId);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Dashboard ──────────────────────────────────────────────────────────────
router.get('/overview', (req, res) => {
  try { res.json(svc.getOverview(req.user.companyId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Guideline catalog (public browse) ────────────────────────────────────────
router.get('/guidelines', (req, res) => {
  try { res.json({ guidelines: svc.getGuidelines(req.query) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/guidelines/:id', (req, res) => {
  try {
    const result = svc.getGuidelineDetail(Number(req.params.id));
    if (result.error === 'not_found') return res.status(404).json({ error: 'Guideline not found' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Requirements (per-company materialized applicable items) ────────────────
router.get('/requirements', (req, res) => {
  try {
    const { category, status } = req.query;
    res.json({ requirements: svc.getRequirements(req.user.companyId, { category, status }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/requirements/:id', (req, res) => {
  try {
    const result = svc.getRequirementDetail(req.user.companyId, Number(req.params.id));
    if (result.error === 'not_found') return res.status(404).json({ error: 'Requirement not found' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/requirements/:id', (req, res) => {
  try {
    const result = svc.updateRequirement(req.user.companyId, Number(req.params.id), req.body || {});
    if (result.error === 'not_found') return res.status(404).json({ error: 'Requirement not found' });
    res.json({ requirement: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Document Checklist (Document Vault integration) ──────────────────────────
router.post('/requirements/:id/documents', upload.array('files', 10), (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No file uploaded' });
    const requirementId = Number(req.params.id);
    const results = [];
    for (const file of req.files) {
      const docName = (req.files.length === 1 && req.body.doc_name) ? req.body.doc_name : file.originalname;
      const r = svc.recordUpload(req.user.companyId, requirementId, {
        file, docName, expiryDate: req.body.expiry_date, uploadedBy: req.user.userId,
      });
      if (r.error === 'not_found') return res.status(404).json({ error: 'Requirement not found' });
      results.push(r);
    }
    res.status(201).json({ documents: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/requirements/:id/documents', (req, res) => {
  try {
    res.json({ documents: svc.listChecklistDocuments(req.user.companyId, Number(req.params.id), { includeHistory: req.query.history === '1' }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/documents/:docId/download', (req, res) => {
  try {
    const doc = svc.getDocumentForDownload(req.user.companyId, Number(req.params.docId));
    if (!doc || !doc.file_path) return res.status(404).json({ error: 'Document not found' });
    res.download(doc.file_path, doc.original_name || doc.doc_name);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/documents/:docId', (req, res) => {
  try {
    const r = svc.updateDocument(req.user.companyId, Number(req.params.docId), req.body || {});
    if (r.error === 'not_found') return res.status(404).json({ error: 'Document not found' });
    res.json({ document: r });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/documents/:docId', (req, res) => {
  try {
    const r = svc.deleteDocument(req.user.companyId, Number(req.params.docId));
    if (r.error === 'not_found') return res.status(404).json({ error: 'Document not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Reference data ─────────────────────────────────────────────────────────
router.get('/authorities', (req, res) => {
  try { res.json({ authorities: svc.getAuthorities() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/countries', (req, res) => {
  try { res.json({ countries: svc.getCountries() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/countries/:code', (req, res) => {
  try {
    const c = svc.getCountryDetail(req.params.code.toUpperCase());
    if (c.error === 'not_found') return res.status(404).json({ error: 'Country not found' });
    res.json({ country: c });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI Trade Copilot ─────────────────────────────────────────────────────────
// POST /api/trade/copilot  { question }
router.post('/copilot', (req, res) => {
  try {
    if (!req.body || !req.body.question) return res.status(400).json({ error: 'question is required' });
    res.json(svc.copilot(req.user.companyId, req.body.question));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: guideline management (data-driven, no code changes) ──────────────
router.get('/admin/guidelines', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    res.json({ guidelines: svc.listGuidelinesAdmin({ country: req.query.country }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/guidelines', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    const result = svc.createGuideline(req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/admin/guidelines/:id', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    res.json({ guideline: svc.updateGuideline(Number(req.params.id), req.body || {}) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/guidelines/:id', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    res.json(svc.deleteGuideline(Number(req.params.id)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Upload error normalization (mirrors routes/growth.js) ────────────────────
router.use((err, req, res, next) => {
  if (err && (err.name === 'MulterError' || err.status === 400)) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 15MB).' : err.message;
    return res.status(400).json({ error: message, code: err.code });
  }
  next(err);
});

module.exports = router;
