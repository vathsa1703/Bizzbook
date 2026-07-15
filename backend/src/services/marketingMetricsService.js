const { getDb } = require('../config/db');

/**
 * Shared metrics layer for all Marketing Intelligence features.
 * Ensures AOV, LTV, Margin, ROI, and Confidence are calculated identically everywhere.
 */

function getStoreEconomics(db, companyId, timeframe = '1year') {
  let dateFilter = '';
  if (timeframe === '1year') {
    dateFilter = `AND invoice_date >= date('now', '-365 days')`;
  }

  // 1. AOV and Frequency
  const invoiceStats = db.prepare(`
    SELECT 
      COUNT(id) as total_invoices,
      COUNT(DISTINCT customer_id) as total_customers,
      SUM(grand_total) as total_revenue
    FROM invoices
    WHERE company_id = ? ${dateFilter}
  `).get(companyId);

  let aov = 0;
  let purchaseFrequency = 1;
  let ltv = 0;

  if (invoiceStats && invoiceStats.total_invoices > 0) {
    aov = invoiceStats.total_revenue / invoiceStats.total_invoices;
    if (invoiceStats.total_customers > 0) {
      purchaseFrequency = invoiceStats.total_invoices / invoiceStats.total_customers;
    }
    ltv = aov * purchaseFrequency;
  }

  // 2. Margin
  const productStats = db.prepare(`
    SELECT 
      AVG((selling_price - cost_price) / NULLIF(selling_price, 0)) as avg_margin
    FROM products
    WHERE company_id = ? AND selling_price > 0
  `).get(companyId);

  let margin = (productStats && productStats.avg_margin) ? productStats.avg_margin : 0.3;

  return {
    margin,
    aov,
    purchaseFrequency,
    ltv
  };
}

function getConfidenceScore(db, companyId, keyword, defaultConfidence = 50) {
  const signal = db.prepare(`
    SELECT confidence_score 
    FROM marketing_signals 
    WHERE company_id = ? AND signal_name LIKE '%' || ? || '%' 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get(companyId, keyword);

  return signal ? signal.confidence_score : defaultConfidence;
}

function getCampaignPerformance(db, companyId, dateFilter = '') {
  // Fetch campaigns
  const campaigns = db.prepare(`
    SELECT 
      id, name, segment, type,
      campaign_cost as base_cost, 
      actual_revenue, 
      target_count, 
      customers_converted,
      status
    FROM marketing_campaigns
    WHERE company_id = ? AND status = 'completed' ${dateFilter}
  `).all(companyId);

  if (campaigns.length === 0) return [];

  // Fetch comm costs
  const logs = db.prepare(`
    SELECT campaign_id, channel, count(id) as msgs 
    FROM communication_logs 
    WHERE company_id = ?
    GROUP BY campaign_id, channel
  `).all(companyId);

  const costs = db.prepare(`SELECT channel, cost_per_message FROM channel_costs WHERE company_id = ?`).all(companyId);
  const costMap = {};
  costs.forEach(c => { costMap[c.channel] = c.cost_per_message; });

  return campaigns.map(c => {
    let commCost = 0;
    const campLogs = logs.filter(l => l.campaign_id === c.id);
    const channelsUsed = [];
    campLogs.forEach(cl => { 
      commCost += (cl.msgs * (costMap[cl.channel] || 0.15)); 
      channelsUsed.push({ channel: cl.channel, msgs: cl.msgs, cost: cl.msgs * (costMap[cl.channel] || 0.15) });
    });

    const totalCost = (c.base_cost || 0) + commCost;
    const revenue = c.actual_revenue || 0;
    const roi = totalCost > 0 ? (revenue - totalCost) / totalCost : (revenue > 0 ? 1 : 0);
    
    return {
      ...c,
      commCost,
      totalCost,
      revenue,
      roi,
      channelsUsed
    };
  });
}

module.exports = {
  getStoreEconomics,
  getConfidenceScore,
  getCampaignPerformance
};
