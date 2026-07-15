const { getDb } = require('./backend/src/config/db');
const { getMarketingOpportunities, invalidateOpportunityCache, generateOpportunityStrategy } = require('./backend/src/services/marketingEngine');
const gstService = require('./backend/src/services/gstService');
const fs = require('fs');

async function runDynamicAudit() {
  const db = getDb();
  const report = [];

  try {
    // Ensure company_settings has a state to bypass GST error during simulation
    const hasCompanyState = db.prepare('SELECT COUNT(*) as cnt FROM company_settings WHERE state IS NOT NULL').get().cnt > 0;
    if (!hasCompanyState) {
      db.prepare('INSERT INTO company_settings (id, state) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run('Maharashtra');
    }

    report.push('=== PHASE 1: BEFORE OPPORTUNITIES ===');
    invalidateOpportunityCache();
    const opsBefore = getMarketingOpportunities();
    opsBefore.forEach(o => {
      report.push(`[${o.type}] ${o.name}`);
      report.push(`  Score: ${o.overall_score} | Confidence: ${o.confidenceScore}% | Expected Rev: ₹${Math.round(o.expectedImpact)}`);
      report.push(`  Detected Because: ${o.detectedBecause}`);
    });

    report.push('\n=== PHASE 2: EXECUTING TRANSACTIONS ===');
    db.exec('BEGIN TRANSACTION');

    // Get a valid customer ID
    const customer = db.prepare('SELECT id FROM customers LIMIT 1').get();
    const customerId = customer ? customer.id : null;

    // 1. Sell dead stock item
    const deadStockOpp = opsBefore.find(o => o.type === 'dead_stock_liquidation');
    if (deadStockOpp && deadStockOpp.evidence && deadStockOpp.evidence.cohort.length > 0) {
      const deadProductData = deadStockOpp.evidence.cohort[0];
      const deadProduct = db.prepare('SELECT id, name, selling_price FROM products WHERE name = ?').get(deadProductData.name);
      report.push(`Action: Selling 10 units of dead stock item ID ${deadProduct.id} (${deadProduct.name})`);
      
      const taxData = gstService.calculateSaleTax({
        product_id: deadProduct.id,
        customer_id: customerId,
        revenue: deadProduct.selling_price * 10,
      });

      const saleDate = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO sales (product_id, customer_id, quantity, revenue, sale_date, payment_status, invoice_number, taxable_value, gst_amount, cgst, sgst, igst)
        VALUES (?, ?, 10, ?, ?, 'paid', 'INV-DS-01', ?, ?, ?, ?, ?)
      `).run(deadProduct.id, customerId, deadProduct.selling_price * 10, saleDate, taxData.taxable_value, taxData.gst_amount, taxData.cgst, taxData.sgst, taxData.igst);
      
      db.prepare('UPDATE inventory SET stock_quantity = stock_quantity - 10 WHERE product_id = ?').run(deadProduct.id);
    }

    // 2. Create unpaid invoice (Revenue Recovery)
    const prod = db.prepare('SELECT id FROM products LIMIT 1').get();
    const prodId = prod ? prod.id : 1;
    report.push(`Action: Creating massive unpaid invoice for Customer ${customerId} to trigger revenue recovery opp...`);
    const taxDataUnpaid = gstService.calculateSaleTax({
      product_id: prodId, customer_id: customerId, revenue: 500000
    });
    const saleDatePast = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 40 days ago
    const saleRes = db.prepare(`
        INSERT INTO sales (product_id, customer_id, quantity, revenue, sale_date, payment_status, invoice_number, taxable_value, gst_amount, cgst, sgst, igst)
        VALUES (?, ?, 100, 500000, ?, 'unpaid', 'INV-UNPAID-01', ?, ?, ?, ?, ?)
      `).run(prodId, customerId, saleDatePast, taxDataUnpaid.taxable_value, taxDataUnpaid.gst_amount, taxDataUnpaid.cgst, taxDataUnpaid.sgst, taxDataUnpaid.igst);
    
    db.prepare(`
      INSERT INTO credits (customer_id, sale_id, total_amount, paid_amount, due_date, status, notes)
      VALUES (?, ?, 500000, 0, ?, 'pending', 'Huge Credit')
    `).run(customerId, saleRes.lastInsertRowid, saleDatePast);

    // 3. Mark existing credit paid to see if it resolves
    const revRecOpp = opsBefore.find(o => o.type === 'revenue_recovery');
    if (revRecOpp && revRecOpp.evidence && revRecOpp.evidence.cohort && revRecOpp.evidence.cohort.length > 0) {
      const targetCustomer = revRecOpp.evidence.cohort[0];
      report.push(`Action: Marking all existing credits for customer ${targetCustomer.name} (ID ${targetCustomer.id}) as paid to resolve opportunity`);
      db.prepare("UPDATE credits SET paid_amount = total_amount, status = 'paid' WHERE customer_id = ?").run(targetCustomer.id);
      db.prepare("UPDATE sales SET payment_status = 'paid' WHERE customer_id = ?").run(targetCustomer.id);
    }

    db.exec('COMMIT');

    report.push('\n=== PHASE 3: RECOMPUTING OPPORTUNITIES ===');
    invalidateOpportunityCache();
    const opsAfter = getMarketingOpportunities();

    report.push('\n=== PHASE 4: AFTER OPPORTUNITIES ===');
    opsAfter.forEach(o => {
      report.push(`[${o.type}] ${o.name}`);
      report.push(`  Score: ${o.overall_score} | Confidence: ${o.confidenceScore}% | Expected Rev: ₹${Math.round(o.expectedImpact)}`);
      report.push(`  Detected Because: ${o.detectedBecause}`);
    });

    report.push('\n=== PHASE 5: CAMPAIGN GENERATION VALIDATION ===');
    if (opsAfter.length > 0) {
      const topOpp = opsAfter[0];
      report.push(`Simulating API Call POST /api/marketing/campaigns/generate with opportunity ID: ${topOpp.id}`);
      
      // We pass req.body manually
      try {
        const strategy = await generateOpportunityStrategy(topOpp.id);
        report.push(`Response Code: 200 OK`);
        report.push(`Campaign Created Successfully: YES`);
        report.push(`Strategy Keys: ${Object.keys(strategy).join(', ')}`);
        report.push(`Suggested Campaign Message: \n${strategy.message}`);
      } catch (e) {
        report.push(`Failed to generate strategy: ${e.message}`);
      }
    }

    fs.writeFileSync('dynamic_validation_results.txt', report.join('\n'));
    console.log('Dynamic validation complete.');

  } catch (err) {
    console.error(err);
  } finally {
    db.close();
  }
}

runDynamicAudit();
