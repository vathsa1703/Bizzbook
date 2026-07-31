const express = require('express');
const { dbGet, dbAll } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');

const router = express.Router();

// GET credit summary KPIs — scoped to company
router.get('/summary', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const today = 'CURRENT_DATE';
    const summary = await dbGet(`
      SELECT
        COALESCE(SUM(total_amount - paid_amount), 0) as outstanding_amount,
        COALESCE(SUM(paid_amount), 0) as paid_amount,
        COUNT(CASE WHEN due_date < ${today} AND status != 'paid' THEN 1 END) as overdue_count
      FROM credits
      WHERE company_id = ?
    `, [companyId]);

    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// GET all credits — scoped to company
router.get('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const status = req.query.status || '';
    const search = req.query.search || '';
    const today = 'CURRENT_DATE';

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
        query += ` AND cr.due_date < ${today} AND cr.status != 'paid'`;
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

    const credits = await dbAll(query, params);
    res.json(credits);
  } catch (err) {
    next(err);
  }
});

// POST create credit — stamped with company_id
router.post('/', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { customer_id, sale_id, total_amount, paid_amount = 0, due_date, notes } = req.body;

    if (!customer_id || total_amount === undefined || !due_date) {
      return res.status(400).json({ error: 'Missing required credit fields' });
    }

    const status = paid_amount >= total_amount ? 'paid' : 'pending';

    const row = await dbGet(`
      INSERT INTO credits (customer_id, sale_id, total_amount, paid_amount, due_date, status, notes, company_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `, [customer_id, sale_id || null, total_amount, paid_amount, due_date, status, notes || null, companyId]);

    res.status(201).json({ id: row.id, customer_id, total_amount, paid_amount, due_date, status });
  } catch (err) {
    next(err);
  }
});

// PUT pay credit (supports partial payment) — scoped to company
router.put('/:id/pay', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { amount } = req.body;
    const creditId = req.params.id;

    if (amount === undefined || amount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required' });
    }

    const credit = await dbGet('SELECT * FROM credits WHERE id = ? AND company_id = ?', [creditId, companyId]);
    if (!credit) {
      return res.status(404).json({ error: 'Credit record not found' });
    }

    const newPaidAmount = Math.min(credit.total_amount, credit.paid_amount + amount);
    const newStatus = newPaidAmount >= credit.total_amount ? 'paid' : 'pending';

    await withTransaction(async (tx) => {
      await tx.query(`
        UPDATE credits
        SET paid_amount = ?,
            status = ?
        WHERE id = ? AND company_id = ?
      `, [newPaidAmount, newStatus, creditId, companyId]);

      // If this is linked to a sale, update sale payment status to 'paid' if fully paid.
      // Update every sales row on the same invoice (not just credit.sale_id) so
      // multi-item sales are flipped consistently. tx.query/tx.getOne stay on
      // the same pinned client as the credits UPDATE above -- no pool-level
      // helper is called here, so nothing can silently escape this transaction
      // (see companySettings.js's fix for the bug class this guards against).
      if (credit.sale_id && newStatus === 'paid') {
        const linkedSale = await tx.getOne('SELECT invoice_id FROM sales WHERE id = ? AND company_id = ?', [credit.sale_id, companyId]);
        if (linkedSale && linkedSale.invoice_id) {
          await tx.query("UPDATE sales SET payment_status = 'paid' WHERE invoice_id = ? AND company_id = ?", [linkedSale.invoice_id, companyId]);
        } else {
          await tx.query("UPDATE sales SET payment_status = 'paid' WHERE id = ? AND company_id = ?", [credit.sale_id, companyId]);
        }
      }
    });

    res.json({ message: 'Payment recorded successfully', outstanding: credit.total_amount - newPaidAmount, status: newStatus });
  } catch (err) {
    next(err);
  }
});

// PUT update credit fields — scoped to company
router.put('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const { total_amount, paid_amount, due_date, notes, status } = req.body;
    const creditId = req.params.id;

    const existing = await dbGet('SELECT * FROM credits WHERE id = ? AND company_id = ?', [creditId, companyId]);
    if (!existing) {
      return res.status(404).json({ error: 'Credit record not found' });
    }

    const newPaid = paid_amount !== undefined ? paid_amount : existing.paid_amount;
    const newTotal = total_amount !== undefined ? total_amount : existing.total_amount;
    const finalStatus = status || (newPaid >= newTotal ? 'paid' : 'pending');

    await dbGet(`
      UPDATE credits
      SET total_amount = ?,
          paid_amount = ?,
          due_date = COALESCE(?, due_date),
          notes = COALESCE(?, notes),
          status = ?
      WHERE id = ? AND company_id = ?
    `, [newTotal, newPaid, due_date ?? null, notes ?? null, finalStatus, creditId, companyId]);

    res.json({ message: 'Credit record updated successfully' });
  } catch (err) {
    next(err);
  }
});

// DELETE credit — scoped to company
router.delete('/:id', async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    const existing = await dbGet('SELECT id FROM credits WHERE id = ? AND company_id = ?', [req.params.id, companyId]);
    if (!existing) {
      return res.status(404).json({ error: 'Credit record not found' });
    }
    await dbGet('DELETE FROM credits WHERE id = ? AND company_id = ?', [req.params.id, companyId]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
