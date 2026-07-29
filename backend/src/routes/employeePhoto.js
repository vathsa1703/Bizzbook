// Employee profile photo upload/serve/delete — company-scoped file storage.
// Mirrors the working precedent in employeeDocuments.js (multer diskStorage +
// an authenticated GET /file route rather than a static mount — app.js only
// statically serves the frontend build, nothing under data/uploads/) but nests
// storage per-company (backend/data/uploads/employee-photos/<companyId>/)
// since this is PII (a photo of a real person) rather than a flat shared dir.
//
// Every route here re-verifies the target employee belongs to req.user.companyId
// before touching anything — this file is mounted after the global
// `app.use('/api', authenticate, branchAuth, rbacMiddleware)` gate in app.js,
// so req.user is always populated, but company ownership of the :id employee
// still has to be checked per-request (multi-tenant scoping).

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('../config/db');

const UPLOADS_ROOT = path.join(__dirname, '../../data/uploads/employee-photos');

// MIME allow-list — photos only, nothing else. Extension is derived from the
// matched MIME type (not trusted from the client) for both the stored filename
// and for re-deriving Content-Type on serve.
const ALLOWED_MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// Verifies :id is an employee belonging to the caller's company. Runs before
// multer so we never accept/write a file for an employee that isn't ours.
function loadOwnedEmployee(req, res, next) {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const employee = db.prepare(
      'SELECT id, company_id, avatar FROM employees WHERE id = ? AND company_id = ?'
    ).get(req.params.id, companyId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    req.employeeRecord = employee;
    next();
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const dir = path.join(UPLOADS_ROOT, String(req.user.companyId));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${req.params.id}_${Date.now()}_${safeName}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_EXT[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
    }
  }
});

function companyPhotoDir(companyId) {
  return path.join(UPLOADS_ROOT, String(companyId));
}

// POST /api/employees/:id/photo — upload/replace the employee's photo
router.post('/:id/photo', loadOwnedEmployee, (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      // multer/fileFilter errors (bad MIME, over size limit, etc.) -> 400
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, (req, res, next) => {
  const db = getDb();
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded' });
    }
    const companyId = req.user.companyId;
    const empId = req.params.id;
    const dir = companyPhotoDir(companyId);

    // Delete the previous photo file from disk (if any) to avoid orphans.
    const previous = req.employeeRecord.avatar;
    if (previous) {
      const prevPath = path.join(dir, previous);
      if (fs.existsSync(prevPath)) {
        try { fs.unlinkSync(prevPath); } catch (e) { console.error('Photo cleanup error:', e.message); }
      }
    }

    db.prepare('UPDATE employees SET avatar = ? WHERE id = ? AND company_id = ?').run(req.file.filename, empId, companyId);

    res.status(201).json({ avatar: req.file.filename });
  } catch (err) { next(err); } finally { db.close(); }
});

// GET /api/employees/:id/photo/file — stream the stored photo (authenticated, not static)
router.get('/:id/photo/file', loadOwnedEmployee, (req, res, next) => {
  try {
    const employee = req.employeeRecord;
    if (!employee.avatar) {
      return res.status(404).json({ error: 'No photo set for this employee' });
    }
    const filePath = path.join(companyPhotoDir(req.user.companyId), employee.avatar);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Photo file not found on disk' });
    }

    const ext = path.extname(employee.avatar).toLowerCase();
    const mimeByExt = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mimeByExt[ext] || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (err) { next(err); }
});

// DELETE /api/employees/:id/photo — remove the employee's photo
router.delete('/:id/photo', loadOwnedEmployee, (req, res, next) => {
  const db = getDb();
  try {
    const employee = req.employeeRecord;
    const companyId = req.user.companyId;
    if (employee.avatar) {
      const filePath = path.join(companyPhotoDir(companyId), employee.avatar);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) { console.error('Photo delete error:', e.message); }
      }
    }
    db.prepare('UPDATE employees SET avatar = NULL WHERE id = ? AND company_id = ?').run(req.params.id, companyId);
    res.status(204).end();
  } catch (err) { next(err); } finally { db.close(); }
});

module.exports = router;
