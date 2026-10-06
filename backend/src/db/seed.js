// Initialize a fresh PostgreSQL database and verify its schema/reference data.
// The application bootstrap is idempotent and does not create demo users or
// business records, so this is safe to rerun against an existing BizBook DB.
require('dotenv').config();
const pgDb = require('../config/pgDb');

const EXPECTED_TABLES = [
  'schema_versions',
  'users',
  'companies',
  'products',
  'permissions',
  'compliance_categories',
  'compliance_rules',
  'trade_guidelines',
];

async function seed() {
  try {
    await pgDb.bootstrapPostgresSchema();
    await pgDb.runPostgresMigrations();
    await pgDb.query('SELECT 1');

    const counts = {};
    for (const table of EXPECTED_TABLES) {
      const row = await pgDb.getOne(`SELECT COUNT(*) AS count FROM ${table}`);
      counts[table] = Number(row.count);
    }

    const emptyReferenceTables = [
      'permissions',
      'compliance_categories',
      'compliance_rules',
      'trade_guidelines',
    ].filter((table) => counts[table] === 0);

    if (emptyReferenceTables.length) {
      throw new Error(`Required reference data is empty: ${emptyReferenceTables.join(', ')}`);
    }

    console.log('PostgreSQL schema and reference data are ready.');
    for (const [table, count] of Object.entries(counts)) {
      console.log(`${table}: ${count}`);
    }
  } catch (error) {
    console.error('PostgreSQL initialization/verification failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pgDb.getPgPool().end();
  }
}

seed();
