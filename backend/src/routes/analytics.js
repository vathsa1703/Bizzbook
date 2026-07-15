const express = require('express');
const dataService = require('../services/dataService');

const router = express.Router();

function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

// All analytics routes pass companyId from req.user for multi-tenant isolation.
// req.user is set by the authenticate middleware.

router.get('/sales-summary', (req, res) => {
  const now = new Date();
  const month = toInt(req.query.month, now.getMonth() + 1);
  const year = toInt(req.query.year, now.getFullYear());
  res.json(dataService.getMonthlySalesSummary({ month, year, companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/revenue-trend', (req, res) => {
  const months = toInt(req.query.months, 6);
  res.json(dataService.getRevenueTrend({ months, companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/top-products', (req, res) => {
  const month = req.query.month ? toInt(req.query.month) : undefined;
  const year = req.query.year ? toInt(req.query.year) : undefined;
  const limit = toInt(req.query.limit, 5);
  res.json(dataService.getTopProducts({ month, year, limit, companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/low-performing-products', (req, res) => {
  const month = req.query.month ? toInt(req.query.month) : undefined;
  const year = req.query.year ? toInt(req.query.year) : undefined;
  const limit = toInt(req.query.limit, 5);
  res.json(dataService.getLowPerformingProducts({ month, year, limit, companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/low-stock', (req, res) => {
  res.json(dataService.getLowStockItems({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/overstocked', (req, res) => {
  const thresholdMultiplier = req.query.thresholdMultiplier ? parseFloat(req.query.thresholdMultiplier) : undefined;
  res.json(dataService.getOverstockedItems({ thresholdMultiplier, companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/slow-moving', (req, res) => {
  const days = toInt(req.query.days, 30);
  res.json(dataService.getSlowMovingInventory({ days, companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/profit', (req, res) => {
  const now = new Date();
  const month = toInt(req.query.month, now.getMonth() + 1);
  const year = toInt(req.query.year, now.getFullYear());
  res.json(dataService.getProfitAnalysis({ month, year, companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/pending-invoices', (req, res) => {
  res.json(dataService.getPendingInvoices({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/recommendations', (req, res) => {
  res.json(dataService.getRecommendations({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/customers', (req, res) => {
  res.json(dataService.getCustomers({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/top-groups', (req, res) => {
  const limit = toInt(req.query.limit, 5);
  res.json(dataService.getTopGroups({ limit, companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/revenue-by-group', (req, res) => {
  const month = req.query.month ? toInt(req.query.month) : undefined;
  const year = req.query.year ? toInt(req.query.year) : undefined;
  res.json(dataService.getRevenueByGroup({ month, year, companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/inventory-by-group', (req, res) => {
  res.json(dataService.getInventoryByGroup({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

router.get('/category-distribution', (req, res) => {
  res.json(dataService.getCategoryDistribution({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

// Add a specific route for multi-branch comparison
router.get('/branch-comparison', (req, res) => {
  if (req.scopeContext.type === 'branch') {
    return res.status(400).json({ error: 'Cannot compare branches in a single branch scope.' });
  }
  res.json(dataService.getBranchComparison({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
});

module.exports = router;
