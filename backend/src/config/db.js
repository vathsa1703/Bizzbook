const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// DB_PATH is intentionally isolated behind an env var (falling back to the historical
// on-disk location) so the storage location — and, later, the storage engine itself —
// can be swapped from deployment config alone. See docs/postgres-migration-checklist.md
// for what changes when this becomes a Postgres DATABASE_URL instead of a file path.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'business.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');

function addColumnIfNotExists(db, tableName, columnName, columnDef) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const names = cols.map(c => c.name);
    if (!names.includes(columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
      console.log(`[DB] Added ${columnName} to ${tableName}`);
    }
  } catch (e) {
    console.error(`[DB] Failed to check/add column ${columnName} on ${tableName}:`, e.message);
  }
}

function runMigrations(db) {
  // First, ensure the schema_versions table exists so we can track versions
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      description TEXT NOT NULL,
      executed_at TEXT DEFAULT (datetime('now'))
    )
  `);

  function hasVersion(v) {
    const row = db.prepare('SELECT 1 FROM schema_versions WHERE version = ?').get(v);
    return !!row;
  }

  function markVersion(v, desc) {
    db.prepare('INSERT INTO schema_versions (version, description) VALUES (?, ?)').run(v, desc);
  }

  // Version 1: Add GST and HSN fields
  if (!hasVersion(1)) {
    console.log('[DB] Running Migration 1: GST & HSN fields');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'products', 'hsn_code', 'TEXT');
      addColumnIfNotExists(db, 'products', 'gst_rate', 'REAL');
      addColumnIfNotExists(db, 'sales', 'taxable_value', 'REAL');
      addColumnIfNotExists(db, 'sales', 'cgst', 'REAL');
      addColumnIfNotExists(db, 'sales', 'sgst', 'REAL');
      addColumnIfNotExists(db, 'sales', 'igst', 'REAL');
      addColumnIfNotExists(db, 'sales', 'gst_amount', 'REAL');
      addColumnIfNotExists(db, 'purchases', 'taxable_value', 'REAL');
      addColumnIfNotExists(db, 'purchases', 'cgst', 'REAL');
      addColumnIfNotExists(db, 'purchases', 'sgst', 'REAL');
      addColumnIfNotExists(db, 'purchases', 'igst', 'REAL');
      addColumnIfNotExists(db, 'purchases', 'gst_amount', 'REAL');
      addColumnIfNotExists(db, 'purchases', 'itc_amount', 'REAL');
      addColumnIfNotExists(db, 'purchases', 'itc_eligible', 'INTEGER DEFAULT 0');
      addColumnIfNotExists(db, 'customers', 'state', 'TEXT');
      addColumnIfNotExists(db, 'suppliers', 'state', 'TEXT');
      markVersion(1, 'Add GST and HSN fields');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 1 failed:', e.message);
    }
  }

  // Version 2: Add Email and Phone to customers
  if (!hasVersion(2)) {
    console.log('[DB] Running Migration 2: Customer Contact fields');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'customers', 'email', 'TEXT');
      addColumnIfNotExists(db, 'customers', 'phone', 'TEXT');
      markVersion(2, 'Add Email and Phone to customers');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 2 failed:', e.message);
    }
  }

  // Version 3: Invoice System upgrade
  if (!hasVersion(3)) {
    console.log('[DB] Running Migration 3: Invoice System upgrades');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'company_settings', 'company_name', 'TEXT');
      addColumnIfNotExists(db, 'company_settings', 'address', 'TEXT');
      addColumnIfNotExists(db, 'company_settings', 'phone', 'TEXT');
      addColumnIfNotExists(db, 'company_settings', 'email', 'TEXT');
      addColumnIfNotExists(db, 'company_settings', 'logo', 'TEXT');
      
      addColumnIfNotExists(db, 'customers', 'gstin', 'TEXT');
      addColumnIfNotExists(db, 'customers', 'billing_address', 'TEXT');
      
      addColumnIfNotExists(db, 'invoices', 'subtotal', 'REAL DEFAULT 0');
      addColumnIfNotExists(db, 'invoices', 'taxable_value', 'REAL DEFAULT 0');
      addColumnIfNotExists(db, 'invoices', 'cgst', 'REAL DEFAULT 0');
      addColumnIfNotExists(db, 'invoices', 'sgst', 'REAL DEFAULT 0');
      addColumnIfNotExists(db, 'invoices', 'igst', 'REAL DEFAULT 0');
      addColumnIfNotExists(db, 'invoices', 'grand_total', 'REAL DEFAULT 0');
      addColumnIfNotExists(db, 'invoices', 'payment_status', 'TEXT DEFAULT "PAID"');
      addColumnIfNotExists(db, 'invoices', 'pdf_path', 'TEXT');
      addColumnIfNotExists(db, 'invoices', 'snapshot', 'TEXT');

      addColumnIfNotExists(db, 'sales', 'invoice_id', 'INTEGER REFERENCES invoices(id)');

      db.exec(`
        CREATE TABLE IF NOT EXISTS invoice_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id INTEGER NOT NULL REFERENCES invoices(id),
          product_id INTEGER NOT NULL REFERENCES products(id),
          quantity INTEGER NOT NULL,
          rate REAL NOT NULL,
          taxable_value REAL NOT NULL,
          cgst REAL DEFAULT 0,
          sgst REAL DEFAULT 0,
          igst REAL DEFAULT 0,
          total REAL NOT NULL
        )
      `);

      markVersion(3, 'Add advanced invoice features');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 3 failed:', e.message);
    }
  }

  // Version 4: Product Groups
  if (!hasVersion(4)) {
    console.log('[DB] Running Migration 4: Product Groups');
    db.exec('BEGIN TRANSACTION');
    try {
      // product_groups table is already added to schema.sql and will be created by db.exec(schema)
      addColumnIfNotExists(db, 'products', 'group_id', 'INTEGER REFERENCES product_groups(id)');
      
      // Migrate existing categories
      db.exec(`INSERT OR IGNORE INTO product_groups (name, description) VALUES ('Uncategorized', 'Default group for uncategorized products')`);
      db.exec(`UPDATE products SET category = 'Uncategorized' WHERE category IS NULL OR category = ''`);
      
      const categories = db.prepare(`SELECT DISTINCT category FROM products`).all();
      for (const cat of categories) {
        db.prepare(`INSERT OR IGNORE INTO product_groups (name, description) VALUES (?, ?)`).run(cat.category, `Imported category: ${cat.category}`);
        db.prepare(`UPDATE products SET group_id = (SELECT id FROM product_groups WHERE name = ?) WHERE category = ?`).run(cat.category, cat.category);
      }

      markVersion(4, 'Add Product Groups');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 4 failed:', e.message);
    }
  }

  // Version 5: GST Filing Export module columns
  if (!hasVersion(5)) {
    console.log('[DB] Running Migration 5: GST Filing Export fields');
    db.exec('BEGIN TRANSACTION');
    try {
      // Invoices: fields needed for GSTR-1 official filing
      addColumnIfNotExists(db, 'invoices', 'place_of_supply',   'TEXT');           // 2-digit state code snapshot at invoice creation
      addColumnIfNotExists(db, 'invoices', 'reverse_charge',    "TEXT DEFAULT 'N'"); // 'Y' or 'N'
      addColumnIfNotExists(db, 'invoices', 'invoice_type',      "TEXT DEFAULT 'Regular'"); // Regular | SEZ with payment | SEZ without payment | Deemed Export
      addColumnIfNotExists(db, 'invoices', 'ecommerce_gstin',   'TEXT');           // E-commerce operator GSTIN if applicable

      // Products: Unit Quantity Code for HSN summary sheet
      addColumnIfNotExists(db, 'products', 'uqc', "TEXT DEFAULT 'NOS'"); // NOS, KGS, MTR, etc.

      // Customers: explicit state code for POS derivation
      addColumnIfNotExists(db, 'customers', 'state_code', 'TEXT'); // 2-digit GST state code

      // Company Settings: full GST registration details required for filing
      addColumnIfNotExists(db, 'company_settings', 'legal_name',  'TEXT');
      addColumnIfNotExists(db, 'company_settings', 'trade_name',  'TEXT');
      addColumnIfNotExists(db, 'company_settings', 'pan',         'TEXT');
      addColumnIfNotExists(db, 'company_settings', 'state_code',  'TEXT'); // 2-digit code, e.g. "29" for Karnataka
      addColumnIfNotExists(db, 'company_settings', 'pincode',     'TEXT');

      markVersion(5, 'Add GST Filing Export fields');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 5 failed:', e.message);
    }
  }

  // Version 6: Backfill customer state_code from GSTIN
  // For every customer who has a valid 15-char GSTIN but no state_code,
  // derive the 2-digit state code from the first two chars of the GSTIN.
  if (!hasVersion(6)) {
    console.log('[DB] Running Migration 6: Backfill customer state_code from GSTIN');
    db.exec('BEGIN TRANSACTION');
    try {
      const result = db.prepare(`
        UPDATE customers
        SET state_code = SUBSTR(gstin, 1, 2)
        WHERE
          state_code IS NULL
          AND gstin IS NOT NULL
          AND LENGTH(TRIM(gstin)) = 15
          AND TRIM(gstin) != ''
      `).run();
      console.log(`[DB] Migration 6: backfilled state_code for ${result.changes} customer(s)`);
      markVersion(6, 'Backfill customer state_code from GSTIN');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 6 failed:', e.message);
    }
  }

  // Version 7: Add CESS rate column to products
  if (!hasVersion(7)) {
    console.log('[DB] Running Migration 7: products.cess_rate');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'products', 'cess_rate', 'REAL DEFAULT 0');
      markVersion(7, 'Add cess_rate to products');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 7 failed:', e.message);
    }
  }

  // Version 8: Safe GST backfill on existing invoices
  // Conditions for backfill (all must be true):
  //   • customer.state_code is set
  //   • every invoice_item has product.gst_rate set
  //   • every invoice_item has product.hsn_code set
  // Invoices missing any of the above are left unchanged.
  if (!hasVersion(8)) {
    console.log('[DB] Running Migration 8: GST backfill on existing invoices');
    try {
      const engine = (() => {
        try { return require('../services/gstEngine'); }
        catch (_) { return null; }
      })();

      if (!engine) {
        console.warn('[DB] Migration 8 skipped — gstEngine not loadable yet.');
      } else {
        const companySetting = db.prepare(
          'SELECT state_code, state FROM company_settings WHERE id = 1'
        ).get() || {};
        const companyStateCode = engine.resolveStateCode(
          companySetting.state_code || companySetting.state
        );

        if (!companyStateCode) {
          console.warn('[DB] Migration 8 skipped — company state not configured.');
        } else {
          const candidateInvoices = db.prepare(`
            SELECT
              i.id,
              i.invoice_number,
              c.state_code AS customer_state_code,
              c.state      AS customer_state
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            WHERE
              (c.state_code IS NOT NULL AND c.state_code != '')
              AND (
                i.cgst IS NULL OR i.cgst = 0
                OR i.taxable_value IS NULL OR i.taxable_value = 0
              )
          `).all();

          const itemsStmt = db.prepare(`
            SELECT
              ii.id, ii.product_id, ii.quantity, ii.rate,
              p.gst_rate, p.cess_rate, p.hsn_code, p.uqc, p.name AS product_name
            FROM invoice_items ii
            JOIN products p ON ii.product_id = p.id
            WHERE ii.invoice_id = ?
          `);

          let updated = 0;
          let skipped = 0;

          for (const inv of candidateInvoices) {
            const custCode = engine.resolveStateCode(
              inv.customer_state_code || inv.customer_state
            );
            if (!custCode) { skipped++; continue; }

            const items = itemsStmt.all(inv.id);
            if (!items.length) { skipped++; continue; }

            // Only backfill if every item has gst_rate AND hsn_code
            const allComplete = items.every(
              it => it.gst_rate != null && it.hsn_code && String(it.hsn_code).trim()
            );
            if (!allComplete) { skipped++; continue; }

            const { lines, totals } = engine.buildInvoiceTotals({
              items: items.map((it, idx) => ({
                line_index   : idx,
                product_id   : it.product_id,
                product_name : it.product_name,
                quantity     : it.quantity,
                rate         : it.rate,
                gst_rate     : it.gst_rate  || 0,
                cess_rate    : it.cess_rate || 0,
                hsn_code     : it.hsn_code,
                uqc          : it.uqc || 'NOS',
              })),
              companyStateCode : companyStateCode,
              customerStateCode: custCode,
            });

            db.exec('BEGIN TRANSACTION');
            try {
              for (let i = 0; i < lines.length; i++) {
                const l    = lines[i];
                const orig = items[i];
                db.prepare(`
                  UPDATE invoice_items
                  SET taxable_value = ?, cgst = ?, sgst = ?, igst = ?, total = ?
                  WHERE id = ?
                `).run(l.taxable_value, l.cgst, l.sgst, l.igst, l.total, orig.id);
              }
              db.prepare(`
                UPDATE invoices
                SET subtotal = ?, taxable_value = ?, cgst = ?, sgst = ?,
                    igst = ?, grand_total = ?, amount = ?
                WHERE id = ?
              `).run(
                totals.subtotal, totals.taxable_value,
                totals.cgst, totals.sgst, totals.igst,
                totals.grand_total, totals.grand_total,
                inv.id
              );
              db.exec('COMMIT');
              updated++;
            } catch (innerErr) {
              db.exec('ROLLBACK');
              console.error(`[DB] Migration 8: failed invoice ${inv.invoice_number}:`, innerErr.message);
              skipped++;
            }
          }
          console.log(`[DB] Migration 8: updated=${updated} skipped=${skipped}`);
        }
      }
      markVersion(8, 'GST backfill on existing invoices');
    } catch (e) {
      console.error('[DB] Migration 8 error:', e.message);
      try { markVersion(8, 'GST backfill (partial/failed)'); } catch (_) {}
    }
  }

  // Version 9: GST Registration Mode on company_settings + customers
  if (!hasVersion(9)) {
    console.log('[DB] Running Migration 9: GST Registration Mode fields');
    try {
      // Company: is this business GST-registered?
      addColumnIfNotExists(db, 'company_settings', 'is_gst_registered', 'INTEGER DEFAULT 1');
      // Customers: is this customer GST-registered?
      addColumnIfNotExists(db, 'customers', 'is_gst_registered', 'INTEGER DEFAULT 0');
      markVersion(9, 'Add is_gst_registered to company_settings and customers');
    } catch (e) {
      console.error('[DB] Migration 9 error:', e.message);
    }
  }

  // Version 10: GST Master and Normalized Product Metadata
  if (!hasVersion(10)) {
    console.log('[DB] Running Migration 10: GST Master and Normalized Product Metadata');
    db.exec('BEGIN TRANSACTION');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS gst_hsn_master (
          hsn_code TEXT PRIMARY KEY,
          description TEXT,
          gst_rate REAL DEFAULT 0,
          uqc TEXT DEFAULT 'NOS',
          cess_rate REAL DEFAULT 0,
          is_active INTEGER DEFAULT 1
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS gst_uqc_master (
          code TEXT PRIMARY KEY,
          description TEXT
        )
      `);
      
      const insertUqc = db.prepare('INSERT OR IGNORE INTO gst_uqc_master (code, description) VALUES (?, ?)');
      const uqcs = [
        ['NOS', 'Numbers'], ['KGS', 'Kilograms'], ['MTR', 'Meters'],
        ['PCS', 'Pieces'], ['LTR', 'Liters'], ['BOX', 'Boxes'],
        ['DOZ', 'Dozens'], ['PAC', 'Packs'], ['SET', 'Sets']
      ];
      for (const [code, desc] of uqcs) {
        insertUqc.run(code, desc);
      }

      addColumnIfNotExists(db, 'products', 'use_custom_gst', 'INTEGER DEFAULT 0');
      addColumnIfNotExists(db, 'products', 'uqc', 'TEXT');
      // cess_rate was added in version 7, addColumnIfNotExists is safe.

      markVersion(10, 'GST Master tables and normalized product metadata');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 10 error:', e.message);
    }
  }

  // Version 11: Multi-Tenant Architecture
  if (!hasVersion(11)) {
    console.log('[DB] Running Migration 11: Multi-Tenant Architecture');
    db.exec('BEGIN TRANSACTION');
    try {
      // Add columns to users
      addColumnIfNotExists(db, 'users', 'company_id', 'INTEGER REFERENCES companies(id)');
      addColumnIfNotExists(db, 'users', 'role', "TEXT NOT NULL DEFAULT 'OWNER'");
      addColumnIfNotExists(db, 'users', 'status', "TEXT NOT NULL DEFAULT 'Active'");

      // Add columns to all business tables
      const businessTables = [
        'products', 'sales', 'purchases', 'customers', 'suppliers', 'employees',
        'invoices', 'invoice_items', 'inventory', 'credits', 'marketing_campaigns',
        'marketing_campaign_targets', 'company_settings', 'ai_insights_cache',
        'ai_chat_history', 'ai_dismissed_insights'
      ];
      for (const table of businessTables) {
        addColumnIfNotExists(db, table, 'company_id', 'INTEGER REFERENCES companies(id)');
      }

      // Add indexes
      db.exec('CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_company ON sales(company_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_purchases_company ON purchases(company_id)');

      markVersion(11, 'Multi-Tenant Auth & Company Architecture');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 11 error:', e.message);
    }
  }

  // Version 12: Inclusive Pricing
  if (!hasVersion(12)) {
    console.log('[DB] Running Migration 12: Inclusive Pricing flag');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'company_settings', 'inclusive_pricing', 'INTEGER DEFAULT 1');
      markVersion(12, 'Add inclusive_pricing to company_settings');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 12 error:', e.message);
    }
  }

  // Version 13: Employee Profile Enhanced Fields
  if (!hasVersion(13)) {
    console.log('[DB] Running Migration 13: Employee Profile Enhanced Fields');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'employees', 'user_id', 'INTEGER REFERENCES users(id)');
      addColumnIfNotExists(db, 'employees', 'employee_code', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'avatar', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'phone', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'email', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'emergency_contact', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'job_title', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'manager_id', 'INTEGER REFERENCES employees(id)');
      addColumnIfNotExists(db, 'employees', 'deleted_at', 'TEXT');
      
      // Update existing statuses to Capitalized versions if they exist
      db.exec(`UPDATE employees SET status = 'Active' WHERE status = 'active'`);
      db.exec(`UPDATE employees SET status = 'Inactive' WHERE status = 'inactive'`);
      
      // Generate employee_code for existing employees if empty
      const existingEmps = db.prepare('SELECT id, company_id FROM employees WHERE employee_code IS NULL').all();
      for (const emp of existingEmps) {
         const code = `EMP${String(emp.id).padStart(5, '0')}`;
         db.prepare('UPDATE employees SET employee_code = ? WHERE id = ?').run(code, emp.id);
      }

      markVersion(13, 'Add Employee Profile Enhanced Fields');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 13 error:', e.message);
    }
  }

  // Version 14: Phase 2 Departments and Organization
  if (!hasVersion(14)) {
    console.log('[DB] Running Migration 14: Phase 2 Organization Structure');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'employees', 'department_id', 'INTEGER REFERENCES departments(id)');
      addColumnIfNotExists(db, 'employees', 'employment_type', "TEXT DEFAULT 'Full Time'");
      
      // Migrate existing text departments to relational table
      const uniqueDepts = db.prepare("SELECT DISTINCT department, company_id FROM employees WHERE department IS NOT NULL AND department != ''").all();
      
      for (const dept of uniqueDepts) {
        // Insert department if not exists for this company
        const existingDept = db.prepare('SELECT id FROM departments WHERE name = ? AND company_id = ?').get(dept.department, dept.company_id);
        let deptId;
        if (!existingDept) {
          const insertRes = db.prepare('INSERT INTO departments (company_id, name) VALUES (?, ?)').run(dept.company_id, dept.department);
          deptId = insertRes.lastInsertRowid;
        } else {
          deptId = existingDept.id;
        }
        
        // Update employees
        db.prepare('UPDATE employees SET department_id = ? WHERE department = ? AND company_id = ?').run(deptId, dept.department, dept.company_id);
      }

      markVersion(14, 'Add Organization Structure (Departments, etc.)');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 14 error:', e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Version 15: Company Registration & Profile Module
  // What this does (all in ONE transaction for safe rollback):
  //   1. ALTER TABLE companies — add all new identity/compliance columns
  //   2. CREATE new satellite tables (schema.sql handles IF NOT EXISTS, but we
  //      explicitly ensure them here too for safety)
  //   3. Seed license_category_map with known business categories
  //   4. DATA MIGRATION: copy existing company_settings fields → satellite tables
  //      (company_gst_settings, company_financial_settings, company_branding)
  //   5. Initialize company_setup_progress rows (steps 1-6, status='pending')
  //      for every company that doesn't already have them
  //   6. Initialize company_subscriptions row for every company
  //
  // Rollback: SQLite DDL is transactional — ROLLBACK undoes CREATE TABLE too.
  // markVersion(15) is only called on full success, so a partial failure means
  // this migration will retry cleanly on next startup.
  // ─────────────────────────────────────────────────────────────────────────────
  if (!hasVersion(15)) {
    console.log('[DB] Running Migration 15: Company Registration & Profile Module');
    db.exec('BEGIN TRANSACTION');
    try {

      // ── 1. Extend companies table ───────────────────────────────────────────
      // Note: SQLite ALTER TABLE ADD COLUMN cannot contain a UNIQUE constraint.
      // We add the column normally, then CREATE UNIQUE INDEX.
      addColumnIfNotExists(db, 'companies', 'company_code',          'TEXT');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_company_code ON companies(company_code)');
      
      addColumnIfNotExists(db, 'companies', 'legal_business_name',   'TEXT');
      addColumnIfNotExists(db, 'companies', 'trade_name',            'TEXT');
      addColumnIfNotExists(db, 'companies', 'business_category',     'TEXT');
      addColumnIfNotExists(db, 'companies', 'nic_code',              'TEXT');
      addColumnIfNotExists(db, 'companies', 'date_of_incorporation',  'TEXT');
      addColumnIfNotExists(db, 'companies', 'registration_type',     "TEXT DEFAULT 'regular'");
      addColumnIfNotExists(db, 'companies', 'pan',                   'TEXT');
      addColumnIfNotExists(db, 'companies', 'gstin',                 'TEXT');
      addColumnIfNotExists(db, 'companies', 'phone',                 'TEXT');
      addColumnIfNotExists(db, 'companies', 'website',               'TEXT');
      addColumnIfNotExists(db, 'companies', 'owner_user_id',         'INTEGER REFERENCES users(id)');
      addColumnIfNotExists(db, 'companies', 'industry',              'TEXT');
      addColumnIfNotExists(db, 'companies', 'business_size_bracket', 'TEXT');
      addColumnIfNotExists(db, 'companies', 'turnover_bracket',      'TEXT');
      addColumnIfNotExists(db, 'companies', 'setup_completed',       'INTEGER DEFAULT 0');

      // ── 2. Generate company_code for existing companies that don't have one ─
      const companiesWithoutCode = db.prepare(
        "SELECT id FROM companies WHERE company_code IS NULL OR company_code = ''"
      ).all();
      for (const c of companiesWithoutCode) {
        const code = `BIZ${String(c.id).padStart(5, '0')}`;
        db.prepare('UPDATE companies SET company_code = ? WHERE id = ?').run(code, c.id);
      }

      // ── 3. Seed owner_user_id on companies from their first OWNER user ──────
      const companiesWithoutOwner = db.prepare(
        'SELECT id FROM companies WHERE owner_user_id IS NULL'
      ).all();
      for (const c of companiesWithoutOwner) {
        const owner = db.prepare(
          "SELECT id FROM users WHERE company_id = ? AND role = 'OWNER' ORDER BY id ASC LIMIT 1"
        ).get(c.id);
        if (owner) {
          db.prepare('UPDATE companies SET owner_user_id = ? WHERE id = ?').run(owner.id, c.id);
        }
      }

      // ── 4. Seed license_category_map (idempotent: uses INSERT OR IGNORE) ────
      const licenseMapEntries = [
        // F&B
        ['Food & Beverage', 'FSSAI', 1, 'Mandatory for all food businesses'],
        ['Food & Beverage', 'TRADE_LICENSE', 1, 'Local trade license'],
        ['Food & Beverage', 'SHOP_ESTABLISHMENT', 1, 'Shop & Establishment Act'],
        ['Food & Beverage', 'PROFESSIONAL_TAX', 0, 'Professional tax registration'],
        // Pharmacy / Healthcare
        ['Pharmacy', 'DRUG_LICENSE', 1, 'Mandatory drug license from state authority'],
        ['Pharmacy', 'SHOP_ESTABLISHMENT', 1, 'Shop & Establishment Act'],
        ['Pharmacy', 'PROFESSIONAL_TAX', 0, 'Professional tax registration'],
        ['Pharmacy', 'FSSAI', 0, 'If stocking food supplements'],
        ['Healthcare', 'SHOP_ESTABLISHMENT', 1, 'Shop & Establishment Act'],
        ['Healthcare', 'PROFESSIONAL_TAX', 0, 'Professional tax registration'],
        // Retail
        ['Retail', 'TRADE_LICENSE', 1, 'Local trade license'],
        ['Retail', 'SHOP_ESTABLISHMENT', 1, 'Shop & Establishment Act'],
        ['Retail', 'PROFESSIONAL_TAX', 0, 'State-specific'],
        // Electronics
        ['Electronics', 'TRADE_LICENSE', 1, 'Local trade license'],
        ['Electronics', 'SHOP_ESTABLISHMENT', 1, 'Shop & Establishment Act'],
        // Manufacturing
        ['Manufacturing', 'UDYAM', 1, 'MSME Udyam registration'],
        ['Manufacturing', 'TRADE_LICENSE', 1, 'Local trade license'],
        ['Manufacturing', 'EPFO', 0, 'If 20+ employees'],
        ['Manufacturing', 'ESIC', 0, 'If 10+ employees'],
        // Services
        ['Services', 'SHOP_ESTABLISHMENT', 1, 'Shop & Establishment Act'],
        ['Services', 'PROFESSIONAL_TAX', 0, 'State-specific'],
        // Wholesale / Import-Export
        ['Wholesale', 'IEC', 1, 'Import Export Code from DGFT'],
        ['Wholesale', 'TRADE_LICENSE', 1, 'Local trade license'],
        ['Import-Export', 'IEC', 1, 'Import Export Code from DGFT'],
      ];
      const insertMapStmt = db.prepare(
        'INSERT OR IGNORE INTO license_category_map (business_category, license_type, is_mandatory, description) VALUES (?, ?, ?, ?)'
      );
      for (const [cat, type, mandatory, desc] of licenseMapEntries) {
        insertMapStmt.run(cat, type, mandatory, desc);
      }

      // ── 5. DATA MIGRATION: company_settings → satellite tables ──────────────
      // Read all company_settings rows and seed the new satellite tables.
      // company_settings is then deprecated (no new code writes to it).
      const allSettings = db.prepare('SELECT * FROM company_settings').all();
      for (const s of allSettings) {
        if (!s.company_id) continue;
        const cid = s.company_id;

        // 5a. company_gst_settings
        const existingGst = db.prepare('SELECT id FROM company_gst_settings WHERE company_id = ?').get(cid);
        if (!existingGst) {
          db.prepare(`
            INSERT INTO company_gst_settings
              (company_id, state_code, is_gst_registered, inclusive_pricing)
            VALUES (?, ?, ?, ?)
          `).run(
            cid,
            s.state_code || s.state || null,
            s.is_gst_registered != null ? s.is_gst_registered : 1,
            s.inclusive_pricing != null ? s.inclusive_pricing : 1
          );
        }

        // 5b. company_financial_settings (invoice prefix from company_settings if stored)
        const existingFin = db.prepare('SELECT id FROM company_financial_settings WHERE company_id = ?').get(cid);
        if (!existingFin) {
          db.prepare(`
            INSERT INTO company_financial_settings (company_id) VALUES (?)
          `).run(cid);
        }

        // 5c. company_branding (migrate logo)
        const existingBrand = db.prepare('SELECT id FROM company_branding WHERE company_id = ?').get(cid);
        if (!existingBrand) {
          db.prepare(`
            INSERT INTO company_branding (company_id, logo_url) VALUES (?, ?)
          `).run(cid, s.logo || null);
        }

        // 5d. Migrate GSTIN and PAN up to companies table
        if (s.gstin || s.pan) {
          db.prepare(`
            UPDATE companies SET
              gstin = COALESCE(gstin, ?),
              pan   = COALESCE(pan, ?),
              legal_business_name = COALESCE(legal_business_name, ?),
              trade_name = COALESCE(trade_name, ?)
            WHERE id = ?
          `).run(
            s.gstin || null,
            s.pan || null,
            s.legal_name || null,
            s.trade_name || null,
            cid
          );
        }
      }

      // ── 6. Initialize company_setup_progress for all companies ──────────────
      const allCompanies = db.prepare('SELECT id FROM companies').all();
      const insertProgress = db.prepare(`
        INSERT OR IGNORE INTO company_setup_progress (company_id, step_number, status)
        VALUES (?, ?, 'pending')
      `);
      for (const c of allCompanies) {
        // Existing companies are considered to have completed setup already
        // (they were registered before the wizard existed). Mark step 1 as skipped
        // and 2-6 as skipped so they can use Company Profile to fill in gaps.
        for (let step = 1; step <= 6; step++) {
          const existingStep = db.prepare(
            'SELECT id FROM company_setup_progress WHERE company_id = ? AND step_number = ?'
          ).get(c.id, step);
          if (!existingStep) {
            db.prepare(`
              INSERT INTO company_setup_progress (company_id, step_number, status, completed_at)
              VALUES (?, ?, 'skipped', datetime('now'))
            `).run(c.id, step);
          }
        }
        // Mark company as setup_completed (pre-existing companies bypass wizard)
        db.prepare("UPDATE companies SET setup_completed = 1 WHERE id = ?").run(c.id);
      }

      // ── 7. Initialize company_subscriptions for all companies ───────────────
      const insertSub = db.prepare(`
        INSERT OR IGNORE INTO company_subscriptions (company_id, plan_id, status, trial_ends_at, current_period_end)
        VALUES (?, 'free', 'trialing', datetime('now', '+14 days'), datetime('now', '+14 days'))
      `);
      for (const c of allCompanies) {
        insertSub.run(c.id);
      }

      markVersion(15, 'Company Registration & Profile Module');
      db.exec('COMMIT');
      console.log('[DB] Migration 15 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 15 FAILED — rolled back:', e.message);
      // markVersion is NOT called — migration will retry on next startup
    }
  }

  // Version 16: Phase 2 Enterprise Employee Management System
  if (!hasVersion(16)) {
    console.log('[DB] Running Migration 16: Enterprise Employee Management System (Phase 2)');
    db.exec('BEGIN TRANSACTION');
    try {
      // 1. Add new columns to existing tables
      addColumnIfNotExists(db, 'departments', 'branch_id', 'INTEGER REFERENCES branches(id)');
      
      addColumnIfNotExists(db, 'employees', 'branch_id', 'INTEGER REFERENCES branches(id)');
      addColumnIfNotExists(db, 'employees', 'date_of_birth', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'gender', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'blood_group', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'personal_email', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'permanent_address', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'current_address', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'pan', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'aadhaar', 'TEXT');
      
      addColumnIfNotExists(db, 'users', 'last_login', 'TEXT');
      addColumnIfNotExists(db, 'users', 'login_count', 'INTEGER DEFAULT 0');

      // 2. Seed System Permission Groups
      const groups = [
        'Employees', 'Attendance', 'Leaves', 'Payroll', 'Reports', 'Settings',
        'Notifications', 'Audit Logs', 'Branches', 'Departments', 'Sales',
        'Inventory', 'Products', 'Customers', 'Suppliers', 'GST', 'Marketing', 'AI'
      ];
      const insertGroupStmt = db.prepare('INSERT INTO permission_groups (name) VALUES (?)');
      const groupMap = {};
      
      for (const group of groups) {
        // Idempotent check
        let row = db.prepare('SELECT id FROM permission_groups WHERE name = ?').get(group);
        if (!row) {
          const info = insertGroupStmt.run(group);
          groupMap[group] = info.lastInsertRowid;
        } else {
          groupMap[group] = row.id;
        }
      }

      // 3. Seed Permissions
      const permissionsToSeed = [
        { group: 'Employees', actions: ['employees.view', 'employees.create', 'employees.edit', 'employees.delete'] },
        { group: 'Attendance', actions: ['attendance.view', 'attendance.manage'] },
        { group: 'Leaves', actions: ['leaves.view', 'leaves.manage'] },
        { group: 'Payroll', actions: ['payroll.view', 'payroll.run'] },
        { group: 'Branches', actions: ['branches.view', 'branches.manage'] },
        { group: 'Departments', actions: ['departments.view', 'departments.manage'] },
        { group: 'Settings', actions: ['settings.view', 'settings.manage'] },
        { group: 'Audit Logs', actions: ['audit_logs.view'] },
        { group: 'Sales', actions: ['sales.view', 'sales.create', 'sales.edit', 'sales.delete'] },
        { group: 'Inventory', actions: ['inventory.view', 'inventory.manage'] },
        { group: 'Products', actions: ['products.view', 'products.manage'] },
        { group: 'Customers', actions: ['customers.view', 'customers.manage'] },
        { group: 'Suppliers', actions: ['suppliers.view', 'suppliers.manage'] }
      ];

      const insertPermStmt = db.prepare('INSERT INTO permissions (group_id, action, description, is_system) VALUES (?, ?, ?, 1)');
      for (const block of permissionsToSeed) {
        const groupId = groupMap[block.group];
        for (const action of block.actions) {
          const row = db.prepare('SELECT id FROM permissions WHERE action = ?').get(action);
          if (!row) {
            insertPermStmt.run(groupId, action, `Allows ${action.replace('.', ' ')}`);
          }
        }
      }

      // 4. Seed System Roles for existing companies
      const companies = db.prepare('SELECT id FROM companies').all();

      for (const comp of companies) {
        const ownerRoleId = ensureOwnerRole(db, comp.id);

        // Migrate existing OWNER users to the new granular Owner role
        const ownerUsers = db.prepare("SELECT id FROM users WHERE company_id = ? AND role = 'OWNER'").all(comp.id);
        for (const user of ownerUsers) {
          assignUserToRole(db, user.id, ownerRoleId, comp.id);
        }
      }

      markVersion(16, 'Phase 2: EMS tables, permissions, roles, multi-tenant RBAC');
      db.exec('COMMIT');
      console.log('[DB] Migration 16 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 16 FAILED — rolled back:', e.message);
    }
  }

  // Version 17: Phase 3 Automation, Events & Multi-Store
  if (!hasVersion(17)) {
    console.log('[DB] Running Migration 17: Phase 3 Foundation');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'sales', 'branch_id', 'INTEGER REFERENCES branches(id)');
      addColumnIfNotExists(db, 'sales', 'warehouse_id', 'INTEGER REFERENCES warehouses(id)');
      
      addColumnIfNotExists(db, 'inventory', 'branch_id', 'INTEGER REFERENCES branches(id)');
      addColumnIfNotExists(db, 'inventory', 'warehouse_id', 'INTEGER REFERENCES warehouses(id)');
      
      addColumnIfNotExists(db, 'marketing_campaigns', 'branch_id', 'INTEGER REFERENCES branches(id)');
      addColumnIfNotExists(db, 'customers', 'branch_id', 'INTEGER REFERENCES branches(id)');

      // The new tables (system_events, background_jobs, etc.) are already in schema.sql
      // so db.exec(schema) creates them before runMigrations() is called.
      
      markVersion(17, 'Phase 3 Automations, Events & Multi-Store');
      db.exec('COMMIT');
      console.log('[DB] Migration 17 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 17 FAILED — rolled back:', e.message);
    }
  }

  // Version 18: user_branches table
  if (!hasVersion(18)) {
    console.log('[DB] Running Migration 18: user_branches');
    db.exec('BEGIN TRANSACTION');
    try {
      // The new table (user_branches) is already in schema.sql
      // so db.exec(schema) creates it before runMigrations() is called.
      
      markVersion(18, 'user_branches');
      db.exec('COMMIT');
      console.log('[DB] Migration 18 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 18 FAILED — rolled back:', e.message);
    }
  }

  // Version 19: Close remaining company_settings migration gaps.
  // company_settings had two fields (email, default_hsn_prefix) that were never
  // given a home in the Migration 15 satellite tables, which left a live UI
  // (GstSettings.jsx) writing to the deprecated table with no other consumer.
  // This adds the missing columns to the canonical tables so that screen (and
  // the invoice PDF snapshot, which needs company email) can move off
  // company_settings entirely.
  if (!hasVersion(19)) {
    console.log('[DB] Running Migration 19: companies.email + company_gst_settings.default_hsn_prefix');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'companies', 'email', 'TEXT');
      addColumnIfNotExists(db, 'company_gst_settings', 'default_hsn_prefix', 'TEXT');

      // Best-effort backfill from company_settings for companies that already had it set.
      const legacy = db.prepare(`
        SELECT company_id, email, default_hsn_prefix FROM company_settings
        WHERE company_id IS NOT NULL AND (email IS NOT NULL OR default_hsn_prefix IS NOT NULL)
      `).all();
      for (const row of legacy) {
        if (row.email) {
          db.prepare('UPDATE companies SET email = COALESCE(email, ?) WHERE id = ?').run(row.email, row.company_id);
        }
        if (row.default_hsn_prefix) {
          const existingGst = db.prepare('SELECT id FROM company_gst_settings WHERE company_id = ?').get(row.company_id);
          if (existingGst) {
            db.prepare('UPDATE company_gst_settings SET default_hsn_prefix = COALESCE(default_hsn_prefix, ?) WHERE company_id = ?')
              .run(row.default_hsn_prefix, row.company_id);
          } else {
            db.prepare('INSERT INTO company_gst_settings (company_id, default_hsn_prefix) VALUES (?, ?)')
              .run(row.company_id, row.default_hsn_prefix);
          }
        }
      }

      markVersion(19, 'Close company_settings migration gaps (email, default_hsn_prefix)');
      db.exec('COMMIT');
      console.log('[DB] Migration 19 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 19 FAILED — rolled back:', e.message);
    }
  }

  // Version 20: Communication Center tables and columns
  if (!hasVersion(20)) {
    console.log('[DB] Running Migration 20: Communication Center');
    db.exec('BEGIN TRANSACTION');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS communication_campaigns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER REFERENCES companies(id),
          name TEXT NOT NULL,
          channel TEXT NOT NULL,
          status TEXT DEFAULT 'draft',
          audience_type TEXT,
          segment_id INTEGER REFERENCES custom_segments(id),
          template_id INTEGER,
          schedule_time TEXT,
          total_recipients INTEGER DEFAULT 0,
          successful_deliveries INTEGER DEFAULT 0,
          failed_deliveries INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS communication_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER REFERENCES companies(id),
          name TEXT NOT NULL,
          channel TEXT NOT NULL,
          category TEXT DEFAULT 'marketing',
          content TEXT NOT NULL,
          variables TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      
      addColumnIfNotExists(db, 'communication_logs', 'marketing_campaign_id', 'INTEGER');
      addColumnIfNotExists(db, 'communication_logs', 'automation_id', 'INTEGER');
      addColumnIfNotExists(db, 'communication_logs', 'template_id', 'INTEGER');
      addColumnIfNotExists(db, 'communication_logs', 'segment_id', 'INTEGER');
      addColumnIfNotExists(db, 'communication_logs', 'provider', 'TEXT');
      addColumnIfNotExists(db, 'communication_logs', 'job_id', 'INTEGER');
      addColumnIfNotExists(db, 'communication_logs', 'provider_message_id', 'TEXT');
      addColumnIfNotExists(db, 'communication_logs', 'error_details', 'TEXT');
      addColumnIfNotExists(db, 'communication_logs', 'delivered_at', 'TEXT');
      addColumnIfNotExists(db, 'communication_logs', 'read_at', 'TEXT');

      // Due to the previous reference campaign_id being to marketing_campaigns, we don't drop it but maybe rename it conceptually if we could. SQLite doesn't let us rename foreign keys easily. It's fine, we added marketing_campaign_id for the old one and communication_campaigns will use campaign_id.

      markVersion(20, 'Communication Center Support');
      db.exec('COMMIT');
      console.log('[DB] Migration 20 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 20 FAILED — rolled back:', e.message);
    }
  }

  // Version 21: Compliance Intelligence Platform (Phase 1)
  // The compliance_* tables live in schema.sql (created by db.exec(schema) before
  // this runs). This migration only seeds the initial data-driven Indian rule set
  // via complianceSeed. The seed is idempotent (keyed by rule code), so this stays
  // safe even though seedCompliance also runs defensively at service startup.
  if (!hasVersion(21)) {
    console.log('[DB] Running Migration 21: Compliance Intelligence Platform');
    db.exec('BEGIN TRANSACTION');
    try {
      const { seedCompliance } = require('../db/complianceSeed');
      const result = seedCompliance(db);
      console.log(`[DB] Migration 21: seeded ${result.rulesCreated}/${result.rulesTotal} compliance rules, ${result.categories} categories.`);
      markVersion(21, 'Compliance Intelligence Platform (rules, conditions, categories)');
      db.exec('COMMIT');
      console.log('[DB] Migration 21 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 21 FAILED — rolled back:', e.message);
    }
  }

  // Version 22: Compliance Phase 2 — Document Vault + Government Resource Center.
  // Additive columns on existing compliance tables + resource-data backfill.
  // (New columns also exist in schema.sql for fresh installs; these ALTERs cover
  // databases that already ran Migration 21.)
  if (!hasVersion(22)) {
    console.log('[DB] Running Migration 22: Compliance Phase 2 (Document Vault + Resources)');
    db.exec('BEGIN TRANSACTION');
    try {
      // Government Resource Center fields on rules
      addColumnIfNotExists(db, 'compliance_rules', 'processing_fee', 'TEXT');
      addColumnIfNotExists(db, 'compliance_rules', 'typical_timeline', 'TEXT');
      addColumnIfNotExists(db, 'compliance_rules', 'forms_json', 'TEXT');
      addColumnIfNotExists(db, 'compliance_rules', 'guide_url', 'TEXT');

      // Enterprise document-vault fields
      addColumnIfNotExists(db, 'compliance_item_documents', 'document_type', 'TEXT');
      addColumnIfNotExists(db, 'compliance_item_documents', 'original_name', 'TEXT');
      addColumnIfNotExists(db, 'compliance_item_documents', 'mime_type', 'TEXT');
      addColumnIfNotExists(db, 'compliance_item_documents', 'file_size', 'INTEGER');
      addColumnIfNotExists(db, 'compliance_item_documents', 'uploaded_by', 'INTEGER');
      addColumnIfNotExists(db, 'compliance_item_documents', 'verified', 'INTEGER DEFAULT 0');
      addColumnIfNotExists(db, 'compliance_item_documents', 'verification_notes', 'TEXT');
      addColumnIfNotExists(db, 'compliance_item_documents', 'version', 'INTEGER DEFAULT 1');
      addColumnIfNotExists(db, 'compliance_item_documents', 'is_current', 'INTEGER DEFAULT 1');

      const { seedResources } = require('../db/complianceSeed');
      const applied = seedResources(db);
      console.log(`[DB] Migration 22: backfilled resources for ${applied} rule codes.`);

      markVersion(22, 'Compliance Phase 2: Document Vault + Government Resource Center');
      db.exec('COMMIT');
      console.log('[DB] Migration 22 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 22 FAILED — rolled back:', e.message);
    }
  }

  // Version 23: Compliance Phase 2b — Board Meeting Manager.
  // The compliance_meeting* tables live in schema.sql (created before this runs);
  // this migration just records the version.
  if (!hasVersion(23)) {
    console.log('[DB] Running Migration 23: Board Meeting Manager');
    db.exec('BEGIN TRANSACTION');
    try {
      markVersion(23, 'Compliance Phase 2b: Board Meeting Manager tables');
      db.exec('COMMIT');
      console.log('[DB] Migration 23 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 23 FAILED — rolled back:', e.message);
    }
  }

  // Version 24: Workforce & Organization Management — Phase 1.
  // Additive only. The new grouping tables (teams, team_members, employee_groups,
  // employee_group_members) live in schema.sql and are created before this runs;
  // this block ALTERs existing tables for databases that predate them and records
  // the version. Reporting hierarchy is unchanged — it already lives on
  // employees.manager_id, and routes/employees.js already guards against
  // circular/self reporting, so nothing is duplicated here.
  if (!hasVersion(24)) {
    console.log('[DB] Running Migration 24: Workforce & Organization Management (Phase 1)');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'departments', 'color', 'TEXT');
      addColumnIfNotExists(db, 'departments', 'icon', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'skills', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'date_of_birth', 'TEXT');
      markVersion(24, 'Workforce & Org Mgmt Phase 1: teams, employee groups, dept color/icon, employee skills/DOB');
      db.exec('COMMIT');
      console.log('[DB] Migration 24 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 24 FAILED — rolled back:', e.message);
    }
  }

  // Version 25: Workforce & Organization Management — Phase 2 (Task engine).
  // All new tables (tasks, task_assignments, task_comments, task_checklist_items,
  // task_activity, task_attachments) live in schema.sql and are created before
  // this runs; this block only records the version (no ALTERs on existing tables).
  if (!hasVersion(25)) {
    console.log('[DB] Running Migration 25: Task Management engine');
    db.exec('BEGIN TRANSACTION');
    try {
      markVersion(25, 'Workforce & Org Mgmt Phase 2: tasks, assignments, comments, checklist, activity, attachments');
      db.exec('COMMIT');
      console.log('[DB] Migration 25 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 25 FAILED — rolled back:', e.message);
    }
  }

  // Version 26: Business Growth Hub
  // Creates all 17 Growth Hub tables and seeds reference data.
  if (!hasVersion(26)) {
    console.log('[DB] Running Migration 26: Business Growth Hub');
    db.exec('BEGIN TRANSACTION');
    try {
      const growthSchemaPath = path.join(__dirname, '..', 'db', 'schema_growth.sql');
      if (fs.existsSync(growthSchemaPath)) {
        const growthSchema = fs.readFileSync(growthSchemaPath, 'utf8');
        db.exec(growthSchema);
        console.log('[DB] Migration 26: growth schema applied.');
      } else {
        console.warn('[DB] Migration 26: schema_growth.sql not found — skipping table creation.');
      }
      markVersion(26, 'Business Growth Hub: 17 tables for funding, equity, IPO, partnerships, roadmap, AI advisor');
      db.exec('COMMIT');
      console.log('[DB] Migration 26 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 26 FAILED — rolled back:', e.message);
    }
  }

  // Version 27: Import & Export Intelligence System.
  // The 11 trade_* tables live in schema.sql (created idempotently on every
  // getDb() call, same as Compliance) — this migration only ALTERs the
  // pre-existing business_compliance_profile table (for DBs that predate the
  // trade columns) and seeds the India trade-guideline reference data.
  if (!hasVersion(27)) {
    console.log('[DB] Running Migration 27: Import & Export Intelligence System');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'business_compliance_profile', 'import_enabled', 'INTEGER DEFAULT 0');
      addColumnIfNotExists(db, 'business_compliance_profile', 'export_enabled', 'INTEGER DEFAULT 0');
      addColumnIfNotExists(db, 'business_compliance_profile', 'is_manufacturer', 'INTEGER DEFAULT 0');
      addColumnIfNotExists(db, 'business_compliance_profile', 'is_trader', 'INTEGER DEFAULT 0');
      addColumnIfNotExists(db, 'business_compliance_profile', 'is_service_provider', 'INTEGER DEFAULT 0');
      addColumnIfNotExists(db, 'business_compliance_profile', 'iec_number', 'TEXT');

      const { seedTrade } = require('../db/tradeSeed');
      const result = seedTrade(db);
      console.log(`[DB] Migration 27: seeded ${result.guidelinesCreated}/${result.guidelinesTotal} trade guidelines, ${result.authorities} authorities, ${result.countries} countries, ${result.products} products.`);

      markVersion(27, 'Import & Export Intelligence: trade guidelines, authorities, countries, products, requirements');
      db.exec('COMMIT');
      console.log('[DB] Migration 27 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 27 FAILED — rolled back:', e.message);
    }
  }

  // Version 28: Backfill missing Owner roles (fixes companies signed up between migration
  // 16's one-time backfill and the signup handler being wired to call ensureOwnerRole —
  // those companies had zero rows in `roles`, which a since-fixed bug in GET /api/roles
  // papered over by leaking every other company's Owner role instead of an empty list).
  if (!hasVersion(28)) {
    console.log('[DB] Running Migration 28: Backfill missing per-company Owner roles');
    db.exec('BEGIN TRANSACTION');
    try {
      const companies = db.prepare('SELECT id FROM companies').all();
      let backfilled = 0;
      for (const comp of companies) {
        const existing = db.prepare("SELECT id FROM roles WHERE company_id = ? AND name = 'Owner'").get(comp.id);
        if (existing) continue;
        const ownerRoleId = ensureOwnerRole(db, comp.id);
        const ownerUsers = db.prepare("SELECT id FROM users WHERE company_id = ? AND role = 'OWNER'").all(comp.id);
        for (const user of ownerUsers) {
          assignUserToRole(db, user.id, ownerRoleId, comp.id);
        }
        backfilled++;
      }
      console.log(`[DB] Migration 28: backfilled Owner role for ${backfilled} company(ies).`);

      markVersion(28, 'Backfill missing per-company Owner roles');
      db.exec('COMMIT');
      console.log('[DB] Migration 28 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 28 FAILED — rolled back:', e.message);
    }
  }

  // Version 29: Employee profile — qualification + structured emergency contact
  if (!hasVersion(29)) {
    console.log('[DB] Running Migration 29: Employee qualification + structured emergency contact');
    db.exec('BEGIN TRANSACTION');
    try {
      addColumnIfNotExists(db, 'employees', 'qualification', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'emergency_contact_name', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'emergency_contact_relation', 'TEXT');
      addColumnIfNotExists(db, 'employees', 'emergency_contact_phone', 'TEXT');

      markVersion(29, 'Employee qualification + structured emergency contact');
      db.exec('COMMIT');
      console.log('[DB] Migration 29 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 29 FAILED — rolled back:', e.message);
    }
  }

  // Version 30: Investor Directory (Growth Hub reference data, mirrors
  // government_schemes) + government_schemes.last_verified_at.
  // schema_growth.sql only gets replayed via migration 26's one-time db.exec,
  // so a DB that already has version 26 marked won't pick up new tables added
  // to that file afterward — this migration creates investor_directory and
  // adds the new column directly, same idempotent pattern as every other
  // migration here.
  if (!hasVersion(30)) {
    console.log('[DB] Running Migration 30: Investor Directory + scheme verification tracking');
    db.exec('BEGIN TRANSACTION');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS investor_directory (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          name                TEXT NOT NULL,
          org_type            TEXT,
          focus_sectors       TEXT,
          investment_stage    TEXT,
          ticket_size_min     REAL,
          ticket_size_max     REAL,
          region              TEXT,
          country_code        TEXT DEFAULT 'IN',
          website_url         TEXT,
          contact_info        TEXT,
          description         TEXT,
          notable_portfolio   TEXT,
          is_active           INTEGER DEFAULT 1,
          sort_order          INTEGER DEFAULT 0,
          created_at          TEXT DEFAULT (datetime('now')),
          updated_at          TEXT DEFAULT (datetime('now'))
        );
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_investor_directory_type ON investor_directory(org_type, investment_stage);');
      addColumnIfNotExists(db, 'government_schemes', 'last_verified_at', 'TEXT');

      markVersion(30, 'Growth Hub: investor_directory reference table + government_schemes.last_verified_at');
      db.exec('COMMIT');
      console.log('[DB] Migration 30 complete.');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error('[DB] Migration 30 FAILED — rolled back:', e.message);
    }
  }
}

