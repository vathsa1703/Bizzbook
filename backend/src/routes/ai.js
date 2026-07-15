const express = require('express');
const { getDb } = require('../config/db');
const { callLLM } = require('../services/aiService');
const { aiRateLimit } = require('../middleware/aiRateLimit');

const router = express.Router();

// GET /api/ai/insights/dashboard
// Fetch pre-computed insights scoped to the user's company.
router.get('/insights/dashboard', (req, res) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    // Cache key is scoped to company + user so two companies never share insights
    const cacheKey = `dashboard_insights_company_${companyId}_user_${userId}`;
    const row = db.prepare(
      'SELECT payload FROM ai_insights_cache WHERE cache_key = ? AND company_id = ?'
    ).get(cacheKey, companyId);

    if (row) {
      res.json(JSON.parse(row.payload));
    } else {
      res.json({ insights: [], dataQualityNote: "Insights are still generating, please wait a moment." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// POST /api/ai/chat
// Protected by AI rate limit middleware (10 calls/day/user). Scoped to user's company.
router.post('/chat', aiRateLimit, async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.companyId;
    const businessType = req.user.businessType || 'General Business';
    const { message, sessionId = 'default_session' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await callLLM(userId, companyId, sessionId, message, businessType);
    res.json(response);
  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: err.message || 'Internal server error processing AI chat.' });
  }
});

module.exports = router;
