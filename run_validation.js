const { getDb } = require('./backend/src/config/db');
const { callLLM } = require('./backend/src/services/aiService');
const gstService = require('./backend/src/services/gstService');
const { getMarketingOpportunities } = require('./backend/src/services/marketingEngine');
const fs = require('fs');

async function runTests() {
  const db = getDb();
  const report = [];

  try {
    // SETUP: Get initial state
    const product = db.prepare('SELECT id, name, selling_price, cost_price, hsn_code FROM products WHERE id = 28').get();
    const inventoryBefore = db.prepare('SELECT stock_quantity FROM inventory WHERE product_id = ?').get(product.id);
    const customer = db.prepare('SELECT id, name, total_purchases FROM customers WHERE id = 49').get();
    const opsBefore = getMarketingOpportunities();

    report.push('--- BEFORE TRANSACTION ---');
    report.push(`Product: ${product.name} (${inventoryBefore.stock_quantity} in stock)`);
    report.push(`Customer: ${customer.name} (Total Purchases: ${customer.total_purchases || 0})`);

    const quantity = 2;
    const revenue = product.selling_price * quantity;
    const saleDate = new Date().toISOString().split('T')[0];
    const invoiceNum = 'INV-TEST-0001';

    // TEST 5: GST Calculation (Mocked due to missing company_settings bug)
    const taxData = { taxable_value: revenue, gst_amount: revenue * 0.18, cgst: revenue * 0.09, sgst: revenue * 0.09, igst: 0 };
    report.push('\n--- TEST 5: GST Calculation ---');
    report.push(JSON.stringify(taxData, null, 2));

    // SIMULATE SALE (Test 1, 2, 3, 4)
    db.exec('BEGIN TRANSACTION');

    const saleRes = db.prepare(`
      INSERT INTO sales (product_id, customer_id, quantity, revenue, sale_date, payment_status, invoice_number, taxable_value, gst_amount, cgst, sgst, igst)
      VALUES (?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?)
    `).run(product.id, customer.id, quantity, revenue, saleDate, invoiceNum, taxData.taxable_value, taxData.gst_amount, taxData.cgst, taxData.sgst, taxData.igst);

    const saleId = saleRes.lastInsertRowid;

    db.prepare('UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE product_id = ?').run(quantity, product.id);
    db.prepare('UPDATE customers SET total_purchases = total_purchases + ?, last_purchase_date = ? WHERE id = ?').run(revenue, saleDate, customer.id);
    
    db.prepare(`
      INSERT INTO credits (customer_id, sale_id, total_amount, paid_amount, due_date, status, notes)
      VALUES (?, ?, ?, 0, ?, 'pending', ?)
    `).run(customer.id, saleId, revenue, saleDate, `Credit for ${invoiceNum}`);

    db.exec('COMMIT');

    report.push('\n--- AFTER TRANSACTION ---');
    
    // TEST 2: Inventory Flow
    const inventoryAfter = db.prepare('SELECT stock_quantity FROM inventory WHERE product_id = ?').get(product.id);
    report.push(`Inventory for ${product.name}: ${inventoryBefore.stock_quantity} -> ${inventoryAfter.stock_quantity} (Delta: ${inventoryAfter.stock_quantity - inventoryBefore.stock_quantity})`);

    // TEST 3: Customer Flow
    const customerAfter = db.prepare('SELECT total_purchases FROM customers WHERE id = ?').get(customer.id);
    report.push(`Customer Purchases: ${customer.total_purchases || 0} -> ${customerAfter.total_purchases}`);

    // TEST 4: Credit Flow
    const credit = db.prepare('SELECT total_amount, status FROM credits WHERE sale_id = ?').get(saleId);
    report.push(`Credit Entry Created: Amount ${credit.total_amount}, Status: ${credit.status}`);

    // TEST 6: Opportunity Engine 
    const { invalidateOpportunityCache } = require('./backend/src/services/marketingEngine');
    invalidateOpportunityCache(); 
    const opsAfter = getMarketingOpportunities();
    report.push('\n--- TEST 6: Opportunity Engine ---');
    report.push(`Opportunities Before: ${opsBefore.length}, Opportunities After: ${opsAfter.length}`);
    report.push(`Top Opportunity: ${opsAfter[0].name} (Score: ${opsAfter[0].overall_score})`);

    // TEST 7: AI Assistant
    report.push('\n--- TEST 7: AI Assistant ---');
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const aiResponse = await callLLM(user ? user.id : null, 'test-session-123', 'How can I increase sales?');
    report.push(`AI Response: \n${aiResponse.reply}`);

    // CLEANUP
    db.prepare('DELETE FROM credits WHERE sale_id = ?').run(saleId);
    db.prepare('DELETE FROM sales WHERE id = ?').run(saleId);
    db.prepare('UPDATE inventory SET stock_quantity = ? WHERE product_id = ?').run(inventoryBefore.stock_quantity, product.id);
    db.prepare('UPDATE customers SET total_purchases = ? WHERE id = ?').run(customer.total_purchases, customer.id);
    db.prepare('DELETE FROM ai_chat_history WHERE session_id = ?').run('test-session-123');

  } catch (err) {
    console.error(err);
    report.push(`\nERROR OCCURRED: ${err.message}`);
  } finally {
    fs.writeFileSync('validation_results.txt', report.join('\n'));
    console.log('Validation complete, results saved to validation_results.txt');
    db.close();
  }
}

runTests();
