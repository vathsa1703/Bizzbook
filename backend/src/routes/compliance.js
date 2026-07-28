// ============================================================================
// Compliance Intelligence API
// Mounted at /api/compliance (auth + branchAuth + rbac applied globally in app.js).
// Thin controllers — all logic lives in complianceService.
//
// Phase 2 dual-engine: complianceService/complianceDocumentService/
// complianceReportService/complianceMeetingService are all async now, so every
// handler below is async with await added at each service call site. Response
// shapes/status codes/catch style are unchanged.
// ============================================================================
const express = require('express');
const multer = require('multer');
const router = express.Router();
const svc = require('../services/complianceService');
const docService = require('../services/complianceDocumentService');
const reportService = require('../services/complianceReportService');
const complianceReminders = require('../jobs/complianceReminders');

const isAdmin = (req) => ['admin', 'OWNER', 'MANAGER'].includes(req.user.role);

// Document Vault upload — disk storage under data/compliance/<companyId>/,
// mirroring the OCR route's multer approach. 15MB cap; PDFs/images/Office docs.
const ALLOWED_MIME = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const storage = multer.diskStorage({
  destination: (req, file, cb) => { try { cb(null, docService.companyDir(req.user.companyId)); } catch (e) { cb(e); } },
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_MIME.has(file.mimetype) || file.mimetype.startsWith('image/')),
});

