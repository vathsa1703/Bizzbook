import { getPlaceholderData } from './placeholders';

const BASE = '/api';

let jwtToken = null;

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token') || jwtToken;
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    const response = await fetch(`${BASE}${endpoint}`, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.status === 204) return null;

    const data = await response.json().catch(() => ({ error: 'Invalid server response' }));

    if (response.ok && (!options.method || options.method === 'GET')) {
      const type = localStorage.getItem('businessType');
      if (type) {
        let isEmpty = false;
        
        // Determine if response is effectively empty based on common shapes
        if (Array.isArray(data)) {
          isEmpty = data.length === 0;
        } else if (data && Array.isArray(data.data)) {
          isEmpty = data.data.length === 0;
        } else if (endpoint.includes('/analytics/sales-summary') && data && data.transaction_count === 0) {
          isEmpty = true;
        } else if (endpoint.includes('/credits/summary') && data && data.outstanding_amount === 0) {
          isEmpty = true;
        }

        if (isEmpty) {
          const placeholderData = getPlaceholderData(endpoint, type);
          if (placeholderData) {
            return placeholderData;
          }
        }
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      if (response.status >= 500) {
        console.error(`[API 500] ${endpoint}:`, data.error || 'Server Error');
        alert(`Server Error: ${data.error || 'The system is currently unavailable.'}`);
      }
      const err = new Error(data.error || `Request failed with status ${response.status}`);
      if (data.errors) err.validationErrors = data.errors;
      throw err;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      alert('Request timed out. Please check your network connection.');
      throw new Error('Request timeout');
    } else if (error.message === 'Failed to fetch') {
      alert('Network error. Unable to reach the server.');
      throw new Error('Network error');
    }
    throw error;
  }
}

