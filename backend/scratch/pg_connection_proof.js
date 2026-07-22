// Throwaway Phase-0 proof-of-connection script for the Postgres migration.
// Run: node backend/scratch/pg_connection_proof.js  (requires the docker-compose
// postgres service up and backend/.env populated with DATABASE_URL or PG* vars).
// Safe to delete once Phase 0 is reviewed — nothing else references this file.
require('dotenv').config();
const { getPgPool } = require('../src/config/pgPool');

(async () => {
  const pool = getPgPool();
  try {
    const result = await pool.query('SELECT 1 AS ok');
    console.log('[pg proof] Connected. SELECT 1 ->', result.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('[pg proof] Connection FAILED:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
