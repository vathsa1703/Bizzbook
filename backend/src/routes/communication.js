const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const communicationService = require('../services/communication/CommunicationService');

// Require authentication for all communication routes
const { authenticate } = require('../middleware/auth');
router.use(authenticate);

// 1. Dashboard Stats
router.get('/dashboard', (req, res) => {
  try {
    const db = getDb();
    const companyId = req.user.companyId;

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_campaigns,
        SUM(total_recipients) as total_messages,
        SUM(successful_deliveries) as delivered,
        SUM(failed_deliveries) as failed
      FROM communication_campaigns
      WHERE company_id = ?
    `).get(companyId);

    const recentCampaigns = db.prepare(`
      SELECT * FROM communication_campaigns 
      WHERE company_id = ?
      ORDER BY created_at DESC LIMIT 5
    `).all(companyId);

    res.json({
      stats: {
        total_campaigns: stats.total_campaigns || 0,
        total_messages: stats.total_messages || 0,
        delivered: stats.delivered || 0,
        failed: stats.failed || 0
      },
      recentCampaigns
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Templates CRUD
router.get('/templates', (req, res) => {
  try {
    const db = getDb();
    const templates = db.prepare(`SELECT * FROM communication_templates WHERE company_id = ? ORDER BY created_at DESC`).all(req.user.companyId);
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates', (req, res) => {
  try {
    const db = getDb();
    const { name, channel, category, content, variables } = req.body;
    
    const stmt = db.prepare(`
      INSERT INTO communication_templates (company_id, name, channel, category, content, variables)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(req.user.companyId, name, channel, category, JSON.stringify(content), JSON.stringify(variables || []));
    
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Dispatch Campaign
router.post('/dispatch', async (req, res) => {
  try {
    const db = getDb();
    const { name, channel, audience_type, segment_id, template_id, schedule_time } = req.body;
    const companyId = req.user.companyId;

    // Resolve Audience
    let recipients = [];
    if (audience_type === 'segment' && segment_id) {
      // In reality, resolve customer segment from db
      recipients = db.prepare(`
        SELECT id as customer_id, phone, email, name 
        FROM customers WHERE company_id = ?
      `).all(companyId)
        .map(c => ({
          customer_id: c.customer_id,
          identifier: channel === 'email' ? c.email : c.phone,
          content: 'Templated Content',
          metadata: { name: c.name }
        }))
        .filter(r => r.identifier);
    } else {
      // Manual list or ALL
      recipients = db.prepare(`
        SELECT id as customer_id, phone, email, name 
        FROM customers WHERE company_id = ?
      `).all(companyId)
        .map(c => ({
          customer_id: c.customer_id,
          identifier: channel === 'email' ? c.email : c.phone,
          content: 'Templated Content',
          metadata: { name: c.name }
        }))
        .filter(r => r.identifier);
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients found for this audience' });
    }

    const campaignData = {
      name,
      channel,
      audience_type,
      segment_id,
      template_id,
      schedule_time
    };

    const result = await communicationService.dispatchCampaign(companyId, campaignData, recipients);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Dispatch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Get Campaigns
router.get('/campaigns', (req, res) => {
  try {
    const db = getDb();
    const campaigns = db.prepare(`SELECT * FROM communication_campaigns WHERE company_id = ? ORDER BY created_at DESC`).all(req.user.companyId);
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get History Logs
router.get('/history', (req, res) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit) || 100;
    const logs = db.prepare(`
      SELECT cl.*, c.name as customer_name, cc.name as campaign_name
      FROM communication_logs cl
      LEFT JOIN customers c ON cl.customer_id = c.id
      LEFT JOIN communication_campaigns cc ON cl.campaign_id = cc.id
      WHERE cl.company_id = ?
      ORDER BY cl.created_at DESC
      LIMIT ?
    `).all(req.user.companyId, limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
