// Throwaway Phase 2 auth-module verification seed. Mirrors the SQLite
// business.db's permission_groups/permissions data exactly (same ids, names,
// actions) into Postgres, since migration 16's permission seeding only runs
// via runMigrations() on the SQLite path -- Postgres bootstrap loads the raw
// schema with no data seeding (reseed is a later phase). Needed for a fair,
// direct cross-engine comparison of queryUserPermissions() and for
// ensureOwnerRoleAsync to have anything to assign to the Owner role.
// Safe to delete once the auth module is reviewed. Run: node backend/scratch/pg_auth_test_seed.js
require('dotenv').config();
const { getPgPool } = require('../src/config/pgPool');
const { DatabaseSync } = require('node:sqlite');

(async () => {
  const pool = getPgPool();
  const sqliteDb = new DatabaseSync('data/business.db');
  try {
    const groups = sqliteDb.prepare('SELECT id, name, description FROM permission_groups ORDER BY id').all();
    const perms = sqliteDb.prepare('SELECT id, group_id, action, description, is_system FROM permissions ORDER BY id').all();

    await pool.query('BEGIN');
    for (const g of groups) {
      await pool.query(
        'INSERT INTO permission_groups (id, name, description) OVERRIDING SYSTEM VALUE VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
        [g.id, g.name, g.description]
      );
    }
    for (const p of perms) {
      await pool.query(
        'INSERT INTO permissions (id, group_id, action, description, is_system) OVERRIDING SYSTEM VALUE VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
        [p.id, p.group_id, p.action, p.description, !!p.is_system]
      );
    }
    // Keep the identity sequences ahead of the explicit ids we just inserted,
    // so future INSERTs (without OVERRIDING SYSTEM VALUE) don't collide.
    await pool.query(`SELECT setval(pg_get_serial_sequence('permission_groups','id'), (SELECT COALESCE(MAX(id),1) FROM permission_groups))`);
    await pool.query(`SELECT setval(pg_get_serial_sequence('permissions','id'), (SELECT COALESCE(MAX(id),1) FROM permissions))`);
    await pool.query('COMMIT');

    console.log(`[seed] Done. ${groups.length} permission_groups, ${perms.length} permissions seeded into Postgres.`);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('[seed] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    sqliteDb.close();
    await pool.end();
  }
})();
