/**
 * segmentationEngine.js
 * SQL-first customer segmentation. AI never selects customers — only SQL does.
 * Each segment function returns a consistent shape:
 *   { segment_name, customer_id, name, phone, email, last_purchase_date, total_orders, total_revenue }
 */
const { withExecutor, dateSub } = require('../config/dbEngine');
const { getAnchorDate } = require('./metricsService');

// ─── Segment Definitions ───────────────────────────────────────────────────────

const SEGMENTS = [
  {
    id: 'vip',
    name: 'VIP Customers',
    description: 'Top 20% customers by lifetime revenue',
    icon: 'crown',
    color: 'amber',
  },
  {
    id: 'at_risk',
    name: 'At-Risk Customers',
    description: 'Previously active but no purchases in last 30 days',
    icon: 'alert',
    color: 'orange',
  },
  {
    id: 'high_spend_low_freq',
    name: 'High Spend, Low Frequency',
    description: 'High average order value but purchases fewer than 3 times',
    icon: 'gem',
    color: 'violet',
  },
  {
    id: 'frequent_low_value',
    name: 'Frequent Buyers, Low Value',
    description: 'Buy often but spend little per order',
    icon: 'repeat',
    color: 'blue',
  },
  {
    id: 'new_customers',
    name: 'New Customers',
    description: 'First purchase within the last 30 days',
    icon: 'star',
    color: 'green',
  },
  {
    id: 'inactive',
    name: 'Inactive Customers',
    description: 'No purchases in the last 60+ days',
    icon: 'sleep',
    color: 'gray',
  },
];

// ─── Segment Queries ───────────────────────────────────────────────────────────

async function getVipCustomers(x, anchorDate, companyId) {
  return x.all(`
    WITH ranked AS (
      SELECT
        c.id AS customer_id, c.name, c.phone, c.email,
        c.last_purchase_date,
        COUNT(s.id) AS total_orders,
        COALESCE(SUM(s.revenue), 0) AS total_revenue,
        NTILE(5) OVER (ORDER BY COALESCE(SUM(s.revenue), 0) DESC) AS revenue_quintile
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id
      WHERE c.company_id = ?
      GROUP BY c.id
      HAVING COUNT(s.id) > 0
    )
    SELECT *, 'vip' AS segment_name FROM ranked WHERE revenue_quintile = 1
    ORDER BY total_revenue DESC
  `, [companyId]);
}

// julianday() is SQLite-only; Postgres has real DATE columns, so a plain
// date subtraction (`?::date - MAX(sale_date)`) gives the day-count integer
// directly without needing EXTRACT/EPOCH gymnastics.
function daysSinceExpr(x) {
  return x.engine === 'postgres'
    ? `(?::date - MAX(s.sale_date))`
    : `(julianday(?) - julianday(MAX(s.sale_date)))`;
}

async function getAtRiskCustomers(x, anchorDate, companyId) {
  const diff = daysSinceExpr(x);
  return x.all(`
    SELECT
      c.id AS customer_id, c.name, c.phone, c.email,
      MAX(s.sale_date) AS last_purchase_date,
      COUNT(s.id) AS total_orders,
      COALESCE(SUM(s.revenue), 0) AS total_revenue,
      'at_risk' AS segment_name
    FROM customers c
    JOIN sales s ON s.customer_id = c.id
    WHERE c.company_id = ?
    GROUP BY c.id
    HAVING COUNT(s.id) >= 2
      AND ${diff} > 30
      AND ${diff} <= 60
    ORDER BY total_revenue DESC
  `, [companyId, anchorDate, anchorDate]);
}

async function getHighSpendLowFreqCustomers(x, anchorDate, companyId) {
  return x.all(`
    SELECT
      c.id AS customer_id, c.name, c.phone, c.email,
      MAX(s.sale_date) AS last_purchase_date,
      COUNT(s.id) AS total_orders,
      COALESCE(SUM(s.revenue), 0) AS total_revenue,
      COALESCE(SUM(s.revenue), 0) / COUNT(s.id) AS avg_order_value,
      'high_spend_low_freq' AS segment_name
    FROM customers c
    JOIN sales s ON s.customer_id = c.id
    WHERE c.company_id = ?
    GROUP BY c.id
    HAVING COUNT(s.id) < 3 AND COALESCE(SUM(s.revenue), 0) / COUNT(s.id) > (
      SELECT AVG(revenue) FROM sales WHERE company_id = ?
    )
    ORDER BY avg_order_value DESC
  `, [companyId, companyId]);
}

