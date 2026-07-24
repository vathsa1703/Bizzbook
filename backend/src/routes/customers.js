const express = require('express');
const { isValidGSTIN, extractStateCodeFromGSTIN, lookupStateCode } = require('../services/gstEngine');
const { withBranchScope } = require('../utils/BranchScopedQuery');
const { dbGet, dbAll } = require('../config/dbEngine');

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveStateCode(state_code, gstin) {
  if (state_code && /^[0-9]{2}$/.test(String(state_code).trim())) {
    return String(state_code).trim();
  }
  const g = (gstin || '').trim().toUpperCase();
  if (isValidGSTIN(g)) {
    return g.slice(0, 2);
  }
  return state_code || null;
}

// ─── GET all customers — scoped to company ────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const search = req.query.search || '';
    let query = `SELECT * FROM customers WHERE company_id = ?`;
    const params = [companyId];

    if (search) {
      query += ` AND (name LIKE ? OR gstin LIKE ? OR phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const scoped = withBranchScope(query, params, req.scopeContext, 'branch_id');
    scoped.sql += ` ORDER BY total_purchases DESC, name ASC`;

    res.json(await dbAll(scoped.sql, scoped.params));
  } catch (err) {
    next(err);
  }
});

// ─── GET single customer with history — scoped to company ────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const customer = await dbGet('SELECT * FROM customers WHERE id = ? AND company_id = ?', [req.params.id, companyId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const sales = await dbAll(`
      SELECT s.*, p.name as product_name
      FROM sales s
      LEFT JOIN products p ON s.product_id = p.id
      WHERE s.customer_id = ? AND s.company_id = ?
      ORDER BY s.sale_date DESC
    `, [req.params.id, companyId]);

    const credits = await dbAll(
      'SELECT * FROM credits WHERE customer_id = ? AND company_id = ? ORDER BY due_date ASC',
      [req.params.id, companyId]
    );

    const invoices = await dbAll(
      'SELECT * FROM invoices WHERE customer_id = ? AND company_id = ? ORDER BY invoice_date DESC, id DESC',
      [req.params.id, companyId]
    );

    res.json({ ...customer, sales, credits, invoices });
  } catch (err) {
    next(err);
  }
});

// ─── POST create customer — stamped with company_id ──────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const {
      name,
      gstin           = null,
      phone           = null,
      email           = null,
      state           = null,
      billing_address = null,
      is_gst_registered = 0,
    } = req.body;
    let { state_code = null } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const custGstReg = is_gst_registered ? 1 : 0;
    const normGstin = gstin ? gstin.trim().toUpperCase() : null;

    if (custGstReg) {
      if (!normGstin) {
        return res.status(400).json({ error: 'GSTIN is required for GST-registered customers.' });
      }
      if (!isValidGSTIN(normGstin)) {
        return res.status(400).json({ error: 'Invalid GSTIN format. Must be 15 characters matching the GSTIN pattern.' });
      }
    } else if (normGstin && !isValidGSTIN(normGstin)) {
      return res.status(400).json({ error: 'Invalid GSTIN format. Must be 15 characters matching the GSTIN pattern.' });
    }

    state_code = deriveStateCode(state_code, normGstin);

    if (!state_code) {
      return res.status(400).json({ error: 'State selection is mandatory for all customers.' });
    }

    // No transaction needed: single INSERT, atomic on both engines by itself.
    // RETURNING id works identically via .get() on node:sqlite and pg, so this
    // is one shared code path rather than a dual SQLite/Postgres branch.
    const result = await dbGet(`
      INSERT INTO customers
        (name, gstin, phone, email, state, state_code, billing_address, is_gst_registered, total_purchases, last_purchase_date, company_id)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
      RETURNING id
    `, [name.trim(), normGstin, phone, email, state, state_code, billing_address, custGstReg, companyId]);

    const customerId = result.id;

    // Emit event for automations
    const eventBusService = require('../services/EventBusService');
    const { Events } = require('../constants/events');
    eventBusService.emit(companyId, Events.CUSTOMER_CREATED, customerId, {
      customerId: customerId,
      name: name.trim(),
      city: state // We map city to state roughly for testing if city field is absent
    });

    res.status(201).json({
      id: customerId,
      name: name.trim(),
      gstin: normGstin,
      phone,
      email,
      state,
      state_code,
      is_gst_registered: custGstReg,
      billing_address,
      total_purchases: 0,
      last_purchase_date: null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT update customer — scoped to company ─────────────────────────────────

router.put('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const existing = await dbGet('SELECT * FROM customers WHERE id = ? AND company_id = ?', [req.params.id, companyId]);
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    const {
      name            = existing.name,
      gstin           = existing.gstin,
      phone           = existing.phone,
      email           = existing.email,
      state           = existing.state,
      billing_address = existing.billing_address,
      is_gst_registered = existing.is_gst_registered ?? 0,
    } = req.body;
    let { state_code = existing.state_code } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const custGstReg = is_gst_registered ? 1 : 0;
    const normGstin = gstin ? String(gstin).trim().toUpperCase() : null;

    if (custGstReg) {
      if (!normGstin) {
        return res.status(400).json({ error: 'GSTIN is required for GST-registered customers.' });
      }
      if (!isValidGSTIN(normGstin)) {
        return res.status(400).json({ error: 'Invalid GSTIN format. Must be 15 characters matching the GSTIN pattern.' });
      }
    } else if (normGstin && !isValidGSTIN(normGstin)) {
      return res.status(400).json({ error: 'Invalid GSTIN format. Must be 15 characters matching the GSTIN pattern.' });
    }

    state_code = deriveStateCode(state_code, normGstin);

    if (!state_code) {
      return res.status(400).json({ error: 'State selection is mandatory for all customers.' });
    }

    await dbGet(`
      UPDATE customers SET
        name              = ?,
        gstin             = ?,
        phone             = ?,
        email             = ?,
        state             = ?,
        state_code        = ?,
        billing_address   = ?,
        is_gst_registered = ?
      WHERE id = ? AND company_id = ?
    `, [name.trim(), normGstin, phone, email, state, state_code, billing_address, custGstReg, req.params.id, companyId]);

    res.json({
      id: Number(req.params.id),
      name: name.trim(),
      gstin: normGstin,
      phone,
      email,
      state,
      state_code,
      is_gst_registered: custGstReg,
      billing_address,
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE customer — scoped to company ─────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const id = req.params.id;

    const customer = await dbGet('SELECT id FROM customers WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const salesExist = await dbGet('SELECT id FROM sales WHERE customer_id = ? AND company_id = ? LIMIT 1', [id, companyId]);
    if (salesExist) return res.status(400).json({ error: 'Cannot delete customer with existing sales history.' });

    const invoicesExist = await dbGet('SELECT id FROM invoices WHERE customer_id = ? AND company_id = ? LIMIT 1', [id, companyId]);
    if (invoicesExist) return res.status(400).json({ error: 'Cannot delete customer with outstanding invoices.' });

    const creditsExist = await dbGet('SELECT id FROM credits WHERE customer_id = ? AND company_id = ? LIMIT 1', [id, companyId]);
    if (creditsExist) return res.status(400).json({ error: 'Cannot delete customer with outstanding credit logs.' });

    await dbGet('DELETE FROM customers WHERE id = ? AND company_id = ?', [id, companyId]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
