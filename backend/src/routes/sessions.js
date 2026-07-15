const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../config/db');

// List sessions for current user (or all company sessions for admin)
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const { role, userId, companyId } = req.user;
    const isAdmin = role === 'OWNER' || role === 'admin' || role === 'MANAGER';
    let sql, params;
    if (isAdmin && req.query.all === 'true') {
      sql = `SELECT s.*, u.name as user_name, u.email as user_email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.company_id = ? AND s.is_active = 1 ORDER BY s.last_activity DESC`;
      params = [companyId];
    } else {
      sql = `SELECT * FROM sessions WHERE user_id = ? AND is_active = 1 ORDER BY last_activity DESC`;
      params = [userId];
    }

    // Mark current session
    const currentHash = crypto.createHash('sha256').update(req.user.token || '').digest('hex');
    const sessions = db.prepare(sql).all(...params).map(s => ({
      ...s,
      is_current: s.token_hash === currentHash,
      token_hash: undefined // don't expose hash
    }));

    res.json(sessions);
  } catch (err) { next(err); } finally { db.close(); }
});

// Terminate a specific session
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const { userId, companyId, role } = req.user;
    const isAdmin = role === 'OWNER' || role === 'admin';
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Only admins can terminate others' sessions
    if (!isAdmin && session.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (session.company_id !== companyId) return res.status(403).json({ error: 'Forbidden' });

    db.prepare('UPDATE sessions SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); } finally { db.close(); }
});

// Terminate all except current
router.delete('/', (req, res, next) => {
  const db = getDb();
  try {
    const currentHash = crypto.createHash('sha256').update(req.user.token || '').digest('hex');
    db.prepare('UPDATE sessions SET is_active = 0 WHERE user_id = ? AND token_hash != ?').run(req.user.userId, currentHash);
    res.json({ success: true });
  } catch (err) { next(err); } finally { db.close(); }
});

module.exports = router;
