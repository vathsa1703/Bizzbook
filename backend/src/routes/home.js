const express = require('express');
const router = express.Router();
const { dbGet } = require('../config/dbEngine');

// This route is a thin aggregation façade for the Home dashboard. It performs
// NO business calculations of its own — every number comes from an existing
// service (marketingEngine, spendIntelligenceEngine, AutomationEngine) so there
// is a single source of truth. Each section is wrapped independently so a
// failure in one optional engine degrades that widget to null rather than
// failing the whole page (mirrors the optional-module philosophy in app.js).

const { getMarketingOpportunities } = require('../services/marketingEngine');
const {
  calculateStoreHealthScore,
  getWeeklyRecommendation,
  getDoNotSpendFlags
} = require('../services/spendIntelligenceEngine');
const automationEngine = require('../services/AutomationEngine');

// GET /api/home/marketing-summary
router.get('/marketing-summary', async (req, res) => {
  const companyId = req.user.companyId;

  // ── 1. Top opportunity + customers-at-risk (marketingEngine) ────────────────
  let opportunity = null;
  let customersAtRisk = 0;
  try {
    const opps = (await getMarketingOpportunities(companyId)) || [];
    if (opps.length > 0) {
      const top = opps[0]; // engine returns them pre-ranked by score
      opportunity = {
        id: top.id,
        type: top.type,
        name: top.name,
        priority: top.priority,
        expectedImpact: Math.round(top.expectedImpact || 0),
        detectedBecause: top.detectedBecause,
        // Every opportunity is actioned from the Marketing "opportunities" tab,
        // where the Generate-Campaign flow lives.
        deepLinkTab: 'opportunities'
      };
    }
    const retention = opps.find(o => o.type === 'customer_retention');
    customersAtRisk = retention ? (retention.evidence?.cohort?.length || 0) : 0;
  } catch (err) {
    console.error('[Home] opportunity aggregation error:', err.message);
  }

  // ── 2. Store health (spendIntelligenceEngine) ───────────────────────────────
  let health = null;
  try {
    const h = await calculateStoreHealthScore(companyId);
    health = { grade: h.grade, score: h.overall_score, trend: h.score_change || 0 };
  } catch (err) {
    console.error('[Home] health aggregation error:', err.message);
  }

  // ── 3. Weekly recommendation (spendIntelligenceEngine) ──────────────────────
  let weeklyRecommendation = null;
  try {
    weeklyRecommendation = await getWeeklyRecommendation(companyId);
  } catch (err) {
    console.error('[Home] weekly-recommendation aggregation error:', err.message);
  }

  // ── 4. Reward / coupon cost + overspend guardrail ───────────────────────────
  // rewardCost is a raw read of already-recorded redemptions (no calculation);
  // the overspend signal is the existing do-not-spend engine.
  let rewardCost = null;
  try {
    const row = await dbGet(`
      SELECT COUNT(id) as redemptions, COALESCE(SUM(discount_applied), 0) as totalDiscount
      FROM coupon_redemptions
      WHERE company_id = ?
    `, [companyId]);
    let overspend = false;
    try {
      const flags = (await getDoNotSpendFlags(companyId)) || [];
      overspend = Array.isArray(flags) && flags.length > 0;
    } catch (flagErr) {
      console.error('[Home] flags aggregation error:', flagErr.message);
    }
    rewardCost = {
      total: Math.round(row?.totalDiscount || 0),
      redemptions: row?.redemptions || 0,
      overspend
    };
  } catch (err) {
    console.error('[Home] reward-cost aggregation error:', err.message);
  }

  // ── 5. Automation health (AutomationEngine) ─────────────────────────────────
  let automations = null;
  try {
    const s = automationEngine.getStats(companyId);
    automations = { failed: s.failed, successRate: s.successRate, total: s.total };
  } catch (err) {
    console.error('[Home] automation aggregation error:', err.message);
  }

  res.json({
    opportunity,
    customersAtRisk,
    health,
    weeklyRecommendation,
    rewardCost,
    automations
  });
});

module.exports = router;
