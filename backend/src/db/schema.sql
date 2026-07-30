-- Companies (Multi-Tenant)
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'Retail',
  subscription TEXT NOT NULL DEFAULT 'Basic',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Product groups
-- company_id + the composite unique below were added by migration 31 (this
-- table originally predates multi-tenancy migration 11 and was never
-- retrofitted). See migration 31 in runMigrations() for how existing
-- databases -- including groups that were shared across companies under the
-- old global UNIQUE(name) -- get split into one row per (company_id, name).
CREATE TABLE IF NOT EXISTS product_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, name)
);

-- Products catalog
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- kept for backward compatibility
  group_id INTEGER REFERENCES product_groups(id),
  company_id INTEGER REFERENCES companies(id),
  cost_price REAL NOT NULL,
  selling_price REAL NOT NULL,
  hsn_code TEXT,
  use_custom_gst INTEGER DEFAULT 0,
  gst_rate REAL,
  uqc TEXT,
  cess_rate REAL,
  supplier_id INTEGER REFERENCES suppliers(id)
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TEXT DEFAULT (date('now'))
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  head_id INTEGER REFERENCES employees(id),
  status TEXT DEFAULT 'Active',
  color TEXT,
  icon TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  salary REAL NOT NULL,
  revenue_generated REAL DEFAULT 0,
  joining_date TEXT NOT NULL,
  performance_rating REAL DEFAULT 3.0,
  attendance REAL DEFAULT 95,
  status TEXT DEFAULT 'Active',
  user_id INTEGER REFERENCES users(id),
  employee_code TEXT,
  avatar TEXT,
  phone TEXT,
  email TEXT,
  emergency_contact TEXT,
  job_title TEXT,
  manager_id INTEGER REFERENCES employees(id),
  department_id INTEGER REFERENCES departments(id),
  employment_type TEXT DEFAULT 'Full Time',
  skills TEXT,
  date_of_birth TEXT,
  deleted_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Individual sale transactions
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_id INTEGER REFERENCES customers(id),
  employee_id INTEGER REFERENCES employees(id),
  quantity INTEGER NOT NULL,
  revenue REAL NOT NULL,
  sale_date TEXT NOT NULL, -- ISO date string, e.g. 2026-05-14
  payment_status TEXT DEFAULT 'paid', -- 'paid' | 'unpaid'
  invoice_number TEXT,
  invoice_id INTEGER REFERENCES invoices(id)
);

-- Current stock levels
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  stock_quantity INTEGER NOT NULL,
  reorder_level INTEGER NOT NULL,
  last_restocked TEXT
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  total_purchases REAL DEFAULT 0,
  last_purchase_date TEXT,
  gstin TEXT,
  billing_address TEXT
);

-- Invoices
-- invoice_number's uniqueness is scoped to company_id below, not a bare
-- column-level UNIQUE (was global UNIQUE(invoice_number); fixed by migration
-- 32 for existing databases -- see runMigrations() for why the rebuild there
-- reads column definitions from the live table via PRAGMA rather than
-- copying this file, since the two have already drifted apart via earlier
-- addColumnIfNotExists calls).
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  invoice_number TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  subtotal REAL DEFAULT 0,
  taxable_value REAL DEFAULT 0,
  cgst REAL DEFAULT 0,
  sgst REAL DEFAULT 0,
  igst REAL DEFAULT 0,
  grand_total REAL NOT NULL,
  amount REAL NOT NULL, -- Legacy compat
  invoice_date TEXT NOT NULL,
  status TEXT DEFAULT 'paid', -- 'paid' | 'pending' | 'overdue'
  payment_status TEXT DEFAULT 'PAID',
  pdf_path TEXT,
  snapshot TEXT,
  UNIQUE(company_id, invoice_number)
);

-- Invoice Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  rate REAL NOT NULL,
  taxable_value REAL NOT NULL,
  cgst REAL DEFAULT 0,
  sgst REAL DEFAULT 0,
  igst REAL DEFAULT 0,
  total REAL NOT NULL
);

-- Credits table
CREATE TABLE IF NOT EXISTS credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  sale_id INTEGER REFERENCES sales(id),
  total_amount REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  due_date TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending' | 'paid' | 'overdue'
  notes TEXT,
  created_at TEXT DEFAULT (date('now'))
);

CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  quantity INTEGER NOT NULL,
  cost_price REAL NOT NULL,
  gst_amount REAL NOT NULL,
  purchase_date TEXT NOT NULL,
  invoice_number TEXT
);
-- Company Settings
CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  gstin TEXT,
  state TEXT,
  default_hsn_prefix TEXT,
  company_name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo TEXT
);
-- ⚠ DEPRECATED: company_settings is kept for safety but is no longer written to by any new code.
-- All fields have been migrated into satellite tables by Migration 15.
-- New code must read/write from: company_gst_settings, company_financial_settings, company_branding.

-- =============================================================================
-- COMPANY REGISTRATION MODULE — Satellite Tables (added in Migration 15)
-- =============================================================================

-- Company extended identity (core companies table gets new columns via Migration 15 ALTER TABLE)
-- Additional multi-address support
CREATE TABLE IF NOT EXISTS company_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  address_type TEXT NOT NULL CHECK(address_type IN ('registered','branch','billing','shipping','warehouse')),
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  district TEXT,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  pincode TEXT NOT NULL,
  gstin TEXT, -- branch-level GSTIN for multi-state operations
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indian compliance licenses (FSSAI, Drug License, etc.)
CREATE TABLE IF NOT EXISTS company_licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  license_type TEXT NOT NULL CHECK(license_type IN (
    'GSTIN','PAN','CIN','LLPIN','UDYAM','TAN','IEC',
    'FSSAI','DRUG_LICENSE','TRADE_LICENSE','SHOP_ESTABLISHMENT',
    'PROFESSIONAL_TAX','EPFO','ESIC'
  )),
  license_number TEXT,
  issuing_authority TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','expired','pending_renewal')),
  document_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Multi-account bank details
CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  bank_name TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  ifsc TEXT NOT NULL,
  branch_name TEXT,
  upi_id TEXT,
  qr_code_url TEXT,
  is_primary INTEGER DEFAULT 0,
  show_on_invoice INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- GST-specific settings (replaces relevant company_settings fields)
CREATE TABLE IF NOT EXISTS company_gst_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
  registration_type TEXT DEFAULT 'regular' CHECK(registration_type IN ('regular','composition','unregistered','casual')),
  place_of_supply TEXT,
  state_code TEXT,
  default_gst_rate REAL DEFAULT 18,
  reverse_charge_applicable INTEGER DEFAULT 0,
  hsn_sac_mandatory INTEGER DEFAULT 0,
  composition_scheme_rate REAL,
  is_gst_registered INTEGER DEFAULT 1,
  inclusive_pricing INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Financial settings (replaces relevant company_settings + invoice prefix fields)
CREATE TABLE IF NOT EXISTS company_financial_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
  currency TEXT DEFAULT 'INR',
  financial_year_start_month INTEGER DEFAULT 4,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  accounting_method TEXT DEFAULT 'cash' CHECK(accounting_method IN ('cash','accrual')),
  invoice_prefix TEXT DEFAULT 'INV',
  purchase_prefix TEXT DEFAULT 'PO',
  credit_note_prefix TEXT DEFAULT 'CN',
  decimal_precision INTEGER DEFAULT 2,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Branding (replaces logo in company_settings, adds stamp/signature/footer)
CREATE TABLE IF NOT EXISTS company_branding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
  logo_url TEXT,
  signature_url TEXT,
  stamp_url TEXT,
  invoice_footer TEXT,
  brand_color TEXT DEFAULT '#2563EB',
  theme TEXT DEFAULT 'default',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Subscription tracking
CREATE TABLE IF NOT EXISTS company_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
  plan_id TEXT DEFAULT 'free',
  status TEXT DEFAULT 'trialing' CHECK(status IN ('active','trialing','past_due','cancelled','paused')),
  trial_ends_at TEXT,
  current_period_end TEXT,
  billing_cycle TEXT DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly','annual')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Security settings
CREATE TABLE IF NOT EXISTS company_security_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
  two_factor_enabled INTEGER DEFAULT 0,
  password_policy TEXT DEFAULT '{}', -- JSON stored as TEXT
  session_timeout_minutes INTEGER DEFAULT 60,
  login_restrictions TEXT DEFAULT '{}', -- JSON stored as TEXT
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- License-category requirement lookup (no hardcoding: adding a new industry = INSERT a row)
CREATE TABLE IF NOT EXISTS license_category_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_category TEXT NOT NULL,
  license_type TEXT NOT NULL,
  is_mandatory INTEGER DEFAULT 0, -- 1=mandatory, 0=recommended
  description TEXT,
  UNIQUE(business_category, license_type)
);

-- License expiry alerts (surface for Company Profile Licenses tab banner)
CREATE TABLE IF NOT EXISTS license_expiry_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  license_id INTEGER NOT NULL REFERENCES company_licenses(id),
  license_type TEXT NOT NULL,
  license_number TEXT,
  expiry_date TEXT NOT NULL,
  days_until_expiry INTEGER NOT NULL,
  is_dismissed INTEGER DEFAULT 0,
  dismissed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(company_id, license_id) -- one alert per license, upserted by job
);

-- Setup wizard progress tracking
CREATE TABLE IF NOT EXISTS company_setup_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  step_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','skipped')),
  completed_at TEXT,
  UNIQUE(company_id, step_number)
);


-- AI Insights Cache
CREATE TABLE IF NOT EXISTS ai_insights_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  cache_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  confidence REAL,
  generated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id)
);

-- AI Chat History
CREATE TABLE IF NOT EXISTS ai_chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tokens_used INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_session ON ai_chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_user ON ai_chat_history(user_id, created_at DESC);

-- AI Dismissed Insights
CREATE TABLE IF NOT EXISTS ai_dismissed_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  insight_type TEXT NOT NULL,
  entity_id INTEGER,
  dismissed_at TEXT DEFAULT (datetime('now')),
  resurface_at TEXT
);

-- Schema Versions
CREATE TABLE IF NOT EXISTS schema_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  description TEXT NOT NULL,
  executed_at TEXT DEFAULT (datetime('now'))
);

