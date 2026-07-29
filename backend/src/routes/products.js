const express = require('express');
const { getDb } = require('../config/db');
const { HSN_REGEX } = require('../services/gstEngine');
const { dbGet, dbAll, engine } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

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
router.get('/', async (req, res, next) => {
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

    const products = await dbAll(scoped.sql, scoped.params);
    res.json(products);
  } catch (err) {
    next(err);
  }
});

// GET single product — scoped to company
router.get('/:id', async (req, res, next) => {
  try {
    const product = await dbGet(`
      SELECT p.*, i.stock_quantity, i.reorder_level, i.last_restocked, s.name as supplier_name, pg.name as group_name
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN product_groups pg ON p.group_id = pg.id
      WHERE p.id = ? AND p.company_id = ?
    `, [req.params.id, req.user.companyId]);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// POST create product + inventory — stamped with company_id
router.post('/', async (req, res, next) => {
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

    // group_id validation moved ahead of the transaction (pure read, no side
    // effects yet) so a 400 here doesn't need to unwind a withTransaction
    // callback on the Postgres path.
    let syncedCategory = 'Uncategorized';
    let finalGroupId = null;
    if (group_id) {
      const group = await dbGet('SELECT name FROM product_groups WHERE id = ?', [group_id]);
      if (!group) {
        return res.status(400).json({ error: 'Invalid group_id' });
      }
      syncedCategory = group.name;
      finalGroupId = group_id;
    }

    const insertParams = [
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
    const invStock = Number(stock_quantity) || 0;
    const invReorder = reorder_level !== '' && reorder_level !== null && reorder_level !== undefined ? Number(reorder_level) : 10;
    const invRestocked = new Date().toISOString().split('T')[0];

    let productId;

    if (engine() === 'postgres') {
      productId = await withTransaction(async (tx) => {
        const productRow = await tx.getOne(`
          INSERT INTO products (name, category, group_id, cost_price, selling_price, supplier_id, hsn_code, use_custom_gst, gst_rate, cess_rate, uqc, company_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `, insertParams);
        const txProductId = productRow.id;

        await tx.query(`
          INSERT INTO inventory (product_id, stock_quantity, reorder_level, last_restocked, company_id)
          VALUES (?, ?, ?, ?, ?)
        `, [txProductId, invStock, invReorder, invRestocked, companyId]);

        return txProductId;
      });
    } else {
      const db = getDb();
      try {
        db.exec('BEGIN TRANSACTION');

        const productRes = db.prepare(`
          INSERT INTO products (name, category, group_id, cost_price, selling_price, supplier_id, hsn_code, use_custom_gst, gst_rate, cess_rate, uqc, company_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(...insertParams);

        productId = productRes.lastInsertRowid;

        db.prepare(`
          INSERT INTO inventory (product_id, stock_quantity, reorder_level, last_restocked, company_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(productId, invStock, invReorder, invRestocked, companyId);

        db.exec('COMMIT');
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw err;
      } finally {
        db.close();
      }
    }

    res.status(201).json({ id: productId, name, category: syncedCategory, cost_price, selling_price, supplier_id, hsn_code, gst_rate, cess_rate, uqc });
  } catch (err) {
    next(err);
  }
});

// PUT update product + inventory — scoped to company
router.put('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { name, group_id, category, cost_price, selling_price, supplier_id, hsn_code, use_custom_gst, gst_rate, cess_rate, uqc, stock_quantity, reorder_level } = req.body;
    const productId = req.params.id;

    const existing = await dbGet('SELECT * FROM products WHERE id = ? AND company_id = ?', [productId, companyId]);
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

    // Same reasoning as POST: group_id validation moved ahead of the transaction.
    if (group_id !== undefined) {
      if (group_id) {
        const group = await dbGet('SELECT name FROM product_groups WHERE id = ?', [group_id]);
        if (!group) {
          return res.status(400).json({ error: 'Invalid group_id' });
        }
        syncedCategory = group.name;
        finalGroupId = group_id;
      } else {
        syncedCategory = 'Uncategorized';
        finalGroupId = null;
      }
    }

    const updateParams = [
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

    const touchesInventory = stock_quantity !== undefined || reorder_level !== undefined;

    if (engine() === 'postgres') {
      await withTransaction(async (tx) => {
        await tx.query(`
          UPDATE products
           SET name = ?, category = ?, group_id = ?, cost_price = ?, selling_price = ?,
               supplier_id = ?, hsn_code = ?, use_custom_gst = ?, gst_rate = ?, cess_rate = ?, uqc = ?
           WHERE id = ? AND company_id = ?
        `, updateParams);

        if (touchesInventory) {
          const inv = await tx.getOne('SELECT id, stock_quantity FROM inventory WHERE product_id = ? AND company_id = ?', [productId, companyId]);
          if (inv) {
            let lastRestocked = null;
            if (Number(stock_quantity) > inv.stock_quantity) {
              lastRestocked = new Date().toISOString().split('T')[0];
            }
            await tx.query(`
              UPDATE inventory
              SET stock_quantity = COALESCE(?, stock_quantity),
                  reorder_level = COALESCE(?, reorder_level),
                  last_restocked = COALESCE(?, last_restocked)
              WHERE product_id = ? AND company_id = ?
            `, [
              stock_quantity !== undefined && stock_quantity !== '' ? Number(stock_quantity) : inv.stock_quantity,
              reorder_level !== undefined && reorder_level !== '' ? Number(reorder_level) : null,
              lastRestocked,
              productId,
              companyId,
            ]);
          } else {
            await tx.query(`
              INSERT INTO inventory (product_id, stock_quantity, reorder_level, last_restocked, company_id)
              VALUES (?, ?, ?, ?, ?)
            `, [
              productId,
              Number(stock_quantity) || 0,
              reorder_level !== undefined && reorder_level !== '' ? Number(reorder_level) : 10,
              new Date().toISOString().split('T')[0],
              companyId,
            ]);
          }
        }
      });
    } else {
      const db = getDb();
      try {
        db.exec('BEGIN TRANSACTION');

        db.prepare(`
          UPDATE products
           SET name = ?, category = ?, group_id = ?, cost_price = ?, selling_price = ?,
               supplier_id = ?, hsn_code = ?, use_custom_gst = ?, gst_rate = ?, cess_rate = ?, uqc = ?
           WHERE id = ? AND company_id = ?
        `).run(...updateParams);

        if (touchesInventory) {
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
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw err;
      } finally {
        db.close();
      }
    }

    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    next(err);
  }
});

// DELETE product — scoped to company
router.delete('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const productId = req.params.id;

    const product = await dbGet('SELECT id FROM products WHERE id = ? AND company_id = ?', [productId, companyId]);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const salesExist = await dbGet('SELECT id FROM sales WHERE product_id = ? AND company_id = ? LIMIT 1', [productId, companyId]);
    if (salesExist) {
      return res.status(400).json({ error: 'Cannot delete product with sales transactions.' });
    }

    if (engine() === 'postgres') {
      await withTransaction(async (tx) => {
        await tx.query('DELETE FROM inventory WHERE product_id = ? AND company_id = ?', [productId, companyId]);
        await tx.query('DELETE FROM products WHERE id = ? AND company_id = ?', [productId, companyId]);
      });
    } else {
      const db = getDb();
      try {
        db.exec('BEGIN TRANSACTION');
        db.prepare('DELETE FROM inventory WHERE product_id = ? AND company_id = ?').run(productId, companyId);
        db.prepare('DELETE FROM products WHERE id = ? AND company_id = ?').run(productId, companyId);
        db.exec('COMMIT');
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw err;
      } finally {
        db.close();
      }
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
