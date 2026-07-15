const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../data/database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Starting migration for GST Master...');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS gst_hsn_master (
      hsn_code TEXT PRIMARY KEY,
      description TEXT,
      gst_rate REAL DEFAULT 0,
      uqc TEXT DEFAULT 'NOS',
      cess_rate REAL DEFAULT 0,
      is_active BOOLEAN DEFAULT 1
    )
  `);
  console.log('Created gst_hsn_master');

  db.run(`
    CREATE TABLE IF NOT EXISTS gst_uqc_master (
      code TEXT PRIMARY KEY,
      description TEXT
    )
  `);
  console.log('Created gst_uqc_master');

  const uqcs = [
    { code: 'NOS', desc: 'Numbers' },
    { code: 'KGS', desc: 'Kilograms' },
    { code: 'MTR', desc: 'Meters' },
    { code: 'PCS', desc: 'Pieces' },
    { code: 'LTR', desc: 'Liters' },
    { code: 'BOX', desc: 'Boxes' },
    { code: 'DOZ', desc: 'Dozens' },
    { code: 'PAC', desc: 'Packs' },
    { code: 'SET', desc: 'Sets' }
  ];
  
  const stmt = db.prepare('INSERT OR IGNORE INTO gst_uqc_master (code, description) VALUES (?, ?)');
  for (const u of uqcs) {
    stmt.run(u.code, u.desc);
  }
  stmt.finalize();
  console.log('Pre-populated gst_uqc_master');

  const alterTable = (sql, msg) => {
    db.run(sql, (err) => {
      if (err) {
        if (!err.message.includes('duplicate column')) {
          console.error(`Error ${msg}:`, err.message);
        } else {
          console.log(`${msg} (already exists)`);
        }
      } else {
        console.log(`Success: ${msg}`);
      }
    });
  };

  alterTable(`ALTER TABLE products ADD COLUMN use_custom_gst BOOLEAN DEFAULT 0`, 'Added use_custom_gst column');
  alterTable(`ALTER TABLE products ADD COLUMN uqc TEXT`, 'Added uqc column');
  alterTable(`ALTER TABLE products ADD COLUMN cess_rate REAL`, 'Added cess_rate column');

  console.log('Migration commands dispatched.');
});
