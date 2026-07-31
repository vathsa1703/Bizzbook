const pgDb = require('./pgDb');

// Postgres-only data access layer. This file used to dispatch between SQLite
// and Postgres during the migration (see git history / CLAUDE.md's Phase 4
// notes for that era) -- the SQLite path and the DB_ENGINE flag that selected
// it have been removed now that the cutover is complete and confirmed stable.
// Query text stays written in the original SQLite-style '?' placeholder
// convention everywhere (including utils/BranchScopedQuery.js), converted to
// Postgres's '$1, $2, ...' once, at the lowest layer (pgDb.js's query()), so
// every access path here converts through the same code with no way for a
// caller to forget it.

// Reading a boolean column with a strict `col !== 0` / `col === 1` check
// breaks silently on Postgres BOOLEAN: `false !== 0` is `true` in JS, so a
// genuinely-off flag reads as on -- no error, just a wrong answer (found in
// sales.js's is_gst_registered/inclusive_pricing reads, and the identical
// pattern in purchases.js). The safe test is a strict inequality against a
// literal 0/1 -- a plain truthy ternary (`col ? a : b`) or `col ?? fallback`
// is fine as-is, since 0 and false are both falsy and neither operator
// distinguishes them. Use this helper wherever a boolean column is read with
// `!== 0`/`=== 1` semantics ("NULL/1/true all count as on, only explicit
// 0/false count as off").
function isOn(v) {
  return !(v === 0 || v === false);
}

// Single-row fetch. sql/params are written SQLite-style ('?'); pgDb.js
// converts placeholders before sending the query.
async function dbGet(sql, params = []) {
  return pgDb.getOne(sql, params);
}

// Multi-row fetch. sql/params are written SQLite-style ('?').
async function dbAll(sql, params = []) {
  return pgDb.getAll(sql, params);
}

// ── Shared query-executor abstraction ───────────────────────────────────────
// Several services (marketingEngine.js, metricsService.js,
// segmentationEngine.js, roiEngine.js, spendIntelligenceEngine.js,
// marketingMetricsService.js, taskService.js) are structured as a public
// entry point plus a set of internal helpers that all take a `db`-like
// handle as a plain parameter (dependency injection) rather than opening
// their own connection -- this lets one helper's query build on another's
// result without each managing its own connection lifecycle. `x` below gives
// every one of those helpers the same {engine, get, all, run, insert} shape,
// whether it's the shared pool (withExecutor) or a single transaction's
// pinned client (withTxExecutor) -- the same guarantee against the
// transaction-escaping bug class (companySettings.js) that taskService.js's
// inline version of this pattern already established.
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

// Runs fn(x) against the shared (non-transactional) Postgres pool.
async function withExecutor(fn) {
  return fn(pgExecutor({ query: pgDb.query, getOne: pgDb.getOne, getAll: pgDb.getAll }));
}

// Runs fn(x) as a single atomic transaction.
async function withTxExecutor(fn) {
  return pgDb.withTransaction((tx) => fn(pgExecutor(tx)));
}

// SQLite's date(?, '-N days') took the anchor date as a bound '?' param and
// subtracted N days; Postgres has no two-arg date() function (its date() is
// a one-arg type cast), so this is a typed date minus an interval. Consumes
// the exact same single '?'/anchor-date param. Recurs across
// marketingEngine.js, metricsService.js, segmentationEngine.js, and
// productOpportunityService.js -- kept as one shared helper rather than
// copy-pasted per file, which is exactly the kind of duplication that goes
// stale when only some copies get updated.
function dateSub(x, days) {
  return `(?::date - interval '${days} days')`;
}

// Inventory collapsed to exactly one row per product, for use as a FROM-clause
// subquery in the stock-vs-sales queries (slow-moving / dead stock / overstock
// in metricsService.js, dead-stock opportunities in marketingEngine.js,
// overstock in dataService.js).
//
// Those queries need a per-product stock level alongside an aggregate over a
// LEFT JOIN to sales. Selecting a bare `i.stock_quantity` under `GROUP BY p.id`
// is rejected outright by Postgres ("must appear in the GROUP BY clause or be
// used in an aggregate function"). Two seemingly-obvious fixes are both wrong
// here:
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
// places, so multi-row-per-product is the schema's intent, not an anomaly.
//
// Tenancy is unaffected and deliberately NOT filtered here: a product belongs
// to exactly one company, and every caller keeps its own p.company_id predicate
// on the outer query, so summing by product_id cannot cross tenants. Adding a
// company_id filter inside this subquery would instead risk dropping rows where
// inventory.company_id is NULL (it is nullable, and older rows predate it).
//
// Callers must use `GROUP BY p.id, i.stock_quantity` — grouping by the
// pre-aggregated value is what makes it a legal non-aggregated selection.
const INVENTORY_BY_PRODUCT = `(
      SELECT product_id, SUM(stock_quantity) AS stock_quantity
      FROM inventory
      GROUP BY product_id
    )`;

module.exports = { dbGet, dbAll, isOn, pgExecutor, withExecutor, withTxExecutor, dateSub, INVENTORY_BY_PRODUCT };
