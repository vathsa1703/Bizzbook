// Phase 4 Checkpoint 1: one-time real-data migration from the live seeded
// backend/data/business.db into the Postgres dev database (bizbook_dev).
// Run: node backend/scratch/migrate_real_data_to_postgres.js
//
// Generic, not hand-mapped per table: introspects column types on the
// Postgres side (information_schema.columns) and converts each SQLite value
// accordingly (INTEGER 0/1 -> BOOLEAN, '' -> NULL for non-text columns).
// Table order doesn't need to respect FK dependencies -- triggers (which is
// how Postgres enforces FK constraints) are disabled per table during load
// and re-enabled after, then a full generic FK-orphan check runs at the end
// across every FK in the schema, not just the tables this script touches.
//
// REFERENCE_TABLES (compliance/trade/gst_uqc/investor_directory/
// permissions/permission_groups) are copied from SQLite WITH ID PRESERVATION
// rather than left as PG migrations 2/5/6 seeded them. First attempt at this
// script skipped them (trusting the independently-authored migration seeds),
// which broke every FK pointing at them: migration-seeded ids don't line up
// with the ACTUAL ids baked into this specific SQLite database's
// role_permissions/business_compliance_items/compliance_events/etc rows (one
// concrete cause found: compliance_rules has a manually-inserted test row,
// TEST_RULE_Z, that shifts its id sequence relative to a fresh reseed). For a
// migration whose entire point is faithfully replicating THIS database, the
// only reliable source of truth for every id is this database itself -- so
// these tables are truncated together (a single multi-table TRUNCATE, since
// they reference each other) and reloaded from SQLite like everything else.
// PG migrations 2/5/6 remain correct and necessary for brand-new Postgres
// installs with no SQLite data to migrate from; they're simply superseded
// here for this one already-populated database.
//
// SKIPPED tables (by design, not oversight -- see report for reasoning):
//   - schema_versions: engine-specific migration bookkeeping. Postgres has
//     its own 1-6; copying SQLite's 1-32 would corrupt migration tracking.
//   - sessions: live JWT/session-revocation state, not business data --
//     regenerates naturally as users log in against the migrated data.
const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');

const SQLITE_PATH = require('path').join(__dirname, '..', 'data', 'business.db');
const PG_URL = process.env.DATABASE_URL || 'postgres://bizbook:bizbook_dev_only@localhost:5433/bizbook_dev';

const SKIP_TABLES = new Set([
  'schema_versions',
  'sessions',
]);

// Reference tables reloaded from SQLite with id preservation instead of
// trusting PG migrations 2/5/6's independently-assigned ids (see header).
const REFERENCE_TABLES = [
  'compliance_categories', 'compliance_rules', 'compliance_rule_conditions', 'compliance_rule_documents',
  'trade_guidelines', 'trade_authorities', 'trade_countries', 'trade_rule_conditions', 'trade_documents',
  'gst_uqc_master', 'gst_hsn_master', 'investor_directory', 'government_schemes', 'funding_types',
  'permissions', 'permission_groups',
];

// Pre-existing dangling FK values confirmed present in the SOURCE SQLite
// database itself (not introduced by this script) -- ai_insights_cache.id=6
// references a deleted user (id 8), compliance_item_documents.id={1,2}
// reference a deleted user (id 1), communication_logs.id={1,2,3} reference a
// deleted campaign (id 15). SQLite's PRAGMA foreign_keys is confirmed ON
// today, but these columns are real REFERENCES in schema.sql -- meaning
// these three rows/values predate consistent enforcement (most likely
// inserted via a path that had FK checks disabled, e.g. the legacy unwired
// backend/seed_demo.js, which is documented as toggling that pragma
// explicitly). Nulling just the dangling column preserves the rest of each
// row's real data (the cache entry / document / log line itself) without
// fabricating a fake attribution -- "we don't know who uploaded this" is
// more honest than inventing a user.
const KNOWN_DANGLING_FKS = [
  { table: 'ai_insights_cache', column: 'user_id', ids: [6] },
  { table: 'compliance_item_documents', column: 'uploaded_by', ids: [1, 2] },
  { table: 'communication_logs', column: 'campaign_id', ids: [1, 2, 3] },
];

function convert(value, dataType) {
  if (value === null || value === undefined) return null;
  if (dataType === 'boolean') {
    if (value === '') return null;
    return !!Number(value);
  }
  if (value === '' && dataType !== 'text' && dataType !== 'character varying') return null;
  return value;
}

