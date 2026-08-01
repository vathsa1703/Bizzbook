const express = require('express');
const router = express.Router();
const { dbGet, dbAll } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

// True for a duplicate-primary-key/unique-constraint violation.
function isDuplicateKeyError(e) {
  return e.code === '23505';
}

// GET all product groups
router.get('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;

    const previewExpr = `json_agg(json_build_object('name', p_prev.name, 'stock', COALESCE(i_prev.stock_quantity, 0)))`;

    const query = `
      SELECT pg.*,
             COUNT(DISTINCT p.id) as products_count,
             COALESCE(SUM(i.stock_quantity), 0) as total_stock,
             COALESCE(SUM(s.revenue), 0) as total_revenue,
             COALESCE(AVG(p.selling_price), 0) as average_selling_price,
             COALESCE(SUM(i.stock_quantity * p.cost_price), 0) as inventory_value,
             (
                SELECT p_top.name
                FROM products p_top
                LEFT JOIN sales s_top ON p_top.id = s_top.product_id
                WHERE p_top.group_id = pg.id
                GROUP BY p_top.id
                ORDER BY SUM(s_top.revenue) DESC NULLS LAST
                LIMIT 1
             ) as top_selling_product,
             (
                SELECT ${previewExpr}
                FROM products p_prev
                LEFT JOIN inventory i_prev ON p_prev.id = i_prev.product_id
                WHERE p_prev.group_id = pg.id
             ) as products_preview
      FROM product_groups pg
      LEFT JOIN products p ON pg.id = p.group_id
      LEFT JOIN inventory i ON p.id = i.product_id
      LEFT JOIN sales s ON p.id = s.product_id
      WHERE pg.company_id = ?
      GROUP BY pg.id
      ORDER BY pg.name ASC
    `;
    const groups = await dbAll(query, [companyId]);

    const data = groups.map(g => ({
      ...g,
      products_preview: g.products_preview || []
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET single product group
router.get('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const group = await dbGet('SELECT * FROM product_groups WHERE id = ? AND company_id = ?', [req.params.id, companyId]);
    if (!group) return res.status(404).json({ success: false, error: 'Product group not found' });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// POST create product group
router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { name, description, productIds } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ success: false, error: 'Name is required' });

    const newGroupId = await withTransaction(async (tx) => {
      const inserted = await tx.getOne('INSERT INTO product_groups (company_id, name, description) VALUES (?, ?, ?) RETURNING id', [companyId, name.trim(), description || '']);
      const groupId = inserted.id;

      // Reassignment is scoped to this company's own products -- without
      // this, a caller could attach another company's product (by id) to
      // their own group.
      if (Array.isArray(productIds) && productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',');
        await tx.query(`UPDATE products SET group_id = ?, category = ? WHERE id IN (${placeholders}) AND company_id = ?`, [groupId, name.trim(), ...productIds, companyId]);
      }
      return groupId;
    });

    const newGroup = await dbGet('SELECT * FROM product_groups WHERE id = ?', [newGroupId]);
    res.status(201).json({ success: true, data: newGroup });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(400).json({ success: false, error: 'A product group with this name already exists' });
    }
    next(err);
  }
});

