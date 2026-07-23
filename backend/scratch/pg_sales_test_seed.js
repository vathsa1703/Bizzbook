// Throwaway Phase 2 Module 2 (sales.js) verification seed. Extends the Module 1
// seed data (company 1 / branch 11 / Widget A+B / customer 1) with GST config
// and two customers (same-state and different-state) so a real POST /api/sales
// can be hand-verified for CGST/SGST vs IGST branching.
// Safe to delete once Module 2 is reviewed. Run: node backend/scratch/pg_sales_test_seed.js
require('dotenv').config();
const { getPgPool } = require('../src/config/pgPool');

(async () => {
  const pool = getPgPool();
  try {
    await pool.query('BEGIN');

    // Company 1: GST-registered, Karnataka (29), exclusive pricing
    await pool.query(`UPDATE companies SET gstin = '29ABCDE1234F1Z5' WHERE id = 1`);
    const existingGst = await pool.query(`SELECT id FROM company_gst_settings WHERE company_id = 1`);
    if (existingGst.rows.length === 0) {
      await pool.query(`INSERT INTO company_gst_settings (company_id, state_code, is_gst_registered, inclusive_pricing) VALUES (1, '29', true, false)`);
    } else {
      await pool.query(`UPDATE company_gst_settings SET state_code = '29', is_gst_registered = true, inclusive_pricing = false WHERE company_id = 1`);
    }

    // Widget A (product id 1 from Module 1 seed): custom GST 18%, valid HSN
    await pool.query(`UPDATE products SET use_custom_gst = true, gst_rate = 18, cess_rate = 0, hsn_code = '1234', uqc = 'NOS' WHERE id = 1 AND company_id = 1`);

    // Bump branch-11 stock for Widget A so there's comfortable room for a new sale
    await pool.query(`UPDATE inventory SET stock_quantity = 100 WHERE product_id = 1 AND branch_id = 11`);

    // Same-state customer (Karnataka, 29) -> expect CGST+SGST split
    const intrastate = await pool.query(`
      INSERT INTO customers (name, company_id, state_code, gstin) VALUES ('Intrastate Customer', 1, '29', NULL)
      RETURNING id
    `);
    // Different-state customer (Maharashtra, 27) -> expect IGST
    const interstate = await pool.query(`
      INSERT INTO customers (name, company_id, state_code, gstin) VALUES ('Interstate Customer', 1, '27', NULL)
      RETURNING id
    `);

    await pool.query('COMMIT');
    console.log('[seed] Done. intrastateCustomerId=%s interstateCustomerId=%s', intrastate.rows[0].id, interstate.rows[0].id);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('[seed] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
