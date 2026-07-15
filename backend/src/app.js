const express = require('express');
const cors = require('cors');

const errorHandler = require('./middleware/errorHandler');
const { authenticate, hasPermission } = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());

// ─── 1. Health & Startup ──────────────────────────────────────────────────────

const healthStatus = {
  status: 'initializing',
  database: 'pending',
  migrations: 'pending',
  auth: 'pending',
  modules: {}
};

app.get('/api/health', (req, res) => {
  const isHealthy = healthStatus.status === 'healthy';
  res.status(isHealthy ? 200 : 503).json(healthStatus);
});

// Used by systemValidator to update health state
app.setHealthStatus = (key, val) => {
  healthStatus[key] = val;
};
app.setModuleStatus = (mod, val) => {
  healthStatus.modules[mod] = val;
};

// ─── 2. Safe Route Registration Helper ────────────────────────────────────────

function registerCoreRoute(path, routerLoader) {
  try {
    const router = routerLoader();
    app.use(path, router);
    app.setModuleStatus(path, 'ready');
  } catch (err) {
    console.error(`[FATAL] Failed to load CORE route: ${path}`, err);
    app.setModuleStatus(path, 'failed');
    process.exit(1); // Core modules MUST load
  }
}

function registerOptionalRoute(path, routerLoader) {
  try {
    const router = routerLoader();
    app.use(path, router);
    app.setModuleStatus(path, 'ready');
  } catch (err) {
    console.error(`[WARN] Failed to load OPTIONAL route: ${path} - ${err.message}`);
    app.setModuleStatus(path, 'failed');
    // We do NOT exit. We wrap the route to return 503.
    app.use(path, (req, res) => {
      res.status(503).json({ error: `Module ${path} is currently unavailable.`, code: 'MODULE_UNAVAILABLE' });
    });
  }
}

// ─── 3. Mount Routes ──────────────────────────────────────────────────────────

// Public Core Route
registerCoreRoute('/api/auth', () => require('./routes/auth'));

// Routes moved below to be protected

// Modules where a custom role's granular permission (assigned via role_permissions,
// see routes/roles.js) should satisfy the coarse checks below even when the user's
// legacy `users.role` string isn't literally OWNER/MANAGER/admin. Every module NOT
// listed here keeps the original admin-string-only behavior unchanged — this is a
// targeted fix, not a blanket loosening, since only these modules' routes are known
// to already gate themselves on these exact permission actions (routes/branches.js,
// routes/roles.js) or are referenced by name in the legacy checks below (employees,
// suppliers).
const DELETE_PERMISSION_BY_PREFIX = [
  { prefix: '/api/branches', action: 'branches.manage' },
  { prefix: '/api/roles', action: 'settings.manage' },
  { prefix: '/api/employees', action: 'employees.delete' },
  { prefix: '/api/suppliers', action: 'suppliers.manage' },
];

// RBAC middleware — supports old 'admin' role and new multi-tenant roles (OWNER, MANAGER, CASHIER)
function rbacMiddleware(req, res, next) {
  const { userId, companyId, role } = req.user;
  const method = req.method;
  const url = req.originalUrl || req.url;

  const isAdmin = role === 'admin' || role === 'OWNER' || role === 'MANAGER';

  if (method === 'DELETE' && !isAdmin) {
    const match = DELETE_PERMISSION_BY_PREFIX.find(m => url.startsWith(m.prefix));
    const allowedByPermission = match && hasPermission(userId, companyId, role, match.action);
    if (!allowedByPermission) {
      return res.status(403).json({ error: 'Forbidden: Only administrators can delete records.', code: 'FORBIDDEN' });
    }
  }

  if (url.startsWith('/api/employees') && method !== 'GET' && !isAdmin) {
    const allowedByPermission = ['employees.create', 'employees.edit', 'employees.delete']
      .some(action => hasPermission(userId, companyId, role, action));
    if (!allowedByPermission) {
      return res.status(403).json({ error: 'Forbidden: Only administrators can manage employees.', code: 'FORBIDDEN' });
    }
  }

  if (url.startsWith('/api/suppliers') && method !== 'GET' && !isAdmin) {
    if (!hasPermission(userId, companyId, role, 'suppliers.manage')) {
      return res.status(403).json({ error: 'Forbidden: Only administrators can manage suppliers.', code: 'FORBIDDEN' });
    }
  }

  next();
}

