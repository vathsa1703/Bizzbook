const { getDb } = require('./db');
const pgDb = require('./pgDb');

// Shared SQLite/Postgres dispatch for services being rewritten in Phase 2.
// Query text stays written in SQLite's plain '?' placeholder style everywhere,
// including in utils/BranchScopedQuery.js, which is unchanged by Phase 2: it
// always appends '... AND col = ?' / '... AND col IN (?,?,...)' regardless of
// engine. The '?' -> '$1,$2,...' conversion lives in pgDb.js's query() (and is
// therefore shared by dbGet/dbAll here, withTransaction()'s tx.query/getOne/
// getAll, and any other pgDb.js caller) — NOT duplicated here. It used to be
// duplicated here, which is exactly how a real bug happened: sales.js's
// Phase 2 rewrite called withTransaction()'s tx.query() with '?' SQL,
// assuming it converted like dbGet/dbAll do, but withTransaction() never ran
// through this file at all, so Postgres received literal '?' characters and
// rejected them as a syntax error. Converting once, at the lowest layer
// (pgDb.js's query()), means every Postgres access path — plain reads here,
// and every transaction — converts through the same code with no way for a
// caller to forget it.
function engine() {
  return (process.env.DB_ENGINE || 'sqlite').toLowerCase();
}

// Phase 1 converted ~55 INTEGER 0/1 columns to real Postgres BOOLEAN. Reading
// one back with a strict `col !== 0` check breaks silently under Postgres:
// `false !== 0` is `true` in JS, so a genuinely-off flag reads as on — no
// error, just a wrong answer (found in sales.js's is_gst_registered/
// inclusive_pricing reads; the identical pattern was in purchases.js too).
// The safe test is a strict inequality against a literal 0/1 -- a plain
// truthy ternary (`col ? a : b`) or `col ?? fallback` is fine as-is, since 0
// and false are both falsy and neither operator distinguishes them. Use this
// helper wherever a boolean column is read with `!== 0`/`=== 1` semantics
// ("NULL/1/true all count as on, only explicit 0/false count as off").
function isOn(v) {
  return !(v === 0 || v === false);
}

// Single-row fetch. sql/params are always written SQLite-style ('?').
async function dbGet(sql, params = []) {
  if (engine() === 'postgres') {
    return pgDb.getOne(sql, params);
  }
  const db = getDb();
  try {
    return db.prepare(sql).get(...params) || null;
  } finally {
    db.close();
  }
}

// Multi-row fetch. sql/params are always written SQLite-style ('?').
async function dbAll(sql, params = []) {
  if (engine() === 'postgres') {
    return pgDb.getAll(sql, params);
  }
  const db = getDb();
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

// ── Shared query-executor abstraction ───────────────────────────────────────
// Several services (marketingEngine.js, metricsService.js,
// segmentationEngine.js, roiEngine.js, spendIntelligenceEngine.js,
// marketingMetricsService.js, taskService.js) are structured as a public
// entry point plus a set of internal helpers that all take a `db`-like
// handle as a plain parameter (dependency injection) rather than opening
// their own connection — this lets one helper's query build on another's
// result without each managing its own connection lifecycle. `x` below
// gives every one of those helpers the same {engine, get, all, run, insert}
// shape regardless of what's underneath, so a helper written once against
// `x` works whether it's wrapping a SQLite db, the shared Postgres pool, or
// (via withTxExecutor) a single transaction's pinned client — the same
// guarantee against the transaction-escaping bug class (companySettings.js)
// that taskService.js's inline version of this pattern already established.
function sqliteExecutor(db) {
  return {
    engine: 'sqlite',
    get: async (sql, params = []) => db.prepare(sql).get(...params) ?? null,
    all: async (sql, params = []) => db.prepare(sql).all(...params),
    run: async (sql, params = []) => {
      const info = db.prepare(sql).run(...params);
      return { id: info.lastInsertRowid, changes: info.changes };
    },
    insert: async (sql, params = []) => db.prepare(sql).run(...params).lastInsertRowid,
  };
}

function pgExecutor(client) {
  return {
    engine: 'postgres',
    get: (sql, params = []) => client.getOne(sql, params),
    all: (sql, params = []) => client.getAll(sql, params),
    run: async (sql, params = []) => {
      const result = await client.query(sql, params);
      return { id: result.rows[0]?.id ?? null, changes: result.rowCount };
    },
    insert: async (sql, params = []) => {
      const row = await client.getOne(`${sql} RETURNING id`, params);
      return row?.id ?? null;
    },
  };
}

// Runs fn(x) against a plain (non-transactional) connection: a fresh SQLite
// handle (closed after) or the shared Postgres pool.
async function withExecutor(fn) {
  if (engine() === 'postgres') {
    return fn(pgExecutor({ query: pgDb.query, getOne: pgDb.getOne, getAll: pgDb.getAll }));
  }
  const db = getDb();
  try { return await fn(sqliteExecutor(db)); }
  finally { db.close(); }
}

// Runs fn(x) as a single atomic transaction, on both engines.
async function withTxExecutor(fn) {
  if (engine() === 'postgres') {
    return pgDb.withTransaction((tx) => fn(pgExecutor(tx)));
  }
  const db = getDb();
  try {
    db.exec('BEGIN TRANSACTION');
    try {
      const result = await fn(sqliteExecutor(db));
      db.exec('COMMIT');
      return result;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } finally { db.close(); }
}

// SQLite's date(?, '-N days') takes the anchor date as a bound '?' param and
// subtracts N days; Postgres has no two-arg date() function (its date() is a
// one-arg type cast), so the equivalent is a typed date minus an interval.
// Both forms consume the exact same single '?'/anchor-date param, so callers
// only swap the SQL fragment in — the params array is unchanged. This is the
// single source of truth for this pattern: it recurs across marketingEngine.js,
// metricsService.js, segmentationEngine.js, and productOpportunityService.js
// and was previously copy-pasted as raw SQLite-only date() calls in all of
// them, which is exactly the kind of duplication that goes stale on one
// engine while looking fine on the other.
function dateSub(x, days) {
  return x.engine === 'postgres' ? `(?::date - interval '${days} days')` : `date(?, '-${days} days')`;
}

module.exports = { dbGet, dbAll, engine, isOn, sqliteExecutor, pgExecutor, withExecutor, withTxExecutor, dateSub };
