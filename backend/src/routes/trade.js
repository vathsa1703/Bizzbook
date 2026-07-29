// ============================================================================
// Import & Export Intelligence API
// Mounted at /api/trade (auth + branchAuth + rbac applied globally in app.js).
// Thin controllers — all logic lives in tradeService. Mirrors routes/compliance.js.
// Phase 2: tradeService's functions are now async (dual-engine SQLite/Postgres)
// except getProfile/saveProfile, which are re-exports of complianceService.js
// (out of this module's Phase 2 scope) and remain synchronous SQLite-only.
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
// getProfile/saveProfile are complianceService.js re-exports, now async
// (dual-engine executor pattern) — must be awaited.
router.get('/profile', async (req, res) => {
  try { res.json({ profile: await svc.getProfile(req.user.companyId) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/profile', async (req, res) => {
  try {
    const profile = await svc.saveProfile(req.user.companyId, req.body || {});
    const result = await svc.recompute(req.user.companyId);
    res.json({ profile, recompute: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/recompute', async (req, res) => {
  try {
    const result = await svc.recompute(req.user.companyId);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Dashboard ──────────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try { res.json(await svc.getOverview(req.user.companyId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Guideline catalog (public browse) ────────────────────────────────────────
router.get('/guidelines', async (req, res) => {
  try { res.json({ guidelines: await svc.getGuidelines(req.query) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/guidelines/:id', async (req, res) => {
  try {
    const result = await svc.getGuidelineDetail(Number(req.params.id));
    if (result.error === 'not_found') return res.status(404).json({ error: 'Guideline not found' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Requirements (per-company materialized applicable items) ────────────────
router.get('/requirements', async (req, res) => {
  try {
    const { category, status } = req.query;
    res.json({ requirements: await svc.getRequirements(req.user.companyId, { category, status }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/requirements/:id', async (req, res) => {
  try {
    const result = await svc.getRequirementDetail(req.user.companyId, Number(req.params.id));
    if (result.error === 'not_found') return res.status(404).json({ error: 'Requirement not found' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/requirements/:id', async (req, res) => {
  try {
    const result = await svc.updateRequirement(req.user.companyId, Number(req.params.id), req.body || {});
    if (result.error === 'not_found') return res.status(404).json({ error: 'Requirement not found' });
    res.json({ requirement: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Document Checklist (Document Vault integration) ──────────────────────────
router.post('/requirements/:id/documents', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No file uploaded' });
    const requirementId = Number(req.params.id);
    const results = [];
    for (const file of req.files) {
      const docName = (req.files.length === 1 && req.body.doc_name) ? req.body.doc_name : file.originalname;
      const r = await svc.recordUpload(req.user.companyId, requirementId, {
        file, docName, expiryDate: req.body.expiry_date, uploadedBy: req.user.userId,
      });
      if (r.error === 'not_found') return res.status(404).json({ error: 'Requirement not found' });
      results.push(r);
    }
    res.status(201).json({ documents: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/requirements/:id/documents', async (req, res) => {
  try {
    res.json({ documents: await svc.listChecklistDocuments(req.user.companyId, Number(req.params.id), { includeHistory: req.query.history === '1' }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/documents/:docId/download', async (req, res) => {
  try {
    const doc = await svc.getDocumentForDownload(req.user.companyId, Number(req.params.docId));
    if (!doc || !doc.file_path) return res.status(404).json({ error: 'Document not found' });
    res.download(doc.file_path, doc.original_name || doc.doc_name);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/documents/:docId', async (req, res) => {
  try {
    const r = await svc.updateDocument(req.user.companyId, Number(req.params.docId), req.body || {});
    if (r.error === 'not_found') return res.status(404).json({ error: 'Document not found' });
    res.json({ document: r });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/documents/:docId', async (req, res) => {
  try {
    const r = await svc.deleteDocument(req.user.companyId, Number(req.params.docId));
    if (r.error === 'not_found') return res.status(404).json({ error: 'Document not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Reference data ─────────────────────────────────────────────────────────
router.get('/authorities', async (req, res) => {
  try { res.json({ authorities: await svc.getAuthorities() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/countries', async (req, res) => {
  try { res.json({ countries: await svc.getCountries() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/countries/:code', async (req, res) => {
  try {
    const c = await svc.getCountryDetail(req.params.code.toUpperCase());
    if (c.error === 'not_found') return res.status(404).json({ error: 'Country not found' });
    res.json({ country: c });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI Trade Copilot ─────────────────────────────────────────────────────────
// POST /api/trade/copilot  { question }
router.post('/copilot', async (req, res) => {
  try {
    if (!req.body || !req.body.question) return res.status(400).json({ error: 'question is required' });
    res.json(await svc.copilot(req.user.companyId, req.body.question));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: guideline management (data-driven, no code changes) ──────────────
router.get('/admin/guidelines', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    res.json({ guidelines: await svc.listGuidelinesAdmin({ country: req.query.country }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/guidelines', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    const result = await svc.createGuideline(req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/admin/guidelines/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    res.json({ guideline: await svc.updateGuideline(Number(req.params.id), req.body || {}) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/guidelines/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    res.json(await svc.deleteGuideline(Number(req.params.id)));
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