const branchAuth = require('./middleware/branchAuth');
app.use('/api', authenticate, branchAuth, rbacMiddleware);

// Core Protected Routes
// gst-master was previously mounted as a public route above app.use('/api', authenticate, ...) —
// gst_hsn_master/gst_uqc_master have no company_id (shared reference data across all tenants),
// but every mutating endpoint must still require a logged-in user, not the open internet.
registerCoreRoute('/api/gst-master', () => require('./routes/gstMaster'));
registerCoreRoute('/api/product-groups', () => require('./routes/productGroups'));
registerCoreRoute('/api/analytics', () => require('./routes/analytics'));
registerCoreRoute('/api/sales', () => require('./routes/sales'));
registerCoreRoute('/api/customers', () => require('./routes/customers'));
registerCoreRoute('/api/products', () => require('./routes/products'));
registerCoreRoute('/api/jobs', () => require('./routes/jobs'));
registerCoreRoute('/api/automations', () => require('./routes/automations'));
registerCoreRoute('/api/communication', () => require('./routes/communication'));

// Optional Protected Routes
registerOptionalRoute('/api/ai', () => require('./routes/ai'));
registerOptionalRoute('/api/ocr', () => require('./routes/ocr'));
registerOptionalRoute('/api/marketing', () => require('./routes/marketing'));
registerOptionalRoute('/api/marketing-copilot', () => require('./routes/marketingCopilot'));
registerOptionalRoute('/api/home', () => require('./routes/home'));
registerOptionalRoute('/api/compliance', () => require('./routes/compliance'));
registerOptionalRoute('/api/reports', () => require('./routes/reports'));
registerOptionalRoute('/api/voice', () => require('./routes/voice'));
registerOptionalRoute('/api/employees', () => require('./routes/employees'));
registerOptionalRoute('/api/departments', () => require('./routes/departments'));
registerOptionalRoute('/api/org', () => require('./routes/org'));
registerOptionalRoute('/api/teams', () => require('./routes/teams'));
registerOptionalRoute('/api/employee-groups', () => require('./routes/employeeGroups'));
registerOptionalRoute('/api/tasks', () => require('./routes/tasks'));
registerOptionalRoute('/api/branches', () => require('./routes/branches'));
registerOptionalRoute('/api/roles', () => require('./routes/roles'));
registerOptionalRoute('/api/invitations', () => require('./routes/invitations'));
registerOptionalRoute('/api/leaves', () => require('./routes/leaves'));
registerOptionalRoute('/api/attendance', () => require('./routes/attendance'));
registerOptionalRoute('/api/payroll', () => require('./routes/payroll'));
registerOptionalRoute('/api/employee-documents', () => require('./routes/employeeDocuments'));
registerOptionalRoute('/api/audit-logs', () => require('./routes/auditLogs'));
registerOptionalRoute('/api/sessions', () => require('./routes/sessions'));
registerOptionalRoute('/api/notifications', () => require('./routes/notifications'));
registerOptionalRoute('/api/hr-ai', () => require('./routes/hrAI'));
registerOptionalRoute('/api/suppliers', () => require('./routes/suppliers'));
registerOptionalRoute('/api/credits', () => require('./routes/credits'));
registerOptionalRoute('/api/stock', () => require('./routes/stock'));
registerOptionalRoute('/api/invoices', () => require('./routes/invoices'));
registerOptionalRoute('/api/purchases', () => require('./routes/purchases'));
registerOptionalRoute('/api/company-settings', () => require('./routes/companySettings'));
registerOptionalRoute('/api/gst-filing', () => require('./routes/gstFiling'));
registerOptionalRoute('/api/gst-states', () => require('./routes/gstStates'));
registerOptionalRoute('/api/company', () => require('./routes/company'));
registerOptionalRoute('/api/growth', () => require('./routes/growth'));
registerOptionalRoute('/api/trade', () => require('./routes/trade'));

// ─── 4. Fallbacks & Error Handling ────────────────────────────────────────────

app.use((req, res) => res.status(404).json({ success: false, error: 'Endpoint not found', code: 'NOT_FOUND' }));

// Apply centralized error handler
app.use(errorHandler);

module.exports = app;
