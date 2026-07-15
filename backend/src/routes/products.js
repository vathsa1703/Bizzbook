const express = require('express');
const { getDb } = require('../config/db');
const { HSN_REGEX } = require('../services/gstEngine');

const router = express.Router();

const VALID_GST_RATES = new Set([0, 5, 12, 18, 28]);
const VALID_UQC = new Set([
  'BAG','BAL','BDL','BKL','BOU','BOX','BTL','BUN','CAN','CBM','CCM','CMS',
  'CTN','DOZ','DRM','GGK','GMS','GRS','GYD','KGS','KLR','KME','MLT','MTR',
  'MTS','NOS','OTH','PAC','PCS','PRS','QTL','ROL','SET','SQF','SQM','SQY',
  'TBS','TGM','THD','TON','TUB','UGS','UNT','YDS'
]);
const { withBranchScope } = require('../utils/BranchScopedQuery');

// GET all products with inventory data — scoped to company
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    if (!req.user.companyId) {
      return res.status(400).json({ error: 'companyId missing from token' });
    }

    const companyId = req.user.companyId;
    const search = req.query.search || '';
    const category = req.query.category || '';

    let query = `
      SELECT p.*, i.stock_quantity, i.reorder_level, i.last_restocked, s.name as supplier_name, pg.name as group_name
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN product_groups pg ON p.group_id = pg.id
      WHERE p.company_id = ?
    `;
    const params = [companyId];

    if (search) {
      query += ` AND p.name LIKE ?`;
      params.push(`%${search}%`);
    }
    if (category && category !== 'All') {
      query += ` AND (p.category = ? OR p.group_id = ?)`;
      params.push(category, category);
    }

    const scoped = withBranchScope(query, params, req.scopeContext, 'i.branch_id');
    scoped.sql += ` ORDER BY p.id DESC`;

    const products = db.prepare(scoped.sql).all(...scoped.params);
    res.json(products);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET single product — scoped to company
