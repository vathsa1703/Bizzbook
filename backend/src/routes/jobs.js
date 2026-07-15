const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { authenticate } = require('../middleware/auth');

// Note: Ensure that your auth middleware allows you to extract companyId from req.user
router.use(authenticate);

/**
 * GET /api/jobs/monitoring
 * Returns metrics on job processing
 */
router.get('/monitoring', (req, res) => {
  try {
    const db = getDb();
    const companyId = req.user.companyId;

    const stats = db.prepare(`
      SELECT 
        status, 
        COUNT(*) as count
      FROM background_jobs
      WHERE company_id = ?
      GROUP BY status
    `).all(companyId);

    const metrics = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
      total_retries: 0,
      success_rate: 0
    };

    let totalFinished = 0;

    for (const stat of stats) {
      if (stat.status === 'pending') metrics.pending = stat.count;
      else if (stat.status === 'processing') metrics.processing = stat.count;
      else if (stat.status === 'completed') metrics.completed = stat.count;
      else if (stat.status === 'failed') metrics.failed = stat.count;
      else if (stat.status === 'dead') metrics.dead = stat.count;
    }

    totalFinished = metrics.completed + metrics.failed + metrics.dead;
    if (totalFinished > 0) {
      metrics.success_rate = parseFloat(((metrics.completed / totalFinished) * 100).toFixed(2));
    }

    // Get total retries
    const retryStat = db.prepare(`
      SELECT SUM(attempts) as total_retries
      FROM background_jobs
      WHERE company_id = ?
    `).get(companyId);
    
    metrics.total_retries = retryStat.total_retries || 0;

    res.json({ success: true, metrics });
  } catch (error) {
    console.error('[JobsAPI] Error fetching monitoring stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch job monitoring metrics.' });
  }
});

/**
 * GET /api/jobs
 * Returns recent jobs
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const companyId = req.user.companyId;
    
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;

    let query = `
      SELECT id, correlation_id, idempotency_key, type, priority, status, attempts, error_log, created_at, updated_at
      FROM background_jobs
      WHERE company_id = ?
    `;
    const params = [companyId];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const jobs = db.prepare(query).all(...params);
    res.json({ success: true, jobs });
  } catch (error) {
    console.error('[JobsAPI] Error fetching jobs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch jobs.' });
  }
});

module.exports = router;