-- GST Master
CREATE TABLE IF NOT EXISTS gst_hsn_master (
  hsn_code TEXT PRIMARY KEY,
  description TEXT,
  gst_rate REAL DEFAULT 0,
  uqc TEXT DEFAULT 'NOS',
  cess_rate REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS gst_uqc_master (
  code TEXT PRIMARY KEY,
  description TEXT
);

-- Users (Auth)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'OWNER',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Marketing Campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  opportunity_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  segment TEXT,
  objective TEXT,
  status TEXT DEFAULT 'draft',
  target_count INTEGER DEFAULT 0,
  customers_targeted INTEGER DEFAULT 0,
  customers_converted INTEGER DEFAULT 0,
  expected_impact REAL DEFAULT 0,
  actual_revenue REAL DEFAULT 0,
  campaign_cost REAL,
  conversion_rate REAL DEFAULT 0,
  roi REAL,
  notes TEXT,
  ai_content TEXT,
  campaign_snapshot TEXT,
  launched_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Marketing Campaign Targets
CREATE TABLE IF NOT EXISTS marketing_campaign_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  campaign_id INTEGER NOT NULL REFERENCES marketing_campaigns(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- PHASE 2 EMS TABLES (Migration 16)
-- =============================================================================

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  code TEXT,
  location TEXT,
  address TEXT,
  phone TEXT,
  gstin TEXT,
  is_hq INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permission_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER REFERENCES permission_groups(id),
  action TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  color TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER REFERENCES roles(id),
  permission_id INTEGER REFERENCES permissions(id),
  PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER REFERENCES users(id),
  role_id INTEGER REFERENCES roles(id),
  company_id INTEGER REFERENCES companies(id),
  assigned_at TEXT DEFAULT (datetime('now')),
  assigned_by INTEGER REFERENCES users(id),
  PRIMARY KEY(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  department_id INTEGER REFERENCES departments(id),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role_id INTEGER REFERENCES roles(id),
  status TEXT DEFAULT 'pending', -- pending|accepted|expired|revoked
  expires_at TEXT,
  accepted_at TEXT,
  invited_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  code TEXT,
  max_days_per_year REAL,
  carry_forward REAL DEFAULT 0,
  requires_approval INTEGER DEFAULT 1,
  is_paid INTEGER DEFAULT 1,
  color TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  leave_type_id INTEGER REFERENCES leave_types(id),
  company_id INTEGER REFERENCES companies(id),
  year INTEGER,
  total_days REAL DEFAULT 0,
  used_days REAL DEFAULT 0,
  remaining_days REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  company_id INTEGER REFERENCES companies(id),
  leave_type_id INTEGER REFERENCES leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days REAL NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending', -- pending|approved|rejected|cancelled
  approved_by INTEGER REFERENCES users(id),
  rejected_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  ai_risk_score REAL,
  ai_risk_level TEXT,
  ai_risk_reason TEXT,
  ai_suggested_replacement_id INTEGER REFERENCES employees(id),
  ai_recommendation TEXT
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  company_id INTEGER REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  date TEXT NOT NULL,
  clock_in TEXT,
  clock_out TEXT,
  break_start TEXT,
  break_end TEXT,
  total_hours REAL,
  break_hours REAL,
  overtime_hours REAL,
  status TEXT, -- present|absent|half_day|late|on_leave|holiday|remote|wfh|on_site
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS salary_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT, -- earning|deduction
  is_fixed INTEGER DEFAULT 1,
  is_mandatory INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employee_salaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  company_id INTEGER REFERENCES companies(id),
  effective_from TEXT,
  basic REAL DEFAULT 0,
  hra REAL DEFAULT 0,
  da REAL DEFAULT 0,
  medical REAL DEFAULT 0,
  travel REAL DEFAULT 0,
  bonus REAL DEFAULT 0,
  overtime REAL DEFAULT 0,
  incentives REAL DEFAULT 0,
  pf_employee REAL DEFAULT 0,
  pf_employer REAL DEFAULT 0,
  esi_employee REAL DEFAULT 0,
  esi_employer REAL DEFAULT 0,
  professional_tax REAL DEFAULT 0,
  tds REAL DEFAULT 0,
  other_deductions REAL DEFAULT 0,
  gross_salary REAL DEFAULT 0,
  net_salary REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  month INTEGER,
  year INTEGER,
  status TEXT DEFAULT 'draft', -- draft|processed|approved|paid
  total_employees INTEGER DEFAULT 0,
  total_gross REAL DEFAULT 0,
  total_deductions REAL DEFAULT 0,
  total_net REAL DEFAULT 0,
  processed_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll_slips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_run_id INTEGER REFERENCES payroll_runs(id),
  employee_id INTEGER REFERENCES employees(id),
  company_id INTEGER REFERENCES companies(id),
  month INTEGER,
  year INTEGER,
  basic REAL DEFAULT 0,
  hra REAL DEFAULT 0,
  da REAL DEFAULT 0,
  medical REAL DEFAULT 0,
  travel REAL DEFAULT 0,
  bonus REAL DEFAULT 0,
  overtime REAL DEFAULT 0,
  incentives REAL DEFAULT 0,
  gross_salary REAL DEFAULT 0,
  pf_employee REAL DEFAULT 0,
  esi_employee REAL DEFAULT 0,
  professional_tax REAL DEFAULT 0,
  tds REAL DEFAULT 0,
  other_deductions REAL DEFAULT 0,
  net_salary REAL DEFAULT 0,
  working_days REAL,
  present_days REAL,
  lop_days REAL,
  status TEXT DEFAULT 'draft',
  pdf_path TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER REFERENCES employees(id),
  company_id INTEGER REFERENCES companies(id),
  doc_type TEXT, -- PAN, Aadhaar, Resume, etc.
  doc_name TEXT,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  verified INTEGER DEFAULT 0,
  verified_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  module TEXT,
  target_type TEXT,
  target_id INTEGER,
  target_label TEXT,
  before_json TEXT,
  after_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  company_id INTEGER REFERENCES companies(id),
  token_hash TEXT NOT NULL,
  browser TEXT,
  os TEXT,
  ip_address TEXT,
  country TEXT,
  city TEXT,
  device_name TEXT,
  is_active INTEGER DEFAULT 1,
  last_activity TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  user_id INTEGER REFERENCES users(id),
  type TEXT,
  title TEXT,
  body TEXT,
  related_type TEXT,
  related_id INTEGER,
  is_read INTEGER DEFAULT 0,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hr_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  work_week_start TEXT DEFAULT 'Monday',
  work_hours_per_day REAL DEFAULT 8,
  overtime_threshold_hours REAL DEFAULT 8,
  leave_approval_flow TEXT DEFAULT 'manager_then_hr',
  attendance_method TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- PHASE 0: MARKETING SIGNAL ENGINE (Knowledge Graph Foundation)
-- =============================================================================

-- 1. Marketing Signals (Persisted outputs from detection engines)
CREATE TABLE IF NOT EXISTS marketing_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  engine_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  signal_name TEXT NOT NULL,
  signal_value REAL,
  confidence_score REAL,
  urgency_score REAL,
  metadata TEXT, -- JSON
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_signals_company ON marketing_signals(company_id);
CREATE INDEX IF NOT EXISTS idx_signals_entity ON marketing_signals(entity_type, entity_id);

-- 2. Knowledge Graph Edges (Relational Graph Approximation)
CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  node_a_type TEXT NOT NULL,
  node_a_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  node_b_type TEXT NOT NULL,
  node_b_id TEXT,
  weight REAL DEFAULT 1.0,
  metadata TEXT, -- JSON
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kg_node_a ON knowledge_graph_edges(company_id, node_a_type, node_a_id);
CREATE INDEX IF NOT EXISTS idx_kg_node_b ON knowledge_graph_edges(company_id, node_b_type, node_b_id);
CREATE INDEX IF NOT EXISTS idx_kg_relationship ON knowledge_graph_edges(relationship_type);

-- =============================================================================
-- PHASE 1: CORE MARKETING FOUNDATION
-- =============================================================================

-- 1. Customer Wallet & Loyalty Points
CREATE TABLE IF NOT EXISTS customer_wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  customer_id INTEGER REFERENCES customers(id),
  balance_type TEXT DEFAULT 'store_credit', -- 'store_credit', 'cashback', 'reward_points'
  balance REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(customer_id, balance_type)
);
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  wallet_id INTEGER REFERENCES customer_wallets(id),
  amount REAL NOT NULL, -- Positive for earn, Negative for burn
  transaction_type TEXT, -- 'earn', 'burn', 'refund', 'adjustment'
  reference_id TEXT, -- e.g., 'invoice_123', 'campaign_45'
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wallet_cust ON customer_wallets(customer_id);

-- 2. Customer Segmentation
CREATE TABLE IF NOT EXISTS custom_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  segment_type TEXT, -- 'rfm', 'rule_based', 'ai_generated'
  logic_type TEXT DEFAULT 'AND',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS segment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  segment_id INTEGER REFERENCES custom_segments(id),
  rule_type TEXT, -- 'recency', 'frequency', 'monetary', 'product_category'
  operator TEXT, -- '>', '<', '=', 'IN'
  value TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 3. Coupons & Promotions Engine
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  campaign_id INTEGER REFERENCES marketing_campaigns(id),
  code TEXT NOT NULL,
  discount_type TEXT, -- 'percentage', 'flat', 'bogo'
  discount_value REAL NOT NULL,
  min_order_value REAL DEFAULT 0,
  max_discount REAL,
  target_segment_id INTEGER REFERENCES custom_segments(id),
  usage_limit INTEGER,
  times_used INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(company_id, code)
);
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  coupon_id INTEGER REFERENCES coupons(id),
  customer_id INTEGER REFERENCES customers(id),
  invoice_id INTEGER REFERENCES invoices(id),
  discount_applied REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 4. Referral Codes
CREATE TABLE IF NOT EXISTS referral_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  customer_id INTEGER REFERENCES customers(id),
  campaign_id INTEGER REFERENCES marketing_campaigns(id),
  code TEXT NOT NULL UNIQUE,
  reward_referrer REAL, -- e.g., 50 cashback
  reward_referee REAL,  -- e.g., 50 cashback
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS referral_uses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  referral_id INTEGER REFERENCES referral_codes(id),
  new_customer_id INTEGER REFERENCES customers(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- 5. Feedback Surveys
CREATE TABLE IF NOT EXISTS feedback_surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  campaign_id INTEGER REFERENCES marketing_campaigns(id),
  invoice_id INTEGER REFERENCES invoices(id),
  type TEXT, -- 'post_purchase', 'nps'
  question_text TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  survey_id INTEGER REFERENCES feedback_surveys(id),
  customer_id INTEGER REFERENCES customers(id),
  rating INTEGER, -- 1 to 5
  feedback_text TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 6. Omnichannel Delivery
CREATE TABLE IF NOT EXISTS communication_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  channel TEXT NOT NULL, -- 'whatsapp', 'sms', 'email'
  status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'processing', 'completed', 'cancelled'
  audience_type TEXT, -- 'segment', 'manual', 'all'
  segment_id INTEGER REFERENCES custom_segments(id),
  template_id INTEGER,
  schedule_time TEXT,
  total_recipients INTEGER DEFAULT 0,
  successful_deliveries INTEGER DEFAULT 0,
  failed_deliveries INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS communication_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  channel TEXT NOT NULL, -- 'whatsapp', 'sms', 'email'
  category TEXT DEFAULT 'marketing', -- 'marketing', 'utility'
  content TEXT NOT NULL, -- JSON or raw text
  variables TEXT, -- JSON array of variable names
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS communication_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  customer_id INTEGER REFERENCES customers(id),
  campaign_id INTEGER REFERENCES communication_campaigns(id),
  marketing_campaign_id INTEGER REFERENCES marketing_campaigns(id),
  automation_id INTEGER REFERENCES marketing_automations(id),
  template_id INTEGER REFERENCES communication_templates(id),
  segment_id INTEGER REFERENCES custom_segments(id),
  channel TEXT, -- 'whatsapp', 'sms', 'email', 'push'
  provider TEXT, -- 'mock', 'twilio', 'sendgrid', etc.
  direction TEXT DEFAULT 'outbound',
  status TEXT, -- 'queued', 'processing', 'sent', 'delivered', 'read', 'failed', 'cancelled'
  message_payload TEXT,
  job_id INTEGER REFERENCES background_jobs(id),
  provider_message_id TEXT,
  error_details TEXT,
  cost REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  delivered_at TEXT,
  read_at TEXT
);

-- =============================================================================
-- PHASE 2: SPEND INTELLIGENCE
-- =============================================================================

-- 1. Store Health History
CREATE TABLE IF NOT EXISTS store_health_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  score_date TEXT NOT NULL,
  overall_score INTEGER,
  grade TEXT,
  spend_efficiency_score INTEGER,
  retention_trend_score INTEGER,
  engagement_score INTEGER,
  review_sentiment_score INTEGER,
  top_strength TEXT,
  biggest_weakness TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(company_id, score_date)
);

