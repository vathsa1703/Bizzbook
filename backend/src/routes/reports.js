const express = require('express');
const router = express.Router();
const reportsService = require('../services/ReportsService');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

function getFilters(req) {
  return {
    range: req.query.range || '30days',
    start: req.query.start,
    end: req.query.end
  };
}

router.get('/executive', async (req, res) => {
  try {
    const data = await reportsService.getExecutiveSummary(req.user.companyId, getFilters(req));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/campaigns', async (req, res) => {
  try {
    const data = await reportsService.getCampaignAnalytics(req.user.companyId, getFilters(req));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/customers', async (req, res) => {
  try {
    const data = await reportsService.getCustomerAnalytics(req.user.companyId, getFilters(req));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/coupons', async (req, res) => {
  try {
    const data = await reportsService.getCouponAnalytics(req.user.companyId, getFilters(req));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/loyalty', async (req, res) => {
  try {
    const data = await reportsService.getLoyaltyAnalytics(req.user.companyId, getFilters(req));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/referrals', async (req, res) => {
  try {
    const data = await reportsService.getReferralAnalytics(req.user.companyId, getFilters(req));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/surveys', async (req, res) => {
  try {
    const data = await reportsService.getSurveyAnalytics(req.user.companyId, getFilters(req));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/communications', async (req, res) => {
  try {
    const data = await reportsService.getCommunicationAnalytics(req.user.companyId, getFilters(req));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/export/:type', async (req, res) => {
  try {
    const format = req.query.format || 'csv';
    const data = await reportsService.generateExport(req.user.companyId, req.params.type, format, getFilters(req));
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=report_${req.params.type}.csv`);
      res.send(data);
    } else if (format === 'excel') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=report_${req.params.type}.xlsx`);
      res.send(Buffer.from(data));
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
