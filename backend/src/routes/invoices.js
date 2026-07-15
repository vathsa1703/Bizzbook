const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/db');

const router = express.Router();
const INVOICE_DIR = path.join(__dirname, '..', '..', 'data', 'invoices');

// GET all invoices (for customer tab) — scoped to company
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const customerId = req.query.customerId;
    let query = `
      SELECT i.*, c.name as customer_name
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.company_id = ?
    `;
    const params = [companyId];
    if (customerId) {
      query += ` AND i.customer_id = ?`;
      params.push(customerId);
    }
    query += ` ORDER BY i.id DESC`;

    const invoices = db.prepare(query).all(...params);
    res.json(invoices);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET single invoice with items — scoped to company
router.get('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const invoice = db.prepare(`
      SELECT i.*, c.name as customer_name, c.email, c.phone, c.billing_address, c.gstin as customer_gstin
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      WHERE i.id = ? AND i.company_id = ?
    `).get(req.params.id, companyId);

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const items = db.prepare(`
      SELECT ii.*, p.name as product_name, p.hsn_code 
      FROM invoice_items ii
      LEFT JOIN products p ON ii.product_id = p.id
      WHERE ii.invoice_id = ? AND ii.company_id = ?
    `).all(invoice.id, companyId);

    // If it has a snapshot, return it instead as it's the frozen source of truth
    let snapshot = null;
    if (invoice.snapshot) {
      try { snapshot = JSON.parse(invoice.snapshot); } catch(e) {}
    }

    res.json({ invoice, items, snapshot });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET download PDF — scoped to company
router.get('/:id/download', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const invoice = db.prepare('SELECT pdf_path, invoice_number FROM invoices WHERE id = ? AND company_id = ?').get(req.params.id, companyId);
    if (!invoice || !invoice.pdf_path) {
      return res.status(404).json({ error: 'PDF not found or not yet generated' });
    }
    
    const filePath = path.join(INVOICE_DIR, invoice.pdf_path);
    if (fs.existsSync(filePath)) {
      res.download(filePath, `${invoice.invoice_number}.pdf`);
    } else {
      res.status(404).json({ error: 'PDF file missing on server' });
    }
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