-- 2. Channel Costs Configuration
CREATE TABLE IF NOT EXISTS channel_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  channel TEXT NOT NULL,
  cost_per_message REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(company_id, channel)
);

-- 3. Channel ROI History
CREATE TABLE IF NOT EXISTS channel_roi_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  channel TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  total_spend REAL,
  total_revenue REAL,
  roi REAL,
  messages_sent INTEGER,
  conversion_rate REAL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(company_id, channel, snapshot_date)
);

-- =============================================================================
-- PHASE 3: AUTOMATION, EVENTS & MULTI-STORE
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  correlation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_id INTEGER,
  payload TEXT,
  status TEXT DEFAULT 'pending',
  error_log TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sys_evts ON system_events(company_id, status);

CREATE TABLE IF NOT EXISTS background_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  correlation_id TEXT,
  idempotency_key TEXT UNIQUE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  priority INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  run_at TEXT DEFAULT (datetime('now')),
  locked_at TEXT,
  error_log TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_run ON background_jobs(status, run_at, priority);

CREATE TABLE IF NOT EXISTS marketing_automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  conditions TEXT,
  delay_minutes INTEGER DEFAULT 0,
  action_type TEXT NOT NULL,
  action_payload TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_execution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  automation_id INTEGER REFERENCES marketing_automations(id),
  correlation_id TEXT NOT NULL,
  customer_id INTEGER,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  message TEXT,
  executed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  company_id INTEGER REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, branch_id)
);

