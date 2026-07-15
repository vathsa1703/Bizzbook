// inspect_db.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.resolve(__dirname, '../data/business.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to open DB:', err.message);
    process.exit(1);
  }
});

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

(async () => {
  try {
    // List tables and columns
    const tables = await all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
    console.log('Tables:', tables.map(t => t.name));
    for (const t of tables) {
      const cols = await all(`PRAGMA table_info(${t.name});`);
      console.log(`Columns for ${t.name}:`, cols.map(c => c.name));
    }

    // Sample rows
    const salesSample = await all('SELECT * FROM sales ORDER BY id DESC LIMIT 1;');
    console.log('=== SALES SAMPLE ===');
    console.log(salesSample[0] || {});
    const purchaseSample = await all('SELECT * FROM purchases ORDER BY id DESC LIMIT 1;');
    console.log('=== PURCHASE SAMPLE ===');
    console.log(purchaseSample[0] || {});

    // Counts where GST amounts > 0
    const salesGstCount = await all('SELECT COUNT(*) as cnt FROM sales WHERE gst_amount > 0;');
    const purchaseGstCount = await all('SELECT COUNT(*) as cnt FROM purchases WHERE gst_amount > 0;');
    console.log('=== GST COUNTS ===');
    console.log({salesWithGst: salesGstCount[0].cnt, purchasesWithGst: purchaseGstCount[0].cnt});
  } catch (e) {
    console.error('Error:', e);
  } finally {
    db.close();
  }
})();
