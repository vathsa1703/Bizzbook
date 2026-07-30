const fs = require('fs');
const path = require('path');
const { getPgPool } = require('./pgPool');
// Same source data as the SQLite seed (migrations 10/21/27 in config/db.js) --
// complianceSeed.js/tradeSeed.js export their raw data arrays alongside the
// SQLite-specific insert functions specifically so a second engine doesn't
// need to duplicate the data, only the insert mechanics. See migration 5
// below for why Postgres never got this data in the first place.
const { CATEGORIES: COMPLIANCE_CATEGORIES, RULES: COMPLIANCE_RULES, RESOURCES: COMPLIANCE_RESOURCES } = require('../db/complianceSeed');
const { GUIDELINES: TRADE_GUIDELINES, AUTHORITIES: TRADE_AUTHORITIES, COUNTRIES: TRADE_COUNTRIES } = require('../db/tradeSeed');

// Phase 2 foundation: the Postgres-side equivalent of config/db.js's getDb().
// Nothing in services/ or routes/ calls this yet — modules are rewritten one at
// a time in later Phase 2 steps, gated behind process.env.DB_ENGINE. SQLite's
// getDb() is untouched and remains the default path.
//
// db.prepare(sql).run(...params)  -> query(sql, params)
// db.prepare(sql).get(...params)  -> getOne(sql, params)
// db.prepare(sql).all(...params)  -> getAll(sql, params)
// db.exec('BEGIN') / db.exec('COMMIT') / db.exec('ROLLBACK') around a series of
//   db.prepare(...).run() calls  -> withTransaction(async (tx) => { ...tx.query()... })
//
// withTransaction pins to a single checked-out client for its whole lifetime
// (pool.connect(), not pool.query()) — a transaction issued as separate
// pool.query() calls can silently land on different physical connections and
// never actually be atomic. This is the one thing every module rewrite in
// Step 2 depends on getting right, so it's centralized here instead of being
// re-implemented per module.

const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.postgres.sql');
const BOOTSTRAP_VERSION = 1;

// Every SQL-text-accepting function in this file (query/getOne/getAll, and
// withTransaction's tx.query/getOne/getAll) is written and called in SQLite's
// plain '?' placeholder style, matching BranchScopedQuery.js and dbEngine.js —
// see dbEngine.js's own comment for why the conversion happens on the fully-
// assembled string in one place rather than requiring callers to hand-author
// '$1, $2, ...'. This used to live only in dbEngine.js's dbGet/dbAll, which
// missed withTransaction()'s tx.query/getOne/getAll entirely — sales.js's
// Phase 2 transaction code called tx.query() with '?' SQL that never got
// converted, and Postgres rejected it as a syntax error. Moving the
// conversion down into this file's own query() means every caller through
// every path (plain query, getOne/getAll, and every transaction) converts
// exactly once, in exactly one place, with no way to forget it.
function toPgPlaceholders(sql, params) {
  let i = 0;
  const converted = sql.replace(/\?/g, () => `$${++i}`);
  if (i !== params.length) {
    throw new Error(
      `[pgDb] Placeholder/param mismatch: SQL has ${i} '?' but ${params.length} params were given.\nSQL: ${sql}`
    );
  }
  return converted;
}

async function query(text, params = []) {
  const pool = getPgPool();
  return pool.query(toPgPlaceholders(text, params), params);
}

async function getOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