-- ============================================================================
-- SPRINT 11: INTELLIGENT CAMPAIGN ASSISTANT (MARKETING COPILOT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketing_ai_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  type TEXT NOT NULL, -- e.g., 'campaign', 'insight', 'opportunity'
  title TEXT NOT NULL,
  reasoning TEXT,
  expected_impact REAL,
  confidence_score INTEGER,
  status TEXT DEFAULT 'pending', -- pending, accepted, rejected, launched
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS marketing_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  target_type TEXT NOT NULL,
  target_id INTEGER,
  predicted_roi REAL,
  predicted_revenue REAL,
  risk_score INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS marketing_forecasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  forecast_date DATE,
  expected_revenue REAL,
  seasonality_factor REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS marketing_experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  campaign_id INTEGER,
  name TEXT,
  variant_a_id INTEGER,
  variant_b_id INTEGER,
  winner_id INTEGER,
  status TEXT DEFAULT 'running',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  predicted_reach INTEGER,
  predicted_conversion_rate REAL,
  confidence INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generated_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  recommendation_id INTEGER REFERENCES marketing_ai_recommendations(id),
  name TEXT,
  description TEXT,
  target_audience TEXT,
  offer_details TEXT,
  budget REAL,
  status TEXT DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS marketing_calendar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  event_date DATE,
  title TEXT,
  type TEXT, -- e.g., 'festival', 'deadline', 'business_anniversary'
  ai_suggested_campaign INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  name TEXT,
  channel TEXT, -- whatsapp, sms, email
  tone TEXT,
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS marketing_ai_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  action TEXT,
  tokens_used INTEGER,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- COMPLIANCE INTELLIGENCE PLATFORM  (Phase 1 — data-driven rule engine)
-- Reference tables (categories / rules / conditions / rule_documents) are GLOBAL
-- and admin-managed. business_* tables are COMPANY-SCOPED. New compliance rules
-- (even new countries) are added as DATA — no application code changes required.
-- ============================================================================

-- Rule taxonomy shown as the sidebar/score buckets.
CREATE TABLE IF NOT EXISTS compliance_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,        -- tax | licenses | filings | meetings | employee | operational | renewals | documents
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0
);

-- The compliance rule itself. Applicability is decided by rows in
-- compliance_rule_conditions, so a rule is pure configuration.
CREATE TABLE IF NOT EXISTS compliance_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,       -- stable business key, e.g. 'IN_GSTR3B'
  country TEXT NOT NULL DEFAULT 'IN',
  state TEXT,                      -- NULL = applies to every state in the country
  title TEXT NOT NULL,
  description TEXT,
  category_key TEXT NOT NULL,      -- soft FK -> compliance_categories.key
  department TEXT,                 -- government department / authority
  portal_url TEXT,                 -- government portal
  reference_url TEXT,
  mandatory INTEGER DEFAULT 1,     -- 1 mandatory, 0 optional
  frequency TEXT NOT NULL,         -- monthly | quarterly | half_yearly | annual | one_time | renewal
  renewal_interval_months INTEGER, -- for 'renewal'/expiring 'one_time' items
  due_day INTEGER,                 -- day-of-month anchor (e.g. 20 for GSTR-3B)
  due_month INTEGER,               -- month-of-year anchor for annual items (e.g. 7 = July for ITR)
  grace_period_days INTEGER DEFAULT 0,
  penalty_info TEXT,
  priority TEXT DEFAULT 'medium',  -- low | medium | high | critical
  ai_explanation TEXT,
  -- Government Resource Center (data-driven; "never Google where to file")
  processing_fee TEXT,             -- e.g. '₹0 (online)' / 'State-specific'
  typical_timeline TEXT,           -- e.g. '7–15 working days'
  forms_json TEXT,                 -- JSON array of {name,url}
  guide_url TEXT,                  -- official how-to guide
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comp_rules_country ON compliance_rules(country, is_active);

