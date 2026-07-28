const express = require('express');
const router = express.Router();
const { dbGet, dbAll, engine, isOn } = require('../config/dbEngine');
const { authenticate } = require('../middleware/auth');
const automationEngine = require('../services/AutomationEngine');

router.use(authenticate);

/**
 * GET /api/automations/dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const stats = await automationEngine.getStats(req.user.companyId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[AutomationsAPI] Error fetching dashboard:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats.' });
  }
});

/**
 * GET /api/automations/:id/history
 */
router.get('/:id/history', async (req, res) => {
  try {
    const logs = await dbAll(`
      SELECT id, correlation_id, status, duration_ms, message, executed_at, customer_id
      FROM automation_execution_logs
      WHERE company_id = ? AND automation_id = ?
      ORDER BY executed_at DESC
      LIMIT 50
    `, [req.user.companyId, req.params.id]);

    res.json({ success: true, logs });
  } catch (error) {
    console.error('[AutomationsAPI] Error fetching history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch execution history.' });
  }
});

/**
 * GET /api/automations
 */
router.get('/', async (req, res) => {
  try {
    const automations = await dbAll(`
      SELECT a.id, a.name, a.event_type, a.conditions, a.delay_minutes, a.action_type, a.action_payload, a.is_active, a.created_at,
             (SELECT COUNT(*) FROM automation_execution_logs l WHERE l.automation_id = a.id) as total_executions,
             (SELECT MAX(executed_at) FROM automation_execution_logs l WHERE l.automation_id = a.id) as last_run
      FROM marketing_automations a
      WHERE a.company_id = ?
      ORDER BY a.created_at DESC
    `, [req.user.companyId]);

    for (const auto of automations) {
      if (auto.conditions) {
        try { auto.conditions = JSON.parse(auto.conditions); } catch(e) {}
      }
      if (auto.action_payload) {
        try { auto.action_payload = JSON.parse(auto.action_payload); } catch(e) {}
      }
    }

    res.json({ success: true, automations });
  } catch (error) {
    console.error('[AutomationsAPI] Error fetching automations:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch automations.' });
  }
});

/**
 * POST /api/automations
 */
router.post('/', async (req, res) => {
  try {
    const { name, event_type, conditions, delay_minutes, action_type, action_payload } = req.body;

    if (!name || !event_type || !action_type) {
      return res.status(400).json({ success: false, error: 'Name, event_type, and action_type are required.' });
    }

    // is_active is BOOLEAN on Postgres, INTEGER 0/1 on SQLite (see
    // schema.postgres.sql's marketing_automations.is_active) — the "active on
    // create" literal has to match the column type per engine.
    const activeLiteral = engine() === 'postgres' ? 'true' : '1';

    const row = await dbGet(`
      INSERT INTO marketing_automations (company_id, name, event_type, conditions, delay_minutes, action_type, action_payload, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ${activeLiteral}) RETURNING id
    `, [
      req.user.companyId,
      name,
      event_type,
      conditions ? JSON.stringify(conditions) : null,
      delay_minutes || 0,
      action_type,
      action_payload ? JSON.stringify(action_payload) : null
    ]);

    await automationEngine.reloadAutomations();

    res.status(201).json({ success: true, automation_id: row.id });
  } catch (error) {
    console.error('[AutomationsAPI] Error creating automation:', error);
    res.status(500).json({ success: false, error: 'Failed to create automation.' });
  }
});

/**
 * PUT /api/automations/:id/toggle
 */
router.put('/:id/toggle', async (req, res) => {
  try {
    const companyId = req.user.companyId;

    // dbGet/dbAll don't surface an affected-row count on either engine, so
    // (like credits.js) existence + the current value are established with a
    // SELECT first, and the CASE-based flip is done in JS instead of SQL —
    // is_active is BOOLEAN on Postgres vs INTEGER 0/1 on SQLite.
    const existing = await dbGet(
      'SELECT is_active FROM marketing_automations WHERE id = ? AND company_id = ?',
      [req.params.id, companyId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }

    const currentlyActive = isOn(existing.is_active);
    const newValue = engine() === 'postgres' ? !currentlyActive : (currentlyActive ? 0 : 1);

    await dbGet(
      'UPDATE marketing_automations SET is_active = ? WHERE id = ? AND company_id = ?',
      [newValue, req.params.id, companyId]
    );

    await automationEngine.reloadAutomations();

    res.json({ success: true });
  } catch (error) {
    console.error('[AutomationsAPI] Error toggling automation:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle automation.' });
  }
});

/**
 * DELETE /api/automations/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const existing = await dbGet(
      'SELECT id FROM marketing_automations WHERE id = ? AND company_id = ?',
      [req.params.id, companyId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }

    await dbGet('DELETE FROM marketing_automations WHERE id = ? AND company_id = ?', [req.params.id, companyId]);

    // Also delete logs
    await dbGet('DELETE FROM automation_execution_logs WHERE automation_id = ? AND company_id = ?', [req.params.id, companyId]);

    await automationEngine.reloadAutomations();

    res.json({ success: true });
  } catch (error) {
    console.error('[AutomationsAPI] Error deleting automation:', error);
    res.status(500).json({ success: false, error: 'Failed to delete automation.' });
  }
});

module.exports = router;
