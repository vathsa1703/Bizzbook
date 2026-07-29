const { withExecutor, dateSub } = require('../config/dbEngine');

// Uses the most recent sales transaction date to anchor relative dates like "-30 days".
// This ensures that demo/seeded data remains usable regardless of the current physical date.
async function getAnchorDate(x, companyId) {
  const row = await x.get('SELECT MAX(sale_date) as max_date FROM sales WHERE company_id = ?', [companyId]);
  return row?.max_date || new Date().toISOString().slice(0, 10);
}

async function getTopProducts(x, anchorDate, companyId, limit = 10) {
  return x.all(`
    SELECT p.name, SUM(s.quantity) AS units_sold, SUM(s.revenue) AS revenue
    FROM sales s
    JOIN products p ON p.id = s.product_id
    WHERE s.sale_date >= ${dateSub(x, 30)} AND s.company_id = ?
    GROUP BY p.id
    ORDER BY revenue DESC
    LIMIT ?
  `, [anchorDate, companyId, limit]);
}

async function getSlowMovingProducts(x, anchorDate, companyId) {
  return x.all(`
    SELECT p.id, p.name, i.stock_quantity, COALESCE(SUM(s.quantity), 0) AS units_sold_last_30d
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN sales s ON s.product_id = p.id AND s.sale_date >= ${dateSub(x, 30)} AND s.company_id = ?
    WHERE p.company_id = ?
    GROUP BY p.id
    HAVING COALESCE(SUM(s.quantity), 0) = 0 AND i.stock_quantity > 0
  `, [anchorDate, companyId, companyId]);
}

async function getDeadStock(x, anchorDate, companyId) {
  return x.all(`
    SELECT p.id, p.name, i.stock_quantity, p.cost_price, (i.stock_quantity * p.cost_price) AS dead_stock_value
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN sales s ON s.product_id = p.id AND s.sale_date >= ${dateSub(x, 60)} AND s.company_id = ?
    WHERE p.company_id = ?
    GROUP BY p.id
    HAVING COALESCE(SUM(s.quantity), 0) = 0 AND i.stock_quantity > 0
  `, [anchorDate, companyId, companyId]);
}

async function getCustomerChurnRisk(x, anchorDate, companyId) {
  return x.all(`
    SELECT c.id, c.name, COUNT(s.id) AS total_purchases_historical, MAX(s.sale_date) AS last_purchase_date
    FROM customers c
    JOIN sales s ON s.customer_id = c.id AND s.company_id = ?
    WHERE c.company_id = ?
    GROUP BY c.id
    HAVING COUNT(s.id) > 2 AND MAX(s.sale_date) < ${dateSub(x, 45)}
  `, [companyId, companyId, anchorDate]);
}

async function getRevenueTrends(x, companyId) {
  // strftime('%Y-%m', ...) is SQLite-only; Postgres equivalent is
  // TO_CHAR(date_col, 'YYYY-MM') over the real DATE column.
  const monthExpr = x.engine === 'postgres' ? "TO_CHAR(sale_date, 'YYYY-MM')" : "strftime('%Y-%m', sale_date)";
  return x.all(`
    SELECT ${monthExpr} AS month,
           SUM(revenue) AS revenue,
           SUM(revenue - (s.quantity * p.cost_price)) AS profit
    FROM sales s
    JOIN products p ON p.id = s.product_id
    WHERE s.company_id = ?
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
  `, [companyId]);
}

async function getCreditRisk(x, anchorDate, companyId) {
  return x.all(`
    SELECT c.id, c.name, (cr.total_amount - cr.paid_amount) AS outstanding_amount, cr.due_date
    FROM credits cr
    JOIN customers c ON c.id = cr.customer_id
    WHERE cr.status IN ('pending', 'overdue') AND cr.due_date < ${dateSub(x, 30)} AND cr.company_id = ?
  `, [anchorDate, companyId]);
}

