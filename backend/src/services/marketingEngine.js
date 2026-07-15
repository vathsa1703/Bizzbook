const { getDb } = require('../config/db');
const { getAnchorDate } = require('./metricsService');

let cachedOpportunities = null;
let lastComputed = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function invalidateOpportunityCache(companyId) {
  if (companyId) {
    oppCache.delete(companyId);
    console.log(`[MarketingEngine] Opportunity cache invalidated for company ${companyId}.`);
  } else {
    oppCache.clear();
    console.log('[MarketingEngine] Opportunity cache invalidated for all companies.');
  }
}

// 1. Revenue Recovery Engine
function getRevenueRecoveryOpportunities(db, anchorDate, companyId) {
  const rows = db.prepare(`
    SELECT 
      c.id AS customer_id,
      c.name AS customer_name,
      c.phone,
      SUM(cr.total_amount - cr.paid_amount) AS recoverable_amount,
      MAX(cr.due_date) as max_due_date,
      COUNT(cr.id) as overdue_invoices
    FROM credits cr
    JOIN customers c ON c.id = cr.customer_id
    WHERE cr.status IN ('pending', 'overdue') AND cr.due_date < date(?, '-15 days') AND cr.company_id = ?
    GROUP BY c.id
    HAVING recoverable_amount > 0
    ORDER BY recoverable_amount DESC
  `).all(anchorDate, companyId);

  if (rows.length === 0) return null;

  const totalRecovery = rows.reduce((sum, r) => sum + r.recoverable_amount, 0);
  
  let conservativeRecovery = 0;
  let expectedRecovery = 0;
  let optimisticRecovery = 0;

  rows.forEach(r => {
    // Probability of recovery drops as overdue invoices pile up
    const riskFactor = Math.min(1, r.overdue_invoices / 10);
    const baseRate = 0.8 - (riskFactor * 0.4); // 0.4 to 0.8
    expectedRecovery += r.recoverable_amount * baseRate;
    conservativeRecovery += r.recoverable_amount * (baseRate * 0.5);
    optimisticRecovery += r.recoverable_amount * Math.min(1, baseRate * 1.5);
  });
  
  const impactTiers = {
    conservative: conservativeRecovery,
    expected: expectedRecovery,
    optimistic: optimisticRecovery
  };

  return {
    id: 'opp_revenue_recovery_01',
    type: 'revenue_recovery',
    name: 'Revenue Recovery',
    priority: totalRecovery > 10000 ? 'High' : 'Medium',
    confidenceScore: 95,
    urgencyScore: 80,
    expectedImpact: impactTiers.expected,
    impactTiers,
    detectedBecause: `${rows.length} customers have unpaid invoices older than 15 days totaling ₹${totalRecovery.toLocaleString()}.`,
    summary: `${rows.length} overdue customers identified.`,
    evidence: {
      metrics: [
        `${rows.length} customers have overdue balances older than 15 days.`,
        `Historical recoverable revenue is ₹${totalRecovery.toLocaleString()}.`,
        `Top debtor: ${rows[0].customer_name} (₹${rows[0].recoverable_amount.toLocaleString()}).`
      ],
      cohort: rows.map(r => ({ id: r.customer_id, name: r.customer_name, amount: r.recoverable_amount, overdue_invoices: r.overdue_invoices }))
    }
  };
}

