// Historical only. This script generated mock data directly into
// data/business.db via config/db.js's synchronous node:sqlite API, from
// before the schema was multi-tenant (no company_id/branch_id on any of the
// rows it inserted). The SQLite path has since been removed -- Postgres is
// now the only engine, and every table it wrote to now requires a
// company_id. Porting this generator to Postgres's multi-tenant shape is a
// separate piece of work, not part of the SQLite removal; until that's done,
// there is no working `npm run seed`.
console.log('src/db/seed.js is historical-only (SQLite path removed, and this ' +
  'generator predates multi-tenancy). No Postgres-compatible replacement exists yet.');
