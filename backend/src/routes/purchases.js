const express = require('express');
const {
  resolveStateCode,
  determineTransactionType,
  calculateLineGST,
  getCompanyGstProfileAsync,
  enrichItemsAsync,
} = require('../services/gstEngine');
const { dbGet, dbAll, isOn } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

const router = express.Router();

// GET all purchases — scoped to company
router.get('/', async (req, res, next) => {
  try {
    res.json(await dbAll('SELECT * FROM purchases WHERE company_id = ?', [req.user.companyId]));
  } catch (err) {
    next(err);
  }
});

// GET single purchase — scoped to company
router.get('/:id', async (req, res, next) => {
  try {
    const purchase = await dbGet('SELECT * FROM purchases WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    res.json(purchase);
  } catch (err) {
    next(err);
  }
});

// POST create purchase — stamped with company_id
router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { product_id, supplier_id = null, quantity, cost_price, itc_eligible = 0, purchase_date, invoice_number = null } = req.body;
    if (!product_id || !quantity || !cost_price || !purchase_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify product belongs to this company
    const product = await dbGet('SELECT id FROM products WHERE id = ? AND company_id = ?', [product_id, companyId]);
    if (!product) return res.status(404).json({ error: 'Product not found for this company' });

    // Calculate GST fields using gstEngine — scoped by company
    // Canonical source: companies + company_gst_settings (company_settings is deprecated).
    const companySetting = await getCompanyGstProfileAsync(companyId);
    const companyStateCode = companySetting.state_code;

    let supplierStateCode = null;
    if (supplier_id) {
      const supplier = await dbGet('SELECT state FROM suppliers WHERE id = ? AND company_id = ?', [supplier_id, companyId]);
      if (supplier) {
        supplierStateCode = resolveStateCode(supplier.state);
      }
    }

    const enriched = await enrichItemsAsync([{ product_id, quantity, revenue: Number(quantity) * Number(cost_price) }]);
    const gstRate = enriched[0].gst_rate;
    const cessRate = enriched[0].cess_rate;

    const txType = determineTransactionType(companyStateCode, supplierStateCode);
    const isInterstate = (txType === 'interstate');

    // Phase 2 fix (was `!== 0`, silently broke for Postgres's real `false` --
    // see dbEngine.js's isOn() doc comment): correctly reads inclusive_pricing
    // regardless of whether it comes back as SQLite's 0/1 or Postgres's boolean.
    const taxData = calculateLineGST({
      taxableValue: Number(quantity) * Number(cost_price),
      gstRate: gstRate,
      cessRate: cessRate,
      isInterstate: isInterstate,
      isInclusive: isOn(companySetting.inclusive_pricing)
    });
    taxData.itc_eligible = Boolean(itc_eligible) ? 1 : 0;
    taxData.itc_amount = taxData.itc_eligible ? taxData.gst_amount : 0;

    const insertParams = [
      product_id, supplier_id, quantity, cost_price,
      taxData.taxable_value, taxData.gst_amount, taxData.cgst, taxData.sgst, taxData.igst,
      taxData.itc_eligible, taxData.itc_amount, purchase_date, invoice_number, companyId,
    ];

    const purchaseId = await withTransaction(async (tx) => {
      const purchaseRow = await tx.getOne(`
        INSERT INTO purchases (
          product_id, supplier_id, quantity, cost_price,
          taxable_value, gst_amount, cgst, sgst, igst,
          itc_eligible, itc_amount, purchase_date, invoice_number, company_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, insertParams);
      const txPurchaseId = purchaseRow.id;

      // Increment received stock into inventory — scoped to company.
      // tx.query() returns the raw pg Result here (not routed through
      // getOne/getAll) specifically so rowCount is available -- dbGet/dbAll
      // abstract that away, but we need to know whether the UPDATE actually
      // matched a row to decide whether to fall back to an INSERT.
      const invResult = await tx.query(
        'UPDATE inventory SET stock_quantity = stock_quantity + ?, last_restocked = ? WHERE product_id = ? AND company_id = ?',
        [Number(quantity), purchase_date, product_id, companyId]
      );
      if (invResult.rowCount === 0) {
        // Product had no inventory row yet (shouldn't normally happen — products always get one on create)
        await tx.query(
          'INSERT INTO inventory (product_id, stock_quantity, reorder_level, last_restocked, company_id) VALUES (?, ?, 10, ?, ?)',
          [product_id, Number(quantity), purchase_date, companyId]
        );
      }

      return txPurchaseId;
    });

    res.status(201).json({ id: purchaseId });
  } catch (err) {
    next(err);
  }
});

// PUT update purchase — scoped to company
router.put('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { product_id, supplier_id, quantity, cost_price, gst_amount, purchase_date, invoice_number } = req.body;
    const purchaseId = req.params.id;
    const existing = await dbGet('SELECT id FROM purchases WHERE id = ? AND company_id = ?', [purchaseId, companyId]);
    if (!existing) return res.status(404).json({ error: 'Purchase not found' });

    // Single UPDATE, atomic on its own on both engines — no transaction needed
    // (same realization as customers.js: only multi-statement writes like
    // POST's purchase+inventory pair need withTransaction).
    await dbGet(`
      UPDATE purchases SET
        product_id = COALESCE(?, product_id),
        supplier_id = COALESCE(?, supplier_id),
        quantity = COALESCE(?, quantity),
        cost_price = COALESCE(?, cost_price),
        gst_amount = COALESCE(?, gst_amount),
        purchase_date = COALESCE(?, purchase_date),
        invoice_number = COALESCE(?, invoice_number)
      WHERE id = ? AND company_id = ?
    `, [product_id, supplier_id, quantity, cost_price, gst_amount, purchase_date, invoice_number, purchaseId, companyId]);

    res.json({ message: 'Purchase updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE purchase — scoped to company
router.delete('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const purchaseId = req.params.id;
    const existing = await dbGet('SELECT id FROM purchases WHERE id = ? AND company_id = ?', [purchaseId, companyId]);
    if (!existing) return res.status(404).json({ error: 'Purchase not found' });

    await dbGet('DELETE FROM purchases WHERE id = ? AND company_id = ?', [purchaseId, companyId]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
