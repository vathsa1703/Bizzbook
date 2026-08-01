const { dbAll } = require('../config/dbEngine');

async function branchAuth(req, res, next) {
  try {
    const branchHeader = req.headers['x-branch-id'];
    const user = req.user;

    if (!user || !user.companyId) {
      return res.status(401).json({ error: 'User must belong to a company to access branches.' });
    }

    const isOwner = user.role === 'OWNER';

    // Load allowed branches
    let allowedBranchIds = [];

    if (isOwner) {
      // Owner can access all company branches. Excludes soft-deleted branches
      // (status = 'Deleted') -- otherwise a deleted branch still counts as
      // "this company has branches" everywhere downstream that consults this
      // list, incorrectly blocking the owner's default no-header scope.
      const branches = await dbAll("SELECT id FROM branches WHERE company_id = ? AND status != 'Deleted'", [user.companyId]);
      allowedBranchIds = branches.map(b => b.id);
    } else {
      // Other roles restricted to assigned branches
      const userBranches = await dbAll('SELECT branch_id FROM user_branches WHERE user_id = ? AND company_id = ?', [user.userId, user.companyId]);
      allowedBranchIds = userBranches.map(ub => ub.branch_id);
    }

    // Determine Scope
    if (!branchHeader || branchHeader === 'global') {
      // If global, we let them through, but the scope type indicates how queries should be filtered.
      req.scopeContext = {
        type: isOwner ? 'global' : 'multi-branch',
        companyId: user.companyId,
        allowedBranches: allowedBranchIds
      };
    } else {
      const requestedBranchId = parseInt(branchHeader, 10);
      if (isNaN(requestedBranchId)) {
        return res.status(400).json({ error: 'Invalid X-Branch-ID header' });
      }

      if (!allowedBranchIds.includes(requestedBranchId)) {
        return res.status(403).json({ error: `Access denied to branch ${requestedBranchId}` });
      }

      req.scopeContext = {
        type: 'branch',
        companyId: user.companyId,
        branchId: requestedBranchId,
        allowedBranches: allowedBranchIds
      };
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = branchAuth;
