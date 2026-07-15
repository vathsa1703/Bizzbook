const express = require('express');
const { getDb } = require('../config/db');
const gstEngine = require('../services/gstEngine');
const pdfService = require('../services/pdfService');
const eventBusService = require('../services/EventBusService');
const { Events } = require('../constants/events');
const { withBranchScope } = require('../utils/BranchScopedQuery');

const router = express.Router();

// GET all sales with pagination & filters — scoped to company
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const search = req.query.search || '';
    const customerId = req.query.customerId || '';
    const date = req.query.date || '';
    const groupId = req.query.groupId || req.query.category || '';

    let query = `
      SELECT s.*, p.name as product_name, c.name as customer_name, e.name as employee_name, pg.name as group_name, p.group_id
      FROM sales s
      LEFT JOIN products p ON s.product_id = p.id
      LEFT JOIN product_groups pg ON p.group_id = pg.id
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN employees e ON s.employee_id = e.id
      WHERE s.company_id = ?
    `;
    const params = [companyId];

    if (search) {
      query += ` AND (p.name LIKE ? OR c.name LIKE ? OR s.invoice_number LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (customerId) {
      query += ` AND s.customer_id = ?`;
      params.push(customerId);
    }
    if (date) {
      query += ` AND s.sale_date = ?`;
      params.push(date);
    }
    if (groupId && groupId !== 'All') {
      query += ` AND (p.group_id = ? OR p.category = ?)`;
      params.push(groupId, groupId);
    }

    const scoped = withBranchScope(query, params, req.scopeContext, 's.branch_id');

    // Sorting — whitelist to prevent SQL injection via column name
    const SORT_COLUMNS = {
      sale_date: 's.sale_date',
      invoice_number: 's.invoice_number',
      customer: 'c.name',
      total_amount: 's.revenue',
      payment_status: 's.payment_status',
      created_at: 's.id',
    };
    const sortColumn = SORT_COLUMNS[req.query.sort] || 's.sale_date';
    const sortOrder = String(req.query.order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const orderClause = ` ORDER BY ${sortColumn} ${sortOrder}, s.id ${sortOrder}`;

    // Pagination — only activates when page/limit are explicitly supplied, so
    // existing callers that don't send them keep getting a plain array back.
    const pageProvided = req.query.page !== undefined;
    const limitProvided = req.query.limit !== undefined;

    if (pageProvided || limitProvided) {
      let page = parseInt(req.query.page, 10);
      if (!Number.isInteger(page) || page < 1) page = 1;
      let limit = parseInt(req.query.limit, 10);
      if (!Number.isInteger(limit) || limit < 1) limit = 20;
      limit = Math.min(limit, 200);
      const offset = (page - 1) * limit;

      const countRow = db.prepare(`SELECT COUNT(*) as total FROM (${scoped.sql})`).get(...scoped.params);
      const total = countRow.total;
      const totalPages = Math.max(1, Math.ceil(total / limit));

      const pagedSql = scoped.sql + orderClause + ` LIMIT ? OFFSET ?`;
      const sales = db.prepare(pagedSql).all(...scoped.params, limit, offset);

      return res.json({
        data: sales,
        pagination: { page, limit, total, totalPages },
      });
    }

    const sales = db.prepare(scoped.sql + orderClause).all(...scoped.params);
    res.json(sales);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// POST create sale — auto-calculates all GST via gstEngine, stamped with company_id
router.post('/', async (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    // Normalise: support legacy single-product body and multi-item body
    const items = req.body.items || [{
      product_id : req.body.product_id,
      quantity   : req.body.quantity,
      revenue    : req.body.revenue,
    }];

    if (req.scopeContext.type === 'global') {
      return res.status(400).json({ error: 'Cannot create a sale in global scope. Please specify a branch.' });
    }
    const branchId = req.scopeContext.type === 'branch' ? req.scopeContext.branchId : (req.scopeContext.allowedBranches[0] || null);
    if (!branchId) {
       return res.status(400).json({ error: 'No branch assigned to this user.' });
    }

    const { customer_id, employee_id, sale_date, payment_status = 'PAID', due_date } = req.body;

    if (!items.length || !sale_date) {
      return res.status(400).json({ error: 'Missing required sale parameters or items' });
    }

    // ── 1. Validate inventory stock — scoped to company ──────────────────────
    const checkInv = db.prepare('SELECT stock_quantity FROM inventory WHERE product_id = ? AND company_id = ?');
    for (const item of items) {
      const inv = checkInv.get(item.product_id, companyId);
      if (!inv || inv.stock_quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for product ID ${item.product_id}` });
      }
    }

    // ── 2. Read company state & GST mode — scoped to company ─────────────────
    // Canonical source: companies + company_gst_settings (company_settings is deprecated).
    const companySetting = gstEngine.getCompanyGstProfile(db, companyId);
    const isGstRegistered = companySetting.is_gst_registered !== 0; // treat NULL / 1 as true
    const isInclusive = companySetting.inclusive_pricing !== 0;
    const companyStateCode = companySetting.state_code;

    // ── 3. Read customer state — verify belongs to company ───────────────────
    const customer = customer_id
      ? db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?').get(customer_id, companyId)
      : null;
    const customerStateCode = customer
      ? gstEngine.resolveStateCode(customer.state_code || customer.state)
      : null;

    // ── 4. Enrich items with product GST data ────────────────────────────────
    const enrichedItems = gstEngine.enrichItems(db, items);

    // ── 5. GST calculation or plain totals ───────────────────────────────────
    let lines, totals, transactionType, placeOfSupply, finalInvoiceNumber;

    if (isGstRegistered) {
      // ── GST path: full engine ──────────────────────────────────────────────
      ({ lines, totals, transactionType } = gstEngine.buildInvoiceTotals({
        items             : enrichedItems,
        companyStateCode,
        customerStateCode,
        isInclusive,
      }));

      // ── 6. Generate Invoice Number — scoped to company ────────────────────
      const yearMonth = sale_date.substring(0, 7).replace('-', '');
      const maxInv    = db.prepare(
        `SELECT MAX(CAST(SUBSTR(invoice_number, -4) AS INTEGER)) as max_num FROM invoices WHERE invoice_number LIKE ? AND company_id = ?`
      ).get(`INV-${yearMonth}-%`, companyId);
      const nextSeq   = (maxInv.max_num || 0) + 1;
      finalInvoiceNumber = `INV-${yearMonth}-${String(nextSeq).padStart(4, '0')}`;

      // ── 7. Validate ───────────────────────────────────────────────────────
      const validationPayload = {
        companyGstin: companySetting.gstin,
        companyStateCode,
        customerGstin: customer ? customer.gstin : null,
        customerStateCode,
        invoiceNumber: finalInvoiceNumber,
        invoiceDate: sale_date,
        items: enrichedItems,
      };

      console.log('--- GST Validation Debug ---');
      console.log('Company Settings:', companySetting);
      console.log('Selected Products:', enrichedItems);
      console.log('Customer Object:', customer);
      console.log('Validation Payload:', validationPayload);

      const validation = gstEngine.validateInvoiceInput(validationPayload);
      
      console.log('Validation Result:', validation);
      console.log('----------------------------');

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          errors: validation.errors
        });
      }

      placeOfSupply = customerStateCode || companyStateCode || '';
    } else {
      // ── Non-GST path: plain billing totals ────────────────────────────────
      transactionType = 'non-gst';
      placeOfSupply   = customerStateCode || companyStateCode || '';

      lines = enrichedItems.map((item, idx) => {
        const qty           = Number(item.quantity) || 0;
        const rate          = Number(item.rate)     || 0;
        const taxable_value = Math.round(qty * rate * 100) / 100;
        return {
          line_index    : idx,
          product_id    : item.product_id,
          product_name  : item.product_name  || '',
          hsn_code      : item.hsn_code      || '',
          uqc           : item.uqc           || 'NOS',
          quantity      : qty,
          rate,
          gst_rate      : 0,
          cess_rate     : 0,
          taxable_value,
          gst_amount    : 0,
          cgst          : 0,
          sgst          : 0,
          igst          : 0,
          cess          : 0,
          total         : taxable_value,
        };
      });

      const grandTotal = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
      totals = {
        subtotal      : grandTotal,
        taxable_value : grandTotal,
        cgst          : 0,
        sgst          : 0,
        igst          : 0,
        cess          : 0,
        grand_total   : grandTotal,
      };

      // Invoice Number for non-GST mode — scoped to company
      const yearMonth = sale_date.substring(0, 7).replace('-', '');
      const maxInv    = db.prepare(
        `SELECT MAX(CAST(SUBSTR(invoice_number, -4) AS INTEGER)) as max_num FROM invoices WHERE invoice_number LIKE ? AND company_id = ?`
      ).get(`INV-${yearMonth}-%`, companyId);
      const nextSeq   = (maxInv.max_num || 0) + 1;
      finalInvoiceNumber = `INV-${yearMonth}-${String(nextSeq).padStart(4, '0')}`;
    }

    // Validation passed / non-GST path selected — proceed with saving.
    db.exec('BEGIN TRANSACTION');

    // ── 8. Determine place_of_supply ─────────────────────────────────────────
    // (already set in each branch above)

    // ── 9. Create invoice record — stamped with company_id ───────────────────
    const invoiceRes = db.prepare(`
      INSERT INTO invoices (
        invoice_number, customer_id, invoice_date, status, payment_status,
        subtotal, taxable_value, cgst, sgst, igst, grand_total, amount,
        place_of_supply, company_id
      ) VALUES (?, ?, ?, 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      finalInvoiceNumber, customer_id || null, sale_date,
      payment_status.toUpperCase(),
      totals.subtotal, totals.taxable_value,
      totals.cgst, totals.sgst, totals.igst,
      totals.grand_total, totals.grand_total,
      placeOfSupply, companyId
    );
    const invoiceId = invoiceRes.lastInsertRowid;

    // ── 9. Insert sales + invoice_items + inventory ──────────────────────────
    const snapshotItems = [];
    const createdSaleIds = [];

    for (let i = 0; i < lines.length; i++) {
      const line     = lines[i];
      const origItem = items[i];

      // sales table (legacy ledger row) — stamped with company_id
      const saleInsertRes = db.prepare(`
        INSERT INTO sales (
          product_id, customer_id, employee_id, quantity, revenue,
          sale_date, payment_status, invoice_number, invoice_id,
          taxable_value, gst_amount, cgst, sgst, igst, company_id, branch_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        line.product_id, customer_id || null, employee_id || null,
        line.quantity, line.total,
        sale_date, payment_status.toLowerCase(), finalInvoiceNumber, invoiceId,
        line.taxable_value, line.gst_amount || 0, line.cgst, line.sgst, line.igst, companyId, branchId
      );
      createdSaleIds.push(saleInsertRes.lastInsertRowid);

      // invoice_items (GST-filing-ready) — stamped with company_id
      db.prepare(`
        INSERT INTO invoice_items (
          invoice_id, product_id, quantity, rate,
          taxable_value, cgst, sgst, igst, total, company_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invoiceId, line.product_id, line.quantity, line.rate,
        line.taxable_value, line.cgst, line.sgst, line.igst, line.total, companyId
      );

      // Decrement inventory — scoped to company
      db.prepare('UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE product_id = ? AND company_id = ?')
        .run(line.quantity, line.product_id, companyId);

      if (employee_id) {
        db.prepare('UPDATE employees SET revenue_generated = revenue_generated + ? WHERE id = ? AND company_id = ?')
          .run(line.total, employee_id, companyId);
      }

      snapshotItems.push({
        product_id    : line.product_id,
        product_name  : line.product_name,
        hsn_code      : line.hsn_code,
        uqc           : line.uqc,
        quantity      : line.quantity,
        rate          : line.rate,
        gst_rate      : line.gst_rate,
        taxable_value : line.taxable_value,
        cgst          : line.cgst,
        sgst          : line.sgst,
        igst          : line.igst,
        cess          : line.cess,
        total         : line.total,
      });
    }

    // ── 10. Customer purchase totals — scoped to company ────────────────────
    if (customer_id) {
      db.prepare(`
        UPDATE customers
        SET total_purchases = total_purchases + ?, last_purchase_date = ?
        WHERE id = ? AND company_id = ?
      `).run(totals.grand_total, sale_date, customer_id, companyId);
    }

    // ── 11. Credit record for unpaid invoices — stamped with company_id ──────
    if (payment_status.toLowerCase() === 'unpaid' && customer_id) {
      const finalDueDate = due_date || new Date(
        new Date(sale_date).getTime() + 30 * 24 * 60 * 60 * 1000
      ).toISOString().split('T')[0];
      // Link to the sale row so settling this credit can flip the sale back to 'paid'
      // (see credits.js PUT /:id/pay). createdSaleIds[0] is the only row for the
      // common single-item case; for multi-item sales all rows share invoice_id.
      const creditSaleId = createdSaleIds.length > 0 ? createdSaleIds[0] : null;
      db.prepare(`
        INSERT INTO credits (customer_id, sale_id, total_amount, paid_amount, due_date, status, notes, company_id)
        VALUES (?, ?, ?, 0, ?, 'pending', ?, ?)
      `).run(customer_id, creditSaleId, totals.grand_total, finalDueDate, `Credit for invoice ${finalInvoiceNumber}`, companyId);
    }

    // ── 12. Snapshot ─────────────────────────────────────────────────────────
    const snapshot = {
      company  : companySetting,
      customer : customer || { name: 'Cash Customer' },
      invoice  : {
        invoice_number  : finalInvoiceNumber,
        invoice_date    : sale_date,
        payment_status  : payment_status.toUpperCase(),
        transaction_type: transactionType,
        place_of_supply : placeOfSupply,
        subtotal        : totals.subtotal,
        taxable_value   : totals.taxable_value,
        cgst            : totals.cgst,
        sgst            : totals.sgst,
        igst            : totals.igst,
        cess            : totals.cess,
        grand_total     : totals.grand_total,
      },
      items: snapshotItems,
    };
    db.prepare('UPDATE invoices SET snapshot = ? WHERE id = ?')
      .run(JSON.stringify(snapshot), invoiceId);

    db.exec('COMMIT');

    // Emit domain event
    eventBusService.emit(companyId, Events.INVOICE_CREATED, invoiceId, {
      invoiceId,
      invoiceNumber: finalInvoiceNumber,
      companyId,
      branchId,
      customerId: customer_id || null,
      customerName: customer ? customer.name : 'Cash Customer',
      grandTotal: totals.grand_total,
      items: snapshotItems,
      timestamp: new Date().toISOString()
    });

    // ── 13. Generate PDF (async, non-blocking) ────────────────────────────────
    let pdfPath = null;
    try {
      pdfPath = await pdfService.generateInvoicePDF(snapshot);
      const db2 = getDb();
      db2.prepare('UPDATE invoices SET pdf_path = ? WHERE id = ?').run(pdfPath, invoiceId);
      db2.close();
    } catch (pdfErr) {
      console.error('PDF generation failed, sale recorded:', pdfErr.message);
    }

    res.status(201).json({
      id             : invoiceId,
      invoice_number : finalInvoiceNumber,
      pdf_path       : pdfPath,
      transaction_type: transactionType,
      totals,
    });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally {
    db.close();
  }
});

// POST create bulk sale (alias for root)
router.post('/bulk', async (req, res, next) => {
  req.url = '/';
  return router.handle(req, res, next);
});

// REMOVED PUT and DELETE temporarily for simplicity as rewriting them for invoices is complex and not requested immediately. I will leave them commented out or skip.
// Let's actually keep them but return 501 Not Implemented, or keep the old ones. The old PUT/DELETE relies on sales table.
// I will just stub them out for now, or just leave the old logic since sales table still exists.
// Actually I'll restore the old PUT and DELETE from backup to avoid breaking existing frontend logic that relies on deleting a sale.

// PUT update sale with reverse + forward cascade — scoped to company
router.put('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const saleId = req.params.id;
    const oldSale = db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(saleId, companyId);

    if (!oldSale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const { product_id, customer_id, employee_id, quantity, revenue, sale_date, payment_status = 'paid', invoice_number, due_date } = req.body;

    if (!product_id || !quantity || !revenue || !sale_date) {
      return res.status(400).json({ error: 'Missing required sale parameters' });
    }

    // Calculate available stock (restore old quantity first, then check)
    const inv = db.prepare('SELECT stock_quantity FROM inventory WHERE product_id = ? AND company_id = ?').get(product_id, companyId);
    if (!inv) {
      return res.status(400).json({ error: 'Product inventory record not found' });
    }
    let availableStock = inv.stock_quantity;
    // If same product, add back old quantity to available pool
    if (Number(product_id) === oldSale.product_id) {
      availableStock += oldSale.quantity;
    }
    if (availableStock < quantity) {
      return res.status(400).json({ error: `Insufficient stock. Available: ${availableStock}` });
    }

    db.exec('BEGIN TRANSACTION');

    // --- REVERSE old sale side-effects ---

    // 1. Restore old inventory
    db.prepare('UPDATE inventory SET stock_quantity = stock_quantity + ? WHERE product_id = ? AND company_id = ?')
      .run(oldSale.quantity, oldSale.product_id, companyId);

    // 2. Reverse old customer purchase totals
    if (oldSale.customer_id) {
      db.prepare('UPDATE customers SET total_purchases = MAX(0, total_purchases - ?) WHERE id = ? AND company_id = ?')
        .run(oldSale.revenue, oldSale.customer_id, companyId);
    }

    // 3. Reverse old employee revenue
    if (oldSale.employee_id) {
      db.prepare('UPDATE employees SET revenue_generated = MAX(0, revenue_generated - ?) WHERE id = ? AND company_id = ?')
        .run(oldSale.revenue, oldSale.employee_id, companyId);
    }

    // 4. Delete old linked credits
    db.prepare('DELETE FROM credits WHERE sale_id = ?').run(saleId);

    // --- APPLY new sale values ---

    const finalInvoiceNumber = invoice_number || oldSale.invoice_number;

    // 5. Update sale record
    db.prepare(`
      UPDATE sales
      SET product_id = ?, customer_id = ?, employee_id = ?, quantity = ?, revenue = ?,
          sale_date = ?, payment_status = ?, invoice_number = ?
      WHERE id = ?
    `).run(product_id, customer_id || null, employee_id || null, quantity, revenue,
           sale_date, payment_status, finalInvoiceNumber, saleId);

    // 6. Decrement new inventory — scoped to company
    db.prepare('UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE product_id = ? AND company_id = ?')
      .run(quantity, product_id, companyId);

    // 7. Update new customer purchase totals
    if (customer_id) {
      db.prepare(`
        UPDATE customers
        SET total_purchases = total_purchases + ?,
            last_purchase_date = ?
        WHERE id = ? AND company_id = ?
      `).run(revenue, sale_date, customer_id, companyId);
    }

    // 8. Update new employee revenue
    if (employee_id) {
      db.prepare('UPDATE employees SET revenue_generated = revenue_generated + ? WHERE id = ? AND company_id = ?')
        .run(revenue, employee_id, companyId);
    }

    // 9. If unpaid, create new credit record — stamped with company_id
    if (payment_status === 'unpaid' && customer_id) {
      const finalDueDate = due_date || new Date(new Date(sale_date).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO credits (customer_id, sale_id, total_amount, paid_amount, due_date, status, notes, company_id)
        VALUES (?, ?, ?, 0, ?, 'pending', ?, ?)
      `).run(customer_id, saleId, revenue, finalDueDate, `Credit for invoice ${finalInvoiceNumber}`, companyId);
    }

    db.exec('COMMIT');
    res.json({ message: 'Sale updated successfully', id: saleId, invoice_number: finalInvoiceNumber });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally {
    db.close();
  }
});

