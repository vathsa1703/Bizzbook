const { getDb } = require('./src/config/db');
const db = getDb();

const migrations = [
  `CREATE TABLE IF NOT EXISTS marketing_campaign_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )`,
  'ALTER TABLE marketing_campaigns ADD COLUMN campaign_snapshot TEXT',
  'ALTER TABLE marketing_campaigns ADD COLUMN customers_targeted INTEGER DEFAULT 0',
  'ALTER TABLE marketing_campaigns ADD COLUMN customers_converted INTEGER DEFAULT 0'
];

migrations.forEach(sql => {
  try { db.prepare(sql).run(); console.log('OK:', sql.substring(0, 60)); }
  catch(e) { console.log('SKIP:', e.message); }
});

db.close();
console.log('Migration step 1 complete.');