router.get('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const product = db.prepare(`
      SELECT p.*, i.stock_quantity, i.reorder_level, i.last_restocked, s.name as supplier_name, pg.name as group_name
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN product_groups pg ON p.group_id = pg.id
      WHERE p.id = ? AND p.company_id = ?
    `).get(req.params.id, req.user.companyId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// POST create product + inventory — stamped with company_id
router.post('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { name, group_id, category, cost_price, selling_price, supplier_id, hsn_code = null, use_custom_gst = false, gst_rate = null, cess_rate = 0, uqc = 'NOS', stock_quantity = 0, reorder_level = 10 } = req.body;

    if (!name || cost_price === undefined || selling_price === undefined) {
      return res.status(400).json({ error: 'Missing required fields: name, cost_price, selling_price.' });
    }

    if (hsn_code && !HSN_REGEX.test(String(hsn_code).trim())) {
      return res.status(400).json({ error: 'Invalid HSN format. Must be 4, 6, or 8 digits.' });
    }
    if (gst_rate !== null && gst_rate !== '' && !VALID_GST_RATES.has(Number(gst_rate))) {
      return res.status(400).json({ error: `Invalid GST rate. Allowed slabs: 0, 5, 12, 18, 28.` });
    }
    if (uqc && !VALID_UQC.has(String(uqc).trim().toUpperCase())) {
      return res.status(400).json({ error: `Invalid UQC. Must be a valid GSTIN UQC.` });
    }
    if (cess_rate !== undefined && cess_rate !== null && isNaN(Number(cess_rate))) {
      return res.status(400).json({ error: `CESS Rate must be a number.` });
    }

    db.exec('BEGIN TRANSACTION');

    let syncedCategory = 'Uncategorized';
    let finalGroupId = null;

    if (group_id) {
      const group = db.prepare('SELECT name FROM product_groups WHERE id = ?').get(group_id);
      if (!group) {
        db.exec('ROLLBACK');
        return res.status(400).json({ error: 'Invalid group_id' });
      }
      syncedCategory = group.name;
      finalGroupId = group_id;
    }

    const params = [
      name,
      syncedCategory,
      finalGroupId,
      Number(cost_price),
      Number(selling_price),
      supplier_id ? Number(supplier_id) : null,
      hsn_code || null,
      use_custom_gst ? 1 : 0,
      gst_rate !== '' && gst_rate !== null ? Number(gst_rate) : null,
      cess_rate !== '' && cess_rate !== null ? Number(cess_rate) : 0,
      uqc || 'NOS',
      companyId,
    ];

    const productRes = db.prepare(`
      INSERT INTO products (name, category, group_id, cost_price, selling_price, supplier_id, hsn_code, use_custom_gst, gst_rate, cess_rate, uqc, company_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...params);

    const productId = productRes.lastInsertRowid;

    db.prepare(`
      INSERT INTO inventory (product_id, stock_quantity, reorder_level, last_restocked, company_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      productId,
      Number(stock_quantity) || 0,
      reorder_level !== '' && reorder_level !== null && reorder_level !== undefined ? Number(reorder_level) : 10,
      new Date().toISOString().split('T')[0],
      companyId,
    );

    db.exec('COMMIT');

    res.status(201).json({ id: productId, name, category: syncedCategory, cost_price, selling_price, supplier_id, hsn_code, gst_rate, cess_rate, uqc });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally {
    db.close();
  }
});

// PUT update product + inventory — scoped to company
router.put('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { name, group_id, category, cost_price, selling_price, supplier_id, hsn_code, use_custom_gst, gst_rate, cess_rate, uqc, stock_quantity, reorder_level } = req.body;
    const productId = req.params.id;

    const existing = db.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(productId, companyId);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let syncedCategory = existing.category;
    let finalGroupId = existing.group_id;

    if (hsn_code && !HSN_REGEX.test(String(hsn_code).trim())) {
      return res.status(400).json({ error: 'Invalid HSN format. Must be 4, 6, or 8 digits.' });
    }
    if (gst_rate !== undefined && gst_rate !== null && gst_rate !== '' && !VALID_GST_RATES.has(Number(gst_rate))) {
      return res.status(400).json({ error: `Invalid GST rate. Allowed slabs: 0, 5, 12, 18, 28.` });
    }
    if (uqc && !VALID_UQC.has(String(uqc).trim().toUpperCase())) {
      return res.status(400).json({ error: `Invalid UQC. Must be a valid GSTIN UQC.` });
    }
    if (cess_rate !== undefined && cess_rate !== null && cess_rate !== '' && isNaN(Number(cess_rate))) {
      return res.status(400).json({ error: `CESS Rate must be a number.` });
    }

    db.exec('BEGIN TRANSACTION');

    if (group_id !== undefined) {
      if (group_id) {
        const group = db.prepare('SELECT name FROM product_groups WHERE id = ?').get(group_id);
        if (!group) {
          db.exec('ROLLBACK');
          return res.status(400).json({ error: 'Invalid group_id' });
        }
        syncedCategory = group.name;
        finalGroupId = group_id;
      } else {
        syncedCategory = 'Uncategorized';
        finalGroupId = null;
      }
    }

    const params = [
      name !== undefined ? name : existing.name,
      syncedCategory,
      finalGroupId,
      cost_price !== undefined ? Number(cost_price) : existing.cost_price,
      selling_price !== undefined ? Number(selling_price) : existing.selling_price,
      supplier_id !== undefined ? (supplier_id ? Number(supplier_id) : null) : existing.supplier_id,
      hsn_code !== undefined ? (hsn_code || null) : existing.hsn_code,
      use_custom_gst !== undefined ? (use_custom_gst ? 1 : 0) : existing.use_custom_gst,
      gst_rate !== undefined ? (gst_rate !== '' && gst_rate !== null ? Number(gst_rate) : null) : existing.gst_rate,
      cess_rate !== undefined ? (cess_rate !== '' && cess_rate !== null ? Number(cess_rate) : 0) : existing.cess_rate,
      uqc !== undefined ? (uqc || 'NOS') : existing.uqc,
      productId,
      companyId,
    ];

    db.prepare(`
      UPDATE products
       SET name = ?, category = ?, group_id = ?, cost_price = ?, selling_price = ?,
           supplier_id = ?, hsn_code = ?, use_custom_gst = ?, gst_rate = ?, cess_rate = ?, uqc = ?
       WHERE id = ? AND company_id = ?
    `).run(...params);

    if (stock_quantity !== undefined || reorder_level !== undefined) {
      const inv = db.prepare('SELECT id, stock_quantity FROM inventory WHERE product_id = ? AND company_id = ?').get(productId, companyId);
      if (inv) {
        let lastRestocked = null;
        if (Number(stock_quantity) > inv.stock_quantity) {
          lastRestocked = new Date().toISOString().split('T')[0];
        }
        db.prepare(`
          UPDATE inventory
          SET stock_quantity = COALESCE(?, stock_quantity),
              reorder_level = COALESCE(?, reorder_level),
              last_restocked = COALESCE(?, last_restocked)
          WHERE product_id = ? AND company_id = ?
        `).run(
          stock_quantity !== undefined && stock_quantity !== '' ? Number(stock_quantity) : inv.stock_quantity,
          reorder_level !== undefined && reorder_level !== '' ? Number(reorder_level) : null,
          lastRestocked,
          productId,
          companyId,
        );
      } else {
        db.prepare(`
          INSERT INTO inventory (product_id, stock_quantity, reorder_level, last_restocked, company_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          productId,
          Number(stock_quantity) || 0,
          reorder_level !== undefined && reorder_level !== '' ? Number(reorder_level) : 10,
          new Date().toISOString().split('T')[0],
          companyId,
        );
      }
    }

    db.exec('COMMIT');
    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally {
    db.close();
  }
});

// DELETE product — scoped to company
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const productId = req.params.id;

    const product = db.prepare('SELECT id FROM products WHERE id = ? AND company_id = ?').get(productId, companyId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const salesExist = db.prepare('SELECT id FROM sales WHERE product_id = ? AND company_id = ? LIMIT 1').get(productId, companyId);
    if (salesExist) {
      return res.status(400).json({ error: 'Cannot delete product with sales transactions.' });
    }

    db.exec('BEGIN TRANSACTION');
    db.prepare('DELETE FROM inventory WHERE product_id = ? AND company_id = ?').run(productId, companyId);
    db.prepare('DELETE FROM products WHERE id = ? AND company_id = ?').run(productId, companyId);
    db.exec('COMMIT');

    res.status(204).end();
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
