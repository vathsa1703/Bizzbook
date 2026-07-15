const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const copilotService = require('../services/marketingCopilotService');
const insightService = require('../services/customerInsightService');
const oppService = require('../services/productOpportunityService');
const calendarService = require('../services/marketingCalendarService');
const predictionService = require('../services/campaignPredictionService');
const experimentEngine = require('../services/experimentEngine');
const audienceBuilder = require('../services/audienceBuilderService');

// All marketing AI routes are authenticated
router.use(authenticate);

// MODULE 1: AI Marketing Dashboard
router.get('/copilot', async (req, res) => {
  try {
    const feed = await copilotService.getDashboardFeed(req.user.companyId);
    res.json({ success: true, feed });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/recommendations', async (req, res) => {
  try {
    const recommendations = await copilotService.getPendingRecommendations(req.user.companyId);
    res.json({ success: true, recommendations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// MODULE 2: AI Campaign Generator
router.post('/copilot/generate', async (req, res) => {
  try {
    const { intent } = req.body;
    if (!intent) return res.status(400).json({ success: false, message: "Intent is required" });
    const result = await copilotService.generateCampaignFromIntent(req.user.companyId, intent);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// MODULE 3: Customer Insights AI
router.get('/insights', async (req, res) => {
  try {
    const insights = await insightService.getInsights(req.user.companyId);
    res.json({ success: true, insights });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// MODULE 4: Product Opportunity Engine
router.get('/opportunities', async (req, res) => {
  try {
    const opportunities = await oppService.getOpportunities(req.user.companyId);
    res.json({ success: true, opportunities });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// MODULE 5: Campaign Predictor
router.post('/predict', async (req, res) => {
  try {
    const prediction = await predictionService.predictCampaign(req.body);
    res.json({ success: true, prediction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// MODULE 6: Smart Audience Builder
router.post('/audience', async (req, res) => {
  try {
    const { naturalLanguage } = req.body;
    const rules = await audienceBuilder.translateToRules(naturalLanguage);
    res.json({ success: true, rules });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// MODULE 7: Marketing Calendar
router.get('/calendar', async (req, res) => {
  try {
    const events = await calendarService.getUpcomingEvents(req.user.companyId);
    res.json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// MODULE 10: Marketing Experiments
router.get('/experiments', async (req, res) => {
  try {
    const evaluation = await experimentEngine.evaluateTests(req.user.companyId);
    res.json({ success: true, evaluation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
