const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('../config/db');

const UPLOADS_DIR = path.join(__dirname, '../../data/uploads/employee-docs');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = `${req.params.employeeId}_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/jpg','application/pdf','image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only images and PDF files are allowed'));
  }
});

// List documents for an employee
router.get('/:employeeId', (req, res, next) => {
  const db = getDb();
  try {
    const docs = db.prepare(`
      SELECT ed.*, u.name as uploaded_by_name, v.name as verified_by_name
      FROM employee_documents ed
      LEFT JOIN users u ON ed.uploaded_by = u.id
      LEFT JOIN users v ON ed.verified_by = v.id
      WHERE ed.employee_id = ? AND ed.company_id = ?
      ORDER BY ed.created_at DESC
    `).all(req.params.employeeId, req.user.companyId);
    res.json(docs);
  } catch (err) { next(err); } finally { db.close(); }
});

// Upload a document
router.post('/:employeeId', upload.single('file'), (req, res, next) => {
  const db = getDb();
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { doc_type, doc_name } = req.body;

    const info = db.prepare(`
      INSERT INTO employee_documents (employee_id, company_id, doc_type, doc_name, file_path, file_size, mime_type, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.employeeId, req.user.companyId, doc_type || 'Other',
      doc_name || req.file.originalname, req.file.filename,
      req.file.size, req.file.mimetype, req.user.userId);

    res.status(201).json(db.prepare('SELECT * FROM employee_documents WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) { next(err); } finally { db.close(); }
});

// Serve/download a document
router.get('/file/:id', (req, res, next) => {
  const db = getDb();
  try {
    const doc = db.prepare('SELECT * FROM employee_documents WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const filePath = path.join(UPLOADS_DIR, doc.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${doc.doc_name}"`);
    res.sendFile(filePath);
  } catch (err) { next(err); } finally { db.close(); }
});

// Delete a document
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const doc = db.prepare('SELECT * FROM employee_documents WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const filePath = path.join(UPLOADS_DIR, doc.file_path);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (e) { console.error('File delete error:', e.message); } }
    db.prepare('DELETE FROM employee_documents WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); } finally { db.close(); }
});

module.exports = router;
