// Real product-demand trend detection for the AI Copilot dashboard's
// "New Opportunities" panel. Was previously a hardcoded stub (Coca Cola,
// Seasonal Umbrella -- products that don't exist in any real company's
// catalog) -- now compares each product's actual sales velocity over the
// last 14 days against the 14 days before that, anchored to the company's
// most recent sale date (same anchoring convention as metricsService.js/
// marketingEngine.js, so demo data stays consistent even as real time passes).
const { withExecutor, dateSub } = require('../config/dbEngine');
const { getAnchorDate } = require('./metricsService');

module.exports = {
  getOpportunities: async (companyId) => {
    return withExecutor(async (x) => {
      const anchorDate = await getAnchorDate(x, companyId);
      const minus14 = dateSub(x, 14);
      const minus28 = dateSub(x, 28);

      const rows = await x.all(`
        SELECT
          p.id, p.name,
          COALESCE(SUM(CASE WHEN s.sale_date >  ${minus14} THEN s.quantity ELSE 0 END), 0) AS recent_qty,
          COALESCE(SUM(CASE WHEN s.sale_date <= ${minus14} AND s.sale_date > ${minus28} THEN s.quantity ELSE 0 END), 0) AS prior_qty
        FROM products p
        LEFT JOIN sales s ON s.product_id = p.id AND s.sale_date > ${minus28}
        WHERE p.company_id = ?
        GROUP BY p.id
      `, [anchorDate, anchorDate, anchorDate, anchorDate, companyId]);

      const withTrend = rows
        .filter(r => r.recent_qty > 0 || r.prior_qty > 0)
        .map(r => {
          const demandPct = r.prior_qty > 0
            ? Math.round(((r.recent_qty - r.prior_qty) / r.prior_qty) * 100)
            : (r.recent_qty > 0 ? 100 : 0);
          return { ...r, demandPct };
        });

      const risers = withTrend.filter(r => r.demandPct > 0).sort((a, b) => b.demandPct - a.demandPct).slice(0, 2);
      const fallers = withTrend.filter(r => r.demandPct < 0).sort((a, b) => a.demandPct - b.demandPct).slice(0, 2);

      const confidenceFor = (rows_) => Math.min(95, 60 + Math.min(rows_.recent_qty, rows_.prior_qty) * 2);

      const opportunities = [
        ...risers.map(r => ({
          product: r.name,
          demand: `+${r.demandPct}%`,
          recommendation: 'Increase stock, consider a bundle offer',
          confidence: confidenceFor(r),
        })),
        ...fallers.map(r => ({
          product: r.name,
          demand: `${r.demandPct}%`,
          recommendation: 'Clearance sale to move stock',
          confidence: confidenceFor(r),
        })),
      ];

      return opportunities;
    });
  }
};