-- Data-driven applicability. All conditions on a rule are AND-ed together.
CREATE TABLE IF NOT EXISTS compliance_rule_conditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL REFERENCES compliance_rules(id),
  attribute TEXT NOT NULL,         -- entity_type|industry|gst_registered|annual_turnover|employee_count|import_export|fssai_required|drug_license|has_factory|multiple_branches|msme|startup_registered
  operator TEXT NOT NULL,          -- eq|neq|gt|gte|lt|lte|in|is_true|is_false
  value TEXT                       -- comparison value; CSV for 'in'
);
CREATE INDEX IF NOT EXISTS idx_comp_conditions_rule ON compliance_rule_conditions(rule_id);

-- Documents a rule requires (feeds the Document Vault + score penalty).
CREATE TABLE IF NOT EXISTS compliance_rule_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL REFERENCES compliance_rules(id),
  doc_name TEXT NOT NULL,
  is_required INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_comp_ruledocs_rule ON compliance_rule_documents(rule_id);

-- The onboarding answers — the input to the rule engine (one row per company).
CREATE TABLE IF NOT EXISTS business_compliance_profile (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id),
  country TEXT DEFAULT 'IN',
  state TEXT,
  entity_type TEXT,               -- Sole Proprietorship|Partnership|LLP|Private Limited|OPC|Public Limited|NGO/Trust|Cooperative
  industry TEXT,                  -- Retail|Restaurant|Manufacturing|Pharmacy|Healthcare|IT Services|Ecommerce|...
  gst_registered INTEGER DEFAULT 0,
  annual_turnover REAL DEFAULT 0,
  employee_count INTEGER DEFAULT 0,
  import_export INTEGER DEFAULT 0,
  fssai_required INTEGER DEFAULT 0,
  drug_license INTEGER DEFAULT 0,
  has_factory INTEGER DEFAULT 0,
  multiple_branches INTEGER DEFAULT 0,
  msme INTEGER DEFAULT 0,
  startup_registered INTEGER DEFAULT 0,
  import_enabled INTEGER DEFAULT 0,
  export_enabled INTEGER DEFAULT 0,
  is_manufacturer INTEGER DEFAULT 0,
  is_trader INTEGER DEFAULT 0,
  is_service_provider INTEGER DEFAULT 0,
  iec_number TEXT,
  extra_json TEXT,
  computed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Materialized applicable items (the computed output) with tracking state.
CREATE TABLE IF NOT EXISTS business_compliance_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  rule_id INTEGER NOT NULL REFERENCES compliance_rules(id),
  status TEXT DEFAULT 'pending',   -- pending|in_progress|completed|overdue|not_applicable
  due_date TEXT,
  next_due_date TEXT,
  completed_at TEXT,
  last_renewed_at TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(company_id, rule_id)
);
CREATE INDEX IF NOT EXISTS idx_bci_company ON business_compliance_items(company_id);
CREATE INDEX IF NOT EXISTS idx_bci_due ON business_compliance_items(company_id, next_due_date);

-- Proof documents attached to a company's compliance item (Document Vault).
-- Versioned: replacing a document inserts a new row (version+1) and flips the
-- previous row's is_current to 0, preserving full version history.
CREATE TABLE IF NOT EXISTS compliance_item_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  item_id INTEGER NOT NULL REFERENCES business_compliance_items(id),
  doc_name TEXT NOT NULL,          -- the required-document slot this satisfies
  document_type TEXT,              -- free-form classification
  file_path TEXT,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'uploaded',  -- uploaded|expired|missing
  expiry_date TEXT,
  verified INTEGER DEFAULT 0,
  verification_notes TEXT,
  version INTEGER DEFAULT 1,
  is_current INTEGER DEFAULT 1,
  uploaded_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cid_item ON compliance_item_documents(item_id, is_current);
CREATE INDEX IF NOT EXISTS idx_cid_company ON compliance_item_documents(company_id);

-- Audit / timeline trail for compliance activity.
CREATE TABLE IF NOT EXISTS compliance_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  item_id INTEGER REFERENCES business_compliance_items(id),
  rule_id INTEGER REFERENCES compliance_rules(id),
  event_type TEXT NOT NULL,        -- recomputed|status_changed|completed|renewed|document_uploaded|reminder_sent
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cev_company ON compliance_events(company_id, created_at);

-- ── Board Meeting Manager (Phase 2b) ────────────────────────────────────────
-- Statutory meetings (board / AGM / EGM). A meeting may be linked to a
-- compliance item (item_id) so marking it "held" completes that obligation.
CREATE TABLE IF NOT EXISTS compliance_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  item_id INTEGER REFERENCES business_compliance_items(id),
  meeting_type TEXT NOT NULL DEFAULT 'board',  -- board | agm | egm
  title TEXT NOT NULL,
  scheduled_at TEXT,
  venue TEXT,
  status TEXT DEFAULT 'scheduled',             -- scheduled | held | cancelled
  quorum_met INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cmeet_company ON compliance_meetings(company_id, scheduled_at);

CREATE TABLE IF NOT EXISTS compliance_meeting_agenda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES compliance_meetings(id),
  sort_order INTEGER DEFAULT 0,
  item_text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cmagenda_meeting ON compliance_meeting_agenda(meeting_id);

CREATE TABLE IF NOT EXISTS compliance_meeting_attendees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES compliance_meetings(id),
  name TEXT NOT NULL,
  role TEXT,
  present INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_cmatt_meeting ON compliance_meeting_attendees(meeting_id);

