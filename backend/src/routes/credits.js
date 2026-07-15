const express = require('express');
const { getDb } = require('../config/db');

const router = express.Router();

// GET credit summary KPIs — scoped to company
router.get('/summary', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const summary = db.prepare(`
      SELECT 
        COALESCE(SUM(total_amount - paid_amount), 0) as outstanding_amount,
        COALESCE(SUM(paid_amount), 0) as paid_amount,
        COUNT(CASE WHEN due_date < date('now') AND status != 'paid' THEN 1 END) as overdue_count
      FROM credits
      WHERE company_id = ?
    `).get(companyId);

    res.json(summary);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// GET all credits — scoped to company
router.get('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const status = req.query.status || '';
    const search = req.query.search || '';

    let query = `
      SELECT cr.*, c.name as customer_name, s.invoice_number
      FROM credits cr
      LEFT JOIN customers c ON cr.customer_id = c.id
      LEFT JOIN sales s ON cr.sale_id = s.id
      WHERE cr.company_id = ?
    `;
    const params = [companyId];

    if (status) {
      if (status === 'overdue') {
        query += ` AND cr.due_date < date('now') AND cr.status != 'paid'`;
      } else {
        query += ` AND cr.status = ?`;
        params.push(status);
      }
    }
    if (search) {
      query += ` AND c.name LIKE ?`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY cr.due_date ASC, cr.id DESC`;

    const credits = db.prepare(query).all(...params);
    res.json(credits);
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// POST create credit — stamped with company_id
router.post('/', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { customer_id, sale_id, total_amount, paid_amount = 0, due_date, notes } = req.body;

    if (!customer_id || total_amount === undefined || !due_date) {
      return res.status(400).json({ error: 'Missing required credit fields' });
    }

    const status = paid_amount >= total_amount ? 'paid' : 'pending';

    const resInsert = db.prepare(`
      INSERT INTO credits (customer_id, sale_id, total_amount, paid_amount, due_date, status, notes, company_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(customer_id, sale_id || null, total_amount, paid_amount, due_date, status, notes || null, companyId);

    res.status(201).json({ id: resInsert.lastInsertRowid, customer_id, total_amount, paid_amount, due_date, status });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// PUT pay credit (supports partial payment) — scoped to company
router.put('/:id/pay', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { amount } = req.body;
    const creditId = req.params.id;

    if (amount === undefined || amount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required' });
    }

    const credit = db.prepare('SELECT * FROM credits WHERE id = ? AND company_id = ?').get(creditId, companyId);
    if (!credit) {
      return res.status(404).json({ error: 'Credit record not found' });
    }

    const newPaidAmount = Math.min(credit.total_amount, credit.paid_amount + amount);
    const newStatus = newPaidAmount >= credit.total_amount ? 'paid' : 'pending';

    db.exec('BEGIN TRANSACTION');

    db.prepare(`
      UPDATE credits
      SET paid_amount = ?,
          status = ?
      WHERE id = ? AND company_id = ?
    `).run(newPaidAmount, newStatus, creditId, companyId);

    // If this is linked to a sale, update sale payment status to 'paid' if fully paid.
    // Update every sales row on the same invoice (not just credit.sale_id) so
    // multi-item sales are flipped consistently.
    if (credit.sale_id && newStatus === 'paid') {
      const linkedSale = db.prepare('SELECT invoice_id FROM sales WHERE id = ? AND company_id = ?').get(credit.sale_id, companyId);
      if (linkedSale && linkedSale.invoice_id) {
        db.prepare("UPDATE sales SET payment_status = 'paid' WHERE invoice_id = ? AND company_id = ?")
          .run(linkedSale.invoice_id, companyId);
      } else {
        db.prepare("UPDATE sales SET payment_status = 'paid' WHERE id = ? AND company_id = ?").run(credit.sale_id, companyId);
      }
    }

    db.exec('COMMIT');
    res.json({ message: 'Payment recorded successfully', outstanding: credit.total_amount - newPaidAmount, status: newStatus });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    next(err);
  } finally {
    db.close();
  }
});

// PUT update credit fields — scoped to company
router.put('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const { total_amount, paid_amount, due_date, notes, status } = req.body;
    const creditId = req.params.id;

    const existing = db.prepare('SELECT * FROM credits WHERE id = ? AND company_id = ?').get(creditId, companyId);
    if (!existing) {
      return res.status(404).json({ error: 'Credit record not found' });
    }

    const newPaid = paid_amount !== undefined ? paid_amount : existing.paid_amount;
    const newTotal = total_amount !== undefined ? total_amount : existing.total_amount;
    const finalStatus = status || (newPaid >= newTotal ? 'paid' : 'pending');

    db.prepare(`
      UPDATE credits
      SET total_amount = ?,
          paid_amount = ?,
          due_date = COALESCE(?, due_date),
          notes = COALESCE(?, notes),
          status = ?
      WHERE id = ? AND company_id = ?
    `).run(newTotal, newPaid, due_date ?? null, notes ?? null, finalStatus, creditId, companyId);

    res.json({ message: 'Credit record updated successfully' });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// DELETE credit — scoped to company
router.delete('/:id', (req, res, next) => {
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const resDelete = db.prepare('DELETE FROM credits WHERE id = ? AND company_id = ?').run(req.params.id, companyId);
    if (resDelete.changes === 0) {
      return res.status(404).json({ error: 'Credit record not found' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
