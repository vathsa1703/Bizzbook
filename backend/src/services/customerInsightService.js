// Real customer-insight numbers for the AI Copilot dashboard's "Customer
// Insights" panel. Was previously a hardcoded stub (58/83, ignoring
// companyId entirely) -- now reuses segmentationEngine.js's real VIP/at-risk
// segment queries (same source of truth the Segments page uses) instead of
// duplicating that SQL here.
const { getSegmentCustomers } = require('./segmentationEngine');

function avg(rows, key) {
  if (!rows.length) return 0;
  return Math.round(rows.reduce((sum, r) => sum + (r[key] || 0), 0) / rows.length);
}

module.exports = {
  getInsights: async (companyId) => {
    const vipCustomers = await getSegmentCustomers('vip', companyId);
    const atRiskCustomers = await getSegmentCustomers('at_risk', companyId);

    const vip = {
      count: vipCustomers.length,
      avgSpend: avg(vipCustomers, 'total_revenue'),
      trend: vipCustomers.length > 0 ? 'Stable' : 'No VIP customers yet',
      recommendation: vipCustomers.length > 0 ? 'Launch Premium Loyalty Offer' : null,
    };

    const atRisk = {
      count: atRiskCustomers.length,
      // Matches segmentationEngine.js's at_risk definition (30 < days inactive <= 60).
      reason: 'No purchase in 31-60 days',
      expectedRecovery: avg(atRiskCustomers, 'total_revenue'),
      recommendation: atRiskCustomers.length > 0 ? '10% Coupon' : null,
    };

    return { vip, atRisk };
  }
};
