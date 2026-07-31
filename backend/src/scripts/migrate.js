// Historical only. This script drove SQLite's numbered migrations via
// config/db.js's runMigrations(), back when SQLite was the active engine.
// The SQLite path (config/db.js, node:sqlite, DB_ENGINE) has been removed --
// Postgres is now the only engine, and its migrations run automatically via
// config/pgDb.js's bootstrapPostgresSchema()/runPostgresMigrations(), invoked
// from services/systemValidator.js on every boot. There is nothing left for
// this script to do.
console.log('src/scripts/migrate.js is historical-only (SQLite path removed). ' +
  'Postgres migrations run automatically on boot via systemValidator.js -- ' +
  'nothing to do here.');
