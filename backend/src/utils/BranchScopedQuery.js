/**
 * Utility to explicitly apply branch scoping to an SQL query.
 * 
 * @param {string} sql The base SQL query (must already filter by company_id)
 * @param {Array} params The parameters array for the base SQL
 * @param {Object} scope req.scopeContext from branchAuth middleware
 * @param {string} branchColumn The column alias to filter on (e.g. 's.branch_id')
 * @returns {Object} { sql, params }
 */
function withBranchScope(sql, params, scope, branchColumn = 'branch_id') {
  if (!scope) {
    throw new Error('Scope context missing in withBranchScope');
  }

  let newSql = sql;
  const newParams = [...params];

  if (scope.type === 'branch') {
    newSql += ` AND ${branchColumn} = ?`;
    newParams.push(scope.branchId);
  } else if (scope.type === 'multi-branch') {
    // If the user requested global view but they are only assigned specific branches
    if (!scope.allowedBranches || scope.allowedBranches.length === 0) {
      // No branches assigned -> return nothing
      newSql += ` AND 1 = 0`;
    } else {
      const placeholders = scope.allowedBranches.map(() => '?').join(',');
      newSql += ` AND ${branchColumn} IN (${placeholders})`;
      newParams.push(...scope.allowedBranches);
    }
  } else if (scope.type === 'global') {
    // OWNER doing global -> see all branches in the company.
    // Base SQL already enforces AND company_id = ?
  }

  return { sql: newSql, params: newParams };
}

module.exports = { withBranchScope };
