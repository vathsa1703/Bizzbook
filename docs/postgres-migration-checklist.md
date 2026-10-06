# PostgreSQL deployment notes

The application currently uses PostgreSQL as its only live database engine.
This document replaces the earlier cutover checklist, which described a
SQLite-only implementation and is no longer accurate.

## Runtime database path

- `backend/src/server.js` calls `validateSystem()` before listening.
- `backend/src/services/systemValidator.js` runs schema bootstrap, versioned
  migrations, a connection query, core-table checks, and an auth transaction.
- `backend/src/config/pgPool.js` creates the shared `pg.Pool` from
  `DATABASE_URL`, or local `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and
  `PGDATABASE` values.
- `backend/src/config/pgDb.js` owns query execution, transactions, bootstrap,
  migrations, and reference-data setup.
- `backend/src/db/schema.postgres.sql` is the fresh-database DDL.
- `backend/src/db/seed.js` runs the idempotent bootstrap/migrations and checks
  required tables and seeded reference data. It does not create demo accounts.

## New Render database cutover

Create a new PostgreSQL database for BizBook and set its connection string as
the Render service's `DATABASE_URL`. Do not put the value in this repository.
The old `orudina-db` Blueprint declaration is retained so Blueprint sync does
not remove or alter that existing resource; the service is not linked to it.
The new database is initialized automatically before the service listens, or
can be initialized manually by running `npm run seed` from `backend` with the
new connection string configured.

The current Render service uses `node backend/src/server.js`, builds the
frontend and backend from the repository, and checks `GET /api/health`.

## Legacy SQLite files

`backend/src/db/schema.sql`, `schema_growth.sql`, and `schema_sprint11.sql`,
SQLite inspection/migration utilities, and `backend/seed_demo.js` are retained
historical/local artifacts. They are not part of production startup. Use
`schema.postgres.sql`, `pgDb.js`, and `npm run seed` for PostgreSQL setup.
