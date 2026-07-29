const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbGet, dbAll } = require('../config/dbEngine');

// List sessions for current user (or all company sessions for admin)
router.get('/', async (req, res, next) => {
  try {
    const { role, userId, companyId } = req.user;
    const isAdmin = role === 'OWNER' || role === 'admin' || role === 'MANAGER';
    let sql, params;
    // is_active bound as a parameter, not a literal 1 -- Postgres rejects a
    // literal integer compared against a BOOLEAN column the same way it
    // rejects one assigned to one (see auth.js/company.js for the write-side
    // version of this same bug).
    if (isAdmin && req.query.all === 'true') {
      sql = `SELECT s.*, u.name as user_name, u.email as user_email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.company_id = ? AND s.is_active = ? ORDER BY s.last_activity DESC`;
      params = [companyId, 1];
    } else {
      sql = `SELECT * FROM sessions WHERE user_id = ? AND is_active = ? ORDER BY last_activity DESC`;
      params = [userId, 1];
    }

    // Mark current session
    const currentHash = crypto.createHash('sha256').update(req.user.token || '').digest('hex');
    const sessions = (await dbAll(sql, params)).map(s => ({
      ...s,
      is_current: s.token_hash === currentHash,
      token_hash: undefined // don't expose hash
    }));

    res.json(sessions);
  } catch (err) { next(err); }
});

// Terminate a specific session
router.delete('/:id', async (req, res, next) => {
  try {
    const { userId, companyId, role } = req.user;
    const isAdmin = role === 'OWNER' || role === 'admin';
    const session = await dbGet('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Only admins can terminate others' sessions
    if (!isAdmin && session.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (session.company_id !== companyId) return res.status(403).json({ error: 'Forbidden' });

    await dbGet('UPDATE sessions SET is_active = ? WHERE id = ?', [0, req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// Terminate all except current
router.delete('/', async (req, res, next) => {
  try {
    const currentHash = crypto.createHash('sha256').update(req.user.token || '').digest('hex');
    await dbGet('UPDATE sessions SET is_active = ? WHERE user_id = ? AND token_hash != ?', [0, req.user.userId, currentHash]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