// ── Reference data ──────────────────────────────────────────────────────────
// GET /api/compliance/categories
router.get('/categories', async (req, res) => {
  try { res.json({ categories: await svc.getCategories() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Business profile (onboarding answers) ───────────────────────────────────
// GET /api/compliance/profile
router.get('/profile', async (req, res) => {
  try { res.json({ profile: await svc.getProfile(req.user.companyId) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/compliance/profile  — save answers and immediately recompute items.
router.put('/profile', async (req, res) => {
  try {
    const profile = await svc.saveProfile(req.user.companyId, req.body || {});
    const result = await svc.recompute(req.user.companyId);
    res.json({ profile, recompute: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/compliance/recompute — re-run the rule engine.
router.post('/recompute', async (req, res) => {
  try {
    const result = await svc.recompute(req.user.companyId);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Dashboard & items ───────────────────────────────────────────────────────
// GET /api/compliance/overview — score, breakdown, deadlines, counts.
router.get('/overview', async (req, res) => {
  try { res.json(await svc.getOverview(req.user.companyId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/items?category=&status=
router.get('/items', async (req, res) => {
  try {
    const { category, status } = req.query;
    res.json({ items: await svc.getItems(req.user.companyId, { category, status }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/items/:id — full detail (rule resources + document slots).
router.get('/items/:id', async (req, res) => {
  try {
    const result = await svc.getItemDetail(req.user.companyId, Number(req.params.id));
    if (result.error === 'not_found') return res.status(404).json({ error: 'Compliance item not found' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/compliance/items/:id — update status/notes/dates.
router.patch('/items/:id', async (req, res) => {
  try {
    const result = await svc.updateItem(req.user.companyId, Number(req.params.id), req.body || {});
    if (result.error === 'not_found') return res.status(404).json({ error: 'Compliance item not found' });
    res.json({ item: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Document Vault ──────────────────────────────────────────────────────────
// POST /api/compliance/items/:id/documents  (multipart: files[] + doc_name?, expiry_date?, document_type?)
router.post('/items/:id/documents', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No file uploaded' });
    const itemId = Number(req.params.id);
    const results = [];
    for (const file of req.files) {
      const docName = (req.files.length === 1 && req.body.doc_name) ? req.body.doc_name : file.originalname;
      const r = await docService.recordUpload(req.user.companyId, itemId, {
        file, docName, documentType: req.body.document_type, expiryDate: req.body.expiry_date, uploadedBy: req.user.userId,
      });
      if (r.error === 'not_found') return res.status(404).json({ error: 'Compliance item not found' });
      results.push(r);
    }
    res.status(201).json({ documents: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/items/:id/documents?history=1
router.get('/items/:id/documents', async (req, res) => {
  try {
    res.json({ documents: await docService.listDocuments(req.user.companyId, Number(req.params.id), { includeHistory: req.query.history === '1' }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/documents/:docId/download
router.get('/documents/:docId/download', async (req, res) => {
  try {
    const doc = await docService.getForDownload(req.user.companyId, Number(req.params.docId));
    if (!doc || !doc.file_path) return res.status(404).json({ error: 'Document not found' });
    res.download(doc.file_path, doc.original_name || doc.doc_name);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/compliance/documents/:docId — verify / notes / expiry / type
router.patch('/documents/:docId', async (req, res) => {
  try {
    const r = await docService.updateDocument(req.user.companyId, Number(req.params.docId), req.body || {});
    if (r.error === 'not_found') return res.status(404).json({ error: 'Document not found' });
    res.json({ document: r });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/compliance/documents/:docId
router.delete('/documents/:docId', async (req, res) => {
  try {
    const r = await docService.deleteDocument(req.user.companyId, Number(req.params.docId));
    if (r.error === 'not_found') return res.status(404).json({ error: 'Document not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Reports (CSV / JSON) ────────────────────────────────────────────────────
// GET /api/compliance/reports/:type?format=csv|json|pdf
router.get('/reports/:type', async (req, res) => {
  try {
    const out = await reportService.generate(req.user.companyId, req.params.type, req.query.format || 'csv');
    if (out.error) return res.status(400).json({ error: out.error });
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(out.content);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/compliance/run-reminders — manual trigger (admin/ops & testing).
router.post('/run-reminders', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    res.json(complianceReminders.runComplianceReminders());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI Compliance Copilot ───────────────────────────────────────────────────
// POST /api/compliance/copilot  { question }
router.post('/copilot', async (req, res) => {
  try {
    if (!req.body || !req.body.question) return res.status(400).json({ error: 'question is required' });
    res.json(await svc.copilot(req.user.companyId, req.body.question));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: rule management (data-driven, no code changes) ────────────────────
// GET /api/compliance/rules?country=IN
router.get('/rules', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    res.json({ rules: await svc.listRules({ country: req.query.country }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/compliance/rules
router.post('/rules', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    const result = await svc.createRule(req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/compliance/rules/:id
router.put('/rules/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    res.json({ rule: await svc.updateRule(Number(req.params.id), req.body || {}) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/compliance/rules/:id
router.delete('/rules/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin access required' });
    res.json(await svc.deleteRule(Number(req.params.id)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Board Meeting Manager (Phase 2b) ─────────────────────────────────────────
const meetingService = require('../services/complianceMeetingService');

// GET /api/compliance/meeting-templates — resolution templates (static data).
router.get('/meeting-templates', (req, res) => {
  try { res.json({ templates: meetingService.resolutionTemplates() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/meetings
router.get('/meetings', async (req, res) => {
  try { res.json({ meetings: await meetingService.listMeetings(req.user.companyId) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/compliance/meetings
router.post('/meetings', async (req, res) => {
  try {
    const r = await meetingService.createMeeting(req.user.companyId, req.body || {});
    if (r.error) return res.status(400).json({ error: r.error });
    res.status(201).json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/meetings/:id
router.get('/meetings/:id', async (req, res) => {
  try {
    const r = await meetingService.getMeeting(req.user.companyId, Number(req.params.id));
    if (r.error === 'not_found') return res.status(404).json({ error: 'Meeting not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/compliance/meetings/:id
router.put('/meetings/:id', async (req, res) => {
  try {
    const r = await meetingService.updateMeeting(req.user.companyId, Number(req.params.id), req.body || {});
    if (r.error === 'not_found') return res.status(404).json({ error: 'Meeting not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/compliance/meetings/:id
router.delete('/meetings/:id', async (req, res) => {
  try {
    const r = await meetingService.deleteMeeting(req.user.companyId, Number(req.params.id));
    if (r.error === 'not_found') return res.status(404).json({ error: 'Meeting not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/compliance/meetings/:id/minutes — auto-generate minutes.
router.post('/meetings/:id/minutes', async (req, res) => {
  try {
    const r = await meetingService.generateMinutes(req.user.companyId, Number(req.params.id));
    if (r.error === 'not_found') return res.status(404).json({ error: 'Meeting not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/compliance/meetings/:id/hold — mark held (completes linked obligation).
router.post('/meetings/:id/hold', async (req, res) => {
  try {
    const r = await meetingService.markHeld(req.user.companyId, Number(req.params.id), req.body || {});
    if (r.error === 'not_found') return res.status(404).json({ error: 'Meeting not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