async function getFrequentLowValueCustomers(x, anchorDate, companyId) {
  return x.all(`
    SELECT
      c.id AS customer_id, c.name, c.phone, c.email,
      MAX(s.sale_date) AS last_purchase_date,
      COUNT(s.id) AS total_orders,
      COALESCE(SUM(s.revenue), 0) AS total_revenue,
      COALESCE(SUM(s.revenue), 0) / COUNT(s.id) AS avg_order_value,
      'frequent_low_value' AS segment_name
    FROM customers c
    JOIN sales s ON s.customer_id = c.id
    WHERE c.company_id = ?
    GROUP BY c.id
    HAVING COUNT(s.id) >= 3 AND COALESCE(SUM(s.revenue), 0) / COUNT(s.id) < (
      SELECT AVG(revenue) FROM sales WHERE company_id = ?
    )
    ORDER BY total_orders DESC
  `, [companyId, companyId]);
}

async function getNewCustomers(x, anchorDate, companyId) {
  return x.all(`
    SELECT
      c.id AS customer_id, c.name, c.phone, c.email,
      MIN(s.sale_date) AS first_purchase_date,
      MAX(s.sale_date) AS last_purchase_date,
      COUNT(s.id) AS total_orders,
      COALESCE(SUM(s.revenue), 0) AS total_revenue,
      'new_customers' AS segment_name
    FROM customers c
    JOIN sales s ON s.customer_id = c.id
    WHERE c.company_id = ?
    GROUP BY c.id
    HAVING MIN(s.sale_date) >= ${dateSub(x, 30)}
    ORDER BY first_purchase_date DESC
  `, [companyId, anchorDate]);
}

async function getInactiveCustomers(x, anchorDate, companyId) {
  const diff = daysSinceExpr(x);
  const daysInactiveExpr = x.engine === 'postgres' ? `(?::date - MAX(s.sale_date))` : `CAST(julianday(?) - julianday(MAX(s.sale_date)) AS INTEGER)`;
  return x.all(`
    SELECT
      c.id AS customer_id, c.name, c.phone, c.email,
      MAX(s.sale_date) AS last_purchase_date,
      COUNT(s.id) AS total_orders,
      COALESCE(SUM(s.revenue), 0) AS total_revenue,
      ${daysInactiveExpr} AS days_inactive,
      'inactive' AS segment_name
    FROM customers c
    JOIN sales s ON s.customer_id = c.id
    WHERE c.company_id = ?
    GROUP BY c.id
    HAVING ${diff} > 60
    ORDER BY total_revenue DESC
  `, [anchorDate, companyId, anchorDate]);
}

// ─── Segment Resolver ──────────────────────────────────────────────────────────

const SEGMENT_QUERIES = {
  vip:                getVipCustomers,
  at_risk:            getAtRiskCustomers,
  high_spend_low_freq: getHighSpendLowFreqCustomers,
  frequent_low_value: getFrequentLowValueCustomers,
  new_customers:      getNewCustomers,
  inactive:           getInactiveCustomers,
};

async function getSegmentCustomers(segmentId, companyId) {
  if (!companyId) throw new Error('companyId is required for segment lookups');
  const queryFn = SEGMENT_QUERIES[segmentId];
  if (!queryFn) throw new Error(`Unknown segment: ${segmentId}`);

  return withExecutor(async (x) => {
    const anchorDate = await getAnchorDate(x, companyId);
    return queryFn(x, anchorDate, companyId);
  });
}

async function getAllSegmentSummaries(companyId) {
  if (!companyId) throw new Error('companyId is required for segment summaries');
  return withExecutor(async (x) => {
    const anchorDate = await getAnchorDate(x, companyId);
    const out = [];
    for (const seg of SEGMENTS) {
      try {
        const customers = await SEGMENT_QUERIES[seg.id](x, anchorDate, companyId);
        const totalRevenue = customers.reduce((s, c) => s + (c.total_revenue || 0), 0);
        out.push({
          ...seg,
          customerCount: customers.length,
          totalRevenue: Math.round(totalRevenue),
          avgRevenue: customers.length > 0 ? Math.round(totalRevenue / customers.length) : 0,
        });
      } catch (e) {
        out.push({ ...seg, customerCount: 0, totalRevenue: 0, avgRevenue: 0, error: e.message });
      }
    }
    return out;
  });
}

module.exports = {
  SEGMENTS,
  getSegmentCustomers,
  getAllSegmentSummaries,
};
