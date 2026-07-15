const express = require('express');
const router = express.Router();
const { hrChat, generateLetter, generateInsights } = require('../services/hrAIService');

// HR Copilot Chat
router.post('/chat', async (req, res, next) => {
  try {
    const { messages, message } = req.body;
    const msgs = messages || [{ role: 'user', content: message }];
    if (!msgs || msgs.length === 0) return res.status(400).json({ error: 'message required' });
    const reply = await hrChat(msgs, req.user.companyId);
    res.json({ reply });
  } catch (err) { next(err); }
});

// Generate HR letter
router.post('/generate-letter', async (req, res, next) => {
  try {
    const { type, employee_id, context } = req.body;
    if (!type) return res.status(400).json({ error: 'type required (warning|appreciation|termination)' });

    const { getDb } = require('../config/db');
    const db = getDb();
    let employeeData = null;
    try {
      employeeData = db.prepare('SELECT name, job_title, department, employee_code FROM employees WHERE id = ? AND company_id = ?').get(employee_id, req.user.companyId);
    } finally { db.close(); }

    const letter = await generateLetter(type, employeeData, context);
    res.json({ letter });
  } catch (err) { next(err); }
});

// Proactive HR insights
router.get('/insights', async (req, res, next) => {
  try {
    const insights = await generateInsights(req.user.companyId);
    res.json(insights);
  } catch (err) { next(err); }
});

module.exports = router;
