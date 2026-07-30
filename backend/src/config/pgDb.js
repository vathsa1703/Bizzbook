const fs = require('fs');
const path = require('path');
const { getPgPool } = require('./pgPool');

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
      for (const statement of migration.statements) {
        await client.query(statement);
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
