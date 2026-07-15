# SQLite → PostgreSQL migration checklist

Snapshot of what actually needs to change, based on the current codebase (not a generic guide).
Numbers below are from a grep of `backend/src` at the time this was written.

## 1. Connection layer — the biggest change

- `backend/src/config/db.js` currently opens a **synchronous** `node:sqlite` `DatabaseSync`
  connection per `getDb()` call. Postgres via `pg` (node-postgres) is **fully async** — every
  `db.prepare(sql).get()/.run()/.all()` call becomes an `await pool.query(sql, params)` call.
- **~1,271 call sites** across **72 files** call `db.prepare(...)`/`db.exec(...)` synchronously.
  Every one of those functions — and every caller up the chain to the route handler — needs to
  become `async`/`await`. This is the largest single line-item, not a config change.
- Replace the current "open a fresh connection, expect the caller to `db.close()`" pattern with a
  shared `pg.Pool`, initialized once and reused across requests. Remove all `db.close()` calls.
- Placeholder syntax changes: `node:sqlite` uses positional `?` placeholders; `pg` uses `$1, $2, …`.
  Every one of the ~1,271 query strings needs its placeholders rewritten (or route all queries
  through a query builder like Knex/Kysely that abstracts this — worth evaluating given the
  volume).

## 2. `DB_PATH` → `DATABASE_URL`

- `DB_PATH` (added for this deployment, see `backend/src/config/db.js`) is replaced by a Postgres
  connection string, conventionally `DATABASE_URL` (`postgres://user:pass@host:port/dbname`).
- This is exactly the seam that was isolated for this purpose — only `db.js`'s connection-opening
  code and the Render env var change; no other file references `DB_PATH` directly.
- Managed Postgres providers (Render Postgres, RDS, Supabase, etc.) typically require
  `?sslmode=require` on the connection string — confirm before first connect.

## 3. Schema syntax (`backend/src/db/schema.sql`)

- **`AUTOINCREMENT`** appears **116 times**. Postgres equivalent is
  `GENERATED ALWAYS AS IDENTITY` (preferred) or `SERIAL` (legacy but simpler to search/replace).
- **`datetime('now')`** appears **100 times** as a column default. Postgres equivalent is
  `now()` or `CURRENT_TIMESTAMP`.
- SQLite has no real `BOOLEAN` type — booleans are stored as `INTEGER` `0`/`1` throughout. Decide
  whether to migrate to native Postgres `BOOLEAN` (cleaner, but every JS call site that does
  `=== 1` / `=== 0` truthiness checks on these columns needs auditing) or keep `INTEGER` for a
  faster 1:1 port and revisit later.
- SQLite is dynamically typed (columns don't strictly enforce declared types); Postgres enforces
  types strictly. Expect to hit rows where a numeric column has a stray empty-string or similar —
  worth a data-quality pass before the real migration, not during it.
- `CREATE TABLE IF NOT EXISTS` — supported identically in Postgres, no change needed there.

## 4. Migration runner (`runMigrations()` in `db.js`)

- `addColumnIfNotExists()` currently checks `PRAGMA table_info(table)` to see if a column exists.
  Postgres equivalent: query `information_schema.columns WHERE table_name = ? AND column_name = ?`.
- Actually simpler in Postgres: `ALTER TABLE x ADD COLUMN IF NOT EXISTS y TYPE` is natively
  supported (SQLite's `ALTER TABLE ADD COLUMN` has no `IF NOT EXISTS`, which is why this codebase
  built the `PRAGMA`-based existence check in the first place). This whole helper can likely be
  simplified once on Postgres.
- The `schema_versions` tracking table and the `if (!hasVersion(N))` numbered-migration pattern
  carries over conceptually unchanged — just rewrite the SQL bodies per the above.
- `db.exec('BEGIN TRANSACTION')` / `COMMIT` / `ROLLBACK` — syntactically similar in `pg`
  (`client.query('BEGIN')` etc.), but must be run on a single **checked-out client** from the pool,
  not the pool itself (the pool distributes queries across connections; a transaction needs one
  fixed connection for its duration).

## 5. Data migration (the actual cutover)

- Export the live `backend/data/business.db` and load it into the target Postgres database.
  `pgloader` (supports SQLite → Postgres directly, handles type coercion) is the standard tool —
  simpler than hand-writing a dump/import script given ~40+ tables.
- Verify foreign-key integrity explicitly: SQLite only enforces `FOREIGN KEY` constraints if
  `PRAGMA foreign_keys = ON` was set (check whether this codebase ever sets it — if not, there may
  be orphaned rows that only surface as hard errors once Postgres enforces FKs by default).
- Re-verify GST/financial numeric columns after import — confirm `REAL`/`INTEGER` columns landed as
  the intended Postgres numeric type (`NUMERIC` for currency amounts is safer than `REAL`/`FLOAT`
  for GST math; this is a good opportunity to fix precision issues if any exist).

## 6. Multi-tenant scoping — verify, don't assume

- `backend/src/utils/BranchScopedQuery.js` builds SQL fragments (`withBranchScope`) that get
  concatenated into the base queries. Audit this file specifically for `?`-placeholder assumptions
  once query construction moves to `$n` style.

## 7. Deployment config changes

- Render: either provision a Render Postgres instance (or external managed Postgres), set
  `DATABASE_URL` in the dashboard, and remove/ignore `DB_PATH`.
- `render.yaml` (this repo's root) will need a `databases:` block if using Render's managed
  Postgres, or just the new env var if pointing at an external instance.
- Drop the free-tier "data resets on redeploy" caveat entirely once on managed Postgres — that's
  one of the actual wins of doing this migration.

## 8. Testing after cutover

- There is no automated test suite in this repo. Verification will be manual:
  `npm run validate-system`, then exercise core flows per module (sales, GST invoice creation,
  multi-branch scoping, RBAC) via the `backend/scratch/*.js` scripts or direct API calls — same
  approach used to verify this deployment.
- Specifically re-check anything gated by `gstEngine.js` (tax math) and `BranchScopedQuery.js`
  (tenant isolation) — these are the two areas where a silent type/placeholder bug would be most
  costly.
