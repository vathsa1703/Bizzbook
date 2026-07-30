const { getDb } = require('../config/db');
const pgDb = require('../config/pgDb');

async function validateSystem(app) {
  console.log('\n========================================');
  console.log('   SYSTEM VALIDATION & STARTUP CHECKS   ');
  console.log('========================================\n');

  let passed = true;

  function logResult(name, success, errorMsg = '') {
    const status = success ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
    console.log(`${status} ${name} ${errorMsg ? '- ' + errorMsg : ''}`);
    if (!success) passed = false;
  }

  // 1. Environment Variables
  const envVars = ['PORT']; 
  let envPassed = true;
  envVars.forEach(v => {
    if (!process.env[v]) {
      envPassed = false;
      logResult(`Environment Variable: ${v}`, false, 'Missing required variable');
    }
  });
  if (envPassed) logResult('Environment Variables', true);

  // 1b. AI Environment Variables
  const apiKey = process.env.OPENAI_API_KEY;
  const aiModel = process.env.CHAT_MODEL || 'llama-3.3-70b-versatile';
  const aiBaseUrl = process.env.OPENAI_BASE_URL || '';
  const provider = aiBaseUrl.includes('groq') ? 'groq' : (aiBaseUrl ? 'custom' : 'openai');
  
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    console.log('\n\x1b[33m========================================\x1b[0m');
    console.log('\x1b[33m[WARNING]\x1b[0m');
    console.log('\x1b[33mPlaceholder API key detected.\x1b[0m');
    console.log('\x1b[33mRunning in fallback mode.\x1b[0m');
    console.log('\x1b[33m========================================\n\x1b[0m');
    if (app && app.setHealthStatus) app.setHealthStatus('ai', {
      configured: false,
      reason: 'placeholder_key'
    });
  } else {
    logResult('AI Configuration', true);
    if (app && app.setHealthStatus) app.setHealthStatus('ai', {
      configured: true,
      fallback_mode: false,
      model: aiModel,
      provider: provider
    });
  }

  const dbEngine = (process.env.DB_ENGINE || 'sqlite').toLowerCase();

  if (dbEngine === 'postgres') {
    // 2. Database Connection & Schema (Postgres)
    try {
      await pgDb.bootstrapPostgresSchema();
      // bootstrapPostgresSchema() only ever runs on an empty database; every
      // schema change made after a database was bootstrapped arrives through
      // here instead. Both are needed — see runPostgresMigrations()'s comment.
      await pgDb.runPostgresMigrations();
      await pgDb.query('SELECT 1');
      logResult('Database Connection (Postgres)', true);
      if (app && app.setHealthStatus) app.setHealthStatus('database', 'connected');
    } catch (e) {
      logResult('Database Connection (Postgres)', false, e.message);
      if (app && app.setHealthStatus) app.setHealthStatus('database', 'failed');
      return false; // Cannot proceed without DB
    }

    // 3. Core Tables Existence (Postgres)
    const requiredTables = ['users', 'customers', 'sales', 'marketing_campaigns', 'schema_versions'];
    let tablesPassed = true;
    for (const t of requiredTables) {
      try {
        await pgDb.query(`SELECT 1 FROM ${t} LIMIT 1`);
      } catch (e) {
        logResult(`Table: ${t}`, false, 'Missing table');
        tablesPassed = false;
      }
    }
    if (tablesPassed) logResult('Core Tables Check', true);
    if (app && app.setHealthStatus) app.setHealthStatus('migrations', tablesPassed ? 'passed' : 'failed');

    // 4. Auth Functionality Validation (Postgres) — exercises withTransaction(),
    // the piece every Step 2 module rewrite depends on. The sentinel error
    // forces a rollback after read-back succeeds, so no test row persists.
    try {
      const testEmail = 'validator_test_' + Date.now() + '@internal.com';
      await pgDb.withTransaction(async (tx) => {
        await tx.query(
          'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
          ['Validator', testEmail, 'mockhash', 'employee']
        );
        const user = await tx.getOne('SELECT id FROM users WHERE email = ?', [testEmail]);
        if (!user) throw new Error('Failed to read back inserted user');
        throw new Error('__VALIDATOR_ROLLBACK__');
      });
    } catch (e) {
      if (e.message === '__VALIDATOR_ROLLBACK__') {
        logResult('Auth Functionality (Read/Write)', true);
        if (app && app.setHealthStatus) app.setHealthStatus('auth', 'ready');
      } else {
        logResult('Auth Functionality (Read/Write)', false, e.message);
        if (app && app.setHealthStatus) app.setHealthStatus('auth', 'failed');
      }
    }
  } else {
    // 2. Database Connection & Schema (SQLite — unchanged from pre-Phase-2 behavior)
    let db;
    try {
      db = getDb();
      logResult('Database Connection', true);
      if (app && app.setHealthStatus) app.setHealthStatus('database', 'connected');
    } catch (e) {
      logResult('Database Connection', false, e.message);
      if (app && app.setHealthStatus) app.setHealthStatus('database', 'failed');
      return false; // Cannot proceed without DB
    }

    // 3. Core Tables Existence
    const requiredTables = ['users', 'customers', 'sales', 'marketing_campaigns', 'schema_versions'];
    let tablesPassed = true;
    requiredTables.forEach(t => {
      try {
        db.prepare(`SELECT 1 FROM ${t} LIMIT 1`).get();
      } catch (e) {
        if (e.message.includes('no such table')) {
          logResult(`Table: ${t}`, false, 'Missing table');
          tablesPassed = false;
        }
      }
    });
    if (tablesPassed) logResult('Core Tables Check', true);
    if (app && app.setHealthStatus) app.setHealthStatus('migrations', tablesPassed ? 'passed' : 'failed');

    // 4. Auth Functionality Validation
    try {
      // Try to perform a mock read/write on users table within a transaction
      db.exec('BEGIN TRANSACTION');

      const testEmail = 'validator_test_' + Date.now() + '@internal.com';
      const insert = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
      insert.run('Validator', testEmail, 'mockhash', 'employee');

      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(testEmail);
      if (!user) throw new Error('Failed to read back inserted user');

      db.exec('ROLLBACK'); // Discard test data
      logResult('Auth Functionality (Read/Write)', true);
      if (app && app.setHealthStatus) app.setHealthStatus('auth', 'ready');
    } catch (e) {
      db.exec('ROLLBACK');
      logResult('Auth Functionality (Read/Write)', false, e.message);
      if (app && app.setHealthStatus) app.setHealthStatus('auth', 'failed');
    }
  }

  // 5. Finalize Health Status
  if (app && app.setHealthStatus) {
    app.setHealthStatus('status', passed ? 'healthy' : 'degraded');
  }

  console.log('\n========================================');
  if (passed) {
    console.log('\x1b[32mSYSTEM VALIDATION SUCCESSFUL - ALL SYSTEMS GO\x1b[0m');
  } else {
    console.log('\x1b[31mSYSTEM VALIDATION FAILED - REVIEW ERRORS ABOVE\x1b[0m');
  }
  console.log('========================================\n');

  return passed;
}

module.exports = { validateSystem };
