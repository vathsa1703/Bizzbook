const express = require('express');
const { getDb } = require('../config/db');
const {
  resolveStateCode,
  determineTransactionType,
  calculateLineGST,
  enrichItems,
  getCompanyGstProfile,
} = require('../services/gstEngine');

const router = express.Router();

// GET all purchases — scoped to company
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const purchases = db.prepare('SELECT * FROM purchases WHERE company_id = ?').all(req.user.companyId);
    res.json(purchases);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET single purchase — scoped to company
router.get('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const purchase = db.prepare('SELECT * FROM purchases WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    res.json(purchase);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// POST create purchase — stamped with company_id
router.post('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { product_id, supplier_id = null, quantity, cost_price, itc_eligible = 0, purchase_date, invoice_number = null } = req.body;
    if (!product_id || !quantity || !cost_price || !purchase_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify product belongs to this company
    const product = db.prepare('SELECT id FROM products WHERE id = ? AND company_id = ?').get(product_id, companyId);
    if (!product) return res.status(404).json({ error: 'Product not found for this company' });

    // Calculate GST fields using gstEngine — scoped by company
    // Canonical source: companies + company_gst_settings (company_settings is deprecated).
    const companySetting = getCompanyGstProfile(db, companyId);
    const companyStateCode = companySetting.state_code;

    let supplierStateCode = null;
    if (supplier_id) {
      const supplier = db.prepare('SELECT state FROM suppliers WHERE id = ? AND company_id = ?').get(supplier_id, companyId);
      if (supplier) {
        supplierStateCode = resolveStateCode(supplier.state);
      }
    }

    const enriched = enrichItems(db, [{ product_id, quantity, revenue: Number(quantity) * Number(cost_price) }]);
    const gstRate = enriched[0].gst_rate;
    const cessRate = enriched[0].cess_rate;

    const txType = determineTransactionType(companyStateCode, supplierStateCode);
    const isInterstate = (txType === 'interstate');

    const taxData = calculateLineGST({
      taxableValue: Number(quantity) * Number(cost_price),
      gstRate: gstRate,
      cessRate: cessRate,
      isInterstate: isInterstate,
      isInclusive: companySetting.inclusive_pricing !== 0
    });
    taxData.itc_eligible = Boolean(itc_eligible) ? 1 : 0;
    taxData.itc_amount = taxData.itc_eligible ? taxData.gst_amount : 0;

    db.exec('BEGIN TRANSACTION');
    const result = db.prepare(`
      INSERT INTO purchases (
        product_id, supplier_id, quantity, cost_price,
        taxable_value, gst_amount, cgst, sgst, igst,
        itc_eligible, itc_amount, purchase_date, invoice_number, company_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      product_id, supplier_id, quantity, cost_price,
      taxData.taxable_value, taxData.gst_amount, taxData.cgst, taxData.sgst, taxData.igst,
      taxData.itc_eligible, taxData.itc_amount, purchase_date, invoice_number, companyId,
    );

    // Increment received stock into inventory — scoped to company
    const invUpdate = db.prepare(
      'UPDATE inventory SET stock_quantity = stock_quantity + ?, last_restocked = ? WHERE product_id = ? AND company_id = ?'
    ).run(Number(quantity), purchase_date, product_id, companyId);
    if (invUpdate.changes === 0) {
      // Product had no inventory row yet (shouldn't normally happen — products always get one on create)
      db.prepare(
        'INSERT INTO inventory (product_id, stock_quantity, reorder_level, last_restocked, company_id) VALUES (?, ?, 10, ?, ?)'
      ).run(product_id, Number(quantity), purchase_date, companyId);
    }

    db.exec('COMMIT');
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally {
    db.close();
  }
});

// PUT update purchase — scoped to company
router.put('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { product_id, supplier_id, quantity, cost_price, gst_amount, purchase_date, invoice_number } = req.body;
    const purchaseId = req.params.id;
    const existing = db.prepare('SELECT id FROM purchases WHERE id = ? AND company_id = ?').get(purchaseId, companyId);
    if (!existing) return res.status(404).json({ error: 'Purchase not found' });
    db.exec('BEGIN TRANSACTION');
    db.prepare(`
      UPDATE purchases SET
        product_id = COALESCE(?, product_id),
        supplier_id = COALESCE(?, supplier_id),
        quantity = COALESCE(?, quantity),
        cost_price = COALESCE(?, cost_price),
        gst_amount = COALESCE(?, gst_amount),
        purchase_date = COALESCE(?, purchase_date),
        invoice_number = COALESCE(?, invoice_number)
      WHERE id = ? AND company_id = ?
    `).run(product_id, supplier_id, quantity, cost_price, gst_amount, purchase_date, invoice_number, purchaseId, companyId);
    db.exec('COMMIT');
    res.json({ message: 'Purchase updated' });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally {
    db.close();
  }
});

// DELETE purchase — scoped to company
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const purchaseId = req.params.id;
    const existing = db.prepare('SELECT id FROM purchases WHERE id = ? AND company_id = ?').get(purchaseId, companyId);
    if (!existing) return res.status(404).json({ error: 'Purchase not found' });
    db.exec('BEGIN TRANSACTION');
    db.prepare('DELETE FROM purchases WHERE id = ? AND company_id = ?').run(purchaseId, companyId);
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