// Finds or creates the per-company "Owner" system role (all permissions granted) and
// returns its id. Used both by migration 16's one-time backfill and by signup, so new
// companies get the same granular-RBAC baseline that migration 16 gave existing ones —
// see routes/auth.js signup handler.
function ensureOwnerRole(db, companyId) {
  let ownerRole = db.prepare("SELECT id FROM roles WHERE company_id = ? AND name = 'Owner'").get(companyId);
  if (!ownerRole) {
    const info = db.prepare(
      "INSERT INTO roles (company_id, name, description, is_system, color) VALUES (?, 'Owner', 'Full system access', 1, '#ef4444')"
    ).run(companyId);
    ownerRole = { id: info.lastInsertRowid };
    const allPerms = db.prepare('SELECT id FROM permissions').all();
    const assignPerm = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
    for (const perm of allPerms) {
      assignPerm.run(ownerRole.id, perm.id);
    }
  }
  return ownerRole.id;
}

function assignUserToRole(db, userId, roleId, companyId) {
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, company_id) VALUES (?, ?, ?)').run(userId, roleId, companyId);
}

function getDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  
  // 1. Always execute base schema (IF NOT EXISTS prevents overrides)
  try {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
  } catch (err) {
    console.error('[DB] FATAL: Failed to parse or execute schema.sql', err.message);
    throw new Error('Database schema initialization failed.');
  }

  // 2. Run idempotent migrations for existing tables
  try {
    runMigrations(db);
  } catch (err) {
    console.error('[DB] FATAL: Migration system failed', err.message);
    throw new Error('Database migration system failed.');
  }

  return db;
}

module.exports = { getDb, DB_PATH, ensureOwnerRole, assignUserToRole };
