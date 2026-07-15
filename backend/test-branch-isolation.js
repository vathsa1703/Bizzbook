// Let's do a standalone unit test style script for branchAuth middleware and BranchScopedQuery.
const assert = require('assert');
const { withBranchScope } = require('./src/utils/BranchScopedQuery');
const branchAuth = require('./src/middleware/branchAuth');
const { getDb } = require('./src/config/db');

async function runTests() {
  console.log('--- Running Branch Isolation Tests ---');
  
  const db = getDb();
  
  // Clean up any existing test data
  db.exec("DELETE FROM user_branches WHERE user_id = 999 OR user_id = 998");
  db.exec("DELETE FROM branches WHERE company_id = 99");
  db.exec("DELETE FROM companies WHERE id = 99");
  
  // Insert Test Company
  db.exec("INSERT INTO companies (id, name) VALUES (99, 'Test Company')");
  
  // Insert Test Users
  db.exec("INSERT INTO users (id, company_id, name, email, password_hash, role) VALUES (999, 99, 'Owner', 'o@test.com', 'hash', 'OWNER')");
  db.exec("INSERT INTO users (id, company_id, name, email, password_hash, role) VALUES (998, 99, 'Manager', 'm@test.com', 'hash', 'MANAGER')");
  db.exec("INSERT INTO users (id, company_id, name, email, password_hash, role) VALUES (997, 99, 'Cashier', 'c@test.com', 'hash', 'CASHIER')");
  
  // Insert Test Branches
  const b1 = db.prepare("INSERT INTO branches (company_id, name) VALUES (99, 'Branch A')").run().lastInsertRowid;
  const b2 = db.prepare("INSERT INTO branches (company_id, name) VALUES (99, 'Branch B')").run().lastInsertRowid;
  const b3 = db.prepare("INSERT INTO branches (company_id, name) VALUES (99, 'Branch C')").run().lastInsertRowid;
  
  // Setup Mock Request objects
  const reqOwner = { user: { companyId: 99, role: 'OWNER', userId: 999 }, headers: { 'x-branch-id': 'global' } };
  const reqManager = { user: { companyId: 99, role: 'MANAGER', userId: 998 }, headers: { 'x-branch-id': 'global' } };
  const reqEmployee = { user: { companyId: 99, role: 'CASHIER', userId: 997 }, headers: { 'x-branch-id': String(b1) } };
  
  // Give Manager access to Branch A and Branch B, but NOT Branch C
  db.prepare("INSERT INTO user_branches (user_id, company_id, branch_id) VALUES (?, ?, ?)").run(998, 99, b1);
  db.prepare("INSERT INTO user_branches (user_id, company_id, branch_id) VALUES (?, ?, ?)").run(998, 99, b2);
  
  // Give Employee access to Branch A only
  db.prepare("INSERT INTO user_branches (user_id, company_id, branch_id) VALUES (?, ?, ?)").run(997, 99, b1);

  const res = { 
    status: (code) => ({ json: (data) => { throw new Error(data.error); } }),
    json: (data) => {} 
  };

  // Test 1: Owner Global Access
  branchAuth(reqOwner, res, () => {});
  assert.strictEqual(reqOwner.scopeContext.type, 'global');
  assert.deepStrictEqual(reqOwner.scopeContext.allowedBranches.sort(), [b1, b2, b3].sort());
  console.log('✅ Owner Global Access passed.');

  // Test 2: Manager Global Access (Should convert to multi-branch)
  branchAuth(reqManager, res, () => {});
  assert.strictEqual(reqManager.scopeContext.type, 'multi-branch');
  assert.deepStrictEqual(reqManager.scopeContext.allowedBranches.sort(), [b1, b2].sort());
  console.log('✅ Manager Multi-Branch Access passed.');

  // Test 3: Employee Specific Access (Valid)
  branchAuth(reqEmployee, res, () => {});
  assert.strictEqual(reqEmployee.scopeContext.type, 'branch');
  assert.strictEqual(reqEmployee.scopeContext.branchId, b1);
  console.log('✅ Employee Specific Branch Access passed.');

  // Test 4: Employee Spoofing (Invalid)
  const reqSpoof = { user: { companyId: 99, role: 'CASHIER', userId: 997 }, headers: { 'x-branch-id': String(b2) } };
  let spoofFailed = false;
  try {
    branchAuth(reqSpoof, res, () => {});
  } catch (err) {
    spoofFailed = err.message.includes('Access denied');
  }
  assert.strictEqual(spoofFailed, true);
  console.log('✅ Employee Spoofing Branch B denied.');

  // Test 5: BranchScopedQuery (Manager Multi-Branch)
  const qManager = withBranchScope('SELECT * FROM sales WHERE company_id = ?', [99], reqManager.scopeContext, 'branch_id');
  assert.strictEqual(qManager.sql.includes('branch_id IN (?,?)'), true);
  assert.strictEqual(qManager.params.length, 3);
  console.log('✅ BranchScopedQuery generated correct multi-branch SQL.');

  // Cleanup
  db.exec("DELETE FROM user_branches WHERE company_id = 99");
  db.exec("DELETE FROM users WHERE company_id = 99");
  db.exec("DELETE FROM branches WHERE company_id = 99");
  db.exec("DELETE FROM companies WHERE id = 99");
  console.log('--- All tests passed! ---');
}

runTests().catch(console.error);