async function getSalesSummaryPeriods(x, anchorDate, companyId) {
  const current30d = await x.get(`
    SELECT COALESCE(SUM(revenue), 0) AS revenue, COUNT(DISTINCT invoice_number) as transactions, COALESCE(SUM(quantity), 0) as items_sold
    FROM sales WHERE sale_date >= ${dateSub(x, 30)} AND company_id = ?
  `, [anchorDate, companyId]);

  const previous30d = await x.get(`
    SELECT COALESCE(SUM(revenue), 0) AS revenue
    FROM sales WHERE sale_date >= ${dateSub(x, 60)} AND sale_date < ${dateSub(x, 30)} AND company_id = ?
  `, [anchorDate, anchorDate, companyId]);

  const current7d = await x.get(`
    SELECT COALESCE(SUM(revenue), 0) AS revenue
    FROM sales WHERE sale_date >= ${dateSub(x, 7)} AND company_id = ?
  `, [anchorDate, companyId]);

  const previous7d = await x.get(`
    SELECT COALESCE(SUM(revenue), 0) AS revenue
    FROM sales WHERE sale_date >= ${dateSub(x, 14)} AND sale_date < ${dateSub(x, 7)} AND company_id = ?
  `, [anchorDate, anchorDate, companyId]);

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

async function getReorderAlerts(x, companyId) {
  return x.all(`
    SELECT p.id, p.name, i.stock_quantity, i.reorder_level
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    WHERE i.stock_quantity <= i.reorder_level AND p.company_id = ?
  `, [companyId]);
}

async function getOverstock(x, anchorDate, companyId) {
  return x.all(`
    SELECT p.id, p.name, i.stock_quantity, COALESCE(SUM(s.quantity)/3.0, 0) as avg_monthly_sales
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN sales s ON s.product_id = p.id AND s.sale_date >= ${dateSub(x, 90)} AND s.company_id = ?
    WHERE p.company_id = ?
    GROUP BY p.id
    HAVING i.stock_quantity > 0 AND (COALESCE(SUM(s.quantity)/3.0, 0) = 0 OR i.stock_quantity > (COALESCE(SUM(s.quantity)/3.0, 0) * 3))
  `, [anchorDate, companyId, companyId]);
}

async function getCustomerSummary(x, companyId) {
  const total = (await x.get('SELECT COUNT(*) as cnt FROM customers WHERE company_id = ?', [companyId])).cnt;
  const repeat = (await x.get('SELECT COUNT(*) as cnt FROM (SELECT customer_id FROM sales WHERE company_id = ? GROUP BY customer_id HAVING COUNT(id) > 1) sub', [companyId])).cnt;
  const outstanding = (await x.get(`SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total_outstanding FROM credits WHERE status IN ('pending', 'overdue') AND company_id = ?`, [companyId])).total_outstanding;

  return {
    total,
    repeatRate: total > 0 ? Math.round((repeat / total) * 100) : 0,
    totalCreditsOutstanding: outstanding
  };
}

// getMetricsSnapshot requires companyId to prevent cross-tenant data leaks.
// Called by aiService.js with req.user.companyId.
async function getMetricsSnapshot(companyId) {
  return withExecutor(async (x) => {
    const anchorDate = await getAnchorDate(x, companyId);

    const topProducts = await getTopProducts(x, anchorDate, companyId);
    const slowMovingProducts = await getSlowMovingProducts(x, anchorDate, companyId);
    const deadStock = await getDeadStock(x, anchorDate, companyId);
    const churnRisk = await getCustomerChurnRisk(x, anchorDate, companyId);
    const revenueTrends = await getRevenueTrends(x, companyId);
    const creditRisk = await getCreditRisk(x, anchorDate, companyId);
    const salesSummary = await getSalesSummaryPeriods(x, anchorDate, companyId);
    const reorderAlerts = await getReorderAlerts(x, companyId);
    const overstock = await getOverstock(x, anchorDate, companyId);
    const customerSummary = await getCustomerSummary(x, companyId);

    const totalSKUs = (await x.get('SELECT COUNT(*) as cnt FROM inventory i JOIN products p ON p.id = i.product_id WHERE p.company_id = ?', [companyId])).cnt;

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
  });
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