// PUT update product group
router.put('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { name, description, productIds } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ success: false, error: 'Name is required' });

    const groupId = req.params.id;

    await withTransaction(async (tx) => {
      const existing = await tx.getOne('SELECT id FROM product_groups WHERE id = ? AND company_id = ?', [groupId, companyId]);
      if (!existing) throw new Error('__NOT_FOUND__');

      await tx.query('UPDATE product_groups SET name = ?, description = ?, updated_at = now() WHERE id = ? AND company_id = ?', [name.trim(), description || '', groupId, companyId]);

      // Update existing assigned products' category field (for backward compat)
      await tx.query('UPDATE products SET category = ? WHERE group_id = ? AND company_id = ?', [name.trim(), groupId, companyId]);

      // Handle product reassignment -- own company's products only
      if (Array.isArray(productIds)) {
        // 1. Remove group_id from products that were previously in this group but are no longer in productIds
        if (productIds.length > 0) {
          const placeholders = productIds.map(() => '?').join(',');
          await tx.query(`UPDATE products SET group_id = NULL, category = 'Uncategorized' WHERE group_id = ? AND company_id = ? AND id NOT IN (${placeholders})`, [groupId, companyId, ...productIds]);
        } else {
          // All products removed
          await tx.query(`UPDATE products SET group_id = NULL, category = 'Uncategorized' WHERE group_id = ? AND company_id = ?`, [groupId, companyId]);
        }

        // 2. Add new products to this group
        if (productIds.length > 0) {
          const placeholders = productIds.map(() => '?').join(',');
          await tx.query(`UPDATE products SET group_id = ?, category = ? WHERE id IN (${placeholders}) AND company_id = ?`, [groupId, name.trim(), ...productIds, companyId]);
        }
      }
    });

    const updatedGroup = await dbGet('SELECT * FROM product_groups WHERE id = ? AND company_id = ?', [groupId, companyId]);
    if (!updatedGroup) return res.status(404).json({ success: false, error: 'Product group not found' });
    res.json({ success: true, data: updatedGroup });
  } catch (err) {
    if (err.message === '__NOT_FOUND__') {
      return res.status(404).json({ success: false, error: 'Product group not found' });
    }
    if (isDuplicateKeyError(err)) {
      return res.status(400).json({ success: false, error: 'A product group with this name already exists' });
    }
    next(err);
  }
});

// DELETE product group
router.delete('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const action = req.query.action; // 'uncategorize' or 'move'
    const targetId = req.query.targetId;
    const groupId = req.params.id;

    // withTransaction() rolls back on any throw, so the "not an error,
    // just a different response" outcomes (no products / not found /
    // target not owned) are signaled via marker errors caught right
    // outside the transaction, rather than trying to res.json() from
    // inside it.
    try {
      await withTransaction(async (tx) => {
        const existing = await tx.getOne('SELECT id FROM product_groups WHERE id = ? AND company_id = ?', [groupId, companyId]);
        if (!existing) throw new Error('__NOT_FOUND__');

        if (action === 'uncategorize') {
          await tx.query(`UPDATE products SET group_id = NULL, category = 'Uncategorized' WHERE group_id = ? AND company_id = ?`, [groupId, companyId]);
        } else if (action === 'move' && targetId) {
          // Target group must belong to the same company -- otherwise this
          // would move products into another company's group.
          const targetGroup = await tx.getOne('SELECT name FROM product_groups WHERE id = ? AND company_id = ?', [targetId, companyId]);
          if (!targetGroup) throw new Error('__TARGET_NOT_FOUND__');
          await tx.query(`UPDATE products SET group_id = ?, category = ? WHERE group_id = ? AND company_id = ?`, [targetId, targetGroup.name, groupId, companyId]);
        } else {
          // Default strict behavior
          const productCount = await tx.getOne('SELECT COUNT(*) as count FROM products WHERE group_id = ? AND company_id = ?', [groupId, companyId]);
          if (productCount.count > 0) {
            throw new Error('__HAS_PRODUCTS__');
          }
        }

        await tx.query('DELETE FROM product_groups WHERE id = ? AND company_id = ?', [groupId, companyId]);
      });
    } catch (e) {
      if (e.message === '__TARGET_NOT_FOUND__') {
        return res.status(400).json({ success: false, error: 'Target group not found' });
      }
      if (e.message === '__HAS_PRODUCTS__') {
        return res.status(400).json({ success: false, error: 'Cannot delete group because products exist in it. Please reassign them first.' });
      }
      if (e.message === '__NOT_FOUND__') {
        return res.status(404).json({ success: false, error: 'Product group not found' });
      }
      throw e;
    }
    return res.json({ success: true, message: 'Product group deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
