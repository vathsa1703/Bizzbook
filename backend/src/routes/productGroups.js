const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { dbGet, dbAll, engine } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

// True for a duplicate-primary-key/unique-constraint violation on either
// engine (see routes/gstMaster.js for the canonical version of this check).
function isDuplicateKeyError(e) {
  return e.code === '23505' || (e.message && e.message.includes('UNIQUE constraint failed'));
}

// GET all product groups
router.get('/', async (req, res, next) => {
  try {
    // json_group_array/json_object are SQLite-only; Postgres uses
    // json_agg/json_build_object. Also, node-postgres auto-parses json
    // columns into real JS values, while node:sqlite returns a JSON text
    // string that must be JSON.parse()'d -- handled below per engine.
    const previewExpr = engine() === 'postgres'
      ? `json_agg(json_build_object('name', p_prev.name, 'stock', COALESCE(i_prev.stock_quantity, 0)))`
      : `json_group_array(json_object('name', p_prev.name, 'stock', COALESCE(i_prev.stock_quantity, 0)))`;

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
      GROUP BY pg.id
      ORDER BY pg.name ASC
    `;
    const groups = await dbAll(query, []);

    // Parse the JSON array for previews (Postgres already returns a parsed array/null)
    const data = groups.map(g => ({
      ...g,
      products_preview: engine() === 'postgres'
        ? (g.products_preview || [])
        : (g.products_preview ? JSON.parse(g.products_preview) : [])
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET single product group
router.get('/:id', async (req, res, next) => {
  try {
    const group = await dbGet('SELECT * FROM product_groups WHERE id = ?', [req.params.id]);
    if (!group) return res.status(404).json({ success: false, error: 'Product group not found' });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// POST create product group
router.post('/', async (req, res, next) => {
  try {
    const { name, description, productIds } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ success: false, error: 'Name is required' });

    let newGroupId;
    if (engine() === 'postgres') {
      newGroupId = await withTransaction(async (tx) => {
        const inserted = await tx.getOne('INSERT INTO product_groups (name, description) VALUES (?, ?) RETURNING id', [name.trim(), description || '']);
        const groupId = inserted.id;

        if (Array.isArray(productIds) && productIds.length > 0) {
          const placeholders = productIds.map(() => '?').join(',');
          await tx.query(`UPDATE products SET group_id = ?, category = ? WHERE id IN (${placeholders})`, [groupId, name.trim(), ...productIds]);
        }
        return groupId;
      });
    } else {
      const db = getDb();
      db.exec('BEGIN TRANSACTION');
      try {
        const result = db.prepare('INSERT INTO product_groups (name, description) VALUES (?, ?)').run(name.trim(), description || '');
        newGroupId = result.lastInsertRowid;

        // Assign products if provided
        if (Array.isArray(productIds) && productIds.length > 0) {
          const placeholders = productIds.map(() => '?').join(',');
          db.prepare(`UPDATE products SET group_id = ?, category = ? WHERE id IN (${placeholders})`)
            .run(newGroupId, name.trim(), ...productIds);
        }

        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        db.close();
      }
    }

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
    const { name, description, productIds } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ success: false, error: 'Name is required' });

    const groupId = req.params.id;

    if (engine() === 'postgres') {
      await withTransaction(async (tx) => {
        await tx.query('UPDATE product_groups SET name = ?, description = ?, updated_at = now() WHERE id = ?', [name.trim(), description || '', groupId]);

        // Update existing assigned products' category field (for backward compat)
        await tx.query('UPDATE products SET category = ? WHERE group_id = ?', [name.trim(), groupId]);

        // Handle product reassignment
        if (Array.isArray(productIds)) {
          // 1. Remove group_id from products that were previously in this group but are no longer in productIds
          if (productIds.length > 0) {
            const placeholders = productIds.map(() => '?').join(',');
            await tx.query(`UPDATE products SET group_id = NULL, category = 'Uncategorized' WHERE group_id = ? AND id NOT IN (${placeholders})`, [groupId, ...productIds]);
          } else {
            // All products removed
            await tx.query(`UPDATE products SET group_id = NULL, category = 'Uncategorized' WHERE group_id = ?`, [groupId]);
          }

          // 2. Add new products to this group
          if (productIds.length > 0) {
            const placeholders = productIds.map(() => '?').join(',');
            await tx.query(`UPDATE products SET group_id = ?, category = ? WHERE id IN (${placeholders})`, [groupId, name.trim(), ...productIds]);
          }
        }
      });
    } else {
      const db = getDb();
      db.exec('BEGIN TRANSACTION');
      try {
        db.prepare('UPDATE product_groups SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name.trim(), description || '', groupId);

        // Update existing assigned products' category field (for backward compat)
        db.prepare('UPDATE products SET category = ? WHERE group_id = ?').run(name.trim(), groupId);

        // Handle product reassignment
        if (Array.isArray(productIds)) {
          // 1. Remove group_id from products that were previously in this group but are no longer in productIds
          if (productIds.length > 0) {
             const placeholders = productIds.map(() => '?').join(',');
             db.prepare(`UPDATE products SET group_id = NULL, category = 'Uncategorized' WHERE group_id = ? AND id NOT IN (${placeholders})`)
               .run(groupId, ...productIds);
          } else {
             // All products removed
             db.prepare(`UPDATE products SET group_id = NULL, category = 'Uncategorized' WHERE group_id = ?`)
               .run(groupId);
          }

          // 2. Add new products to this group
          if (productIds.length > 0) {
            const placeholders = productIds.map(() => '?').join(',');
            db.prepare(`UPDATE products SET group_id = ?, category = ? WHERE id IN (${placeholders})`)
              .run(groupId, name.trim(), ...productIds);
          }
        }

        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        db.close();
      }
    }

    const updatedGroup = await dbGet('SELECT * FROM product_groups WHERE id = ?', [groupId]);
    if (!updatedGroup) return res.status(404).json({ success: false, error: 'Product group not found' });
    res.json({ success: true, data: updatedGroup });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(400).json({ success: false, error: 'A product group with this name already exists' });
    }
    next(err);
  }
});

// DELETE product group
router.delete('/:id', async (req, res, next) => {
  try {
    const action = req.query.action; // 'uncategorize' or 'move'
    const targetId = req.query.targetId;
    const groupId = req.params.id;

    if (engine() === 'postgres') {
      // withTransaction() rolls back on any throw, so the two "not an error,
      // just a different response" outcomes (no products / not found) are
      // signaled via marker errors caught right outside the transaction,
      // rather than trying to res.json() from inside it.
      try {
        await withTransaction(async (tx) => {
          if (action === 'uncategorize') {
            await tx.query(`UPDATE products SET group_id = NULL, category = 'Uncategorized' WHERE group_id = ?`, [groupId]);
          } else if (action === 'move' && targetId) {
            const targetGroup = await tx.getOne('SELECT name FROM product_groups WHERE id = ?', [targetId]);
            if (!targetGroup) throw new Error('Target group not found');
            await tx.query(`UPDATE products SET group_id = ?, category = ? WHERE group_id = ?`, [targetId, targetGroup.name, groupId]);
          } else {
            // Default strict behavior
            const productCount = await tx.getOne('SELECT COUNT(*) as count FROM products WHERE group_id = ?', [groupId]);
            if (productCount.count > 0) {
              throw new Error('__HAS_PRODUCTS__');
            }
          }

          const result = await tx.query('DELETE FROM product_groups WHERE id = ?', [groupId]);
          if (result.rowCount === 0) {
            throw new Error('__NOT_FOUND__');
          }
        });
      } catch (e) {
        if (e.message === 'Target group not found') {
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
    }

    const db = getDb();
    db.exec('BEGIN TRANSACTION');
    try {
      if (action === 'uncategorize') {
        db.prepare(`UPDATE products SET group_id = NULL, category = 'Uncategorized' WHERE group_id = ?`).run(groupId);
      } else if (action === 'move' && targetId) {
        const targetGroup = db.prepare('SELECT name FROM product_groups WHERE id = ?').get(targetId);
        if (!targetGroup) throw new Error('Target group not found');
        db.prepare(`UPDATE products SET group_id = ?, category = ? WHERE group_id = ?`).run(targetId, targetGroup.name, groupId);
      } else {
        // Default strict behavior
        const productCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE group_id = ?').get(groupId);
        if (productCount.count > 0) {
          db.exec('ROLLBACK');
          db.close();
          return res.status(400).json({ success: false, error: 'Cannot delete group because products exist in it. Please reassign them first.' });
        }
      }

      const result = db.prepare('DELETE FROM product_groups WHERE id = ?').run(groupId);
      if (result.changes === 0) {
         db.exec('ROLLBACK');
         db.close();
         return res.status(404).json({ success: false, error: 'Product group not found' });
      }

      db.exec('COMMIT');
      db.close();
      res.json({ success: true, message: 'Product group deleted successfully' });
    } catch (e) {
      db.exec('ROLLBACK');
      db.close();
      if (e.message === 'Target group not found') {
         return res.status(400).json({ success: false, error: 'Target group not found' });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
