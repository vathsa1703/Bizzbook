const { getDb } = require('../config/db');

// Uses the most recent sales transaction date to anchor relative dates like "-30 days".
// This ensures that demo/seeded data remains usable regardless of the current physical date.
function getAnchorDate(db, companyId) {
  const row = db.prepare('SELECT MAX(sale_date) as max_date FROM sales WHERE company_id = ?').get(companyId);
  return row?.max_date || new Date().toISOString().slice(0, 10);
}

function getTopProducts(db, anchorDate, companyId, limit = 10) {
  return db.prepare(`
    SELECT p.name, SUM(s.quantity) AS units_sold, SUM(s.revenue) AS revenue 
    FROM sales s 
    JOIN products p ON p.id = s.product_id 
    WHERE s.sale_date >= date(?, '-30 days') AND s.company_id = ?
    GROUP BY p.id 
    ORDER BY revenue DESC 
    LIMIT ?
  `).all(anchorDate, companyId, limit);
}

function getSlowMovingProducts(db, anchorDate, companyId) {
  return db.prepare(`
    SELECT p.id, p.name, i.stock_quantity, COALESCE(SUM(s.quantity), 0) AS units_sold_last_30d
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN sales s ON s.product_id = p.id AND s.sale_date >= date(?, '-30 days') AND s.company_id = ?
    WHERE p.company_id = ?
    GROUP BY p.id
    HAVING units_sold_last_30d = 0 AND i.stock_quantity > 0
  `).all(anchorDate, companyId, companyId);
}

function getDeadStock(db, anchorDate, companyId) {
  return db.prepare(`
    SELECT p.id, p.name, i.stock_quantity, p.cost_price, (i.stock_quantity * p.cost_price) AS dead_stock_value
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN sales s ON s.product_id = p.id AND s.sale_date >= date(?, '-60 days') AND s.company_id = ?
    WHERE p.company_id = ?
    GROUP BY p.id
    HAVING COALESCE(SUM(s.quantity), 0) = 0 AND i.stock_quantity > 0
  `).all(anchorDate, companyId, companyId);
}

function getCustomerChurnRisk(db, anchorDate, companyId) {
  return db.prepare(`
    SELECT c.id, c.name, COUNT(s.id) AS total_purchases_historical, MAX(s.sale_date) AS last_purchase_date
    FROM customers c
    JOIN sales s ON s.customer_id = c.id AND s.company_id = ?
    WHERE c.company_id = ?
    GROUP BY c.id
    HAVING total_purchases_historical > 2 AND last_purchase_date < date(?, '-45 days')
  `).all(companyId, companyId, anchorDate);
}

function getRevenueTrends(db, companyId) {
  return db.prepare(`
    SELECT strftime('%Y-%m', sale_date) AS month, 
           SUM(revenue) AS revenue,
           SUM(revenue - (s.quantity * p.cost_price)) AS profit
    FROM sales s
    JOIN products p ON p.id = s.product_id
    WHERE s.company_id = ?
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `).all(companyId);
}

function getCreditRisk(db, anchorDate, companyId) {
  return db.prepare(`
    SELECT c.id, c.name, (cr.total_amount - cr.paid_amount) AS outstanding_amount, cr.due_date
    FROM credits cr
    JOIN customers c ON c.id = cr.customer_id
    WHERE cr.status IN ('pending', 'overdue') AND cr.due_date < date(?, '-30 days') AND cr.company_id = ?
  `).all(anchorDate, companyId);
}

function getSalesSummaryPeriods(db, anchorDate, companyId) {
  const current30d = db.prepare(`
    SELECT COALESCE(SUM(revenue), 0) AS revenue, COUNT(DISTINCT invoice_number) as transactions, COALESCE(SUM(quantity), 0) as items_sold
    FROM sales WHERE sale_date >= date(?, '-30 days') AND company_id = ?
  `).get(anchorDate, companyId);

  const previous30d = db.prepare(`
    SELECT COALESCE(SUM(revenue), 0) AS revenue 
    FROM sales WHERE sale_date >= date(?, '-60 days') AND sale_date < date(?, '-30 days') AND company_id = ?
  `).get(anchorDate, anchorDate, companyId);

  const current7d = db.prepare(`
    SELECT COALESCE(SUM(revenue), 0) AS revenue 
    FROM sales WHERE sale_date >= date(?, '-7 days') AND company_id = ?
  `).get(anchorDate, companyId);

  const previous7d = db.prepare(`
    SELECT COALESCE(SUM(revenue), 0) AS revenue 
    FROM sales WHERE sale_date >= date(?, '-14 days') AND sale_date < date(?, '-7 days') AND company_id = ?
  `).get(anchorDate, anchorDate, companyId);

  const avgBasketSize = current30d.transactions > 0 ? (current30d.items_sold / current30d.transactions).toFixed(2) : 0;

  return {
    revenue30d: current30d.revenue,
    transactions30d: current30d.transactions,
    avgBasketSize,
    revenueMoM: previous30d.revenue > 0 ? Math.round(((current30d.revenue - previous30d.revenue) / previous30d.revenue) * 100) : 0,
    revenue7d: current7d.revenue,
    revenueWoW: previous7d.revenue > 0 ? Math.round(((current7d.revenue - previous7d.revenue) / previous7d.revenue) * 100) : 0,
  };
}

