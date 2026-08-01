const express = require('express');
const router = express.Router();
const { dbGet, dbAll } = require('../config/dbEngine');

router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const notifs = await dbAll(`
      SELECT * FROM notifications WHERE user_id = ? AND company_id = ?
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `, [req.user.userId, req.user.companyId, parseInt(limit), offset]);
    res.json(notifs);
  } catch (err) { next(err); }
});

router.get('/unread-count', async (req, res, next) => {
  try {
    // is_read is BOOLEAN on Postgres, INTEGER 0/1 on SQLite (see
    // schema.postgres.sql's notifications.is_read) — the literal has to
    // match the column type per engine.
    const unreadLiteral = 'false';
    const result = await dbGet(
      `SELECT count(*) as cnt FROM notifications WHERE user_id = ? AND company_id = ? AND is_read = ${unreadLiteral}`,
      [req.user.userId, req.user.companyId]
    );
    res.json({ count: result?.cnt || 0 });
  } catch (err) { next(err); }
});

router.put('/:id/read', async (req, res, next) => {
  try {
    const activeLiteral = 'true';
    const now = 'now()';
    await dbGet(
      `UPDATE notifications SET is_read = ${activeLiteral}, read_at = ${now} WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.userId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.put('/read-all', async (req, res, next) => {
  try {
    const activeLiteral = 'true';
    const now = 'now()';
    const unreadLiteral = 'false';
    await dbGet(
      `UPDATE notifications SET is_read = ${activeLiteral}, read_at = ${now} WHERE user_id = ? AND company_id = ? AND is_read = ${unreadLiteral}`,
      [req.user.userId, req.user.companyId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