async function getAll(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

// fn receives { query, getOne, getAll, client } bound to the single checked-out
// client for the lifetime of the transaction. Commits on return, rolls back and
// rethrows on any error, always releases the client back to the pool.
async function withTransaction(fn) {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const txQuery = (text, params = []) => client.query(toPgPlaceholders(text, params), params);
    const txGetOne = async (text, params = []) => {
      const result = await txQuery(text, params);
      return result.rows[0] || null;
    };
    const txGetAll = async (text, params = []) => {
      const result = await txQuery(text, params);
      return result.rows;
    };

    const result = await fn({ query: txQuery, getOne: txGetOne, getAll: txGetAll, client });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[PG] ROLLBACK failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

// Postgres-native replacement for db.js's addColumnIfNotExists: Postgres has
// supported ADD COLUMN IF NOT EXISTS natively since 9.6, so the SQLite
// helper's manual PRAGMA table_info() existence check is unnecessary here.
// Not used by the initial bootstrap (schema.postgres.sql already has every
// column baked into each CREATE TABLE) — this exists for whatever Postgres-side
// migration comes after Phase 1's schema is extended in the future.
async function addColumnIfNotExists(table, column, columnDef) {
  await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${columnDef}`);
}

async function isBootstrapped() {
  try {
    const row = await getOne('SELECT 1 FROM schema_versions WHERE version = ?', [BOOTSTRAP_VERSION]);
    return !!row;
  } catch (e) {
    // relation "schema_versions" does not exist yet -> genuinely empty database
    if (e.code === '42P01') return false;
    throw e;
  }
}

// One-shot: loads the full Phase 1 DDL into an empty Postgres database. Unlike
// SQLite's runMigrations() (28 incremental, idempotent ALTER-based steps
// replayed on every boot), this runs the entire schema.postgres.sql as a single
// multi-statement batch — node-postgres's simple query protocol (triggered by
// passing a plain string with no params) executes semicolon-separated
// statements as one implicit transaction, so a failure partway rolls back the
// whole batch rather than leaving a half-created schema.
//
// schema_versions.version = 1 marks "bootstrap has run"; re-running against an
// already-bootstrapped database is a no-op, since re-executing the DDL file
// would fail on the ALTER TABLE ADD CONSTRAINT lines (Postgres has no
// `ADD CONSTRAINT IF NOT EXISTS`, unlike CREATE TABLE/INDEX).
async function bootstrapPostgresSchema() {
  if (await isBootstrapped()) {
    console.log('[PG] Schema already bootstrapped — skipping.');
    return;
  }

  console.log('[PG] Bootstrapping Postgres schema from schema.postgres.sql...');
  const ddl = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const pool = getPgPool();
  await pool.query(ddl);
  await pool.query(
    'INSERT INTO schema_versions (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
    [BOOTSTRAP_VERSION, 'Phase 1 bootstrap: full schema.postgres.sql applied']
  );
  console.log('[PG] Bootstrap complete.');
}

// ── Incremental Postgres migrations (post-bootstrap) ────────────────────────
// bootstrapPostgresSchema() above is deliberately ONE-SHOT: it applies the
// whole DDL file to an empty database and marks version 1. That is correct for
// a fresh database and wrong for every subsequent schema change — a database
// bootstrapped from an older schema.postgres.sql skips the bootstrap forever
// (isBootstrapped() is true), so any DDL added to that file afterwards is
// simply never applied to it. There was no mechanism to close that gap, which
// is exactly how `investor_directory` came to be "committed but missing":
// commit b5d870d appended it (plus employees' qualification/emergency-contact
// columns and government_schemes' last_verified_at/created_at/updated_at) to
// schema.postgres.sql and touched nothing else, so every already-bootstrapped
// database still lacks all of it. The DDL file was right; nothing ever ran it.
//
// This is the SQLite side's runMigrations() pattern (config/db.js) ported over:
// numbered, append-only, each recorded in schema_versions, each wrapped in its
// own transaction. Two differences from the SQLite version, both simplifying:
// Postgres DDL is transactional (a failed migration rolls back cleanly instead
// of leaving a half-applied schema), and Postgres has native ADD COLUMN IF NOT
// EXISTS / CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, so no
// PRAGMA-style existence probing is needed.
//
// Every statement here MUST be idempotent, because these run against fresh
// databases too: a fresh bootstrap already applied the current DDL file (which
// contains all of this), so migration 2 is a no-op there — it still gets
// recorded, so schema_versions honestly reflects which steps are known-applied
// regardless of which path a given database arrived by.
//
// To add a schema change from here on: append the DDL to schema.postgres.sql
// (so fresh databases get it at bootstrap) AND add a numbered block below (so
// existing databases get it too). Doing only the first is the bug above.
const PG_MIGRATIONS = [
  {
    version: 2,
    description: 'b5d870d backfill: employee qualification/emergency-contact, government_schemes timestamps, investor_directory',
    statements: [
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS qualification TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT`,

      `ALTER TABLE government_schemes ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ`,
      `ALTER TABLE government_schemes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()`,
      `ALTER TABLE government_schemes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`,

      // Kept character-for-character in sync with the block in
      // schema.postgres.sql — global reference data, deliberately not
      // company_id-scoped (this is the curated directory, not the per-company
      // `investors` CRM table).
      `CREATE TABLE IF NOT EXISTS investor_directory (
        id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name                TEXT NOT NULL,
        org_type            TEXT,
        focus_sectors       TEXT,
        investment_stage    TEXT,
        ticket_size_min     DOUBLE PRECISION,
        ticket_size_max     DOUBLE PRECISION,
        region              TEXT,
        country_code        TEXT DEFAULT 'IN',
        website_url         TEXT,
        contact_info        TEXT,
        description         TEXT,
        notable_portfolio   TEXT,
        is_active           BOOLEAN DEFAULT true,
        sort_order          INTEGER DEFAULT 0,
        created_at          TIMESTAMPTZ DEFAULT now(),
        updated_at          TIMESTAMPTZ DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_investor_directory_type ON investor_directory(org_type, investment_stage)`,
    ],
  },
  {
    version: 3,
    description: 'product_groups tenant scoping: company_id + UNIQUE(company_id, name) (mirrors SQLite migration 31)',
    // JS-driven (`run`, not `statements`): splitting a group row that's shared
    // across companies (found on the live SQLite data -- see migration 31's
    // comment in config/db.js) needs a per-row conditional backfill, not a
    // single SQL statement. Both forms are supported by runPostgresMigrations()
    // below; static `statements` stays the simpler path for migration 2.
    async run(client) {
      await client.query('ALTER TABLE product_groups ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id)');

      // Drop the old global UNIQUE(name) if this database still has it (a
      // fresh bootstrap on the CURRENT schema.postgres.sql never creates it --
      // only a database bootstrapped before that file was updated would).
      // Looked up by column signature rather than hardcoding the
      // auto-generated constraint name, so this stays correct either way.
      const oldUnique = await client.query(`
        SELECT con.conname
        FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'product_groups' AND con.contype = 'u'
          AND (SELECT array_agg(attname ORDER BY attname) FROM pg_attribute
               WHERE attrelid = con.conrelid AND attnum = ANY(con.conkey)) = ARRAY['name']::name[]
      `);
      for (const row of oldUnique.rows) {
        await client.query(`ALTER TABLE product_groups DROP CONSTRAINT ${row.conname}`);
      }

      // Backfill / split -- identical logic to SQLite migration 31: zero
      // companies using a group -> orphaned, delete; exactly one -> assign
      // directly; more than one -> the row is shared, keep it for the lowest
      // company_id and clone+repoint a new row for every other company.
      const groups = (await client.query(
        'SELECT id, name, description, created_at, updated_at FROM product_groups'
      )).rows;
      for (const g of groups) {
        const companyIds = (await client.query(
          'SELECT DISTINCT company_id FROM products WHERE group_id = $1 AND company_id IS NOT NULL', [g.id]
        )).rows.map(r => r.company_id).sort((a, b) => a - b);

        if (companyIds.length === 0) {
          await client.query('DELETE FROM product_groups WHERE id = $1', [g.id]);
        } else if (companyIds.length === 1) {
          await client.query('UPDATE product_groups SET company_id = $1 WHERE id = $2', [companyIds[0], g.id]);
        } else {
          const [keepCompany, ...restCompanies] = companyIds;
          await client.query('UPDATE product_groups SET company_id = $1 WHERE id = $2', [keepCompany, g.id]);
          for (const cid of restCompanies) {
            const inserted = await client.query(
              'INSERT INTO product_groups (company_id, name, description, created_at, updated_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
              [cid, g.name, g.description, g.created_at, g.updated_at]
            );
            await client.query('UPDATE products SET group_id = $1 WHERE group_id = $2 AND company_id = $3',
              [inserted.rows[0].id, g.id, cid]);
          }
        }
      }

      // Add the composite unique unless a fresh-bootstrap database already
      // has it inline from the current schema.postgres.sql.
      const compositeExists = await client.query(`
        SELECT 1 FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'product_groups' AND con.contype = 'u'
          AND (SELECT array_agg(attname ORDER BY attname) FROM pg_attribute
               WHERE attrelid = con.conrelid AND attnum = ANY(con.conkey)) = ARRAY['company_id','name']::name[]
      `);
      if (compositeExists.rowCount === 0) {
        await client.query('ALTER TABLE product_groups ADD CONSTRAINT product_groups_company_id_name_key UNIQUE (company_id, name)');
      }
    },
  },
  {
    version: 4,
    description: 'invoices tenant scoping: UNIQUE(company_id, invoice_number) replacing bare UNIQUE(invoice_number) (mirrors SQLite migration 32)',
    // JS-driven for the same reason as migration 3: look up the actual
    // constraint names by column signature rather than hardcode them, so
    // this is correct whether the database still has the old bare UNIQUE (an
    // already-bootstrapped database) or never did (fresh bootstrap on the
    // current schema.postgres.sql, which already declares the composite
    // UNIQUE inline -- this migration is then a no-op, still recorded).
    //
    // No data backfill needed (unlike migration 3): the OLD database-wide
    // UNIQUE already guaranteed no two rows share an invoice_number, so every
    // existing row already satisfies the new, narrower
    // UNIQUE(company_id, invoice_number) as-is.
    async run(client) {
      const oldUnique = await client.query(`
        SELECT con.conname
        FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'invoices' AND con.contype = 'u'
          AND (SELECT array_agg(attname ORDER BY attname) FROM pg_attribute
               WHERE attrelid = con.conrelid AND attnum = ANY(con.conkey)) = ARRAY['invoice_number']::name[]
      `);
      for (const row of oldUnique.rows) {
        await client.query(`ALTER TABLE invoices DROP CONSTRAINT ${row.conname}`);
      }

      const compositeExists = await client.query(`
        SELECT 1 FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'invoices' AND con.contype = 'u'
          AND (SELECT array_agg(attname ORDER BY attname) FROM pg_attribute
               WHERE attrelid = con.conrelid AND attnum = ANY(con.conkey)) = ARRAY['company_id','invoice_number']::name[]
      `);
      if (compositeExists.rowCount === 0) {
        await client.query('ALTER TABLE invoices ADD CONSTRAINT invoices_company_id_invoice_number_key UNIQUE (company_id, invoice_number)');
      }
    },
  },
  {
    version: 5,
    description: 'reference-data seeding: gst_uqc_master, compliance_rules/categories, trade_guidelines/authorities/countries (mirrors SQLite migrations 10/21/27)',
    // Confirmed via direct count comparison against the live seeded SQLite
    // database that this data was NEVER seeded into Postgres at all (0 rows
    // in every one of these 4 tables) -- not a Postgres-specific bug like
    // migrations 2-4, but a gap in what got ported during Phase 2: the tables
    // themselves are in schema.postgres.sql (so bootstrapPostgresSchema()
    // creates them), but the SQLite-side seed data only ever gets inserted by
    // config/db.js's migrations 10/21/27, which never run on the Postgres
    // path. All four tables are global reference data, not company-scoped --
    // no tenant-splitting concern like migrations 3/31 had.
    //
    // Reuses the exact same data arrays complianceSeed.js/tradeSeed.js export
    // for the SQLite seed (CATEGORIES/RULES/RESOURCES, GUIDELINES/
    // AUTHORITIES/COUNTRIES) rather than re-typing this data a second time --
    // only the insert mechanics differ (native pg $n params, BOOLEAN instead
    // of INTEGER 0/1 for mandatory/is_required/is_active, RETURNING id instead
    // of lastInsertRowid). Idempotent by natural key exactly like the SQLite
    // version (code / short_name / country_code), so admin edits made later
    // via the API are never clobbered by a re-run.
    async run(client) {
      // ── gst_uqc_master (migration 10's static 9-row list) ──────────────────
      const UQCS = [
        ['NOS', 'Numbers'], ['KGS', 'Kilograms'], ['MTR', 'Meters'],
        ['PCS', 'Pieces'], ['LTR', 'Liters'], ['BOX', 'Boxes'],
        ['DOZ', 'Dozens'], ['PAC', 'Packs'], ['SET', 'Sets'],
      ];
      for (const [code, desc] of UQCS) {
        await client.query('INSERT INTO gst_uqc_master (code, description) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING', [code, desc]);
      }

      // ── compliance_categories ───────────────────────────────────────────────
      for (const c of COMPLIANCE_CATEGORIES) {
        await client.query(
          'INSERT INTO compliance_categories (key, name, icon, sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO NOTHING',
          [c.key, c.name, c.icon, c.sort_order]
        );
      }

      // ── compliance_rules (+ conditions + documents) ─────────────────────────
      let complianceRulesCreated = 0;
      for (const r of COMPLIANCE_RULES) {
        const existing = await client.query('SELECT id FROM compliance_rules WHERE code = $1', [r.code]);
        if (existing.rowCount > 0) continue; // already seeded -- respect any admin edits

        const inserted = await client.query(`
          INSERT INTO compliance_rules
            (code, country, state, title, description, category_key, department, portal_url, reference_url,
             mandatory, frequency, renewal_interval_months, due_day, due_month, grace_period_days,
             penalty_info, priority, ai_explanation, is_active)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true)
          RETURNING id
        `, [
          r.code, r.country || 'IN', r.state || null, r.title, r.description || null,
          r.category_key, r.department || null, r.portal_url || null, r.reference_url || null,
          r.mandatory != null ? !!r.mandatory : true, r.frequency,
          r.renewal_interval_months || null, r.due_day || null, r.due_month || null,
          r.grace_period_days || 0, r.penalty_info || null, r.priority || 'medium',
          r.ai_explanation || null,
        ]);
        const ruleId = inserted.rows[0].id;
        for (const c of (r.conditions || [])) {
          await client.query(
            'INSERT INTO compliance_rule_conditions (rule_id, attribute, operator, value) VALUES ($1,$2,$3,$4)',
            [ruleId, c.attribute, c.operator, c.value]
          );
        }
        for (const d of (r.documents || [])) {
          await client.query(
            'INSERT INTO compliance_rule_documents (rule_id, doc_name, is_required) VALUES ($1,$2,true)',
            [ruleId, d]
          );
        }
        complianceRulesCreated++;
      }

      // ── Government Resource Center fields (fills only if still NULL) ───────
      for (const [code, r] of Object.entries(COMPLIANCE_RESOURCES)) {
        await client.query(`
          UPDATE compliance_rules
          SET processing_fee   = COALESCE(processing_fee, $1),
              typical_timeline = COALESCE(typical_timeline, $2),
              guide_url        = COALESCE(guide_url, $3),
              forms_json       = COALESCE(forms_json, $4)
          WHERE code = $5
        `, [
          r.processing_fee || null, r.typical_timeline || null, r.guide_url || null,
          r.forms ? JSON.stringify(r.forms) : null, code,
        ]);
      }

      // ── trade_authorities (keyed by short_name) ─────────────────────────────
      const authIdByShortName = {};
      for (const a of TRADE_AUTHORITIES) {
        const existing = await client.query('SELECT id FROM trade_authorities WHERE short_name = $1', [a.short_name]);
        if (existing.rowCount > 0) {
          authIdByShortName[a.short_name] = existing.rows[0].id;
        } else {
          const inserted = await client.query(
            'INSERT INTO trade_authorities (name, short_name, description, website, country) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [a.name, a.short_name, a.description, a.website, 'IN']
          );
          authIdByShortName[a.short_name] = inserted.rows[0].id;
        }
      }

      // ── trade_countries (keyed by country_code) ─────────────────────────────
      for (const c of TRADE_COUNTRIES) {
        const existing = await client.query('SELECT id FROM trade_countries WHERE country_code = $1', [c.country_code]);
        if (existing.rowCount > 0) continue;
        await client.query(`
          INSERT INTO trade_countries (country_code, country_name, region, requirements_json, restricted_products_json,
            import_duties_notes, standards_json, shipping_notes, official_links_json)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [
          c.country_code, c.country_name, c.region, JSON.stringify(c.requirements),
          JSON.stringify(c.restricted_products), c.import_duties_notes, JSON.stringify(c.standards),
          c.shipping_notes, JSON.stringify(c.official_links),
        ]);
      }

      // ── trade_guidelines (+ conditions + documents) ─────────────────────────
      for (const g of TRADE_GUIDELINES) {
        const existing = await client.query('SELECT id FROM trade_guidelines WHERE code = $1', [g.code]);
        if (existing.rowCount > 0) continue;

        const inserted = await client.query(`
          INSERT INTO trade_guidelines
            (code, country, category, title, description, department, authority_id, official_website,
             fees, processing_time, renewal_requirement, penalty_info, faq_json, ai_explanation,
             frequency, renewal_interval_months, mandatory, is_active)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true)
          RETURNING id
        `, [
          g.code, g.country || 'IN', g.category, g.title, g.description || null,
          g.department || null, authIdByShortName[g.authority_short] || null, g.official_website || null,
          g.fees || null, g.processing_time || null, g.renewal_requirement || null, g.penalty_info || null,
          g.faq ? JSON.stringify(g.faq) : null, g.ai_explanation || null,
          g.frequency || 'one_time', g.renewal_interval_months || null,
          g.mandatory != null ? !!g.mandatory : true,
        ]);
        const guidelineId = inserted.rows[0].id;
        for (const c of (g.conditions || [])) {
          await client.query(
            'INSERT INTO trade_rule_conditions (guideline_id, attribute, operator, value) VALUES ($1,$2,$3,$4)',
            [guidelineId, c.attribute, c.operator, c.value ?? null]
          );
        }
        for (const d of (g.documents || [])) {
          await client.query(
            'INSERT INTO trade_documents (guideline_id, doc_name, is_required) VALUES ($1,$2,true)',
            [guidelineId, d]
          );
        }
      }

      console.log(`[PG] Migration 5: seeded ${complianceRulesCreated}/${COMPLIANCE_RULES.length} compliance rules, ${COMPLIANCE_CATEGORIES.length} categories, ${TRADE_GUIDELINES.length} trade guidelines, ${TRADE_AUTHORITIES.length} authorities, ${TRADE_COUNTRIES.length} countries, 9 UQC codes.`);
    },
  },
  {
    version: 6,
    description: 'RBAC reference-data seeding: permission_groups + permissions (mirrors SQLite migration 16)',
    // Found during Checkpoint 1 (Phase 4) real-data migration prep, not
    // during the earlier Checkpoint 0 audit -- the shared dev Postgres
    // container had these two tables populated from an old manual scratch
    // script (see commit b832db3), which masked the fact that there was no
    // actual migration seeding them. Recreating the dev database from scratch
    // for Checkpoint 1 exposed it: both tables read 0 with nothing else
    // touching them.
    //
    // This is a real Postgres-path correctness bug independent of any data
    // migration: ensureOwnerRoleAsync (config/dbEngine.js-driven, called from
    // routes/auth.js signup) assigns a brand-new company's Owner role EVERY
    // row currently in `permissions` -- with an empty table, every fresh
    // company signup on Postgres silently gets an Owner with zero
    // permissions. Same data complianceSeed.js/tradeSeed.js pattern doesn't
    // apply here (this data was only ever inline in config/db.js's migration
    // 16, never exported), so it's reproduced directly rather than imported.
    async run(client) {
      const GROUPS = [
        'Employees', 'Attendance', 'Leaves', 'Payroll', 'Reports', 'Settings',
        'Notifications', 'Audit Logs', 'Branches', 'Departments', 'Sales',
        'Inventory', 'Products', 'Customers', 'Suppliers', 'GST', 'Marketing', 'AI',
      ];
      const PERMISSIONS = [
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
        { group: 'Suppliers', actions: ['suppliers.view', 'suppliers.manage'] },
      ];

      const groupIdByName = {};
      for (const name of GROUPS) {
        const existing = await client.query('SELECT id FROM permission_groups WHERE name = $1', [name]);
        if (existing.rowCount > 0) {
          groupIdByName[name] = existing.rows[0].id;
        } else {
          const inserted = await client.query('INSERT INTO permission_groups (name) VALUES ($1) RETURNING id', [name]);
          groupIdByName[name] = inserted.rows[0].id;
        }
      }

      let permissionsCreated = 0;
      for (const block of PERMISSIONS) {
        const groupId = groupIdByName[block.group];
        for (const action of block.actions) {
          const existing = await client.query('SELECT id FROM permissions WHERE action = $1', [action]);
          if (existing.rowCount > 0) continue;
          await client.query(
            'INSERT INTO permissions (group_id, action, description, is_system) VALUES ($1,$2,$3,true)',
            [groupId, action, `Allows ${action.replace('.', ' ')}`]
          );
          permissionsCreated++;
        }
      }

      console.log(`[PG] Migration 6: seeded ${GROUPS.length} permission groups, ${permissionsCreated} permissions.`);
    },
  },
];

async function hasPgVersion(version) {
  const row = await getOne('SELECT 1 FROM schema_versions WHERE version = ?', [version]);
  return !!row;
}

// Runs after bootstrapPostgresSchema() on every boot. Safe to call repeatedly:
// already-recorded versions are skipped, and every statement is IF NOT EXISTS.
async function runPostgresMigrations() {
  for (const migration of PG_MIGRATIONS) {
    if (await hasPgVersion(migration.version)) continue;

    console.log(`[PG] Running Migration ${migration.version}: ${migration.description}`);
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (migration.run) {
        await migration.run(client);
      } else {
        for (const statement of migration.statements) {
          await client.query(statement);
        }
      }
      await client.query(
        'INSERT INTO schema_versions (version, description) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
        [migration.version, migration.description]
      );
      await client.query('COMMIT');
      console.log(`[PG] Migration ${migration.version} complete.`);
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[PG] ROLLBACK failed:', rollbackErr.message);
      }
      console.error(`[PG] Migration ${migration.version} FAILED — rolled back:`, e.message);
      throw e;
    } finally {
      client.release();
    }
  }
}

module.exports = {
  getPgPool,
  query,
  getOne,
  getAll,
  withTransaction,
  addColumnIfNotExists,
  bootstrapPostgresSchema,
  runPostgresMigrations,
  toPgPlaceholders,
};
