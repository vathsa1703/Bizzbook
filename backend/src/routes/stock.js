const express = require('express');
const { withTransaction } = require('../config/pgDb');

const router = express.Router();

// POST bulk stock (purchases) addition
router.post('/bulk', async (req, res, next) => {
  try {
    const { items, date, supplier_name, invoice_number } = req.body;
    const companyId = req.user.companyId;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'Missing items' });
    }

    const addedItems = await withTransaction(async (tx) => {
      const results = [];

      for (const item of items) {
        let productId = item.product_id;

        if (!productId) {
          const groupRes = await tx.getOne("SELECT id FROM product_groups WHERE name = 'Uncategorized'");
          const groupId = groupRes ? groupRes.id : 1;

          const newProd = await tx.getOne(`
            INSERT INTO products (name, category, cost_price, selling_price, reorder_level, hsn_code, gst_rate, group_id, company_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `, [item.product_name || 'Unknown Product', 'Uncategorized', item.price || 0, (item.price || 0) * 1.2, 5, '0000', 0, groupId, companyId]);

          productId = newProd.id;

          await tx.query('INSERT INTO inventory (product_id, stock_quantity, company_id) VALUES (?, ?, ?)', [productId, 0, companyId]);
        }

        await tx.query('UPDATE inventory SET stock_quantity = stock_quantity + ? WHERE product_id = ? AND company_id = ?', [item.quantity, productId, companyId]);

        results.push({ product_id: productId, quantity: item.quantity, price: item.price });
      }

      return results;
    });

    res.status(201).json({ success: true, message: 'Stock updated', items: addedItems });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
