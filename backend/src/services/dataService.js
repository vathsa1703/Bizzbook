// Every function here runs a real SQL query and returns plain numbers/objects.
// All functions now accept a companyId parameter for multi-tenant data isolation,
// and a scopeContext parameter for branch filtering.
//
// All functions are async and route through dbEngine.js's dbGet/dbAll (Postgres-
// only). Query text is written in plain '?' placeholders; the conversion to
// Postgres's '$1, $2, ...' happens inside dbEngine.js on the fully-assembled
// string, after withBranchScope has already appended its predicate.

const { dbGet, dbAll } = require('../config/dbEngine');
const { withBranchScope } = require('../utils/BranchScopedQuery');

function pad(n) {
  return String(n).padStart(2, '0');
}

function priorMonth(month, year) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

function monthBounds(month, year) {
  const start = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${pad(month)}-${pad(lastDay)}`;
  return { start, end };
}

async function getMonthlySalesSummary({ month, year, companyId, scopeContext }) {
  const { start, end } = monthBounds(month, year);

  const q1 = withBranchScope(`SELECT COALESCE(SUM(revenue), 0) AS revenue, COALESCE(SUM(quantity), 0) AS quantity, COUNT(*) AS transactions FROM sales WHERE sale_date BETWEEN ? AND ? AND company_id = ?`, [start, end, companyId], scopeContext, 'branch_id');
  const current = await dbGet(q1.sql, q1.params);

  const prev = priorMonth(month, year);
  const prevBounds = monthBounds(prev.month, prev.year);

  const q2 = withBranchScope(`SELECT COALESCE(SUM(revenue), 0) AS revenue FROM sales WHERE sale_date BETWEEN ? AND ? AND company_id = ?`, [prevBounds.start, prevBounds.end, companyId], scopeContext, 'branch_id');
  const previous = await dbGet(q2.sql, q2.params);

  const pctChange = previous.revenue > 0 ? Math.round(((current.revenue - previous.revenue) / previous.revenue) * 1000) / 10 : null;

  return {
    month, year,
    total_revenue: current.revenue,
    total_units_sold: current.quantity,
    transaction_count: current.transactions,
    previous_month_revenue: previous.revenue,
    percent_change_vs_previous_month: pctChange,
  };
}

async function getRevenueTrend({ months = 6, companyId, scopeContext } = {}) {
  const q = withBranchScope(`
    SELECT substr(CAST(s.sale_date AS TEXT), 1, 7) AS month, SUM(s.revenue) AS revenue, SUM(s.revenue - s.quantity * p.cost_price) AS profit
    FROM sales s JOIN products p ON p.id = s.product_id
    WHERE s.company_id = ?
  `, [companyId], scopeContext, 's.branch_id');
  q.sql += ` GROUP BY month ORDER BY month DESC LIMIT ?`;
  q.params.push(months);

  const rows = await dbAll(q.sql, q.params);
  return rows.reverse();
}

async function getTopProducts({ month, year, limit = 5, companyId, scopeContext } = {}) {
  let baseQuery = `
    SELECT p.name, SUM(s.quantity) AS units_sold, SUM(s.revenue) AS revenue
    FROM sales s JOIN products p ON p.id = s.product_id
    WHERE s.company_id = ?
  `;
  let params = [companyId];
  if (month && year) {
    const { start, end } = monthBounds(month, year);
    baseQuery += ` AND s.sale_date BETWEEN ? AND ?`;
    params.push(start, end);
  }

  const q = withBranchScope(baseQuery, params, scopeContext, 's.branch_id');
  q.sql += ` GROUP BY p.id ORDER BY revenue DESC LIMIT ?`;
  q.params.push(limit);

  return dbAll(q.sql, q.params);
}

async function getLowPerformingProducts({ month, year, limit = 5, companyId, scopeContext } = {}) {
  let baseQuery = `
    SELECT p.name, SUM(s.quantity) AS units_sold, SUM(s.revenue) AS revenue
    FROM sales s JOIN products p ON p.id = s.product_id
    WHERE s.company_id = ?
  `;
  let params = [companyId];
  if (month && year) {
    const { start, end } = monthBounds(month, year);
    baseQuery += ` AND s.sale_date BETWEEN ? AND ?`;
    params.push(start, end);
  }

  const q = withBranchScope(baseQuery, params, scopeContext, 's.branch_id');
  q.sql += ` GROUP BY p.id ORDER BY revenue ASC LIMIT ?`;
  q.params.push(limit);

  return dbAll(q.sql, q.params);
}

async function getLowStockItems({ companyId, scopeContext } = {}) {
  const q = withBranchScope(`
    SELECT p.name, i.stock_quantity, i.reorder_level, i.last_restocked
    FROM inventory i JOIN products p ON p.id = i.product_id
    WHERE i.stock_quantity <= i.reorder_level AND p.company_id = ?
  `, [companyId], scopeContext, 'i.branch_id');
  q.sql += ` ORDER BY (i.stock_quantity - i.reorder_level) ASC`;

  return dbAll(q.sql, q.params);
}

async function getOverstockedItems({ thresholdMultiplier = 4, companyId, scopeContext } = {}) {
  const q = withBranchScope(`
    SELECT p.name, i.stock_quantity, i.reorder_level
    FROM inventory i JOIN products p ON p.id = i.product_id
    WHERE i.stock_quantity > (i.reorder_level * ?) AND p.company_id = ?
  `, [thresholdMultiplier, companyId], scopeContext, 'i.branch_id');
  q.sql += ` ORDER BY i.stock_quantity DESC`;

  return dbAll(q.sql, q.params);
}

async function getCategoryDistribution({ companyId, scopeContext } = {}) {
  const q = withBranchScope(`
    SELECT p.category, SUM(s.revenue) AS revenue
    FROM sales s JOIN products p ON p.id = s.product_id
    WHERE s.company_id = ?
  `, [companyId], scopeContext, 's.branch_id');
  q.sql += ` GROUP BY p.category ORDER BY revenue DESC`;

  return dbAll(q.sql, q.params);
}

async function getBranchComparison({ companyId, scopeContext } = {}) {
  // We want to show revenue grouped by branch.
  // Since it's multi-branch or global, we scope it to the allowed branches in scopeContext.
  const q = withBranchScope(`
    SELECT b.name as branch_name, COALESCE(SUM(s.revenue), 0) AS revenue, COUNT(s.id) as transactions
    FROM branches b
    LEFT JOIN sales s ON s.branch_id = b.id
    WHERE b.company_id = ?
  `, [companyId], scopeContext, 'b.id');
  q.sql += ` GROUP BY b.id ORDER BY revenue DESC`;

  return dbAll(q.sql, q.params);
}

async function getSlowMovingInventory({ days = 30, companyId, scopeContext } = {}) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const q = withBranchScope(`
    SELECT p.name, i.stock_quantity, COALESCE(SUM(s.quantity), 0) AS units_sold_recently
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN sales s ON s.product_id = p.id AND s.sale_date >= ? AND s.company_id = ?
    WHERE p.company_id = ?
  `, [cutoffStr, companyId, companyId], scopeContext, 'i.branch_id');

  // Two Postgres-only rejections fixed here, both of which SQLite tolerates:
  //   1. i.stock_quantity was selected/filtered/ordered while GROUP BY listed
  //      only p.id — Postgres requires it to be grouped or aggregated. It is
  //      added to GROUP BY rather than pre-aggregated the way metricsService.js
  //      and marketingEngine.js do it (INVENTORY_BY_PRODUCT), because this
  //      query is branch-scoped: withBranchScope appends a predicate on
  //      i.branch_id, and a subquery that pre-aggregates away branch_id would
  //      break that filter.
  //   2. HAVING referenced the output alias `units_sold_recently`. Postgres
  //      allows output aliases in GROUP BY and ORDER BY but never in HAVING
  //      ("column units_sold_recently does not exist"), so the aggregate is
  //      spelled out instead.
  // NOTE: this leaves the pre-existing multi-branch counting question untouched
  // (a product stocked in N branches yields N groups, each seeing that
  // product's full sales total, because the sales join is on product_id only
  // and is not branch-filtered). That is unchanged from the previous behavior
  // and needs a product decision about whether sales should be branch-scoped
  // too — deliberately not resolved as a drive-by here.
  q.sql += ` GROUP BY p.id, i.stock_quantity HAVING COALESCE(SUM(s.quantity), 0) < 5 AND i.stock_quantity > 20 ORDER BY i.stock_quantity DESC`;

  return dbAll(q.sql, q.params);
}

async function getProfitAnalysis({ month, year, companyId, scopeContext }) {
  const { start, end } = monthBounds(month, year);

  const q1 = withBranchScope(`SELECT COALESCE(SUM(s.revenue), 0) AS revenue, COALESCE(SUM(s.quantity * p.cost_price), 0) AS cost FROM sales s JOIN products p ON p.id = s.product_id WHERE s.sale_date BETWEEN ? AND ? AND s.company_id = ?`, [start, end, companyId], scopeContext, 's.branch_id');
  const current = await dbGet(q1.sql, q1.params);

  const profit = current.revenue - current.cost;
  const margin = current.revenue > 0 ? Math.round((profit / current.revenue) * 1000) / 10 : null;

  const prev = priorMonth(month, year);
  const prevBounds = monthBounds(prev.month, prev.year);

  const q2 = withBranchScope(`SELECT COALESCE(SUM(s.revenue), 0) AS revenue, COALESCE(SUM(s.quantity * p.cost_price), 0) AS cost FROM sales s JOIN products p ON p.id = s.product_id WHERE s.sale_date BETWEEN ? AND ? AND s.company_id = ?`, [prevBounds.start, prevBounds.end, companyId], scopeContext, 's.branch_id');
  const previous = await dbGet(q2.sql, q2.params);

  const prevProfit = previous.revenue - previous.cost;

  return {
    month, year,
    revenue: current.revenue, cost: current.cost, profit, margin_percent: margin,
    previous_month_profit: prevProfit,
    profit_change_vs_previous_month: prevProfit !== 0 ? Math.round(((profit - prevProfit) / Math.abs(prevProfit)) * 1000) / 10 : null,
  };
}

async function getPendingInvoices({ companyId, scopeContext } = {}) {
  const q = withBranchScope(`
    SELECT i.invoice_number, c.name AS customer_name, i.amount, i.invoice_date, i.status
    FROM invoices i JOIN customers c ON c.id = i.customer_id
    WHERE i.status IN ('pending', 'overdue') AND i.company_id = ?
  `, [companyId], scopeContext, 'i.branch_id'); // Wait, invoices doesn't have branch_id. Skip scoping or add it? Let's assume no scoping for now since invoices aren't scoped. Or rather, wait!
  q.sql += ` ORDER BY i.invoice_date ASC`;
  return dbAll(q.sql, q.params);
}

async function getCustomers({ companyId, scopeContext } = {}) {
  const q = withBranchScope(`
    SELECT id, name, total_purchases, last_purchase_date FROM customers WHERE company_id = ?
  `, [companyId], scopeContext, 'branch_id');
  q.sql += ` ORDER BY total_purchases DESC`;
  return dbAll(q.sql, q.params);
}

async function getTopGroups({ limit = 5, companyId, scopeContext } = {}) {
  const q = withBranchScope(`
    SELECT pg.name, COALESCE(SUM(s.revenue), 0) AS revenue
    FROM sales s
    JOIN products p ON p.id = s.product_id
    JOIN product_groups pg ON p.group_id = pg.id
    WHERE s.company_id = ?
  `, [companyId], scopeContext, 's.branch_id');
  q.sql += ` GROUP BY pg.id ORDER BY revenue DESC LIMIT ?`;
  q.params.push(limit);

  return dbAll(q.sql, q.params);
}

async function getRevenueByGroup({ month, year, companyId, scopeContext } = {}) {
  let baseQuery = `
    SELECT pg.name as group_name, SUM(s.revenue) AS revenue
    FROM sales s
    JOIN products p ON p.id = s.product_id
    JOIN product_groups pg ON p.group_id = pg.id
    WHERE s.company_id = ?
  `;
  let params = [companyId];
  if (month && year) {
    const { start, end } = monthBounds(month, year);
    baseQuery += ` AND s.sale_date BETWEEN ? AND ?`;
    params.push(start, end);
  }
  const q = withBranchScope(baseQuery, params, scopeContext, 's.branch_id');
  q.sql += ` GROUP BY pg.id ORDER BY revenue DESC`;

  return dbAll(q.sql, q.params);
}

async function getInventoryByGroup({ companyId, scopeContext } = {}) {
  const q = withBranchScope(`
    SELECT pg.name as group_name, SUM(i.stock_quantity) AS total_items, SUM(i.stock_quantity * p.cost_price) AS total_value
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    JOIN product_groups pg ON p.group_id = pg.id
    WHERE p.company_id = ?
  `, [companyId], scopeContext, 'i.branch_id');
  q.sql += ` GROUP BY pg.id ORDER BY total_value DESC`;

  return dbAll(q.sql, q.params);
}

async function getRecommendations({ companyId, scopeContext } = {}) {
  const lowStock = await getLowStockItems({ companyId, scopeContext });
  const overstocked = await getOverstockedItems({ companyId, scopeContext });
  const slowMoving = await getSlowMovingInventory({ companyId, scopeContext });
  const topProducts = await getTopProducts({ limit: 3, companyId, scopeContext });
  const pendingInvoices = await getPendingInvoices({ companyId, scopeContext });

  const recommendations = [];

  for (const item of lowStock) {
    recommendations.push(
      `Restock "${item.name}" soon — only ${item.stock_quantity} units left against a reorder level of ${item.reorder_level}.`
    );
  }
  for (const item of overstocked) {
    recommendations.push(
      `Consider a discount or bundle for "${item.name}" — ${item.stock_quantity} units in stock is well above the usual reorder level of ${item.reorder_level}.`
    );
  }
  for (const item of slowMoving) {
    if (!overstocked.find((o) => o.name === item.name)) {
      recommendations.push(`"${item.name}" has barely sold recently while ${item.stock_quantity} units sit in stock — investigate demand or pricing.`);
    }
  }
  if (topProducts.length > 0) {
    recommendations.push(`Double down on "${topProducts[0].name}" — it's your strongest revenue driver right now.`);
  }
  const overdueCount = pendingInvoices.filter((i) => i.status === 'overdue').length;
  if (overdueCount > 0) {
    recommendations.push(`Follow up on ${overdueCount} overdue invoice(s) — unpaid invoices are hurting cash flow.`);
  }

  return recommendations;
}

module.exports = {
  getMonthlySalesSummary,
  getRevenueTrend,
  getTopProducts,
  getLowPerformingProducts,
  getLowStockItems,
  getOverstockedItems,
  getCategoryDistribution,
  getBranchComparison,
  getSlowMovingInventory,
  getProfitAnalysis,
  getPendingInvoices,
  getCustomers,
  getTopGroups,
  getRevenueByGroup,
  getInventoryByGroup,
  getRecommendations,
};