async function copyTable(sq, pg, table) {
  const sqliteRows = sq.prepare(`SELECT * FROM "${table}"`).all();
  if (sqliteRows.length === 0) return { table, status: 'empty', sqliteRows: 0, inserted: 0 };

  const pgCols = (await pg.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name = $1 ORDER BY ordinal_position`,
    [table]
  )).rows;
  const pgColNames = new Set(pgCols.map(c => c.column_name));
  const sqliteColNames = Object.keys(sqliteRows[0]);

  const missingOnPg = sqliteColNames.filter(c => !pgColNames.has(c));
  // Warn and exclude rather than hard-fail: verified case (marketing_campaigns
  // .target_customers) is a confirmed-dead column -- not in schema.sql, no
  // migration ever added it, 0 non-null rows, no code reference outside an
  // unrelated same-named local variable in spendIntelligenceEngine.js. Any
  // OTHER future mismatch still surfaces here as a visible warning in the
  // report, plus the row-count and FK-orphan checks below as a safety net.
  if (missingOnPg.length > 0) {
    console.log(`  [warn] ${table}: sqlite column(s) not on pg, excluding from copy: ${JSON.stringify(missingOnPg)}`);
  }

  const cols = pgCols.filter(c => sqliteColNames.includes(c.column_name));
  const colNames = cols.map(c => c.column_name);

  await pg.query(`ALTER TABLE "${table}" DISABLE TRIGGER ALL`);
  try {
    const hasIdColumn = colNames.includes('id');
    const placeholders = colNames.map((_, i) => `$${i + 1}`).join(', ');
    const colList = colNames.map(c => `"${c}"`).join(', ');
    const insertSql = hasIdColumn
      ? `INSERT INTO "${table}" (${colList}) OVERRIDING SYSTEM VALUE VALUES (${placeholders})`
      : `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;

    const danglingForThisTable = KNOWN_DANGLING_FKS.filter(d => d.table === table);

    let inserted = 0;
    for (const row of sqliteRows) {
      for (const d of danglingForThisTable) {
        if (d.ids.includes(row.id) && row[d.column] !== null) {
          console.log(`  [known-issue] ${table}.id=${row.id}: nulling pre-existing dangling ${d.column}=${row[d.column]} (confirmed absent from source SQLite's own parent table)`);
          row[d.column] = null;
        }
      }
      const values = cols.map(c => convert(row[c.column_name], c.data_type));
      await pg.query(insertSql, values);
      inserted++;
    }

    if (hasIdColumn) {
      await pg.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`,
        [table]
      );
    }

    return { table, status: 'migrated', sqliteRows: sqliteRows.length, inserted };
  } finally {
    await pg.query(`ALTER TABLE "${table}" ENABLE TRIGGER ALL`);
  }
}

async function main() {
  const sq = new DatabaseSync(SQLITE_PATH);
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  const allTables = sq.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map(r => r.name);

  const report = [];

  // ── Pre-pass: clear reference tables (PG migrations 2/5/6 already put
  // rows in them) in one combined TRUNCATE so their mutual FK references
  // don't block truncating them individually. ──────────────────────────────
  const refTablesPresent = REFERENCE_TABLES.filter(t => allTables.includes(t));
  console.log(`--- clearing ${refTablesPresent.length} reference tables before reload from SQLite ---`);
  // CASCADE is safe here specifically because this runs on a freshly
  // bootstrapped database where every OTHER table (the ones with an FK
  // pointing at these reference tables -- role_permissions, compliance_events,
  // etc.) is still completely empty; CASCADE truncating them is a no-op, not
  // data loss. Would NOT be safe to run this against a database that already
  // has real business data loaded.
  await pg.query(`TRUNCATE TABLE ${refTablesPresent.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);

  for (const table of allTables) {
    if (SKIP_TABLES.has(table)) {
      report.push({ table, status: 'skipped', sqliteRows: null, inserted: null });
      continue;
    }
    report.push(await copyTable(sq, pg, table));
  }

  console.log('\n=== MIGRATION REPORT ===');
  for (const r of report) {
    const tag = REFERENCE_TABLES.includes(r.table) ? ' [reference]' : '';
    console.log(`${(r.table + tag).padEnd(48)} ${r.status.padEnd(10)} sqlite=${String(r.sqliteRows).padStart(5)} inserted=${String(r.inserted).padStart(5)}`);
  }

  console.log(`\nTotal tables: ${allTables.length} | migrated: ${report.filter(r => r.status === 'migrated').length} | skipped: ${report.filter(r => r.status === 'skipped').length} | empty: ${report.filter(r => r.status === 'empty').length}`);

  // ── Generic FK-orphan integrity check across the WHOLE schema ────────────
  console.log('\n=== FK INTEGRITY CHECK (all constraints, not just migrated tables) ===');
  const fks = (await pg.query(`
    SELECT
      con.conname,
      cl1.relname AS child_table,
      att1.attname AS child_col,
      cl2.relname AS parent_table,
      att2.attname AS parent_col
    FROM pg_constraint con
    JOIN pg_class cl1 ON cl1.oid = con.conrelid
    JOIN pg_class cl2 ON cl2.oid = con.confrelid
    JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
    JOIN unnest(con.confkey) WITH ORDINALITY AS cfk(attnum, ord) ON cfk.ord = ck.ord
    JOIN pg_attribute att1 ON att1.attrelid = con.conrelid AND att1.attnum = ck.attnum
    JOIN pg_attribute att2 ON att2.attrelid = con.confrelid AND att2.attnum = cfk.attnum
    WHERE con.contype = 'f'
    ORDER BY cl1.relname, con.conname
  `)).rows;

  let totalOrphans = 0;
  for (const fk of fks) {
    if (SKIP_TABLES.has(fk.child_table)) continue;
    const orphanQ = await pg.query(`
      SELECT COUNT(*) c FROM "${fk.child_table}" child
      WHERE child."${fk.child_col}" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "${fk.parent_table}" parent WHERE parent."${fk.parent_col}" = child."${fk.child_col}")
    `);
    const count = Number(orphanQ.rows[0].c);
    if (count > 0) {
      totalOrphans += count;
      console.log(`  ORPHANS: ${fk.child_table}.${fk.child_col} -> ${fk.parent_table}.${fk.parent_col}: ${count} orphaned rows`);
    }
  }
  console.log(totalOrphans === 0 ? '  All FK relationships clean -- zero orphans across the entire schema.' : `  TOTAL ORPHANS: ${totalOrphans}`);

  sq.close();
  await pg.end();

  if (totalOrphans > 0) {
    console.log('\nRESULT: FAIL');
    process.exit(1);
  }
  console.log('\nRESULT: PASS');
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
