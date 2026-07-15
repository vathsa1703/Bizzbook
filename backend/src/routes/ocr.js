const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { extractTextFromImage } = require('../services/ocrService');
const { parseOCR } = require('../services/aiService');
const { getDb } = require('../config/db');

const upload = multer({ dest: path.join(__dirname, '../../uploads/') });

// Ensure uploads dir exists
if (!fs.existsSync(path.join(__dirname, '../../uploads/'))) {
  fs.mkdirSync(path.join(__dirname, '../../uploads/'), { recursive: true });
}

/**
 * Match parsed products to database products.
 */
function matchProducts(parsedItems, companyId) {
  const db = getDb();
  try {
    const products = db.prepare('SELECT id, name, selling_price, cost_price, group_id FROM products WHERE company_id = ?').all(companyId);

    return parsedItems.map(item => {
      if (!item.product_name) return { ...item, is_matched: false };

      const searchName = item.product_name.toLowerCase();

      // Exact or substring match
      const match = products.find(p => p.name.toLowerCase() === searchName || p.name.toLowerCase().includes(searchName) || searchName.includes(p.name.toLowerCase()));

      if (match) {
        return {
          ...item,
          product_id: match.id,
          matched_name: match.name,
          group_id: match.group_id,
          is_matched: true,
          // Override price if zero or use detected
          price: item.price || match.selling_price
        };
      } else {
        return {
          ...item,
          is_matched: false
        };
      }
    });
  } finally {
    db.close();
  }
}

router.post('/:type', upload.single('image'), async (req, res, next) => {
  try {
    console.log('OCR request received for type:', req.params.type);
    const { type } = req.params; // 'sales' or 'stock'
    if (!['sales', 'stock'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid type. Use sales or stock.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image provided.' });
    }

    const imagePath = req.file.path;

    // 1. OCR Extraction
    const rawText = await extractTextFromImage(imagePath);

    // 2. AI Parsing
    const parsedData = await parseOCR(rawText, type);

    // 3. Product Matching
    if (parsedData.items && Array.isArray(parsedData.items)) {
      parsedData.items = matchProducts(parsedData.items, req.user.companyId);
    } else {
      parsedData.items = [];
    }

    // Cleanup uploaded file
    fs.unlink(imagePath, () => {});

    res.json({ success: true, data: parsedData });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
});

module.exports = router;