// 2. Customer Retention Engine
function getCustomerRetentionOpportunities(db, anchorDate, companyId) {
  const rows = db.prepare(`
    SELECT 
      c.id AS customer_id,
      c.name AS customer_name,
      c.phone,
      COUNT(s.id) AS total_purchases_historical,
      MAX(s.sale_date) AS last_purchase_date,
      SUM(s.revenue) / COUNT(s.id) AS avg_order_value,
      julianday(?) - julianday(MAX(s.sale_date)) as days_since_last_purchase
    FROM customers c
    JOIN sales s ON s.customer_id = c.id
    WHERE c.company_id = ?
    GROUP BY c.id
    HAVING total_purchases_historical >= 2 
       AND days_since_last_purchase > 45
       AND days_since_last_purchase <= 120
    ORDER BY avg_order_value DESC
  `).all(anchorDate, companyId);

  if (rows.length === 0) return null;

  const totalHistoricalValue = rows.reduce((sum, r) => sum + r.avg_order_value, 0);

  let conservativeValue = 0;
  let expectedValue = 0;
  let optimisticValue = 0;

  rows.forEach(r => {
    // Probability of return drops as days_inactive increases (45 to 120 range)
    const recencyFactor = Math.max(0, (120 - r.days_since_last_purchase) / (120 - 45)); 
    const frequencyFactor = Math.min(1.5, r.total_purchases_historical / 5); 
    const conversionProb = Math.min(0.8, recencyFactor * frequencyFactor * 0.5);
    
    expectedValue += r.avg_order_value * conversionProb;
    conservativeValue += r.avg_order_value * conversionProb * 0.5;
    optimisticValue += r.avg_order_value * Math.min(1, conversionProb * 1.5);
  });

  const impactTiers = {
    conservative: conservativeValue,
    expected: expectedValue,
    optimistic: optimisticValue
  };

  return {
    id: 'opp_customer_retention_01',
    type: 'customer_retention',
    name: 'Customer Retention',
    priority: 'High',
    confidenceScore: 85,
    urgencyScore: 70,
    expectedImpact: impactTiers.expected,
    impactTiers,
    detectedBecause: `${rows.length} loyal customers (2+ past purchases) have been inactive for 45+ days.`,
    summary: `${rows.length} loyal customers haven't purchased recently.`,
    evidence: {
      metrics: [
        `${rows.length} customers with 2+ past purchases are inactive for 45+ days.`,
        `Average historical order value across cohort: ₹${Math.round(totalHistoricalValue / rows.length).toLocaleString()}.`,
        `Combined historical value: ₹${Math.round(totalHistoricalValue).toLocaleString()}.`
      ],
      cohort: rows.map(r => ({ id: r.customer_id, name: r.customer_name, days_inactive: Math.round(r.days_since_last_purchase), avg_order: Math.round(r.avg_order_value) }))
    }
  };
}

// 3. Dead Stock Liquidation Engine
function getDeadStockOpportunities(db, anchorDate, companyId) {
  const rows = db.prepare(`
    SELECT 
      p.id AS product_id, 
      p.name AS product_name, 
      i.stock_quantity, 
      p.cost_price, 
      p.selling_price,
      (i.stock_quantity * p.cost_price) AS locked_capital
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN sales s ON s.product_id = p.id AND s.sale_date >= date(?, '-60 days')
    WHERE p.company_id = ?
    GROUP BY p.id
    HAVING COALESCE(SUM(s.quantity), 0) = 0 AND i.stock_quantity > 0 AND locked_capital > 2000
    ORDER BY locked_capital DESC
  `).all(anchorDate, companyId);

  if (rows.length === 0) return null;

  const totalCapitalLocked = rows.reduce((sum, r) => sum + r.locked_capital, 0);
  const potentialRetailValue = rows.reduce((sum, r) => sum + (r.stock_quantity * r.selling_price), 0);

  let conservativeValue = 0;
  let expectedValue = 0;
  let optimisticValue = 0;

  rows.forEach(r => {
    const margin = (r.selling_price - r.cost_price) / r.selling_price;
    // Lower margin items require deeper cuts to liquidate, reducing value
    const discount = margin > 0.5 ? 0.3 : 0.15; 
    const clearancePrice = r.selling_price * (1 - discount);
    
    expectedValue += Math.ceil(r.stock_quantity * 0.5) * clearancePrice;
    conservativeValue += Math.ceil(r.stock_quantity * 0.2) * r.cost_price; // Fire sale at cost
    optimisticValue += Math.ceil(r.stock_quantity * 0.8) * clearancePrice;
  });

  const impactTiers = {
    conservative: conservativeValue,
    expected: expectedValue,
    optimistic: optimisticValue
  };

  return {
    id: 'opp_dead_stock_01',
    type: 'dead_stock_liquidation',
    name: 'Dead Stock Liquidation',
    priority: totalCapitalLocked > 50000 ? 'High' : 'Medium',
    confidenceScore: 90,
    urgencyScore: 90,
    expectedImpact: impactTiers.expected,
    impactTiers,
    detectedBecause: `${rows.length} products have ₹${totalCapitalLocked.toLocaleString()} in locked capital and 0 sales in the last 60 days.`,
    summary: `₹${totalCapitalLocked.toLocaleString()} locked in slow-moving inventory.`,
    evidence: {
      metrics: [
        `${rows.length} products have not sold a single unit in the last 60 days.`,
        `Total capital locked in this dead stock: ₹${totalCapitalLocked.toLocaleString()}.`,
        `Largest locked capital: "${rows[0].product_name}" (₹${rows[0].locked_capital.toLocaleString()}).`
      ],
      cohort: rows.map(r => ({ name: r.product_name, qty: r.stock_quantity, capital: r.locked_capital }))
    }
  };
}

