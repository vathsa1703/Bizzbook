const { verifyToken } = require('../services/authService');
const crypto = require('crypto');
const { dbGet, dbAll } = require('../config/dbEngine');

// Simple in-memory cache for permissions (5 min TTL). Cache key includes
// companyId, not just userId -- see queryUserPermissions below: this matters
// because the same user_id can theoretically hold role assignments scoped to
// different companies (user_roles carries its own company_id column), so a
// userId-only key would risk serving one company's permission set to a
// request scoped at another. Not a Phase 2 change -- this was already
// correct before conversion; verified explicitly rather than assumed.
const permissionCache = new Map();

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }

  req.user = {
    ...payload,
    companyId: payload.companyId || null,
    token: token
  };

  // Phase 2: Check if session is still active in database
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = await dbGet('SELECT id, is_active FROM sessions WHERE token_hash = ?', [tokenHash]);
    // is_active is boolean under Postgres (Phase 1), 0/1 under SQLite. This is
    // a check FOR revocation, not "is on" -- session.is_active === 0 only
    // ever matched SQLite's literal 0; Postgres's real `false` needs the same
    // treatment as dbEngine.js's isOn() but inverted (isOff), since the code
    // wants to act specifically when the flag is off, not when it's on.
    const isRevoked = session && (session.is_active === 0 || session.is_active === false);
    if (isRevoked) {
      return res.status(401).json({ error: 'Session has been revoked' });
    }

    // Update last activity periodically (e.g. 10% chance to avoid heavy writes on every request)
    if (session && Math.random() < 0.1) {
      await dbGet('UPDATE sessions SET last_activity = now() WHERE id = ?', [session.id]);
    }
  } catch (err) {
    console.error('Session check error:', err);
    // Proceed if DB fails here, fallback to JWT validity
  }

  next();
}

function authorize(roles = []) {
  if (typeof roles === 'string') {
    roles = [roles];
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
}

// Looks up (and caches, 5 min TTL) the set of granular permission actions granted
// to a user via user_roles -> role_permissions -> permissions. This is the single
// source of truth for granular RBAC lookups — requirePermission() (route-level) and
// rbacMiddleware (app.js, coarse module gate) both read through this instead of
// each running their own query/cache, so a role's actual permissions are always
// consulted before falling back to legacy role-string checks.
// Throws on unexpected DB failure so callers can decide how to fail (see hasPermission
// below for the fail-closed-to-legacy-fallback wrapper used by rbacMiddleware).
async function queryUserPermissions(userId, companyId) {
  const cacheKey = `${userId}_${companyId}`;
  const now = Date.now();

  if (permissionCache.has(cacheKey)) {
    const cached = permissionCache.get(cacheKey);
    if (now - cached.timestamp < 300000) { // 5 min TTL
      return cached.perms;
    }
  }

  const rows = await dbAll(`
    SELECT p.action
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = ? AND ur.company_id = ?
  `, [userId, companyId]);

  const perms = rows.map(r => r.action);
  permissionCache.set(cacheKey, { timestamp: now, perms });
  return perms;
}

// True if the user is a legacy super-admin, or actually holds the given granular
// permission via a custom role. Fails closed (returns false) on lookup error so a
// transient DB issue can never grant access — callers combine this with their own
// legacy-role fallback for the "not found" case, same as before this existed.
async function hasPermission(userId, companyId, role, action) {
  if (role === 'admin') return true;
  try {
    const perms = await queryUserPermissions(userId, companyId);
    return perms.includes(action);
  } catch (err) {
    console.error('RBAC Error:', err);
    return false;
  }
}

// Phase 2: Granular RBAC Check
function requirePermission(action) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    const { userId, companyId, role } = req.user;

    // Fast-path for legacy super-admin
    if (role === 'admin') {
      return next();
    }

    let userPermissions;
    try {
      userPermissions = await queryUserPermissions(userId, companyId);
    } catch (err) {
      console.error('RBAC Error:', err);
      return res.status(500).json({ error: 'Internal Server Error (RBAC)' });
    }

    // Has granular permission?
    if (userPermissions.includes(action)) {
      return next();
    }

    // Fallback to legacy string role if granular permissions aren't fully migrated yet
    const isAdmin = role === 'OWNER' || role === 'MANAGER';

    // For specific modules, check legacy rules
    if (action.startsWith('employees.') || action.startsWith('suppliers.') || action.startsWith('settings.') || action.startsWith('roles.')) {
       if (isAdmin) return next();
    } else {
       // Regular read access for other modules allowed for all legacy roles
       if (req.method === 'GET') return next();
       // Writes allowed for OWNER/MANAGER
       if (isAdmin) return next();
    }

    return res.status(403).json({ error: `Forbidden: Requires ${action} permission`, code: 'FORBIDDEN' });
  };
}

function clearPermissionCache(userId, companyId) {
  permissionCache.delete(`${userId}_${companyId}`);
}

module.exports = {
  authenticate,
  authorize,
  requirePermission,
  hasPermission,
  clearPermissionCache
};
