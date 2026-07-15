const express = require('express');
const { getDb } = require('../config/db');

const router = express.Router();

// POST bulk stock (purchases) addition
router.post('/bulk', (req, res, next) => {
  const db = getDb();
  try {
    const { items, date, supplier_name, invoice_number } = req.body;
    const companyId = req.user.companyId;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'Missing items' });
    }

    db.exec('BEGIN TRANSACTION');

    const addedItems = [];

    for (const item of items) {
      // If product_id is provided, use it. Otherwise, create a new product.
      let productId = item.product_id;

      if (!productId) {
        // Unknown product, create it on the fly in the Uncategorized group or group_id 1
        const groupRes = db.prepare("SELECT id FROM product_groups WHERE name = 'Uncategorized'").get();
        const groupId = groupRes ? groupRes.id : 1;

        const newProd = db.prepare(`
          INSERT INTO products (name, category, cost_price, selling_price, reorder_level, hsn_code, gst_rate, group_id, company_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(item.product_name || 'Unknown Product', 'Uncategorized', item.price || 0, (item.price || 0) * 1.2, 5, '0000', 0, groupId, companyId);
        
        productId = newProd.lastInsertRowid;
        
        // Add to inventory
        db.prepare('INSERT INTO inventory (product_id, stock_quantity, company_id) VALUES (?, ?, ?)').run(productId, 0, companyId);
      }

      // Update inventory
      db.prepare('UPDATE inventory SET stock_quantity = stock_quantity + ? WHERE product_id = ? AND company_id = ?').run(item.quantity, productId, companyId);

      // Record the purchase if suppliers/purchases tracking exists (Optional, let's keep it simple or log to purchases if needed)
      // Since there's no purchases table in standard Bizzbook MVP yet, we just update inventory.
      // Actually Bizzbook might have purchases table? The app uses `/api/purchases` maybe.
      
      addedItems.push({ product_id: productId, quantity: item.quantity, price: item.price });
    }

    db.exec('COMMIT');

    res.status(201).json({ success: true, message: 'Stock updated', items: addedItems });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
