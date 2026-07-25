const express = require('express');
const { dbGet, dbAll } = require('../config/dbEngine');
const router = express.Router();

// True for a duplicate-primary-key/unique-constraint violation on either
// engine: Postgres raises SQLSTATE 23505 with a "duplicate key value..."
// message; SQLite's node:sqlite driver raises "UNIQUE constraint failed"
// (hsn_code is a PRIMARY KEY, not a separately named UNIQUE constraint, but
// both engines treat a PK violation the same way as a unique violation).
function isDuplicateKeyError(e) {
  return e.code === '23505' || (e.message && e.message.includes('UNIQUE constraint failed'));
}

// ─── GET /api/gst-master/hsn ──────────────────────────────────────────────────
router.get('/hsn', async (req, res, next) => {
  try {
    const { search = '', active_only = 'false' } = req.query;
    let query = 'SELECT * FROM gst_hsn_master';
    const params = [];
    const conditions = [];

    if (active_only === 'true') {
      // is_active bound as a parameter, not a literal 1 -- BOOLEAN on
      // Postgres rejects a literal integer compared this way.
      conditions.push('is_active = ?');
      params.push(1);
    }

    if (search.trim()) {
      conditions.push('(hsn_code LIKE ? OR description LIKE ?)');
      const like = `%${search.trim()}%`;
      params.push(like, like);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY hsn_code ASC';

    const records = await dbAll(query, params);
    res.json(records);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/gst-master/hsn/:hsn_code ─────────────────────────────────────────
router.get('/hsn/:hsn_code', async (req, res, next) => {
  try {
    const record = await dbGet('SELECT * FROM gst_hsn_master WHERE hsn_code = ?', [req.params.hsn_code]);
    if (!record) return res.status(404).json({ error: 'HSN code not found' });
    res.json(record);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/gst-master/hsn ─────────────────────────────────────────────────
router.post('/hsn', async (req, res, next) => {
  try {
    const { hsn_code, description, gst_rate, uqc, cess_rate, is_active } = req.body;

    if (!hsn_code || !/^(\d{4}|\d{6}|\d{8})$/.test(hsn_code)) {
      return res.status(400).json({ error: 'HSN code must be exactly 4, 6, or 8 digits' });
    }

    const rate = Number(gst_rate) || 0;
    if (![0, 5, 12, 18, 28].includes(rate)) {
      return res.status(400).json({ error: 'Invalid GST rate. Allowed slabs: 0, 5, 12, 18, 28' });
    }

    const cess = Number(cess_rate) || 0;
    if (cess < 0) {
      return res.status(400).json({ error: 'CESS rate cannot be negative' });
    }

    const active = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    try {
      await dbGet(`
        INSERT INTO gst_hsn_master (hsn_code, description, gst_rate, uqc, cess_rate, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [hsn_code, description || '', rate, uqc || 'NOS', cess, active]);

      const record = await dbGet('SELECT * FROM gst_hsn_master WHERE hsn_code = ?', [hsn_code]);
      res.status(201).json(record);
    } catch (e) {
      if (isDuplicateKeyError(e)) {
        return res.status(409).json({ error: 'HSN code already exists' });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/gst-master/hsn/:hsn_code ─────────────────────────────────────────
router.put('/hsn/:hsn_code', async (req, res, next) => {
  try {
    const hsnCode = req.params.hsn_code;
    const existing = await dbGet('SELECT * FROM gst_hsn_master WHERE hsn_code = ?', [hsnCode]);
    if (!existing) return res.status(404).json({ error: 'HSN code not found' });

    const {
      description = existing.description,
      gst_rate = existing.gst_rate,
      uqc = existing.uqc,
      cess_rate = existing.cess_rate,
      is_active = existing.is_active
    } = req.body;

    const rate = Number(gst_rate);
    if (![0, 5, 12, 18, 28].includes(rate)) {
      return res.status(400).json({ error: 'Invalid GST rate. Allowed slabs: 0, 5, 12, 18, 28' });
    }

    const cess = Number(cess_rate);
    if (cess < 0) {
      return res.status(400).json({ error: 'CESS rate cannot be negative' });
    }

    const active = is_active ? 1 : 0;

    await dbGet(`
      UPDATE gst_hsn_master
      SET description = ?, gst_rate = ?, uqc = ?, cess_rate = ?, is_active = ?
      WHERE hsn_code = ?
    `, [description, rate, uqc, cess, active, hsnCode]);

    const record = await dbGet('SELECT * FROM gst_hsn_master WHERE hsn_code = ?', [hsnCode]);
    res.json(record);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/gst-master/hsn/:hsn_code ──────────────────────────────────────
router.delete('/hsn/:hsn_code', async (req, res, next) => {
  try {
    const hsnCode = req.params.hsn_code;
    const existing = await dbGet('SELECT * FROM gst_hsn_master WHERE hsn_code = ?', [hsnCode]);
    if (!existing) return res.status(404).json({ error: 'HSN code not found' });

    // Check if referenced by products
    const refCount = await dbGet('SELECT COUNT(*) as cnt FROM products WHERE hsn_code = ?', [hsnCode]);
    if (Number(refCount.cnt) > 0) {
      return res.status(400).json({
        error: `Cannot delete HSN code because it is used by ${refCount.cnt} product(s). Please deactivate it instead.`
      });
    }

    await dbGet('DELETE FROM gst_hsn_master WHERE hsn_code = ?', [hsnCode]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/gst-master/uqc ───────────────────────────────────────────────────
router.get('/uqc', async (req, res, next) => {
  try {
    const records = await dbAll('SELECT * FROM gst_uqc_master ORDER BY code ASC', []);
    res.json(records);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
