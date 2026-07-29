const { Pool, types } = require('pg');

// Phase 0 of the Postgres migration (see docs/postgres-migration-checklist.md): this pool
// exists in parallel with the active SQLite connection in db.js and is NOT wired into any
// route or service yet. Nothing calls getPgPool() outside of the connection proof script.
// DATABASE_URL takes precedence; discrete PG* vars are a fallback for local/manual setups
// that don't want to build a connection string by hand.

// Phase 2 Module 1 finding: node-postgres leaves BIGINT (OID 20 — what
// SUM()/COUNT() return over INTEGER columns) and NUMERIC (OID 1700) as JS
// strings by default, to avoid silently losing precision beyond what a JS
// number can hold. SQLite/better-sqlite3-style access never had that
// distinction — every aggregate came back as a plain number. Restoring that
// here, globally, once, is far safer than special-casing every SUM/COUNT call
// site across the whole migration (1,271 call sites) to know it needs a
// Number() cast. This is a deliberate precision trade-off: safe for this
// app, since every quantity/count column is a 32-bit INTEGER (nowhere near
// Number.MAX_SAFE_INTEGER) and every money column is DOUBLE PRECISION, not
// NUMERIC — the app never had arbitrary-precision semantics to lose.
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));   // int8/bigint
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));   // numeric/decimal

// Phase 2 company.js finding: node-postgres's default parser for DATE (OID
// 1082 -- a pure calendar date, no time-of-day, e.g. expiry_date/issue_date/
// joining_date/date_of_birth) converts it into a JS Date object at LOCAL
// midnight. Serializing that via res.json() -> JSON.stringify() ->
// Date#toJSON() always renders in UTC, so on any host with a positive UTC
// offset the date silently shifts back a day on the wire (2026-08-04 in
// Postgres became "2026-08-03T18:30:00.000Z" in the HTTP response on this
// dev machine). SQLite never had this problem -- dates are plain 'YYYY-MM-DD'
// TEXT the whole way through, no Date object ever constructed. Passing the
// raw string straight through (pg already receives 'YYYY-MM-DD' off the
// wire before its own parser converts it) matches SQLite's representation
// exactly and needs no per-query fix-up. Deliberately narrow to OID 1082
// only -- TIMESTAMP/TIMESTAMPTZ columns (created_at, sessions.expires_at,
// etc.) are genuine points in time and are correctly left as Date objects
// serialized to full ISO8601 UTC, already verified against JWT exp in the
// auth module.
types.setTypeParser(1082, (val) => val);                                      // date

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