// 4. Cross-Sell Engine
function getCrossSellOpportunities(db, anchorDate, companyId) {
  // Find top selling product
  const topProduct = db.prepare(`
    SELECT p.id, p.name, p.selling_price 
    FROM sales s JOIN products p ON p.id = s.product_id 
    WHERE s.company_id = ?
    GROUP BY p.id ORDER BY COUNT(s.id) DESC LIMIT 1
  `).get(companyId);
  
  if (!topProduct) return null;

  // Find another popular product that is not the top product
  const targetProduct = db.prepare(`
    SELECT p.id, p.name, p.selling_price 
    FROM sales s JOIN products p ON p.id = s.product_id 
    WHERE p.id != ? AND s.company_id = ? GROUP BY p.id ORDER BY COUNT(s.id) DESC LIMIT 1
  `).get(topProduct.id, companyId);

  if (!targetProduct) return null;

  // Find customers who bought topProduct but not targetProduct
  const rows = db.prepare(`
    SELECT DISTINCT c.id as customer_id, c.name as customer_name, c.phone
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.product_id = ? AND s.company_id = ?
    AND c.id NOT IN (SELECT customer_id FROM sales WHERE product_id = ? AND company_id = ?)
  `).all(topProduct.id, companyId, targetProduct.id, companyId);

  if (rows.length < 2) return null;

  const potentialRevenue = rows.length * targetProduct.selling_price;
  
  const priceRatio = targetProduct.selling_price / topProduct.selling_price;
  // If target is much cheaper than top product, conversion is higher (impulse buy)
  const baseProb = priceRatio < 0.3 ? 0.25 : (priceRatio < 0.8 ? 0.15 : 0.05);

  const impactTiers = {
    conservative: potentialRevenue * (baseProb * 0.5),
    expected: potentialRevenue * baseProb,
    optimistic: potentialRevenue * Math.min(1, baseProb * 1.5)
  };

  return {
    id: 'opp_cross_sell_01',
    type: 'cross_sell',
    name: `Cross-Sell: ${targetProduct.name}`,
    priority: 'Medium',
    confidenceScore: 75,
    urgencyScore: 50,
    expectedImpact: impactTiers.expected,
    impactTiers,
    detectedBecause: `${rows.length} customers bought "${topProduct.name}" but haven't purchased "${targetProduct.name}".`,
    summary: `${rows.length} prime candidates for cross-selling ${targetProduct.name}.`,
    evidence: {
      metrics: [
        `${rows.length} customers identified in the target segment.`,
        `Potential revenue if 100% convert: ₹${potentialRevenue.toLocaleString()}.`,
        `Base assumption: Customers buying ${topProduct.name} have high affinity for ${targetProduct.name}.`
      ],
      cohort: rows.slice(0, 10).map(r => ({ id: r.customer_id, name: r.customer_name, target_product: targetProduct.name }))
    }
  };
}


const oppCache = new Map();

function getMarketingOpportunities(companyId, forceRefresh = false) {
  if (!companyId) return [];

  const now = Date.now();
  if (!forceRefresh && oppCache.has(companyId)) {
    const cached = oppCache.get(companyId);
    if (now - cached.lastComputed < CACHE_TTL) {
      console.log(`[MarketingEngine] Serving opportunities from cache for company ${companyId}.`);
      return cached.opportunities;
    }
  }
  
  console.log(`[MarketingEngine] Recomputing opportunities for company ${companyId}...`);
  const db = getDb();
  try {
    const anchorDate = getAnchorDate(db, companyId);
    const opportunities = [];

    const revRecovery = getRevenueRecoveryOpportunities(db, anchorDate, companyId);
    if (revRecovery) opportunities.push(revRecovery);

    const retention = getCustomerRetentionOpportunities(db, anchorDate, companyId);
    if (retention) opportunities.push(retention);

    const deadStock = getDeadStockOpportunities(db, anchorDate, companyId);
    if (deadStock) opportunities.push(deadStock);
    
    const crossSell = getCrossSellOpportunities(db, anchorDate, companyId);
    if (crossSell) opportunities.push(crossSell);

    const maxImpact = Math.max(1, ...opportunities.map(o => o.expectedImpact));

    opportunities.forEach(o => {
      // Normalize impact score to a 0-100 scale based on the max impact found
      o.impact_score = Math.round((o.expectedImpact / maxImpact) * 100);
      
      o.overall_score = Math.round((o.impact_score * 0.5) + (o.confidenceScore * 0.3) + (o.urgencyScore * 0.2));
    });

    opportunities.sort((a, b) => b.overall_score - a.overall_score);

    oppCache.set(companyId, { opportunities, lastComputed: now });

    return opportunities;
  } finally {
    db.close();
  }
}

function getOpportunityById(id, companyId) {
  const opps = getMarketingOpportunities(companyId);
  return opps.find(o => o.id === id) || null;
}

module.exports = {
  getMarketingOpportunities,
  getOpportunityById,
  invalidateOpportunityCache
};
