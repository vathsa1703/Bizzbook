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

// Inventory collapsed to exactly one row per product, for use as a FROM-clause
// subquery in the stock-vs-sales queries (slow-moving / dead stock / overstock
// in metricsService.js, dead-stock opportunities in marketingEngine.js,
// overstock in dataService.js).
//
// Those queries need a per-product stock level alongside an aggregate over a
// LEFT JOIN to sales. Selecting a bare `i.stock_quantity` under `GROUP BY p.id`
// is rejected outright by Postgres ("must appear in the GROUP BY clause or be
// used in an aggregate function") — SQLite silently picks an arbitrary row
// instead, which is why this only surfaced when DB_ENGINE=postgres was first
// exercised. Two seemingly-obvious fixes are both wrong here:
//
//   - SUM(i.stock_quantity) — the LEFT JOIN to sales fans the inventory row out
//     once per matching sale, so the sum multiplies stock by the sale count.
//   - adding i.stock_quantity to GROUP BY on its own — legal, but leaves a
//     product stocked in N branches as N separate result rows, each
//     double-counting that product's sales.
//
// Pre-aggregating inventory before the join avoids both: one row per product
// going in means nothing fans out, and SUM() across a product's branch/
// warehouse rows is the company-wide stock level these metrics are asking
// about. `inventory` has no unique constraint on product_id and migration 17
// added branch_id/warehouse_id precisely so a product can be stocked in several
// places, so multi-row-per-product is the schema's intent, not an anomaly —
// even though current data happens to be 1:1 (47 rows / 47 products, all
// branch_id NULL), which is why the arbitrary-row pick has looked correct.
//
// Tenancy is unaffected and deliberately NOT filtered here: a product belongs
// to exactly one company, and every caller keeps its own p.company_id predicate
// on the outer query, so summing by product_id cannot cross tenants. Adding a
// company_id filter inside this subquery would instead risk dropping rows where
// inventory.company_id is NULL (it is nullable, and older rows predate it).
//
// Callers must use `GROUP BY p.id, i.stock_quantity` — grouping by the
// pre-aggregated value is what makes it a legal non-aggregated selection.
// Engine-agnostic: identical text is valid on both SQLite and Postgres.
const INVENTORY_BY_PRODUCT = `(
      SELECT product_id, SUM(stock_quantity) AS stock_quantity
      FROM inventory
      GROUP BY product_id
    )`;

module.exports = { dbGet, dbAll, engine, isOn, sqliteExecutor, pgExecutor, withExecutor, withTxExecutor, dateSub, INVENTORY_BY_PRODUCT };
