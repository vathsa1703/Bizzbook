const { getDb } = require('./db');
const pgDb = require('./pgDb');

// Shared SQLite/Postgres dispatch for services being rewritten in Phase 2.
// Only dataService.js (analytics module) is wired to this so far — no other
// service has been touched. Later Phase 2 modules import this same file
// rather than re-implementing the switch.
//
// Query text stays written in SQLite's plain '?' placeholder style
// everywhere, including in utils/BranchScopedQuery.js, which is unchanged by
// Phase 2: it always appends '... AND col = ?' / '... AND col IN (?,?,...)'
// regardless of engine. toPgPlaceholders() below converts '?' -> '$1,$2,...'
// on the FINAL, fully-concatenated SQL string, immediately before it's sent
// to Postgres — after BranchScopedQuery has already appended its predicate,
// not before. This is deliberate: numbering a fragment in isolation (e.g.
// having BranchScopedQuery itself emit '$3' because it's told "the base used
// 2 placeholders") is exactly the kind of manual bookkeeping that goes stale
// the moment a query changes shape. Converting the assembled string in one
// pass makes the base-query/appended-predicate split irrelevant to
// correctness — there is no separate renumbering step to get wrong. A
// runtime assertion (thrown, not logged) catches any '?' count / params
// count mismatch immediately rather than silently sending malformed SQL.
function toPgPlaceholders(sql, params) {
  let i = 0;
  const converted = sql.replace(/\?/g, () => `$${++i}`);
  if (i !== params.length) {
    throw new Error(
      `[dbEngine] Placeholder/param mismatch: SQL has ${i} '?' but ${params.length} params were given.\nSQL: ${sql}`
    );
  }
  return converted;
}

function engine() {
  return (process.env.DB_ENGINE || 'sqlite').toLowerCase();
}

// Single-row fetch. sql/params are always written SQLite-style ('?').
async function dbGet(sql, params = []) {
  if (engine() === 'postgres') {
    return pgDb.getOne(toPgPlaceholders(sql, params), params);
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
    return pgDb.getAll(toPgPlaceholders(sql, params), params);
  }
  const db = getDb();
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

module.exports = { dbGet, dbAll, toPgPlaceholders, engine };
