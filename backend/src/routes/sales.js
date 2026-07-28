const express = require('express');
const { getDb } = require('../config/db');
const gstEngine = require('../services/gstEngine');
const pdfService = require('../services/pdfService');
const eventBusService = require('../services/EventBusService');
const { Events } = require('../constants/events');
const { withBranchScope } = require('../utils/BranchScopedQuery');
const { dbGet, dbAll, engine, isOn } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

const router = express.Router();

// SQLite's UNIQUE constraint error message vs Postgres's error code (23505 =
// unique_violation) for the invoice_number collision-retry loop below.
function isUniqueViolation(err) {
  if (err && err.code === '23505') return true; // Postgres
  return !!(err && err.message && err.message.includes('UNIQUE constraint failed') && err.message.includes('invoice_number'));
}

// GET all sales with pagination & filters — scoped to company
router.get('/', async (req, res, next) => {
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

      const countRow = await dbGet(`SELECT COUNT(*) as total FROM (${scoped.sql}) sub`, scoped.params);
      const total = countRow.total;
      const totalPages = Math.max(1, Math.ceil(total / limit));

      const pagedSql = scoped.sql + orderClause + ` LIMIT ? OFFSET ?`;
      const sales = await dbAll(pagedSql, [...scoped.params, limit, offset]);

      return res.json({
        data: sales,
        pagination: { page, limit, total, totalPages },
      });
    }

    const sales = await dbAll(scoped.sql + orderClause, scoped.params);
    res.json(sales);
  } catch (err) {
    next(err);
  }
});

