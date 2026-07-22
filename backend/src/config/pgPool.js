const { Pool } = require('pg');

// Phase 0 of the Postgres migration (see docs/postgres-migration-checklist.md): this pool
// exists in parallel with the active SQLite connection in db.js and is NOT wired into any
// route or service yet. Nothing calls getPgPool() outside of the connection proof script.
// DATABASE_URL takes precedence; discrete PG* vars are a fallback for local/manual setups
// that don't want to build a connection string by hand.
let pool = null;

function getPgPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  pool = connectionString
    ? new Pool({ connectionString })
    : new Pool({
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT) || 5433,
        user: process.env.PGUSER || 'bizbook',
        password: process.env.PGPASSWORD || 'bizbook_dev_only',
        database: process.env.PGDATABASE || 'bizbook_dev',
      });

  return pool;
}

module.exports = { getPgPool };
