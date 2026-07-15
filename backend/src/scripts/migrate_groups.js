const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../data/database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Starting migration to add product_groups...');

db.serialize(() => {
  // 1. Create product_groups table
  db.run(`
    CREATE TABLE IF NOT EXISTS product_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `, (err) => {
    if (err) console.error('Error creating product_groups table:', err.message);
    else console.log('Created product_groups table (if not exists).');
  });

  // 2. Add group_id to products table
  // SQLite ALTER TABLE ADD COLUMN might fail if column already exists, so ignore error gracefully
  db.run(`ALTER TABLE products ADD COLUMN group_id INTEGER REFERENCES product_groups(id);`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding group_id to products:', err.message);
    } else {
      console.log('Added group_id column to products (or it already exists).');
    }
  });

  // 3. Migrate data
  db.all(`SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''`, [], (err, categories) => {
    if (err) {
      console.error('Error fetching distinct categories:', err.message);
      return;
    }

    const migrateCategories = () => {
      // Create Uncategorized group
      db.run(`INSERT OR IGNORE INTO product_groups (name, description) VALUES (?, ?)`, ['Uncategorized', 'Default group for uncategorized products'], function(err) {
        if (err) console.error('Error creating Uncategorized group:', err.message);
        
        // Ensure all products without category go to Uncategorized
        db.run(`UPDATE products SET category = 'Uncategorized' WHERE category IS NULL OR category = ''`);
        
        // Re-fetch categories in case we just updated some to 'Uncategorized'
        db.all(`SELECT DISTINCT category FROM products`, [], (err, allCategories) => {
            if (err) return;
            
            let completed = 0;
            if (allCategories.length === 0) {
                console.log('Migration complete.');
                db.close();
                return;
            }

            allCategories.forEach((cat) => {
              db.run(`INSERT OR IGNORE INTO product_groups (name, description) VALUES (?, ?)`, [cat.category, `Imported category: ${cat.category}`], function(err) {
                if (err) console.error(`Error inserting category ${cat.category}:`, err.message);
                
                // Now link products to this group
                db.run(`
                  UPDATE products 
                  SET group_id = (SELECT id FROM product_groups WHERE name = ?) 
                  WHERE category = ?
                `, [cat.category, cat.category], function(err) {
                  if (err) console.error(`Error updating group_id for ${cat.category}:`, err.message);
                  
                  completed++;
                  if (completed === allCategories.length) {
                    console.log('Migration complete.');
                    db.close();
                  }
                });
              });
            });
        });
      });
    };

    migrateCategories();
  });
});
