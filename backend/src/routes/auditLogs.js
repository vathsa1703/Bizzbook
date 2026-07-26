const express = require('express');
const router = express.Router();
const { dbGet, dbAll } = require('../config/dbEngine');

// Paginated audit log list
router.get('/', async (req, res, next) => {
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

    const countSql = sql.replace('SELECT al.*, u.name as user_name, u.email as user_email', 'SELECT count(*) as cnt').replace(/ORDER BY.*$/, '');
    const total = await dbGet(countSql, params.slice(0, -2));
    const logs = await dbAll(sql, params);
    res.json({ data: logs, total: total?.cnt || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// Timeline for a specific record
router.get('/:targetType/:targetId', async (req, res, next) => {
  try {
    const logs = await dbAll(`
      SELECT al.*, u.name as user_name
      FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
      WHERE al.company_id = ? AND al.target_type = ? AND al.target_id = ?
      ORDER BY al.created_at DESC LIMIT 100
    `, [req.user.companyId, req.params.targetType, req.params.targetId]);
    res.json(logs);
  } catch (err) { next(err); }
});

module.exports = router;
