const { getMetricsSnapshot } = require('./metricsService');
const { getMarketingOpportunities } = require('./marketingEngine');

function generateInsights(metrics, companyId) {
  const insights = [];
  
  // Helper to generate a unique ID
  const generateId = (type, entityId) => `${type}_${entityId || Date.now()}`;

  // 1. Slow-moving stock alert (Urgent)
  // Only show top 3 to avoid clutter
  metrics.inventory.slowMovingItems.slice(0, 3).forEach(item => {
    insights.push({
      id: generateId('slow_moving', item.id),
      type: 'slow_moving_stock',
      severity: 'urgent',
      headline: `"${item.name}" hasn't sold in 30 days`,
      subtext: `${item.stock_quantity} units in stock. Consider a combo deal or discount.`,
      action: { label: 'View Product', route: `/stock?id=${item.id}` },
      source: 'rule_based'
    });
  });

  const marketingOpportunities = getMarketingOpportunities(companyId) || [];

  // Map marketing opportunities to dashboard insights
  marketingOpportunities.forEach(opp => {
    if (opp.type === 'dead_stock_liquidation') {
      insights.push({
        id: generateId('dead_stock_opp', opp.id),
        type: 'dead_stock_locked',
        severity: 'urgent',
        headline: `₹${Math.round(opp.evidence.cohort.reduce((s, c) => s + c.capital, 0)).toLocaleString()} locked in dead stock`,
        subtext: opp.detectedBecause,
        action: { label: 'Clear Stock', route: `/marketing?opp=${opp.id}` },
        source: 'opportunity_engine'
      });
    } else if (opp.type === 'revenue_recovery') {
      insights.push({
        id: generateId('credit_overdue_opp', opp.id),
        type: 'credit_overdue',
        severity: 'urgent',
        headline: `Revenue Recovery: ₹${Math.round(opp.expectedImpact).toLocaleString()} expected`,
        subtext: opp.detectedBecause,
        action: { label: 'Recover Funds', route: `/marketing?opp=${opp.id}` },
        source: 'opportunity_engine'
      });
    } else if (opp.type === 'customer_retention') {
      insights.push({
        id: generateId('churn_risk_opp', opp.id),
        type: 'churn_risk',
        severity: 'warning',
        headline: `Customer Retention Opportunity (Score: ${opp.overall_score})`,
        subtext: opp.detectedBecause,
        action: { label: 'Engage Customers', route: `/marketing?opp=${opp.id}` },
        source: 'opportunity_engine'
      });
    } else if (opp.type === 'cross_sell') {
      insights.push({
        id: generateId('cross_sell_opp', opp.id),
        type: 'cross_sell_opportunity',
        severity: 'info',
        headline: opp.name,
        subtext: opp.detectedBecause,
        action: { label: 'Cross-Sell', route: `/marketing?opp=${opp.id}` },
        source: 'opportunity_engine'
      });
    }
  });

  // 11. Best seller identified (Info)
  if (metrics.sales.topProduct !== 'N/A') {
    insights.push({
      id: generateId('best_seller', 'month'),
      type: 'best_seller_identified',
      severity: 'info',
      headline: `Double down on "${metrics.sales.topProduct}"`,
      subtext: `It's your strongest revenue driver this month (₹${metrics.sales.topProductRevenue.toLocaleString()}).`,
      action: { label: 'View Insights', route: `/sales` },
      source: 'rule_based'
    });
  }

  // 12. Revenue growth milestone (Info)
  if (metrics.sales.revenueMoM > 10) {
    insights.push({
      id: generateId('revenue_growth', 'mom'),
      type: 'revenue_growth',
      severity: 'info',
      headline: `Great job! Monthly revenue grew by ${metrics.sales.revenueMoM}%`,
      subtext: `You are outperforming your previous 30-day period.`,
      action: { label: 'View Dashboard', route: `/home` },
      source: 'rule_based'
    });
  }

  // 13. Repeat customer rate healthy (Info)
  if (metrics.customers.repeatRate > 40) {
    insights.push({
      id: generateId('healthy_repeat', 'rate'),
      type: 'healthy_repeat_rate',
      severity: 'info',
      headline: `Your repeat customer rate is strong at ${metrics.customers.repeatRate}%`,
      subtext: `Customers love your business. Keep up the good work.`,
      action: { label: 'View Customers', route: `/customers` },
      source: 'rule_based'
    });
  }

  return {
    generatedAt: metrics.generatedAt,
    confidence: 1.0, // Rule-based is fully deterministic
    dataQualityNote: null,
    insights
  };
}

function getDashboardInsights(companyId) {
  const metrics = getMetricsSnapshot(companyId);
  return generateInsights(metrics, companyId);
}

module.exports = {
  generateInsights,
  getDashboardInsights
};