// POST create sale — auto-calculates all GST via gstEngine, stamped with company_id
router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    // Normalise: support legacy single-product body and multi-item body
    const items = req.body.items || [{
      product_id : req.body.product_id,
      quantity   : req.body.quantity,
      revenue    : req.body.revenue,
    }];

    let branchId = null;
    if (req.scopeContext.type === 'branch') {
      branchId = req.scopeContext.branchId;
    } else if (req.scopeContext.type === 'global') {
      // OWNER with no X-Branch-ID header. Only acceptable while the company has
      // no branches configured at all (single-store default, stays branchless);
      // once branches exist, the frontend's branch selector supplies the header.
      const hasBranches = await dbGet('SELECT 1 FROM branches WHERE company_id = ?', [companyId]);
      if (hasBranches) {
        return res.status(400).json({ error: 'This company has multiple branches configured. Please select a branch before creating a sale.' });
      }
    } else {
      // 'multi-branch' scope (non-owner without an explicit header)
      branchId = req.scopeContext.allowedBranches[0] || null;
      if (!branchId) {
        return res.status(400).json({ error: 'No branch assigned to this user.' });
      }
    }

    const { customer_id, employee_id, sale_date, payment_status = 'PAID', due_date } = req.body;

    if (!items.length || !sale_date) {
      return res.status(400).json({ error: 'Missing required sale parameters or items' });
    }

    // ── 1. Validate inventory stock — scoped to company ──────────────────────
    for (const item of items) {
      const inv = await dbGet('SELECT stock_quantity FROM inventory WHERE product_id = ? AND company_id = ?', [item.product_id, companyId]);
      if (!inv || inv.stock_quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for product ID ${item.product_id}` });
      }
    }

    // ── 2. Read company state & GST mode — scoped to company ─────────────────
    // Canonical source: companies + company_gst_settings (company_settings is deprecated).
    const companySetting = await gstEngine.getCompanyGstProfileAsync(companyId);
    const isGstRegistered = isOn(companySetting.is_gst_registered); // treat NULL / 1 / true as true
    const isInclusive = isOn(companySetting.inclusive_pricing);
    const companyStateCode = companySetting.state_code;

    // ── 3. Read customer state — verify belongs to company ───────────────────
    const customer = customer_id
      ? await dbGet('SELECT * FROM customers WHERE id = ? AND company_id = ?', [customer_id, companyId])
      : null;
    const customerStateCode = customer
      ? gstEngine.resolveStateCode(customer.state_code || customer.state)
      : null;

    // ── 4. Enrich items with product GST data ────────────────────────────────
    const enrichedItems = await gstEngine.enrichItemsAsync(items);

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
      const maxInv    = await dbGet(
        `SELECT MAX(CAST(SUBSTR(invoice_number, LENGTH(invoice_number) - 3) AS INTEGER)) as max_num FROM invoices WHERE invoice_number LIKE ? AND company_id = ?`,
        [`INV-${yearMonth}-%`, companyId]
      );
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

      const validation = gstEngine.validateInvoiceInput(validationPayload);

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
      const maxInv    = await dbGet(
        `SELECT MAX(CAST(SUBSTR(invoice_number, LENGTH(invoice_number) - 3) AS INTEGER)) as max_num FROM invoices WHERE invoice_number LIKE ? AND company_id = ?`,
        [`INV-${yearMonth}-%`, companyId]
      );
      const nextSeq   = (maxInv.max_num || 0) + 1;
      finalInvoiceNumber = `INV-${yearMonth}-${String(nextSeq).padStart(4, '0')}`;
    }

    // ── 8-12. Write phase: invoice + sales + invoice_items + inventory +
    // customer totals + credit + snapshot, all atomic. ────────────────────────
    let invoiceId, snapshot;

    if (engine() === 'postgres') {
      const result = await withTransaction(async (tx) => {
        // invoices.invoice_number carries a DATABASE-WIDE unique constraint (not
        // scoped to company_id), but the number above was generated per-company
        // (MAX+1 within this company's own invoices) — so two different companies'
        // first invoice of a given month can independently compute the same
        // candidate and collide here. Retry with the next sequence number rather
        // than failing the sale; nothing else has been written yet in this
        // transaction, so it's safe to just bump the candidate and re-attempt.
        let invoiceRow;
        let invoiceInsertAttempts = 0;
        const invoiceNumberPrefix = finalInvoiceNumber.slice(0, -4);
        let invoiceSeq = parseInt(finalInvoiceNumber.slice(-4), 10);
        for (;;) {
          try {
            invoiceRow = await tx.getOne(`
              INSERT INTO invoices (
                invoice_number, customer_id, invoice_date, status, payment_status,
                subtotal, taxable_value, cgst, sgst, igst, grand_total, amount,
                place_of_supply, company_id
              ) VALUES (?, ?, ?, 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              RETURNING id
            `, [
              finalInvoiceNumber, customer_id || null, sale_date,
              payment_status.toUpperCase(),
              totals.subtotal, totals.taxable_value,
              totals.cgst, totals.sgst, totals.igst,
              totals.grand_total, totals.grand_total,
              placeOfSupply, companyId
            ]);
            break;
          } catch (insErr) {
            if (!isUniqueViolation(insErr) || invoiceInsertAttempts >= 20) throw insErr;
            invoiceInsertAttempts++;
            invoiceSeq++;
            finalInvoiceNumber = `${invoiceNumberPrefix}${String(invoiceSeq).padStart(4, '0')}`;
          }
        }
        const txInvoiceId = invoiceRow.id;

        const snapshotItems = [];
        const createdSaleIds = [];

        for (let i = 0; i < lines.length; i++) {
          const line     = lines[i];

          const saleRow = await tx.getOne(`
            INSERT INTO sales (
              product_id, customer_id, employee_id, quantity, revenue,
              sale_date, payment_status, invoice_number, invoice_id,
              taxable_value, gst_amount, cgst, sgst, igst, company_id, branch_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `, [
            line.product_id, customer_id || null, employee_id || null,
            line.quantity, line.total,
            sale_date, payment_status.toLowerCase(), finalInvoiceNumber, txInvoiceId,
            line.taxable_value, line.gst_amount || 0, line.cgst, line.sgst, line.igst, companyId, branchId
          ]);
          createdSaleIds.push(saleRow.id);

          await tx.query(`
            INSERT INTO invoice_items (
              invoice_id, product_id, quantity, rate,
              taxable_value, cgst, sgst, igst, total, company_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            txInvoiceId, line.product_id, line.quantity, line.rate,
            line.taxable_value, line.cgst, line.sgst, line.igst, line.total, companyId
          ]);

          await tx.query('UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE product_id = ? AND company_id = ?',
            [line.quantity, line.product_id, companyId]);

          if (employee_id) {
            await tx.query('UPDATE employees SET revenue_generated = revenue_generated + ? WHERE id = ? AND company_id = ?',
              [line.total, employee_id, companyId]);
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

        if (customer_id) {
          await tx.query(`
            UPDATE customers
            SET total_purchases = total_purchases + ?, last_purchase_date = ?
            WHERE id = ? AND company_id = ?
          `, [totals.grand_total, sale_date, customer_id, companyId]);
        }

        if (payment_status.toLowerCase() === 'unpaid' && customer_id) {
          const finalDueDate = due_date || new Date(
            new Date(sale_date).getTime() + 30 * 24 * 60 * 60 * 1000
          ).toISOString().split('T')[0];
          const creditSaleId = createdSaleIds.length > 0 ? createdSaleIds[0] : null;
          await tx.query(`
            INSERT INTO credits (customer_id, sale_id, total_amount, paid_amount, due_date, status, notes, company_id)
            VALUES (?, ?, ?, 0, ?, 'pending', ?, ?)
          `, [customer_id, creditSaleId, totals.grand_total, finalDueDate, `Credit for invoice ${finalInvoiceNumber}`, companyId]);
        }

        const txSnapshot = {
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
        await tx.query('UPDATE invoices SET snapshot = ? WHERE id = ?', [JSON.stringify(txSnapshot), txInvoiceId]);

        return { invoiceId: txInvoiceId, snapshot: txSnapshot };
      });
      invoiceId = result.invoiceId;
      snapshot = result.snapshot;
    } else {
      const db = getDb();
      try {
        db.exec('BEGIN TRANSACTION');

        let invoiceRes;
        let invoiceInsertAttempts = 0;
        const invoiceNumberPrefix = finalInvoiceNumber.slice(0, -4);
        let invoiceSeq = parseInt(finalInvoiceNumber.slice(-4), 10);
        for (;;) {
          try {
            invoiceRes = db.prepare(`
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
            break;
          } catch (insErr) {
            if (!isUniqueViolation(insErr) || invoiceInsertAttempts >= 20) throw insErr;
            invoiceInsertAttempts++;
            invoiceSeq++;
            finalInvoiceNumber = `${invoiceNumberPrefix}${String(invoiceSeq).padStart(4, '0')}`;
          }
        }
        invoiceId = invoiceRes.lastInsertRowid;

        const snapshotItems = [];
        const createdSaleIds = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

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

          db.prepare(`
            INSERT INTO invoice_items (
              invoice_id, product_id, quantity, rate,
              taxable_value, cgst, sgst, igst, total, company_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            invoiceId, line.product_id, line.quantity, line.rate,
            line.taxable_value, line.cgst, line.sgst, line.igst, line.total, companyId
          );

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

        if (customer_id) {
          db.prepare(`
            UPDATE customers
            SET total_purchases = total_purchases + ?, last_purchase_date = ?
            WHERE id = ? AND company_id = ?
          `).run(totals.grand_total, sale_date, customer_id, companyId);
        }

        if (payment_status.toLowerCase() === 'unpaid' && customer_id) {
          const finalDueDate = due_date || new Date(
            new Date(sale_date).getTime() + 30 * 24 * 60 * 60 * 1000
          ).toISOString().split('T')[0];
          const creditSaleId = createdSaleIds.length > 0 ? createdSaleIds[0] : null;
          db.prepare(`
            INSERT INTO credits (customer_id, sale_id, total_amount, paid_amount, due_date, status, notes, company_id)
            VALUES (?, ?, ?, 0, ?, 'pending', ?, ?)
          `).run(customer_id, creditSaleId, totals.grand_total, finalDueDate, `Credit for invoice ${finalInvoiceNumber}`, companyId);
        }

        snapshot = {
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
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw err;
      } finally {
        db.close();
      }
    }

    // Emit domain event
    await eventBusService.emit(companyId, Events.INVOICE_CREATED, invoiceId, {
      invoiceId,
      invoiceNumber: finalInvoiceNumber,
      companyId,
      branchId,
      customerId: customer_id || null,
      customerName: customer ? customer.name : 'Cash Customer',
      grandTotal: totals.grand_total,
      items: snapshot.items,
      timestamp: new Date().toISOString()
    });

    // ── 13. Generate PDF (async, non-blocking) ────────────────────────────────
    let pdfPath = null;
    try {
      pdfPath = await pdfService.generateInvoicePDF(snapshot);
      if (engine() === 'postgres') {
        const { query } = require('../config/pgDb');
        await query('UPDATE invoices SET pdf_path = ? WHERE id = ?', [pdfPath, invoiceId]);
      } else {
        const db2 = getDb();
        db2.prepare('UPDATE invoices SET pdf_path = ? WHERE id = ?').run(pdfPath, invoiceId);
        db2.close();
      }
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
    next(err);
  }
});

// POST create bulk sale (alias for root)
router.post('/bulk', async (req, res, next) => {
  req.url = '/';
  return router.handle(req, res, next);
});

// PUT update sale with reverse + forward cascade — scoped to company
router.put('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const saleId = req.params.id;
    const oldSale = await dbGet('SELECT * FROM sales WHERE id = ? AND company_id = ?', [saleId, companyId]);

    if (!oldSale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const { product_id, customer_id, employee_id, quantity, revenue, sale_date, payment_status = 'paid', invoice_number, due_date } = req.body;

    if (!product_id || !quantity || !revenue || !sale_date) {
      return res.status(400).json({ error: 'Missing required sale parameters' });
    }

    // Calculate available stock (restore old quantity first, then check)
    const inv = await dbGet('SELECT stock_quantity FROM inventory WHERE product_id = ? AND company_id = ?', [product_id, companyId]);
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

    const finalInvoiceNumber = invoice_number || oldSale.invoice_number;

    if (engine() === 'postgres') {
      await withTransaction(async (tx) => {
        // --- REVERSE old sale side-effects ---
        await tx.query('UPDATE inventory SET stock_quantity = stock_quantity + ? WHERE product_id = ? AND company_id = ?',
          [oldSale.quantity, oldSale.product_id, companyId]);

        if (oldSale.customer_id) {
          await tx.query('UPDATE customers SET total_purchases = GREATEST(0, total_purchases - ?) WHERE id = ? AND company_id = ?',
            [oldSale.revenue, oldSale.customer_id, companyId]);
        }
        if (oldSale.employee_id) {
          await tx.query('UPDATE employees SET revenue_generated = GREATEST(0, revenue_generated - ?) WHERE id = ? AND company_id = ?',
            [oldSale.revenue, oldSale.employee_id, companyId]);
        }
        await tx.query('DELETE FROM credits WHERE sale_id = ?', [saleId]);

        // --- APPLY new sale values ---
        await tx.query(`
          UPDATE sales
          SET product_id = ?, customer_id = ?, employee_id = ?, quantity = ?, revenue = ?,
              sale_date = ?, payment_status = ?, invoice_number = ?
          WHERE id = ?
        `, [product_id, customer_id || null, employee_id || null, quantity, revenue,
            sale_date, payment_status, finalInvoiceNumber, saleId]);

        await tx.query('UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE product_id = ? AND company_id = ?',
          [quantity, product_id, companyId]);

        if (customer_id) {
          await tx.query(`
            UPDATE customers
            SET total_purchases = total_purchases + ?,
                last_purchase_date = ?
            WHERE id = ? AND company_id = ?
          `, [revenue, sale_date, customer_id, companyId]);
        }

        if (employee_id) {
          await tx.query('UPDATE employees SET revenue_generated = revenue_generated + ? WHERE id = ? AND company_id = ?',
            [revenue, employee_id, companyId]);
        }

        if (payment_status === 'unpaid' && customer_id) {
          const finalDueDate = due_date || new Date(new Date(sale_date).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          await tx.query(`
            INSERT INTO credits (customer_id, sale_id, total_amount, paid_amount, due_date, status, notes, company_id)
            VALUES (?, ?, ?, 0, ?, 'pending', ?, ?)
          `, [customer_id, saleId, revenue, finalDueDate, `Credit for invoice ${finalInvoiceNumber}`, companyId]);
        }
      });
    } else {
      const db = getDb();
      try {
        db.exec('BEGIN TRANSACTION');

        // --- REVERSE old sale side-effects ---
        db.prepare('UPDATE inventory SET stock_quantity = stock_quantity + ? WHERE product_id = ? AND company_id = ?')
          .run(oldSale.quantity, oldSale.product_id, companyId);

        if (oldSale.customer_id) {
          db.prepare('UPDATE customers SET total_purchases = MAX(0, total_purchases - ?) WHERE id = ? AND company_id = ?')
            .run(oldSale.revenue, oldSale.customer_id, companyId);
        }
        if (oldSale.employee_id) {
          db.prepare('UPDATE employees SET revenue_generated = MAX(0, revenue_generated - ?) WHERE id = ? AND company_id = ?')
            .run(oldSale.revenue, oldSale.employee_id, companyId);
        }
        db.prepare('DELETE FROM credits WHERE sale_id = ?').run(saleId);

        // --- APPLY new sale values ---
        db.prepare(`
          UPDATE sales
          SET product_id = ?, customer_id = ?, employee_id = ?, quantity = ?, revenue = ?,
              sale_date = ?, payment_status = ?, invoice_number = ?
          WHERE id = ?
        `).run(product_id, customer_id || null, employee_id || null, quantity, revenue,
               sale_date, payment_status, finalInvoiceNumber, saleId);

        db.prepare('UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE product_id = ? AND company_id = ?')
          .run(quantity, product_id, companyId);

        if (customer_id) {
          db.prepare(`
            UPDATE customers
            SET total_purchases = total_purchases + ?,
                last_purchase_date = ?
            WHERE id = ? AND company_id = ?
          `).run(revenue, sale_date, customer_id, companyId);
        }

        if (employee_id) {
          db.prepare('UPDATE employees SET revenue_generated = revenue_generated + ? WHERE id = ? AND company_id = ?')
            .run(revenue, employee_id, companyId);
        }

        if (payment_status === 'unpaid' && customer_id) {
          const finalDueDate = due_date || new Date(new Date(sale_date).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          db.prepare(`
            INSERT INTO credits (customer_id, sale_id, total_amount, paid_amount, due_date, status, notes, company_id)
            VALUES (?, ?, ?, 0, ?, 'pending', ?, ?)
          `).run(customer_id, saleId, revenue, finalDueDate, `Credit for invoice ${finalInvoiceNumber}`, companyId);
        }

        db.exec('COMMIT');
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw err;
      } finally {
        db.close();
      }
    }

    res.json({ message: 'Sale updated successfully', id: saleId, invoice_number: finalInvoiceNumber });
  } catch (err) {
    next(err);
  }
});

// DELETE sale with reverse cascade — scoped to company
router.delete('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const saleId = req.params.id;
    const sale = await dbGet('SELECT * FROM sales WHERE id = ? AND company_id = ?', [saleId, companyId]);

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (engine() === 'postgres') {
      await withTransaction(async (tx) => {
        await tx.query('UPDATE inventory SET stock_quantity = stock_quantity + ? WHERE product_id = ? AND company_id = ?',
          [sale.quantity, sale.product_id, companyId]);

        if (sale.customer_id) {
          await tx.query('UPDATE customers SET total_purchases = GREATEST(0, total_purchases - ?) WHERE id = ? AND company_id = ?',
            [sale.revenue, sale.customer_id, companyId]);
        }
        if (sale.employee_id) {
          await tx.query('UPDATE employees SET revenue_generated = GREATEST(0, revenue_generated - ?) WHERE id = ? AND company_id = ?',
            [sale.revenue, sale.employee_id, companyId]);
        }

        await tx.query('DELETE FROM credits WHERE sale_id = ? AND company_id = ?', [saleId, companyId]);
        await tx.query('DELETE FROM sales WHERE id = ? AND company_id = ?', [saleId, companyId]);
      });
    } else {
      const db = getDb();
      try {
        db.exec('BEGIN TRANSACTION');

        db.prepare('UPDATE inventory SET stock_quantity = stock_quantity + ? WHERE product_id = ? AND company_id = ?')
          .run(sale.quantity, sale.product_id, companyId);

        if (sale.customer_id) {
          db.prepare('UPDATE customers SET total_purchases = MAX(0, total_purchases - ?) WHERE id = ? AND company_id = ?')
            .run(sale.revenue, sale.customer_id, companyId);
        }
        if (sale.employee_id) {
          db.prepare('UPDATE employees SET revenue_generated = MAX(0, revenue_generated - ?) WHERE id = ? AND company_id = ?')
            .run(sale.revenue, sale.employee_id, companyId);
        }

        db.prepare('DELETE FROM credits WHERE sale_id = ? AND company_id = ?').run(saleId, companyId);
        db.prepare('DELETE FROM sales WHERE id = ? AND company_id = ?').run(saleId, companyId);

        db.exec('COMMIT');
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw err;
      } finally {
        db.close();
      }
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
