const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const automationEngine = require('../services/AutomationEngine');

router.use(authenticate);

/**
 * GET /api/automations/dashboard
 */
router.get('/dashboard', (req, res) => {
  try {
    const stats = automationEngine.getStats(req.user.companyId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[AutomationsAPI] Error fetching dashboard:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats.' });
  }
});

/**
 * GET /api/automations/:id/history
 */
router.get('/:id/history', (req, res) => {
  try {
    const db = getDb();
    const logs = db.prepare(`
      SELECT id, correlation_id, status, duration_ms, message, executed_at, customer_id
      FROM automation_execution_logs
      WHERE company_id = ? AND automation_id = ?
      ORDER BY executed_at DESC
      LIMIT 50
    `).all(req.user.companyId, req.params.id);

    res.json({ success: true, logs });
  } catch (error) {
    console.error('[AutomationsAPI] Error fetching history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch execution history.' });
  }
});

/**
 * GET /api/automations
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const automations = db.prepare(`
      SELECT a.id, a.name, a.event_type, a.conditions, a.delay_minutes, a.action_type, a.action_payload, a.is_active, a.created_at,
             (SELECT COUNT(*) FROM automation_execution_logs l WHERE l.automation_id = a.id) as total_executions,
             (SELECT MAX(executed_at) FROM automation_execution_logs l WHERE l.automation_id = a.id) as last_run
      FROM marketing_automations a
      WHERE a.company_id = ?
      ORDER BY a.created_at DESC
    `).all(req.user.companyId);
    
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
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, event_type, conditions, delay_minutes, action_type, action_payload } = req.body;

    if (!name || !event_type || !action_type) {
      return res.status(400).json({ success: false, error: 'Name, event_type, and action_type are required.' });
    }

    const info = db.prepare(`
      INSERT INTO marketing_automations (company_id, name, event_type, conditions, delay_minutes, action_type, action_payload, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      req.user.companyId,
      name,
      event_type,
      conditions ? JSON.stringify(conditions) : null,
      delay_minutes || 0,
      action_type,
      action_payload ? JSON.stringify(action_payload) : null
    );

    automationEngine.reloadAutomations();

    res.status(201).json({ success: true, automation_id: info.lastInsertRowid });
  } catch (error) {
    console.error('[AutomationsAPI] Error creating automation:', error);
    res.status(500).json({ success: false, error: 'Failed to create automation.' });
  }
});

/**
 * PUT /api/automations/:id/toggle
 */
router.put('/:id/toggle', (req, res) => {
  try {
    const db = getDb();
    const info = db.prepare(`
      UPDATE marketing_automations 
      SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END 
      WHERE id = ? AND company_id = ?
    `).run(req.params.id, req.user.companyId);

    if (info.changes === 0) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }

    automationEngine.reloadAutomations();

    res.json({ success: true });
  } catch (error) {
    console.error('[AutomationsAPI] Error toggling automation:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle automation.' });
  }
});

/**
 * DELETE /api/automations/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const info = db.prepare(`
      DELETE FROM marketing_automations 
      WHERE id = ? AND company_id = ?
    `).run(req.params.id, req.user.companyId);

    if (info.changes === 0) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }
    
    // Also delete logs
    db.prepare(`DELETE FROM automation_execution_logs WHERE automation_id = ? AND company_id = ?`).run(req.params.id, req.user.companyId);

    automationEngine.reloadAutomations();

    res.json({ success: true });
  } catch (error) {
    console.error('[AutomationsAPI] Error deleting automation:', error);
    res.status(500).json({ success: false, error: 'Failed to delete automation.' });
  }
});

module.exports = router;
