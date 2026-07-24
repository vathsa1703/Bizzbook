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

module.exports = { dbGet, dbAll, engine, isOn };
