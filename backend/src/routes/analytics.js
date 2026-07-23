const express = require('express');
const dataService = require('../services/dataService');

const router = express.Router();

function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

// All analytics routes pass companyId from req.user for multi-tenant isolation.
// req.user is set by the authenticate middleware.
//
// Phase 2: dataService's functions are now async (SQLite or Postgres depending
// on DB_ENGINE), so every handler here is async and awaits its result.

router.get('/sales-summary', async (req, res, next) => {
  try {
    const now = new Date();
    const month = toInt(req.query.month, now.getMonth() + 1);
    const year = toInt(req.query.year, now.getFullYear());
    res.json(await dataService.getMonthlySalesSummary({ month, year, companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/revenue-trend', async (req, res, next) => {
  try {
    const months = toInt(req.query.months, 6);
    res.json(await dataService.getRevenueTrend({ months, companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/top-products', async (req, res, next) => {
  try {
    const month = req.query.month ? toInt(req.query.month) : undefined;
    const year = req.query.year ? toInt(req.query.year) : undefined;
    const limit = toInt(req.query.limit, 5);
    res.json(await dataService.getTopProducts({ month, year, limit, companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/low-performing-products', async (req, res, next) => {
  try {
    const month = req.query.month ? toInt(req.query.month) : undefined;
    const year = req.query.year ? toInt(req.query.year) : undefined;
    const limit = toInt(req.query.limit, 5);
    res.json(await dataService.getLowPerformingProducts({ month, year, limit, companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/low-stock', async (req, res, next) => {
  try {
    res.json(await dataService.getLowStockItems({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/overstocked', async (req, res, next) => {
  try {
    const thresholdMultiplier = req.query.thresholdMultiplier ? parseFloat(req.query.thresholdMultiplier) : undefined;
    res.json(await dataService.getOverstockedItems({ thresholdMultiplier, companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/slow-moving', async (req, res, next) => {
  try {
    const days = toInt(req.query.days, 30);
    res.json(await dataService.getSlowMovingInventory({ days, companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/profit', async (req, res, next) => {
  try {
    const now = new Date();
    const month = toInt(req.query.month, now.getMonth() + 1);
    const year = toInt(req.query.year, now.getFullYear());
    res.json(await dataService.getProfitAnalysis({ month, year, companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/pending-invoices', async (req, res, next) => {
  try {
    res.json(await dataService.getPendingInvoices({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/recommendations', async (req, res, next) => {
  try {
    res.json(await dataService.getRecommendations({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/customers', async (req, res, next) => {
  try {
    res.json(await dataService.getCustomers({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/top-groups', async (req, res, next) => {
  try {
    const limit = toInt(req.query.limit, 5);
    res.json(await dataService.getTopGroups({ limit, companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/revenue-by-group', async (req, res, next) => {
  try {
    const month = req.query.month ? toInt(req.query.month) : undefined;
    const year = req.query.year ? toInt(req.query.year) : undefined;
    res.json(await dataService.getRevenueByGroup({ month, year, companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/inventory-by-group', async (req, res, next) => {
  try {
    res.json(await dataService.getInventoryByGroup({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

router.get('/category-distribution', async (req, res, next) => {
  try {
    res.json(await dataService.getCategoryDistribution({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

// Add a specific route for multi-branch comparison
router.get('/branch-comparison', async (req, res, next) => {
  try {
    if (req.scopeContext.type === 'branch') {
      return res.status(400).json({ error: 'Cannot compare branches in a single branch scope.' });
    }
    res.json(await dataService.getBranchComparison({ companyId: req.user.companyId, scopeContext: req.scopeContext }));
  } catch (err) { next(err); }
});

module.exports = router;
