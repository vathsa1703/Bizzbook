const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');

// GET all product groups
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    
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
                SELECT json_group_array(json_object('name', p_prev.name, 'stock', COALESCE(i_prev.stock_quantity, 0)))
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
    const groups = db.prepare(query).all();
    
    // Parse the JSON array for previews
    const data = groups.map(g => ({
      ...g,
      products_preview: g.products_preview ? JSON.parse(g.products_preview) : []
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET single product group
router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const group = db.prepare('SELECT * FROM product_groups WHERE id = ?').get(req.params.id);
    if (!group) return res.status(404).json({ success: false, error: 'Product group not found' });
    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// POST create product group
router.post('/', (req, res, next) => {
  try {
    const { name, description, productIds } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ success: false, error: 'Name is required' });

    const db = getDb();
    db.exec('BEGIN TRANSACTION');
    try {
      const result = db.prepare('INSERT INTO product_groups (name, description) VALUES (?, ?)').run(name.trim(), description || '');
      const newGroupId = result.lastInsertRowid;
      
      // Assign products if provided
      if (Array.isArray(productIds) && productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',');
        db.prepare(`UPDATE products SET group_id = ?, category = ? WHERE id IN (${placeholders})`)
          .run(newGroupId, name.trim(), ...productIds);
      }
      
      db.exec('COMMIT');
      const newGroup = db.prepare('SELECT * FROM product_groups WHERE id = ?').get(newGroupId);
      res.status(201).json({ success: true, data: newGroup });
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ success: false, error: 'A product group with this name already exists' });
    }
    next(err);
  }
});

// PUT update product group
router.put('/:id', (req, res, next) => {
  try {
    const { name, description, productIds } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ success: false, error: 'Name is required' });

    const groupId = req.params.id;
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
    }

    const updatedGroup = db.prepare('SELECT * FROM product_groups WHERE id = ?').get(groupId);
    if (!updatedGroup) return res.status(404).json({ success: false, error: 'Product group not found' });
    res.json({ success: true, data: updatedGroup });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ success: false, error: 'A product group with this name already exists' });
    }
    next(err);
  }
});

// DELETE product group
router.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const action = req.query.action; // 'uncategorize' or 'move'
    const targetId = req.query.targetId;
    const groupId = req.params.id;
    
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
          return res.status(400).json({ success: false, error: 'Cannot delete group because products exist in it. Please reassign them first.' });
        }
      }

      const result = db.prepare('DELETE FROM product_groups WHERE id = ?').run(groupId);
      if (result.changes === 0) {
         db.exec('ROLLBACK');
         return res.status(404).json({ success: false, error: 'Product group not found' });
      }
      
      db.exec('COMMIT');
      res.json({ success: true, message: 'Product group deleted successfully' });
    } catch (e) {
      db.exec('ROLLBACK');
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
