const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');

// Paginated audit log list
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const { module, user_id, target_type, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = `
      SELECT al.*, u.name as user_name, u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.company_id = ?
    `;
    const params = [req.user.companyId];
    if (module) { sql += ' AND al.module = ?'; params.push(module); }
    if (user_id) { sql += ' AND al.user_id = ?'; params.push(user_id); }
    if (target_type) { sql += ' AND al.target_type = ?'; params.push(target_type); }
    sql += ` ORDER BY al.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const total = db.prepare(sql.replace('SELECT al.*, u.name as user_name, u.email as user_email', 'SELECT count(*) as cnt').replace(/ORDER BY.*$/, '')).get(...params.slice(0, -2));
    const logs = db.prepare(sql).all(...params);
    res.json({ data: logs, total: total?.cnt || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); } finally { db.close(); }
});

// Timeline for a specific record
router.get('/:targetType/:targetId', (req, res, next) => {
  const db = getDb();
  try {
    const logs = db.prepare(`
      SELECT al.*, u.name as user_name
      FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
      WHERE al.company_id = ? AND al.target_type = ? AND al.target_id = ?
      ORDER BY al.created_at DESC LIMIT 100
    `).all(req.user.companyId, req.params.targetType, req.params.targetId);
    res.json(logs);
  } catch (err) { next(err); } finally { db.close(); }
});

module.exports = router;
