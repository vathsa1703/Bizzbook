const { getDb } = require('./src/config/db');

async function test() {
  console.log('Initializing DB (which should apply schema.sql)...');
  const db = getDb();
  
  try {
    // Create test custom segment
    const segRes = db.prepare("INSERT INTO custom_segments (company_id, name, logic_type) VALUES (1, 'Test Seg', 'OR')").run();
    console.log('Created segment:', segRes.lastInsertRowid);
    
    // Create coupon
    const couponRes = db.prepare("INSERT INTO coupons (company_id, code, discount_type, discount_value) VALUES (1, 'TEST100', 'flat', 100)").run();
    console.log('Created coupon:', couponRes.lastInsertRowid);

    // Check wallets
    const walletRes = db.prepare("INSERT INTO customer_wallets (company_id, customer_id, balance_type, balance) VALUES (1, 1, 'reward_points', 50)").run();
    console.log('Created wallet:', walletRes.lastInsertRowid);
    
    console.log('Checking edge weight for coupon redemption...');
    const edgeRes = db.prepare("INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight) VALUES (1, 'customer', 1, 'redeemed_coupon', 'coupon', 1, 100)").run();
    console.log('Created edge with weight:', edgeRes.lastInsertRowid);

    console.log('Phase 1 schema applied successfully!');
  } catch(e) {
    console.error('Error during test:', e);
  }
}

test().catch(console.error);
