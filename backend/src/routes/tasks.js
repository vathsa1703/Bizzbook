// ============================================================================
// Task Management API — mounted at /api/tasks (auth + branchAuth + rbac global).
// Thin controllers — all logic/SQL/RBAC lives in services/taskService.js.
// The caller context {userId, companyId, role} drives row-level visibility.
// ============================================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const svc = require('../services/taskService');

const router = express.Router();

const ctx = (req) => ({ userId: req.user.userId, companyId: req.user.companyId, role: req.user.role });
const send = (res, r, okStatus = 200) => {
  if (r && r.error) return res.status(r.code || 400).json({ error: r.error });
  return res.status(okStatus).json(r);
};

// Attachments — disk storage under data/uploads/task-attachments/<companyId>/,
// mirroring routes/employeeDocuments.js. 15MB cap.
const UPLOAD_ROOT = path.join(__dirname, '../../data/uploads/task-attachments');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const dir = path.join(UPLOAD_ROOT, String(req.user.companyId));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) { cb(e); }
  },
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e6)}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

// ── Board & list ─────────────────────────────────────────────────────────────
router.get('/board', async (req, res, next) => {
  try { res.json(await svc.getBoard(ctx(req), req.query)); } catch (err) { next(err); }
});
router.get('/analytics', async (req, res, next) => {
  try { res.json(await svc.analytics(ctx(req))); } catch (err) { next(err); }
});
router.get('/', async (req, res, next) => {
  try { res.json({ tasks: await svc.listTasks(ctx(req), req.query) }); } catch (err) { next(err); }
});
router.post('/', async (req, res, next) => {
  try { send(res, await svc.createTask(ctx(req), req.body || {}), 201); } catch (err) { next(err); }
});

// ── Single task ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try { send(res, await svc.getTask(ctx(req), Number(req.params.id))); } catch (err) { next(err); }
});
router.patch('/:id', async (req, res, next) => {
  try { send(res, await svc.updateTask(ctx(req), Number(req.params.id), req.body || {})); } catch (err) { next(err); }
});
router.delete('/:id', async (req, res, next) => {
  try { send(res, await svc.deleteTask(ctx(req), Number(req.params.id))); } catch (err) { next(err); }
});

// ── Assignments ──────────────────────────────────────────────────────────────
router.post('/:id/assignments', async (req, res, next) => {
  try { send(res, await svc.addAssignees(ctx(req), Number(req.params.id), req.body || {}), 201); } catch (err) { next(err); }
});
router.delete('/:id/assignments/:type/:assigneeId', async (req, res, next) => {
  try { send(res, await svc.removeAssignee(ctx(req), Number(req.params.id), req.params.type, req.params.assigneeId)); } catch (err) { next(err); }
});

// ── Comments ─────────────────────────────────────────────────────────────────
router.post('/:id/comments', async (req, res, next) => {
  try { send(res, await svc.addComment(ctx(req), Number(req.params.id), req.body?.body, req.body?.mentions), 201); } catch (err) { next(err); }
});

// ── Checklist ────────────────────────────────────────────────────────────────
router.post('/:id/checklist', async (req, res, next) => {
  try { send(res, await svc.addChecklistItem(ctx(req), Number(req.params.id), req.body?.title), 201); } catch (err) { next(err); }
});
router.patch('/:id/checklist/:itemId', async (req, res, next) => {
  try { send(res, await svc.toggleChecklistItem(ctx(req), Number(req.params.id), Number(req.params.itemId), req.body?.is_done)); } catch (err) { next(err); }
});
router.delete('/:id/checklist/:itemId', async (req, res, next) => {
  try { send(res, await svc.deleteChecklistItem(ctx(req), Number(req.params.id), Number(req.params.itemId))); } catch (err) { next(err); }
});

// ── Attachments ──────────────────────────────────────────────────────────────
router.post('/:id/attachments', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    send(res, await svc.recordAttachment(ctx(req), Number(req.params.id), req.file), 201);
  } catch (err) { next(err); }
});
router.get('/attachments/:attId/download', async (req, res, next) => {
  try {
    const att = await svc.getAttachmentForDownload(ctx(req), Number(req.params.attId));
    if (!att || !att.file_path) return res.status(404).json({ error: 'Attachment not found' });
    res.download(att.file_path, att.original_name || att.file_name);
  } catch (err) { next(err); }
});
router.delete('/attachments/:attId', async (req, res, next) => {
  try { send(res, await svc.deleteAttachment(ctx(req), Number(req.params.attId))); } catch (err) { next(err); }
});

module.exports = router;
