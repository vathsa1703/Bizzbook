const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');

router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const { page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const notifs = db.prepare(`
      SELECT * FROM notifications WHERE user_id = ? AND company_id = ?
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(req.user.userId, req.user.companyId, parseInt(limit), offset);
    res.json(notifs);
  } catch (err) { next(err); } finally { db.close(); }
});

router.get('/unread-count', (req, res, next) => {
  const db = getDb();
  try {
    const result = db.prepare('SELECT count(*) as cnt FROM notifications WHERE user_id = ? AND company_id = ? AND is_read = 0').get(req.user.userId, req.user.companyId);
    res.json({ count: result?.cnt || 0 });
  } catch (err) { next(err); } finally { db.close(); }
});

router.put('/:id/read', (req, res, next) => {
  const db = getDb();
  try {
    db.prepare("UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE id = ? AND user_id = ?").run(req.params.id, req.user.userId);
    res.json({ success: true });
  } catch (err) { next(err); } finally { db.close(); }
});

router.put('/read-all', (req, res, next) => {
  const db = getDb();
  try {
    db.prepare("UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE user_id = ? AND company_id = ? AND is_read = 0").run(req.user.userId, req.user.companyId);
    res.json({ success: true });
  } catch (err) { next(err); } finally { db.close(); }
});

module.exports = router;