const rawApi = {
  getInvoice: (id) => request(`/invoices/${id}`),
  downloadInvoicePdf: async (id) => {
    const res = await fetch(`${BASE}/invoices/${id}/download`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` }});
    if (!res.ok) throw new Error("Failed to download");
    return res.blob();
  },
  setToken: (token) => {
    jwtToken = token;
  },

  // Auth
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data) => request('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/auth/me'),

  // GST State Master
  getGstStates: () => request('/gst-states'),
  getGstStateByCode: (code) => request(`/gst-states/${code}`),

  // GST Master (HSN & UQC)
  gstMaster: {
    getHsnList: (search = '', active_only = false) => request(`/gst-master/hsn?search=${encodeURIComponent(search)}&active_only=${active_only}`),
    createHsn: (data) => request('/gst-master/hsn', { method: 'POST', body: JSON.stringify(data) }),
    updateHsn: (hsnCode, data) => request(`/gst-master/hsn/${hsnCode}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteHsn: (hsnCode) => request(`/gst-master/hsn/${hsnCode}`, { method: 'DELETE' }),
    getUqcList: () => request('/gst-master/uqc'),
  },

  // AI Advisor
  ai: {
    dashboardInsights: () => request('/ai/insights/dashboard'),
    chat: (message, sessionId) => request('/ai/chat', { method: 'POST', body: JSON.stringify({ message, sessionId }) }),
  },

  // Marketing Intelligence
  marketing: {
    getOpportunities: () => request('/marketing/opportunities'),
    getStrategy: (id) => request(`/marketing/opportunities/${id}/strategy`),
    getSegments: () => request('/marketing/segments'),
    getSegmentCustomers: (id) => request(`/marketing/segments/${id}/customers`),
    getCampaigns: () => request('/marketing/campaigns'),
    getCampaignPerformance: (id) => request(`/marketing/campaigns/${id}/performance`),
    generateCampaign: (data) => request('/marketing/campaigns/generate', { method: 'POST', body: JSON.stringify(data) }),
    createCampaign: (data) => request('/marketing/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    updateCampaign: (id, data) => request(`/marketing/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCampaign: (id) => request(`/marketing/campaigns/${id}`, { method: 'DELETE' }),
    getDashboard: () => request('/marketing/dashboard'),
    exportCampaignCsv: (id) => `${BASE}/marketing/campaigns/${id}/export/csv`,
    refreshSignals: () => request('/marketing/refresh-signals', { method: 'POST' }),
    
    // Phase 1 endpoints
    getWallet: (customerId) => request(`/marketing/wallet/${customerId}`),
    adjustWallet: (data) => request('/marketing/wallet/adjust', { method: 'POST', body: JSON.stringify(data) }),
    createSegment: (data) => request('/marketing/segments', { method: 'POST', body: JSON.stringify(data) }),
    getCoupons: () => request('/marketing/coupons'),
    createCoupon: (data) => request('/marketing/coupons', { method: 'POST', body: JSON.stringify(data) }),
    validateCoupon: (data) => request('/marketing/coupons/validate', { method: 'POST', body: JSON.stringify(data) }),
    getReferral: (customerId) => request(`/marketing/referrals/${customerId}`),
    redeemReferral: (data) => request('/marketing/referrals/redeem', { method: 'POST', body: JSON.stringify(data) }),
    sendSurvey: (data) => request('/marketing/surveys/send', { method: 'POST', body: JSON.stringify(data) }),
    submitSurvey: (data) => request('/marketing/surveys/submit', { method: 'POST', body: JSON.stringify(data) }),
    sendCommunication: (data) => request('/marketing/communications/send', { method: 'POST', body: JSON.stringify(data) }),
    getHealthScore: () => request('/marketing/health-score'),
    getChannelROI: () => request('/marketing/channel-roi'),
    getBudgetSplit: (budget) => request('/marketing/budget-split', { method: 'POST', body: JSON.stringify({ budget }) }),
    getSegmentPriority: (timeframe = '30') => request(`/marketing/segment-priority?timeframe=${timeframe}`),
    getBreakEven: (timeframe = '1year') => request(`/marketing/break-even?timeframe=${timeframe}`),
    getWeeklyRecommendation: () => request('/marketing/weekly-recommendation'),
    getReportCards: () => request('/marketing/report-cards'),
    getFlags: () => request('/marketing/flags'),
    
    // Sprint 11: Copilot Endpoints
    getCopilotDashboard: () => request('/marketing-copilot/copilot'),
    getCopilotRecommendations: () => request('/marketing-copilot/recommendations'),
    generateCopilotCampaign: (data) => request('/marketing-copilot/copilot/generate', { method: 'POST', body: JSON.stringify(data) }),
    getInsights: () => request('/marketing-copilot/insights'),
    getCalendar: () => request('/marketing-copilot/calendar'),
    getNewOpportunities: () => request('/marketing-copilot/opportunities'),
    predictCampaign: (data) => request('/marketing-copilot/predict', { method: 'POST', body: JSON.stringify(data) }),
    buildAudience: (naturalLanguage) => request('/marketing-copilot/audience', { method: 'POST', body: JSON.stringify({ naturalLanguage }) }),
    getExperiments: () => request('/marketing-copilot/experiments'),
  },

  // Analytics
  salesSummary: (month, year) =>
    request(`/analytics/sales-summary?month=${month}&year=${year}`),

  revenueTrend: (months = 6) =>
    request(`/analytics/revenue-trend?months=${months}`),

  topProducts: (month, year, limit = 5) => {
    const params = new URLSearchParams({ limit });
    if (month) params.set('month', month);
    if (year) params.set('year', year);
    return request(`/analytics/top-products?${params}`);
  },

  lowPerformingProducts: (month, year, limit = 5) => {
    const params = new URLSearchParams({ limit });
    if (month) params.set('month', month);
    if (year) params.set('year', year);
    return request(`/analytics/low-performing-products?${params}`);
  },

  lowStock: () => request('/analytics/low-stock'),

  overstocked: () => request('/analytics/overstocked'),

  slowMoving: (days = 30) => request(`/analytics/slow-moving?days=${days}`),

  topGroups: (limit = 5) => request(`/analytics/top-groups?limit=${limit}`),

  revenueByGroup: (month, year) => {
    const params = new URLSearchParams();
    if (month) params.set('month', month);
    if (year) params.set('year', year);
    return request(`/analytics/revenue-by-group?${params}`);
  },

  inventoryByGroup: () => request('/analytics/inventory-by-group'),

  profit: (month, year) =>
    request(`/analytics/profit?month=${month}&year=${year}`),

  pendingInvoices: () => request('/analytics/pending-invoices'),

  recommendations: () => request('/analytics/recommendations'),

  customers: () => request('/analytics/customers'),

  // Voice
  transcribe: (audioBlob) => {
    const form = new FormData();
    form.append('audio', audioBlob, 'recording.webm');
    const headers = {};
    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    }
    return fetch(`${BASE}/voice/transcribe`, { method: 'POST', body: form, headers }).then(r => {
      if (!r.ok) throw new Error(`Transcription failed: ${r.status}`);
      return r.json();
    });
  },

  // Products CRUD (updated to include GST fields)
  getProducts: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return request(`/products?${params}`);
  },
  getProduct: (id) => request(`/products/${id}`),
  createProduct: (data) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),

  // Product Groups CRUD
  getProductGroups: () => request('/product-groups'),
  getProductGroup: (id) => request(`/product-groups/${id}`),
  createProductGroup: (data) => request('/product-groups', { method: 'POST', body: JSON.stringify(data) }),
  updateProductGroup: (id, data) => request(`/product-groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProductGroup: (id) => request(`/product-groups/${id}`, { method: 'DELETE' }),

  // Purchases CRUD
  getPurchases: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return request(`/purchases?${params}`);
  },
  getPurchase: (id) => request(`/purchases/${id}`),
  createPurchase: (data) => request('/purchases', { method: 'POST', body: JSON.stringify(data) }),
  updatePurchase: (id, data) => request(`/purchases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePurchase: (id) => request(`/purchases/${id}`, { method: 'DELETE' }),

  createBulkStock: (data) => request('/stock/bulk', { method: 'POST', body: JSON.stringify(data) }),

  // Company Settings CRUD
  getCompanySettings: () => request('/company-settings'),
  updateCompanySettings: (data) => request('/company-settings', { method: 'PUT', body: JSON.stringify(data) }),
  // NOTE: Legacy /export/gst-report and /export/gst-workbook have been removed.
  // Use the gstFiling endpoints below for all GST exports.

  // GST Filing Export
  gstFiling: {
    preview: (month, year) => {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      return request(`/gst-filing/preview?${params}`);
    },
    downloadExcel: (month, year) => {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      return `${BASE}/gst-filing/excel?${params}`;
    },
    downloadCsv: (month, year) => {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      return `${BASE}/gst-filing/csv?${params}`;
    },
    downloadJson: (month, year) => {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      return `${BASE}/gst-filing/json?${params}`;
    },
  },

  // Sales CRUD
  // createSale/createBulkSale/updateSale accept an optional branchId: the backend
  // derives which branch a sale belongs to from the X-Branch-ID header (not the
  // request body), and rejects sale creation outright for an OWNER account whose
  // company has multiple branches but sent no header — see Sales.jsx's branch
  // selector, which is the UI that supplies this value.
  getSales: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return request(`/sales?${params}`);
  },
  getSale: (id) => request(`/sales/${id}`),
  createSale: (data, branchId) => request('/sales', { method: 'POST', body: JSON.stringify(data), ...(branchId ? { headers: { 'X-Branch-ID': String(branchId) } } : {}) }),
  createBulkSale: (data, branchId) => request('/sales/bulk', { method: 'POST', body: JSON.stringify(data), ...(branchId ? { headers: { 'X-Branch-ID': String(branchId) } } : {}) }),
  updateSale: (id, data, branchId) => request(`/sales/${id}`, { method: 'PUT', body: JSON.stringify(data), ...(branchId ? { headers: { 'X-Branch-ID': String(branchId) } } : {}) }),
  deleteSale: (id) => request(`/sales/${id}`, { method: 'DELETE' }),

  // GST States
  getGstStates: () => request('/gst-states'),

  // Customers CRUD
  getCustomersList: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return request(`/customers?${params}`);
  },
  getCustomer: (id) => request(`/customers/${id}`),
  createCustomer: (data) => request('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id, data) => request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomer: (id) => request(`/customers/${id}`, { method: 'DELETE' }),

  // Employees CRUD
  getEmployees: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return request(`/employees?${params}`);
  },
  getEmployee: (id) => request(`/employees/${id}`),
  getEmployeeProfile: (id) => request(`/employees/${id}/profile`),
  getEmployeeAnalytics: () => request('/employees/analytics'),
  createEmployee: (data) => request('/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id, data) => request(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmployee: (id) => request(`/employees/${id}`, { method: 'DELETE' }),
  createEmployeeLogin: (id, data) => request(`/employees/${id}/login`, { method: 'POST', body: JSON.stringify(data) }),
  // Employee photo — multipart upload, so bypass the JSON-only request() wrapper
  // the same way uploadEmployeeDocument does (don't set Content-Type manually,
  // let the browser fill in the multipart boundary).
  uploadEmployeePhoto: (id, formData) => {
    const token = localStorage.getItem('token');
    return fetch(`/api/employees/${id}/photo`, {
      method: 'POST', body: formData, headers: { Authorization: `Bearer ${token}` }
    }).then(async r => {
      const data = await r.json().catch(() => ({ error: 'Upload failed' }));
      if (!r.ok) throw new Error(data.error || 'Upload failed');
      return data;
    });
  },
  deleteEmployeePhoto: (id) => request(`/employees/${id}/photo`, { method: 'DELETE' }),
  // GET /photo/file requires the bearer token like every other endpoint, so a
  // plain <img src="..."> can't load it directly (no way to attach the auth
  // header to an <img> request) -- callers fetch the blob and build an
  // object URL instead, same pattern as compliance/trade downloadDocument.
  getEmployeePhoto: async (id) => {
    const res = await fetch(`${BASE}/employees/${id}/photo/file`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` },
    });
    if (!res.ok) return null;
    return res.blob();
  },

  // Departments CRUD
  getDepartments: () => request('/departments'),
  createDepartment: (data) => request('/departments', { method: 'POST', body: JSON.stringify(data) }),
  updateDepartment: (id, data) => request(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDepartment: (id) => request(`/departments/${id}`, { method: 'DELETE' }),

  // Branches CRUD
  getBranches: () => request('/branches'),
  createBranch: (data) => request('/branches', { method: 'POST', body: JSON.stringify(data) }),
  updateBranch: (id, data) => request(`/branches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBranch: (id) => request(`/branches/${id}`, { method: 'DELETE' }),

  // Roles & Permissions CRUD
  getRolesAndPermissions: () => request('/roles'),
  createRole: (data) => request('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id, data) => request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRole: (id) => request(`/roles/${id}`, { method: 'DELETE' }),
  getRolePermissions: (id) => request(`/roles/${id}/permissions`),
  assignRole: (userId, roleId) => request('/roles/assign', { method: 'POST', body: JSON.stringify({ userId, roleId }) }),
  revokeRole: (userId, roleId) => request(`/roles/assign/${userId}/${roleId}`, { method: 'DELETE' }),

  // Suppliers CRUD
  getSuppliers: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return request(`/suppliers?${params}`);
  },
  getSupplier: (id) => request(`/suppliers/${id}`),
  createSupplier: (data) => request('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id, data) => request(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSupplier: (id) => request(`/suppliers/${id}`, { method: 'DELETE' }),

  // Credits CRUD
  getCredits: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return request(`/credits?${params}`);
  },
  getCreditsSummary: () => request('/credits/summary'),
  createCredit: (data) => request('/credits', { method: 'POST', body: JSON.stringify(data) }),
  updateCredit: (id, data) => request(`/credits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  recordPayment: (id, amount) => request(`/credits/${id}/pay`, { method: 'PUT', body: JSON.stringify({ amount }) }),
  deleteCredit: (id) => request(`/credits/${id}`, { method: 'DELETE' }),

  // Invoices CRUD
  getInvoices: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return request(`/invoices?${params}`);
  },
  createInvoice: (data) => request('/invoices', { method: 'POST', body: JSON.stringify(data) }),
  updateInvoice: (id, data) => request(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInvoice: (id) => request(`/invoices/${id}`, { method: 'DELETE' }),

  // ─── Company Registration & Profile ────────────────────────────────────────
  // Full profile (all satellite tables)
  getCompanyProfile: () => request('/company/profile'),
  updateCompanyProfile: (data) => request('/company/profile', { method: 'PUT', body: JSON.stringify(data) }),

  // Setup progress
  getSetupProgress: () => request('/company/setup-progress'),

  // Setup wizard steps
  setupGstin: (data) => request('/company/setup/gstin', { method: 'POST', body: JSON.stringify(data) }),
  setupAddress: (data) => request('/company/setup/address', { method: 'POST', body: JSON.stringify(data) }),
  setupIndustry: (data) => request('/company/setup/industry', { method: 'POST', body: JSON.stringify(data) }),
  setupLicenses: (data) => request('/company/setup/licenses', { method: 'POST', body: JSON.stringify(data) }),
  setupInvoice: (data) => request('/company/setup/invoice', { method: 'POST', body: JSON.stringify(data) }),
  setupBranding: (data) => request('/company/setup/branding', { method: 'POST', body: JSON.stringify(data) }),

  // Real-time validators (for wizard)
  validateGSTIN: (gstin) => request('/company/validate/gstin', { method: 'POST', body: JSON.stringify({ gstin }) }),
  validatePAN: (pan) => request('/company/validate/pan', { method: 'POST', body: JSON.stringify({ pan }) }),

  // Addresses
  getCompanyAddresses: () => request('/company/addresses'),
  addCompanyAddress: (data) => request('/company/addresses', { method: 'POST', body: JSON.stringify(data) }),
  updateCompanyAddress: (id, data) => request(`/company/addresses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCompanyAddress: (id) => request(`/company/addresses/${id}`, { method: 'DELETE' }),

  // Licenses
  getCompanyLicenses: () => request('/company/licenses'),
  addCompanyLicense: (data) => request('/company/licenses', { method: 'POST', body: JSON.stringify(data) }),
  updateCompanyLicense: (id, data) => request(`/company/licenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCompanyLicense: (id) => request(`/company/licenses/${id}`, { method: 'DELETE' }),
  getExpiringLicenses: () => request('/company/licenses/expiring'),
  getLicenseRequirements: (category) => request(`/company/license-requirements?category=${encodeURIComponent(category)}`),
  dismissLicenseAlert: (id) => request(`/company/licenses/alerts/${id}/dismiss`, { method: 'POST' }),

  // Bank Accounts
  getBankAccounts: () => request('/company/bank-accounts'),
  addBankAccount: (data) => request('/company/bank-accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateBankAccount: (id, data) => request(`/company/bank-accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBankAccount: (id) => request(`/company/bank-accounts/${id}`, { method: 'DELETE' }),

  // Settings
  getGstSettings: () => request('/company/gst-settings'),
  updateGstSettings: (data) => request('/company/gst-settings', { method: 'PUT', body: JSON.stringify(data) }),
  getFinancialSettings: () => request('/company/financial-settings'),
  updateFinancialSettings: (data) => request('/company/financial-settings', { method: 'PUT', body: JSON.stringify(data) }),
  getCompanyBranding: () => request('/company/branding'),
  updateCompanyBranding: (data) => request('/company/branding', { method: 'PUT', body: JSON.stringify(data) }),
  getSecuritySettings: () => request('/company/security'),
  updateSecuritySettings: (data) => request('/company/security', { method: 'PUT', body: JSON.stringify(data) }),

  // ─── Phase 2: Invitations ────────────────────────────────────────────────────
  getInvitations: () => request('/invitations'),
  createInvitation: (data) => request('/invitations', { method: 'POST', body: JSON.stringify(data) }),
  revokeInvitation: (id) => request(`/invitations/${id}`, { method: 'DELETE' }),
  validateInviteToken: (token) => request(`/invitations/validate/${token}`),
  acceptInvitation: (data) => request('/invitations/accept', { method: 'POST', body: JSON.stringify(data) }),

  // ─── Phase 2: Leaves ─────────────────────────────────────────────────────────
  getLeaveTypes: () => request('/leaves/types'),
  createLeaveType: (data) => request('/leaves/types', { method: 'POST', body: JSON.stringify(data) }),
  updateLeaveType: (id, data) => request(`/leaves/types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getLeaves: (filters = {}) => request(`/leaves?${new URLSearchParams(filters)}`),
  getLeaveCalendar: (month, year) => request(`/leaves/calendar?month=${month}&year=${year}`),
  getLeaveBalance: (employeeId, year) => request(`/leaves/balance/${employeeId}${year ? `?year=${year}` : ''}`),
  submitLeave: (data) => request('/leaves', { method: 'POST', body: JSON.stringify(data) }),
  approveLeave: (id) => request(`/leaves/${id}/approve`, { method: 'PUT' }),
  rejectLeave: (id, reason) => request(`/leaves/${id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) }),
  cancelLeave: (id) => request(`/leaves/${id}/cancel`, { method: 'PUT' }),

  // ─── Phase 2: Attendance ─────────────────────────────────────────────────────
  getAttendance: (filters = {}) => request(`/attendance?${new URLSearchParams(filters)}`),
  getAttendanceSummary: (date) => request(`/attendance/summary${date ? `?date=${date}` : ''}`),
  getAttendanceReport: (filters = {}) => request(`/attendance/report?${new URLSearchParams(filters)}`),
  clockIn: (data) => request('/attendance/clock-in', { method: 'POST', body: JSON.stringify(data) }),
  clockOut: (data) => request('/attendance/clock-out', { method: 'POST', body: JSON.stringify(data) }),
  markAttendance: (date, records) => request('/attendance/mark', { method: 'POST', body: JSON.stringify({ date, records }) }),
  updateAttendance: (id, data) => request(`/attendance/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // ─── Phase 2: Payroll ─────────────────────────────────────────────────────────
  getPayrollRuns: () => request('/payroll/runs'),
  createPayrollRun: (data) => request('/payroll/runs', { method: 'POST', body: JSON.stringify(data) }),
  getPayrollRun: (id) => request(`/payroll/runs/${id}`),
  approvePayrollRun: (id) => request(`/payroll/runs/${id}/approve`, { method: 'PUT' }),
  payPayrollRun: (id) => request(`/payroll/runs/${id}/pay`, { method: 'PUT' }),
  getPayrollSlips: (employeeId) => request(`/payroll/slips/${employeeId}`),
  getEmployeeSalary: (employeeId) => request(`/payroll/salary/${employeeId}`),
  updateEmployeeSalary: (employeeId, data) => request(`/payroll/salary/${employeeId}`, { method: 'PUT', body: JSON.stringify(data) }),

  // ─── Phase 2: Documents ───────────────────────────────────────────────────────
  getEmployeeDocuments: (employeeId) => request(`/employee-documents/${employeeId}`),
  uploadEmployeeDocument: (employeeId, formData) => {
    const token = localStorage.getItem('token');
    return fetch(`/api/employee-documents/${employeeId}`, {
      method: 'POST', body: formData, headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json());
  },
  getDocumentUrl: (id) => `/api/employee-documents/file/${id}`,
  deleteEmployeeDocument: (id) => request(`/employee-documents/${id}`, { method: 'DELETE' }),

  // ─── Phase 2: Audit Logs ─────────────────────────────────────────────────────
  getAuditLogs: (filters = {}) => request(`/audit-logs?${new URLSearchParams(filters)}`),
  getEntityTimeline: (targetType, targetId) => request(`/audit-logs/${targetType}/${targetId}`),

  // ─── Phase 2: Sessions ────────────────────────────────────────────────────────
  getSessions: (all = false) => request(`/sessions${all ? '?all=true' : ''}`),
  terminateSession: (id) => request(`/sessions/${id}`, { method: 'DELETE' }),
  terminateAllSessions: () => request('/sessions', { method: 'DELETE' }),

  // ─── Phase 2: Notifications ───────────────────────────────────────────────────
  getNotifications: (page = 1) => request(`/notifications?page=${page}`),
  getUnreadCount: () => request('/notifications/unread-count'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PUT' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PUT' }),

  // ─── Phase 2: HR AI Copilot ───────────────────────────────────────────────────
  hrAIChat: (messages) => request('/hr-ai/chat', { method: 'POST', body: JSON.stringify({ messages }) }),
  generateHRLetter: (type, employee_id, context) => request('/hr-ai/generate-letter', { method: 'POST', body: JSON.stringify({ type, employee_id, context }) }),
  getHRInsights: () => request('/hr-ai/insights'),

  // ─── Phase 3: Automations ────────────────────────────────────────────────────
  automations: {
    getAll: () => request('/automations'),
    getDashboard: () => request('/automations/dashboard'),
    create: (data) => request('/automations', { method: 'POST', body: JSON.stringify(data) }),
    updateStatus: (id, status) => request(`/automations/${id}`, { method: 'PUT', body: JSON.stringify({ status }) }),
    delete: (id) => request(`/automations/${id}`, { method: 'DELETE' }),
  },

  // ─── Home dashboard aggregation (thin façade over marketing/spend/automation) ─
  homeMarketingSummary: () => request('/home/marketing-summary'),

  // ─── Compliance Intelligence Platform ─────────────────────────────────────────
  compliance: {
    getCategories: () => request('/compliance/categories'),
    getProfile: () => request('/compliance/profile'),
    saveProfile: (data) => request('/compliance/profile', { method: 'PUT', body: JSON.stringify(data) }),
    recompute: () => request('/compliance/recompute', { method: 'POST' }),
    getOverview: () => request('/compliance/overview'),
    getItems: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      return request(`/compliance/items${qs ? `?${qs}` : ''}`);
    },
    updateItem: (id, data) => request(`/compliance/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    getItemDetail: (id) => request(`/compliance/items/${id}`),
    copilot: (question) => request('/compliance/copilot', { method: 'POST', body: JSON.stringify({ question }) }),

    // Document Vault
    listDocuments: (itemId, history = false) => request(`/compliance/items/${itemId}/documents${history ? '?history=1' : ''}`),
    uploadDocuments: async (itemId, formData) => {
      // Multipart upload — do NOT set Content-Type (browser sets the boundary).
      const res = await fetch(`${BASE}/compliance/items/${itemId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({ error: 'Upload failed' }));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    },
    verifyDocument: (docId, data) => request(`/compliance/documents/${docId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteDocument: (docId) => request(`/compliance/documents/${docId}`, { method: 'DELETE' }),
    downloadDocument: async (docId) => {
      const res = await fetch(`${BASE}/compliance/documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` },
      });
      if (!res.ok) throw new Error('Download failed');
      return res.blob();
    },
    downloadReport: async (type, format = 'csv') => {
      const res = await fetch(`${BASE}/compliance/reports/${type}?format=${format}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` },
      });
      if (!res.ok) throw new Error('Report generation failed');
      return res.blob();
    },

    // Admin rule management
    getRules: (country) => request(`/compliance/rules${country ? `?country=${country}` : ''}`),
    createRule: (data) => request('/compliance/rules', { method: 'POST', body: JSON.stringify(data) }),
    updateRule: (id, data) => request(`/compliance/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteRule: (id) => request(`/compliance/rules/${id}`, { method: 'DELETE' }),

    // Board Meeting Manager
    getMeetings: () => request('/compliance/meetings'),
    getMeeting: (id) => request(`/compliance/meetings/${id}`),
    createMeeting: (data) => request('/compliance/meetings', { method: 'POST', body: JSON.stringify(data) }),
    updateMeeting: (id, data) => request(`/compliance/meetings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteMeeting: (id) => request(`/compliance/meetings/${id}`, { method: 'DELETE' }),
    generateMinutes: (id) => request(`/compliance/meetings/${id}/minutes`, { method: 'POST' }),
    holdMeeting: (id, data) => request(`/compliance/meetings/${id}/hold`, { method: 'POST', body: JSON.stringify(data || {}) }),
    getMeetingTemplates: () => request('/compliance/meeting-templates'),
  },

  // ─── Import & Export Trade Intelligence ──────────────────────────────────────
  trade: {
    getProfile: () => request('/trade/profile'),
    saveProfile: (data) => request('/trade/profile', { method: 'PUT', body: JSON.stringify(data) }),
    recompute: () => request('/trade/recompute', { method: 'POST' }),
    getOverview: () => request('/trade/overview'),

    getGuidelines: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      return request(`/trade/guidelines${qs ? `?${qs}` : ''}`);
    },
    getGuidelineDetail: (id) => request(`/trade/guidelines/${id}`),

    getRequirements: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      return request(`/trade/requirements${qs ? `?${qs}` : ''}`);
    },
    getRequirementDetail: (id) => request(`/trade/requirements/${id}`),
    updateRequirement: (id, data) => request(`/trade/requirements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    copilot: (question) => request('/trade/copilot', { method: 'POST', body: JSON.stringify({ question }) }),

    // Document Vault
    listDocuments: (requirementId, history = false) => request(`/trade/requirements/${requirementId}/documents${history ? '?history=1' : ''}`),
    uploadDocuments: async (requirementId, formData) => {
      const res = await fetch(`${BASE}/trade/requirements/${requirementId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({ error: 'Upload failed' }));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    },
    verifyDocument: (docId, data) => request(`/trade/documents/${docId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteDocument: (docId) => request(`/trade/documents/${docId}`, { method: 'DELETE' }),
    downloadDocument: async (docId) => {
      const res = await fetch(`${BASE}/trade/documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` },
      });
      if (!res.ok) throw new Error('Download failed');
      return res.blob();
    },

    // Reference data
    getAuthorities: () => request('/trade/authorities'),
    getCountries: () => request('/trade/countries'),
    getCountryDetail: (code) => request(`/trade/countries/${code}`),

    // Admin guideline management
    getGuidelinesAdmin: (country) => request(`/trade/admin/guidelines${country ? `?country=${country}` : ''}`),
    createGuideline: (data) => request('/trade/admin/guidelines', { method: 'POST', body: JSON.stringify(data) }),
    updateGuideline: (id, data) => request(`/trade/admin/guidelines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteGuideline: (id) => request(`/trade/admin/guidelines/${id}`, { method: 'DELETE' }),
  },

  // ── Workforce & Organization Management (Phase 1 + 2) ────────────────────
  getDepartmentMembers: (id) => request(`/departments/${id}/members`),
  // Org chart & reporting hierarchy
  getOrgChart: () => request('/org/chart'),
  getOrgChain: (id) => request(`/org/${id}/chain`),
  // Teams
  getTeams: () => request('/teams'),
  getTeam: (id) => request(`/teams/${id}`),
  createTeam: (data) => request('/teams', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id, data) => request(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTeam: (id) => request(`/teams/${id}`, { method: 'DELETE' }),
  addTeamMembers: (id, employee_ids) => request(`/teams/${id}/members`, { method: 'POST', body: JSON.stringify({ employee_ids }) }),
  removeTeamMember: (id, empId) => request(`/teams/${id}/members/${empId}`, { method: 'DELETE' }),
  // Employee Groups
  getGroups: (q) => request(`/employee-groups${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getGroup: (id) => request(`/employee-groups/${id}`),
  createGroup: (data) => request('/employee-groups', { method: 'POST', body: JSON.stringify(data) }),
  updateGroup: (id, data) => request(`/employee-groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGroup: (id) => request(`/employee-groups/${id}`, { method: 'DELETE' }),
  addGroupMembers: (id, employee_ids) => request(`/employee-groups/${id}/members`, { method: 'POST', body: JSON.stringify({ employee_ids }) }),
  removeGroupMember: (id, empId) => request(`/employee-groups/${id}/members/${empId}`, { method: 'DELETE' }),
  transferGroupMembers: (from_group_id, to_group_id, employee_ids) => request('/employee-groups/transfer', { method: 'POST', body: JSON.stringify({ from_group_id, to_group_id, employee_ids }) }),
  // Tasks
  getTasks: (params) => request(`/tasks${params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`),
  getTaskBoard: (params) => request(`/tasks/board${params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`),
  getTaskAnalytics: () => request('/tasks/analytics'),
  getTask: (id) => request(`/tasks/${id}`),
  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  addTaskAssignees: (id, data) => request(`/tasks/${id}/assignments`, { method: 'POST', body: JSON.stringify(data) }),
  removeTaskAssignee: (id, type, assigneeId) => request(`/tasks/${id}/assignments/${type}/${assigneeId}`, { method: 'DELETE' }),
  addTaskComment: (id, body, mentions) => request(`/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify({ body, mentions }) }),
  addTaskChecklist: (id, title) => request(`/tasks/${id}/checklist`, { method: 'POST', body: JSON.stringify({ title }) }),
  toggleTaskChecklist: (id, itemId, is_done) => request(`/tasks/${id}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify({ is_done }) }),
  deleteTaskChecklist: (id, itemId) => request(`/tasks/${id}/checklist/${itemId}`, { method: 'DELETE' }),
  uploadTaskAttachment: async (id, file) => {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch(`${BASE}/tasks/${id}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` }, body: fd });
    const d = await res.json().catch(() => ({ error: 'Upload failed' }));
    if (!res.ok) throw new Error(d.error || 'Upload failed');
    return d;
  },
  downloadTaskAttachment: async (attId) => {
    const res = await fetch(`${BASE}/tasks/attachments/${attId}/download`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` } });
    if (!res.ok) throw new Error('Download failed');
    return res.blob();
  },
  deleteTaskAttachment: (attId) => request(`/tasks/attachments/${attId}`, { method: 'DELETE' }),

  // ─── Business Growth Hub ──────────────────────────────────────────────────────
  growth: {
    // Profile & Dashboard
    getProfile:   ()     => request('/growth/profile'),
    updateProfile:(data) => request('/growth/profile', { method: 'PUT', body: JSON.stringify(data) }),
    getDashboard: ()     => request('/growth/dashboard'),
    getReadiness: ()     => request('/growth/readiness'),

    // Funding Types (global catalog)
    getFundingTypes: (params = {}) => request(`/growth/funding-types?${new URLSearchParams(params)}`),
    getFundingType:  (id)           => request(`/growth/funding-types/${id}`),
    createFundingType:(data)        => request('/growth/funding-types', { method: 'POST', body: JSON.stringify(data) }),

    // Government Schemes
    getSchemes:   (params = {}) => request(`/growth/schemes?${new URLSearchParams(params)}`),
    getScheme:    (id)           => request(`/growth/schemes/${id}`),
    createScheme: (data)         => request('/growth/schemes', { method: 'POST', body: JSON.stringify(data) }),
    updateScheme: (id, data)     => request(`/growth/schemes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

    // Investor Directory (curated reference list of real investor firms — not the Investors CRM below)
    getInvestorDirectory: (params = {}) => request(`/growth/investor-directory?${new URLSearchParams(params)}`),
    getInvestorDirectoryEntry: (id)     => request(`/growth/investor-directory/${id}`),

    // Investors
    getInvestors:   (params = {}) => request(`/growth/investors?${new URLSearchParams(params)}`),
    getInvestor:    (id)           => request(`/growth/investors/${id}`),
    createInvestor: (data)         => request('/growth/investors', { method: 'POST', body: JSON.stringify(data) }),
    updateInvestor: (id, data)     => request(`/growth/investors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteInvestor: (id)           => request(`/growth/investors/${id}`, { method: 'DELETE' }),

    // Investment Rounds
    getRounds:   ()           => request('/growth/rounds'),
    createRound: (data)       => request('/growth/rounds', { method: 'POST', body: JSON.stringify(data) }),
    updateRound: (id, data)   => request(`/growth/rounds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteRound: (id)         => request(`/growth/rounds/${id}`, { method: 'DELETE' }),

    // Cap Table & Shareholders
    getCapTable:       ()           => request('/growth/cap-table'),
    getShareholders:   ()           => request('/growth/shareholders'),
    createShareholder: (data)       => request('/growth/shareholders', { method: 'POST', body: JSON.stringify(data) }),
    updateShareholder: (id, data)   => request(`/growth/shareholders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteShareholder: (id)         => request(`/growth/shareholders/${id}`, { method: 'DELETE' }),
    simulateDilution:  (data)       => request('/growth/simulate-dilution', { method: 'POST', body: JSON.stringify(data) }),

    // Equity Transactions
    getEquityTransactions: () => request('/growth/equity-transactions'),
    createEquityTransaction: (data) => request('/growth/equity-transactions', { method: 'POST', body: JSON.stringify(data) }),

    // Valuations
    getValuations:  ()         => request('/growth/valuations'),
    createValuation:(data)     => request('/growth/valuations', { method: 'POST', body: JSON.stringify(data) }),
    deleteValuation:(id)       => request(`/growth/valuations/${id}`, { method: 'DELETE' }),

    // IPO Checklist
    getIpoChecklist:    ()         => request('/growth/ipo-checklist'),
    updateIpoItem:      (id, data) => request(`/growth/ipo-checklist/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    uploadIpoDocument: async (itemId, formData) => {
      const res = await fetch(`${BASE}/growth/ipo-checklist/${itemId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({ error: 'Upload failed' }));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    },
    getIpoDocuments: (itemId) => request(`/growth/ipo-checklist/${itemId}/documents`),
    deleteIpoDocument: (docId) => request(`/growth/ipo-documents/${docId}`, { method: 'DELETE' }),
    downloadIpoDocument: async (docId) => {
      const res = await fetch(`${BASE}/growth/ipo-documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` },
      });
      if (!res.ok) throw new Error('Download failed');
      return res.blob();
    },

    // Partnerships & Sponsorships
    getPartnerships:   (params = {}) => request(`/growth/partnerships?${new URLSearchParams(params)}`),
    createPartnership: (data)         => request('/growth/partnerships', { method: 'POST', body: JSON.stringify(data) }),
    updatePartnership: (id, data)     => request(`/growth/partnerships/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deletePartnership: (id)           => request(`/growth/partnerships/${id}`, { method: 'DELETE' }),

    // Pitch Decks
    getPitchDecks:   ()         => request('/growth/pitch-decks'),
    deletePitchDeck: (id)       => request(`/growth/pitch-decks/${id}`, { method: 'DELETE' }),
    uploadPitchDeck: async (formData) => {
      const res = await fetch(`${BASE}/growth/pitch-decks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({ error: 'Upload failed' }));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data;
    },

    // Due Diligence
    getDueDiligence:   ()          => request('/growth/due-diligence'),
    updateDueDiligenceItem: async (id, formData) => {
      const res = await fetch(`${BASE}/growth/due-diligence/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || jwtToken}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({ error: 'Update failed' }));
      if (!res.ok) throw new Error(data.error || 'Update failed');
      return data;
    },

    // Growth Roadmap
    getRoadmap:    ()          => request('/growth/roadmap'),
    createTask:    (data)      => request('/growth/roadmap', { method: 'POST', body: JSON.stringify(data) }),
    updateTask:    (id, data)  => request(`/growth/roadmap/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteTask:    (id)        => request(`/growth/roadmap/${id}`, { method: 'DELETE' }),

    // AI Growth Advisor
    chat:          (message, sessionId) => request('/growth/advisor', { method: 'POST', body: JSON.stringify({ message, sessionId }) }),
    getHistory:    (sessionId)          => request(`/growth/advisor/history${sessionId ? `?sessionId=${sessionId}` : ''}`),

    // Notes
    getNotes:   (params = {}) => request(`/growth/notes?${new URLSearchParams(params)}`),
    createNote: (data)        => request('/growth/notes', { method: 'POST', body: JSON.stringify(data) }),
    updateNote: (id, data)    => request(`/growth/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteNote: (id)          => request(`/growth/notes/${id}`, { method: 'DELETE' }),
  },
};
export const api = new Proxy(rawApi, {
  get(target, prop) {
    if (!(prop in target) && prop !== 'then') {
      if (import.meta && import.meta.env && import.meta.env.DEV) {
        console.error(`[API Client Error] Attempted to call missing API method: api.${prop}`);
      }
      return () => Promise.reject(new Error(`API method ${prop} is not implemented`));
    }
    return target[prop];
  }
});
