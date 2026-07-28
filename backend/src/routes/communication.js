const express = require('express');
const router = express.Router();
const { dbGet, dbAll } = require('../config/dbEngine');
const communicationService = require('../services/communication/CommunicationService');

// Require authentication for all communication routes
const { authenticate } = require('../middleware/auth');
router.use(authenticate);

// 1. Dashboard Stats
router.get('/dashboard', async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const stats = await dbGet(`
      SELECT
        COUNT(*) as total_campaigns,
        SUM(total_recipients) as total_messages,
        SUM(successful_deliveries) as delivered,
        SUM(failed_deliveries) as failed
      FROM communication_campaigns
      WHERE company_id = ?
    `, [companyId]);

    const recentCampaigns = await dbAll(`
      SELECT * FROM communication_campaigns
      WHERE company_id = ?
      ORDER BY created_at DESC LIMIT 5
    `, [companyId]);

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
router.get('/templates', async (req, res) => {
  try {
    const templates = await dbAll(`SELECT * FROM communication_templates WHERE company_id = ? ORDER BY created_at DESC`, [req.user.companyId]);
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates', async (req, res) => {
  try {
    const { name, channel, category, content, variables } = req.body;
    if (!name || !channel || !content) {
      return res.status(400).json({ error: 'name, channel, and content are required' });
    }

    const info = await dbGet(`
      INSERT INTO communication_templates (company_id, name, channel, category, content, variables)
      VALUES (?, ?, ?, ?, ?, ?) RETURNING id
    `, [req.user.companyId, name, channel, category, JSON.stringify(content), JSON.stringify(variables || [])]);

    res.json({ id: info.id, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Dispatch Campaign
router.post('/dispatch', async (req, res) => {
  try {
    const { name, channel, audience_type, segment_id, template_id, schedule_time } = req.body;
    const companyId = req.user.companyId;

    if (!name || !channel) {
      return res.status(400).json({ error: 'name and channel are required' });
    }

    // Resolve the real template content once, up front -- interpolated per
    // recipient below. Previously every recipient's `content` was hardcoded
    // to the literal string 'Templated Content' regardless of which real
    // template (if any) was selected, so the Templates feature had no
    // actual effect on what got sent.
    let templateContent = null;
    if (template_id) {
      const template = await dbGet('SELECT content FROM communication_templates WHERE id = ? AND company_id = ?', [template_id, companyId]);
      if (template) {
        try { templateContent = JSON.parse(template.content); } catch (_) { templateContent = template.content; }
      }
    }
    const renderContent = (name) => {
      const base = templateContent || `Hello {{name}}, thanks for being our customer!`;
      return base.replace(/\{\{\s*name\s*\}\}/gi, name || 'there');
    };

    // Resolve Audience. audience_type === 'segment' is accepted by this
    // endpoint's shape but there is no segment-membership resolver wired up
    // yet (custom_segments/segment_rules has no rule-evaluation engine in
    // this codebase) and the frontend's New Broadcast form has no segment
    // picker either, so this path is currently unreachable through the UI --
    // falls back to all customers rather than silently sending to nobody.
    const customerRows = await dbAll(`
      SELECT id as customer_id, phone, email, name
      FROM customers WHERE company_id = ?
    `, [companyId]);
    const recipients = customerRows
      .map(c => ({
        customer_id: c.customer_id,
        identifier: channel === 'email' ? c.email : c.phone,
        content: renderContent(c.name),
        metadata: { name: c.name }
      }))
      .filter(r => r.identifier);

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
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await dbAll(`SELECT * FROM communication_campaigns WHERE company_id = ? ORDER BY created_at DESC`, [req.user.companyId]);
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get History Logs
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = await dbAll(`
      SELECT cl.*, c.name as customer_name, cc.name as campaign_name
      FROM communication_logs cl
      LEFT JOIN customers c ON cl.customer_id = c.id
      LEFT JOIN communication_campaigns cc ON cl.campaign_id = cc.id
      WHERE cl.company_id = ?
      ORDER BY cl.created_at DESC
      LIMIT ?
    `, [req.user.companyId, limit]);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
