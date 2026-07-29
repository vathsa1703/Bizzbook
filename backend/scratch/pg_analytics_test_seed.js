// Throwaway Phase 2 Module 1 verification seed. Inserts known-quantity rows
// into Postgres for company_id=1 / branch_id=11 (matching the real SQLite
// business.db's company 1 / branch 11 — auth + branch-scoping middleware are
// still SQLite-only at this point in the migration, so the JWT's companyId
// and the X-Branch-ID header must resolve against real SQLite rows even
// though the analytics DATA itself is now read from Postgres).
// Safe to delete once Module 1 is reviewed. Run: node backend/scratch/pg_analytics_test_seed.js
require('dotenv').config();
const { getPgPool } = require('../src/config/pgPool');

(async () => {
  const pool = getPgPool();
  try {
    await pool.query('BEGIN');

    await pool.query(`INSERT INTO companies (id, name) OVERRIDING SYSTEM VALUE VALUES (1, 'Test Co') ON CONFLICT (id) DO NOTHING`);
    await pool.query(`INSERT INTO branches (id, company_id, name, is_hq) OVERRIDING SYSTEM VALUE VALUES (11, 1, 'QA_AUDIT_Branch', true) ON CONFLICT (id) DO NOTHING`);
    await pool.query(`INSERT INTO branches (id, company_id, name, is_hq) OVERRIDING SYSTEM VALUE VALUES (12, 1, 'Second Branch', false) ON CONFLICT (id) DO NOTHING`);

    const prodA = await pool.query(`INSERT INTO products (name, category, company_id, cost_price, selling_price) VALUES ('Widget A', 'General', 1, 50, 100) RETURNING id`);
    const prodB = await pool.query(`INSERT INTO products (name, category, company_id, cost_price, selling_price) VALUES ('Widget B', 'General', 1, 30, 80) RETURNING id`);
    const productAId = prodA.rows[0].id;
    const productBId = prodB.rows[0].id;

    const cust = await pool.query(`INSERT INTO customers (name, company_id, total_purchases) VALUES ('Test Customer', 1, 0) RETURNING id`);
    const customerId = cust.rows[0].id;

    const today = new Date().toISOString().slice(0, 10);
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonth = lastMonthDate.toISOString().slice(0, 10);

    // Branch 11 — this month: product A qty 3 rev 300, product B qty 2 rev 160 -> total rev 460, qty 5, 2 txns
    await pool.query(`INSERT INTO sales (company_id, branch_id, product_id, customer_id, quantity, revenue, sale_date) VALUES (1, 11, $1, $2, 3, 300, $3)`, [productAId, customerId, today]);
    await pool.query(`INSERT INTO sales (company_id, branch_id, product_id, customer_id, quantity, revenue, sale_date) VALUES (1, 11, $1, $2, 2, 160, $3)`, [productBId, customerId, today]);
    // Branch 11 — last month: rev 400 (for percent-change check: (460-400)/400*100 = 15.0)
    await pool.query(`INSERT INTO sales (company_id, branch_id, product_id, customer_id, quantity, revenue, sale_date) VALUES (1, 11, $1, $2, 4, 400, $3)`, [productAId, customerId, lastMonth]);

    // Branch 12 — this month: product A qty 10 rev 1000 (must NOT leak into branch-11-scoped results)
    await pool.query(`INSERT INTO sales (company_id, branch_id, product_id, customer_id, quantity, revenue, sale_date) VALUES (1, 12, $1, $2, 10, 1000, $3)`, [productAId, customerId, today]);

    // Inventory: branch 11 product A is low stock (5 <= reorder 10); branch 12 product A also low (2 <= 3) but must not appear when scoped to 11
    await pool.query(`INSERT INTO inventory (company_id, branch_id, product_id, stock_quantity, reorder_level) VALUES (1, 11, $1, 5, 10)`, [productAId]);
    await pool.query(`INSERT INTO inventory (company_id, branch_id, product_id, stock_quantity, reorder_level) VALUES (1, 12, $1, 2, 3)`, [productAId]);
    // Branch 11 product B is well-stocked, should NOT appear in low-stock
    await pool.query(`INSERT INTO inventory (company_id, branch_id, product_id, stock_quantity, reorder_level) VALUES (1, 11, $1, 50, 10)`, [productBId]);

    await pool.query('COMMIT');
    console.log('[seed] Done. productAId=%s productBId=%s customerId=%s', productAId, productBId, customerId);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('[seed] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