// DELETE sale with reverse cascade — scoped to company
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const saleId = req.params.id;
    const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(saleId, companyId);

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    db.exec('BEGIN TRANSACTION');

    // 1. Restore inventory quantity — scoped to company
    db.prepare('UPDATE inventory SET stock_quantity = stock_quantity + ? WHERE product_id = ? AND company_id = ?')
      .run(sale.quantity, sale.product_id, companyId);

    // 2. Reduce Customer purchase totals
    if (sale.customer_id) {
      db.prepare('UPDATE customers SET total_purchases = MAX(0, total_purchases - ?) WHERE id = ? AND company_id = ?')
        .run(sale.revenue, sale.customer_id, companyId);
    }

    // 3. Reduce Employee generated revenue
    if (sale.employee_id) {
      db.prepare('UPDATE employees SET revenue_generated = MAX(0, revenue_generated - ?) WHERE id = ? AND company_id = ?')
        .run(sale.revenue, sale.employee_id, companyId);
    }

    // 4. Delete linked credit record
    db.prepare('DELETE FROM credits WHERE sale_id = ? AND company_id = ?').run(saleId, companyId);

    // 5. Delete sale record — scoped to company
    db.prepare('DELETE FROM sales WHERE id = ? AND company_id = ?').run(saleId, companyId);

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