CREATE TABLE IF NOT EXISTS compliance_meeting_resolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES compliance_meetings(id),
  sort_order INTEGER DEFAULT 0,
  resolution_text TEXT NOT NULL,
  resolution_type TEXT DEFAULT 'ordinary',     -- ordinary | special
  passed INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_cmres_meeting ON compliance_meeting_resolutions(meeting_id);

CREATE TABLE IF NOT EXISTS compliance_meeting_minutes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES compliance_meetings(id),
  content TEXT,
  ai_generated INTEGER DEFAULT 0,
  finalized_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- WORKFORCE & ORGANIZATION MANAGEMENT — Phase 1 (Teams & Employee Groups)
-- Extends the existing Employee module. Reporting hierarchy already lives on
-- employees.manager_id (with a circular-reporting guard in routes/employees.js)
-- and departments already exist — these tables add LATERAL grouping, not a new
-- employee/department/hierarchy model:
--   • teams            — structured units (often under a department) with a lead
--   • employee_groups  — dynamic ad-hoc collections; one employee joins many
-- All additive, company-scoped, soft-deletable. No existing table is recreated.
-- ============================================================================
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  department_id INTEGER REFERENCES departments(id),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  icon TEXT,
  lead_id INTEGER REFERENCES employees(id),
  status TEXT DEFAULT 'Active',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_teams_company ON teams(company_id);