function getReorderAlerts(db, companyId) {
  return db.prepare(`
    SELECT p.id, p.name, i.stock_quantity, i.reorder_level
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    WHERE i.stock_quantity <= i.reorder_level AND p.company_id = ?
  `).all(companyId);
}

function getOverstock(db, anchorDate, companyId) {
  return db.prepare(`
    SELECT p.id, p.name, i.stock_quantity, COALESCE(SUM(s.quantity)/3.0, 0) as avg_monthly_sales
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN sales s ON s.product_id = p.id AND s.sale_date >= date(?, '-90 days') AND s.company_id = ?
    WHERE p.company_id = ?
    GROUP BY p.id
    HAVING i.stock_quantity > 0 AND (avg_monthly_sales = 0 OR i.stock_quantity > (avg_monthly_sales * 3))
  `).all(anchorDate, companyId, companyId);
}

function getCustomerSummary(db, companyId) {
  const total = db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE company_id = ?').get(companyId).cnt;
  const repeat = db.prepare('SELECT COUNT(*) as cnt FROM (SELECT customer_id FROM sales WHERE company_id = ? GROUP BY customer_id HAVING COUNT(id) > 1)').get(companyId).cnt;
  const outstanding = db.prepare(`SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total_outstanding FROM credits WHERE status IN ('pending', 'overdue') AND company_id = ?`).get(companyId).total_outstanding;

  return {
    total,
    repeatRate: total > 0 ? Math.round((repeat / total) * 100) : 0,
    totalCreditsOutstanding: outstanding
  };
}

// getMetricsSnapshot requires companyId to prevent cross-tenant data leaks.
// Called by aiService.js with req.user.companyId.
function getMetricsSnapshot(companyId) {
  const db = getDb();
  try {
    const anchorDate = getAnchorDate(db, companyId);

    const topProducts = getTopProducts(db, anchorDate, companyId);
    const slowMovingProducts = getSlowMovingProducts(db, anchorDate, companyId);
    const deadStock = getDeadStock(db, anchorDate, companyId);
    const churnRisk = getCustomerChurnRisk(db, anchorDate, companyId);
    const revenueTrends = getRevenueTrends(db, companyId);
    const creditRisk = getCreditRisk(db, anchorDate, companyId);
    const salesSummary = getSalesSummaryPeriods(db, anchorDate, companyId);
    const reorderAlerts = getReorderAlerts(db, companyId);
    const overstock = getOverstock(db, anchorDate, companyId);
    const customerSummary = getCustomerSummary(db, companyId);

    const totalSKUs = db.prepare('SELECT COUNT(*) as cnt FROM inventory i JOIN products p ON p.id = i.product_id WHERE p.company_id = ?').get(companyId).cnt;

    return {
      generatedAt: new Date().toISOString(),
      anchorDate,
      sales: {
        revenue30d: salesSummary.revenue30d,
        revenueMoM: salesSummary.revenueMoM,
        revenue7d: salesSummary.revenue7d,
        revenueWoW: salesSummary.revenueWoW,
        avgBasketSize: salesSummary.avgBasketSize,
        topProduct: topProducts.length > 0 ? topProducts[0].name : 'N/A',
        topProductQty: topProducts.length > 0 ? topProducts[0].units_sold : 0,
        topProductRevenue: topProducts.length > 0 ? topProducts[0].revenue : 0,
        bottomProduct: topProducts.length > 0 ? topProducts[topProducts.length - 1].name : 'N/A',
        totalTransactions: salesSummary.transactions30d,
        revenueTrends,
      },
      inventory: {
        totalSKUs,
        slowMovingCount: slowMovingProducts.length,
        slowMovingItems: slowMovingProducts,
        deadStockValue: deadStock.reduce((sum, item) => sum + item.dead_stock_value, 0),
        deadStockItems: deadStock,
        reorderCount: reorderAlerts.length,
        reorderAlerts,
        overstockCount: overstock.length,
        overstockItems: overstock
      },
      customers: {
        total: customerSummary.total,
        repeatRate: customerSummary.repeatRate,
        churnRiskCount: churnRisk.length,
        churnRiskItems: churnRisk,
        totalCreditsOutstanding: customerSummary.totalCreditsOutstanding,
        creditRiskItems: creditRisk
      }
    };
  } finally {
    db.close();
  }
}

module.exports = {
  getAnchorDate,
  getTopProducts,
  getSlowMovingProducts,
  getDeadStock,
  getCustomerChurnRisk,
  getRevenueTrends,
  getCreditRisk,
  getMetricsSnapshot
};
