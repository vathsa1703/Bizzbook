const express = require('express');
const { getDb } = require('../config/db');
const { isValidGSTIN, extractStateCodeFromGSTIN, lookupStateCode } = require('../services/gstEngine');
const { withBranchScope } = require('../utils/BranchScopedQuery');

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

router.get('/', (req, res, next) => {
  const db = getDb();
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

    res.json(db.prepare(scoped.sql).all(...scoped.params));
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// ─── GET single customer with history — scoped to company ────────────────────

router.get('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const sales = db.prepare(`
      SELECT s.*, p.name as product_name
      FROM sales s
      LEFT JOIN products p ON s.product_id = p.id
      WHERE s.customer_id = ? AND s.company_id = ?
      ORDER BY s.sale_date DESC
    `).all(req.params.id, companyId);

    const credits = db.prepare(
      'SELECT * FROM credits WHERE customer_id = ? AND company_id = ? ORDER BY due_date ASC'
    ).all(req.params.id, companyId);

    const invoices = db.prepare(
      'SELECT * FROM invoices WHERE customer_id = ? AND company_id = ? ORDER BY invoice_date DESC, id DESC'
    ).all(req.params.id, companyId);

    res.json({ ...customer, sales, credits, invoices });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// ─── POST create customer — stamped with company_id ──────────────────────────

router.post('/', (req, res, next) => {
  const db = getDb();
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

    const result = db.prepare(`
      INSERT INTO customers
        (name, gstin, phone, email, state, state_code, billing_address, is_gst_registered, total_purchases, last_purchase_date, company_id)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
    `).run(name.trim(), normGstin, phone, email, state, state_code, billing_address, custGstReg, companyId);

    const customerId = result.lastInsertRowid;

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
  } finally {
    db.close();
  }
});

// ─── PUT update customer — scoped to company ─────────────────────────────────

router.put('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const existing = db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
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

    db.prepare(`
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
    `).run(name.trim(), normGstin, phone, email, state, state_code, billing_address, custGstReg, req.params.id, companyId);

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
  } finally {
    db.close();
  }
});

// ─── DELETE customer — scoped to company ─────────────────────────────────────

router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const id = req.params.id;

    const customer = db.prepare('SELECT id FROM customers WHERE id = ? AND company_id = ?').get(id, companyId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const salesExist   = db.prepare('SELECT id FROM sales    WHERE customer_id = ? AND company_id = ? LIMIT 1').get(id, companyId);
    if (salesExist)    return res.status(400).json({ error: 'Cannot delete customer with existing sales history.' });

    const invoicesExist = db.prepare('SELECT id FROM invoices WHERE customer_id = ? AND company_id = ? LIMIT 1').get(id, companyId);
    if (invoicesExist) return res.status(400).json({ error: 'Cannot delete customer with outstanding invoices.' });

    const creditsExist  = db.prepare('SELECT id FROM credits  WHERE customer_id = ? AND company_id = ? LIMIT 1').get(id, companyId);
    if (creditsExist)  return res.status(400).json({ error: 'Cannot delete customer with outstanding credit logs.' });

    db.prepare('DELETE FROM customers WHERE id = ? AND company_id = ?').run(id, companyId);
    res.status(204).end();
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