CREATE INDEX IF NOT EXISTS idx_teams_department ON teams(department_id);

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  role_in_team TEXT DEFAULT 'Member',
  added_at TEXT DEFAULT (datetime('now')),
  UNIQUE (team_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_employee ON team_members(employee_id);

CREATE TABLE IF NOT EXISTS employee_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  avatar TEXT,
  group_type TEXT DEFAULT 'custom',
  status TEXT DEFAULT 'Active',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_emp_groups_company ON employee_groups(company_id);

CREATE TABLE IF NOT EXISTS employee_group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES employee_groups(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  added_at TEXT DEFAULT (datetime('now')),
  UNIQUE (group_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_egm_group ON employee_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_egm_employee ON employee_group_members(employee_id);
CREATE INDEX IF NOT EXISTS idx_cmmin_meeting ON compliance_meeting_minutes(meeting_id);

-- ============================================================================
-- WORKFORCE & ORGANIZATION MANAGEMENT — Phase 2 (Task Management engine)
-- Enterprise task assignment/tracking on top of the Employee module. A task can
-- be assigned to individuals, a team, a department, or a branch (task_assignments
-- carries the assignee_type). Comments (with @mentions), checklists, an activity
-- timeline, and file attachments (multer, mirroring employee documents) hang off
-- each task. All company-scoped, soft-deletable, additive.
-- ============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',            -- low | medium | high | urgent
  category TEXT,
  status TEXT DEFAULT 'todo',                -- todo | in_progress | review | blocked | completed | cancelled
  progress INTEGER DEFAULT 0,                -- 0..100
  labels TEXT,                              -- JSON array of strings
  assigned_by INTEGER REFERENCES users(id),
  department_id INTEGER REFERENCES departments(id),
  team_id INTEGER REFERENCES teams(id),
  start_date TEXT,
  due_date TEXT,
  estimated_minutes INTEGER,
  logged_minutes INTEGER DEFAULT 0,
  recurrence TEXT DEFAULT 'none',            -- none | daily | weekly | monthly
  recurrence_interval INTEGER DEFAULT 1,
  parent_task_id INTEGER REFERENCES tasks(id),
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(company_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(company_id, due_date);

CREATE TABLE IF NOT EXISTS task_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  assignee_type TEXT NOT NULL,              -- employee | team | department | branch
  assignee_id INTEGER NOT NULL,
  assigned_at TEXT DEFAULT (datetime('now')),
  UNIQUE (task_id, assignee_type, assignee_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assign_task ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assign_lookup ON task_assignments(assignee_type, assignee_id);

CREATE TABLE IF NOT EXISTS task_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  user_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  mentions TEXT,                            -- JSON array of employee ids
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  title TEXT NOT NULL,
  is_done INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  done_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(task_id);

CREATE TABLE IF NOT EXISTS task_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  actor_user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity(task_id);

CREATE TABLE IF NOT EXISTS task_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  file_name TEXT,
  original_name TEXT,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_attach_task ON task_attachments(task_id);

-- ============================================================================
-- IMPORT & EXPORT INTELLIGENCE — data-driven, mirrors the Compliance rule
-- engine (compliance_rules/compliance_rule_conditions/business_compliance_items)
-- but for international trade. Applicability is computed from the SAME
-- business_compliance_profile used by Compliance (extended above with
-- import_enabled/export_enabled/is_manufacturer/is_trader/is_service_provider/
-- iec_number) — trade does not duplicate onboarding. Trade alerts write into the
-- existing shared `notifications` table, not a module-specific one.
-- ============================================================================

-- Rule catalog. category: import | export | licensing | registration | certification.
CREATE TABLE IF NOT EXISTS trade_guidelines (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  code                TEXT UNIQUE NOT NULL,
  country             TEXT DEFAULT 'IN',
  category            TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  business_types      TEXT,        -- JSON array, informational (actual matching is via trade_rule_conditions)
  industries          TEXT,        -- JSON array, informational
  department          TEXT,
  authority_id        INTEGER REFERENCES trade_authorities(id),
  official_website     TEXT,
  official_forms       TEXT,        -- JSON array of {name, url}
  fees                 TEXT,
  processing_time      TEXT,
  renewal_requirement  TEXT,
  penalty_info         TEXT,
  faq_json             TEXT,        -- JSON array of {question, answer}
  ai_explanation        TEXT,
  frequency             TEXT DEFAULT 'one_time', -- one_time | annual | renewal
  renewal_interval_months INTEGER,
  mandatory             INTEGER DEFAULT 1,
  priority              TEXT DEFAULT 'medium',
  is_active             INTEGER DEFAULT 1,
  sort_order            INTEGER DEFAULT 0,
  created_at             TEXT DEFAULT (datetime('now')),
  updated_at             TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trade_guidelines_country ON trade_guidelines(country, category);

CREATE TABLE IF NOT EXISTS trade_rule_conditions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guideline_id INTEGER NOT NULL REFERENCES trade_guidelines(id),
  attribute    TEXT NOT NULL,       -- country|state|business_type|industry|entity_type|import_enabled|
                                     -- export_enabled|is_manufacturer|is_trader|is_service_provider|
                                     -- product_category|annual_turnover|employee_count|gst_registered|
                                     -- msme|fssai_required|drug_license|has_factory|iec_registered
  operator     TEXT NOT NULL,       -- is_true|is_false|eq|neq|in|gt|gte|lt|lte
  value        TEXT
);
CREATE INDEX IF NOT EXISTS idx_trade_conditions_guideline ON trade_rule_conditions(guideline_id);

-- Required-document definitions per guideline (rule-level, not a specific upload).
CREATE TABLE IF NOT EXISTS trade_documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guideline_id INTEGER NOT NULL REFERENCES trade_guidelines(id),
  doc_name     TEXT NOT NULL,
  is_required  INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_trade_docdefs_guideline ON trade_documents(guideline_id);

-- Government/regulatory bodies (DGFT, CBIC, BIS, CDSCO, FSSAI, Plant Quarantine...).
CREATE TABLE IF NOT EXISTS trade_authorities (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  short_name   TEXT,
  description  TEXT,
  website      TEXT,
  country      TEXT DEFAULT 'IN'
);

-- Destination-country reference data (requirements/restrictions/duties/standards).
CREATE TABLE IF NOT EXISTS trade_countries (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code        TEXT UNIQUE NOT NULL,
  country_name        TEXT NOT NULL,
  region               TEXT,
  requirements_json    TEXT,        -- JSON array of strings
  restricted_products_json TEXT,    -- JSON array of strings
  import_duties_notes  TEXT,
  standards_json        TEXT,        -- JSON array of strings
  shipping_notes         TEXT,
  official_links_json     TEXT,        -- JSON array of {label, url}
  is_active               INTEGER DEFAULT 1
);

-- Product/HS-code reference catalog for the "can I export/import this?" search.
CREATE TABLE IF NOT EXISTS trade_products (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  product_name           TEXT NOT NULL,
  category               TEXT,
  hs_code                TEXT,
  can_export             INTEGER DEFAULT 1,
  can_import             INTEGER DEFAULT 1,
  required_certifications_json TEXT, -- JSON array of strings
  restrictions           TEXT,
  approvals_required_json TEXT,      -- JSON array of strings
  notes                  TEXT
);
CREATE INDEX IF NOT EXISTS idx_trade_products_name ON trade_products(product_name);

-- Certification catalog (BIS, CDSCO approval, organic certification, etc.).
CREATE TABLE IF NOT EXISTS trade_certifications (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  authority_id        INTEGER REFERENCES trade_authorities(id),
  description         TEXT,
  validity_months     INTEGER
);

-- Materialized per-company applicable items (mirrors business_compliance_items).
CREATE TABLE IF NOT EXISTS trade_requirements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  guideline_id    INTEGER NOT NULL REFERENCES trade_guidelines(id),
  status          TEXT DEFAULT 'pending', -- pending|in_progress|completed|not_applicable|overdue
  next_due_date   TEXT,
  due_date        TEXT,
  completed_at    TEXT,
  notes           TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(company_id, guideline_id)
);
CREATE INDEX IF NOT EXISTS idx_trade_req_company ON trade_requirements(company_id);
CREATE INDEX IF NOT EXISTS idx_trade_req_due ON trade_requirements(next_due_date);

-- Per-requirement document upload/version tracking (mirrors compliance_item_documents).
CREATE TABLE IF NOT EXISTS trade_checklists (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  requirement_id  INTEGER NOT NULL REFERENCES trade_requirements(id),
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  doc_name        TEXT NOT NULL,
  original_name   TEXT,
  file_path       TEXT,
  mime_type       TEXT,
  file_size       INTEGER,
  status          TEXT DEFAULT 'missing', -- missing|uploaded|verified|expired
  verified        INTEGER DEFAULT 0,
  verification_notes TEXT,
  expiry_date     TEXT,
  version         INTEGER DEFAULT 1,
  is_current      INTEGER DEFAULT 1,
  uploaded_by     INTEGER REFERENCES users(id),
  uploaded_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trade_checklist_req ON trade_checklists(requirement_id);
CREATE INDEX IF NOT EXISTS idx_trade_checklist_company ON trade_checklists(company_id);

-- Periodic snapshot of computed readiness scores (live number is always computed
-- fresh; this table is history/trend only, same idea as cap_table_snapshots).
CREATE TABLE IF NOT EXISTS trade_readiness (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL REFERENCES companies(id),
  snapshot_date   TEXT DEFAULT (date('now')),
  import_score    INTEGER DEFAULT 0,
  export_score    INTEGER DEFAULT 0,
  overall_score   INTEGER DEFAULT 0,
  breakdown_json  TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trade_readiness_company ON trade_readiness(company_id);

-- Internal audit trail (mirrors compliance_events). User-facing alerts go into
-- the shared `notifications` table, not here.
CREATE TABLE IF NOT EXISTS trade_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id   INTEGER NOT NULL REFERENCES companies(id),
  requirement_id INTEGER REFERENCES trade_requirements(id),
  guideline_id  INTEGER REFERENCES trade_guidelines(id),
  event_type    TEXT NOT NULL,
  detail        TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trade_events_company ON trade_events(company_id);
