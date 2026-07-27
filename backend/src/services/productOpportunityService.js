// Real product-demand trend detection for the AI Copilot dashboard's
// "New Opportunities" panel. Was previously a hardcoded stub (Coca Cola,
// Seasonal Umbrella -- products that don't exist in any real company's
// catalog) -- now compares each product's actual sales velocity over the
// last 14 days against the 14 days before that, anchored to the company's
// most recent sale date (same anchoring convention as metricsService.js/
// marketingEngine.js, so demo data stays consistent even as real time passes).
const { getDb } = require('../config/db');
const { getAnchorDate } = require('./metricsService');

module.exports = {
  getOpportunities: async (companyId) => {
    const db = getDb();
    try {
      const anchorDate = getAnchorDate(db, companyId);

      const rows = db.prepare(`
        SELECT
          p.id, p.name,
          COALESCE(SUM(CASE WHEN s.sale_date >  date(?, '-14 days') THEN s.quantity ELSE 0 END), 0) AS recent_qty,
          COALESCE(SUM(CASE WHEN s.sale_date <= date(?, '-14 days') AND s.sale_date > date(?, '-28 days') THEN s.quantity ELSE 0 END), 0) AS prior_qty
        FROM products p
        LEFT JOIN sales s ON s.product_id = p.id AND s.sale_date > date(?, '-28 days')
        WHERE p.company_id = ?
        GROUP BY p.id
      `).all(anchorDate, anchorDate, anchorDate, anchorDate, companyId);

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
    } finally {
      db.close();
    }
  }
};
