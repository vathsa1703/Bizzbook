const express = require('express');
const { getDb } = require('../config/db');

const router = express.Router();

// GET all suppliers — scoped to company
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const search = req.query.search || '';
    let query = `
      SELECT s.*, COUNT(p.id) as product_count
      FROM suppliers s
      LEFT JOIN products p ON s.id = p.supplier_id AND p.company_id = ?
      WHERE s.company_id = ?
    `;
    const params = [companyId, companyId];

    if (search) {
      query += ` AND (s.name LIKE ? OR s.contact_person LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` GROUP BY s.id ORDER BY s.name ASC`;

    const suppliers = db.prepare(query).all(...params);
    res.json(suppliers);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET single supplier — scoped to company
router.get('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const products = db.prepare(`
      SELECT p.*, i.stock_quantity
      FROM products p
      LEFT JOIN inventory i ON p.id = i.product_id AND i.company_id = ?
      WHERE p.supplier_id = ? AND p.company_id = ?
      ORDER BY p.name ASC
    `).all(companyId, req.params.id, companyId);

    res.json({ ...supplier, products });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// POST create supplier — stamped with company_id
router.post('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { name, contact_person, phone, email, address } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const resInsert = db.prepare(`
      INSERT INTO suppliers (name, contact_person, phone, email, address, company_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, contact_person || null, phone || null, email || null, address || null, companyId);

    res.status(201).json({ id: resInsert.lastInsertRowid, name, contact_person, phone, email, address });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// PUT update supplier — scoped to company
router.put('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { name, contact_person, phone, email, address } = req.body;
    const supId = req.params.id;

    const existing = db.prepare('SELECT id FROM suppliers WHERE id = ? AND company_id = ?').get(supId, companyId);
    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    db.prepare(`
      UPDATE suppliers
      SET name = COALESCE(?, name),
          contact_person = COALESCE(?, contact_person),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          address = COALESCE(?, address)
      WHERE id = ? AND company_id = ?
    `).run(
      name ?? null,
      contact_person ?? null,
      phone ?? null,
      email ?? null,
      address ?? null,
      supId,
      companyId,
    );

    res.json({ message: 'Supplier updated successfully' });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// DELETE supplier — scoped to company
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const supId = req.params.id;

    const existing = db.prepare('SELECT id FROM suppliers WHERE id = ? AND company_id = ?').get(supId, companyId);
    if (!existing) return res.status(404).json({ error: 'Supplier not found' });

    const productsExist = db.prepare('SELECT id FROM products WHERE supplier_id = ? AND company_id = ? LIMIT 1').get(supId, companyId);
    if (productsExist) {
      return res.status(400).json({ error: 'Cannot delete supplier with linked products.' });
    }

    db.prepare('DELETE FROM suppliers WHERE id = ? AND company_id = ?').run(supId, companyId);
    res.status(204).end();
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
