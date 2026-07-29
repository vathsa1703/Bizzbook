-- ============================================================================
-- BizBook Postgres DDL — Phase 1 of the SQLite -> Postgres migration.
--
-- Translated from backend/src/db/schema.sql + backend/src/db/schema_growth.sql,
-- reconciled against all 28 migrations in backend/src/config/db.js so this file
-- reflects the ACTUAL current shape of the live SQLite database (schema_versions
-- at 28), not just the base schema files. Columns that only exist because a
-- migration's addColumnIfNotExists() added them (never backfilled into the base
-- .sql files) are included inline below, each tagged "-- (added by migration N)".
--
-- NOT wired into the app. getDb()/db.js (SQLite) remains the only live path.
-- Nothing in backend/src/services or backend/src/routes reads this file yet.
--
-- STRUCTURE — three passes, in this order:
--   1. CREATE TABLE  — columns, types, PRIMARY KEY, UNIQUE, CHECK. No inline
--      REFERENCES/FOREIGN KEY here.
--   2. CREATE INDEX  — every index from the source files, translated 1:1.
--   3. ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY — every REFERENCES
--      relationship from the source files, added after all tables exist.
--
-- WHY split out FKs like this: SQLite never validates that a REFERENCES target
-- table exists at CREATE TABLE time (not even when foreign_keys=ON, which this
-- app never enables anyway — see Phase 1 report). So schema.sql freely declares
-- forward references (e.g. `products` REFERENCES `suppliers`, defined 17 lines
-- later; `sales` REFERENCES `customers`, defined 25 lines later) and one genuine
-- circular pair (`companies.owner_user_id` <-> `users.company_id`). Postgres
-- rejects an inline REFERENCES to a table that doesn't exist yet. Rather than
-- hand-sorting 130 tables into dependency order, every table is created first
-- with no FK constraints, then every FK is added via ALTER TABLE once the full
-- set of tables exists — this is correct regardless of source-file order or
-- circularity, and keeps each table's CREATE TABLE block a direct visual match
-- against the corresponding block in schema.sql / schema_growth.sql.
--
-- IDENTITY vs SERIAL: every `id INTEGER PRIMARY KEY AUTOINCREMENT` becomes
-- `id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY`. GENERATED ALWAYS (not
-- BY DEFAULT) was chosen over SERIAL because: (a) it's the SQL-standard form
-- Postgres has recommended over SERIAL since PG10 — SERIAL creates an
-- untracked, separately-owned sequence with looser dependency semantics; (b)
-- ALWAYS blocks silent manual-id inserts from drifting the sequence out of
-- sync with AUTOINCREMENT's implicit-only semantics in SQLite — the closest
-- behavioral match. A future real data import that needs to preserve specific
-- legacy SQLite ids can still do so explicitly via
-- `INSERT ... OVERRIDING SYSTEM VALUE`; ALWAYS only blocks *silent* drift, not
-- explicit intent. INTEGER (32-bit) was kept over BIGINT — the largest table
-- (sales) has 1,205 seeded rows, nowhere near the ~2.1B ceiling, and every
-- REFERENCES column downstream is already declared INTEGER to match.
-- ============================================================================


-- ============================================================================
-- PART 1: TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'Retail',
  subscription TEXT NOT NULL DEFAULT 'Basic',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- (added by migration 15 — Company Registration & Profile Module)
  company_code TEXT,
  legal_business_name TEXT,
  trade_name TEXT,
  business_category TEXT,
  nic_code TEXT,
  date_of_incorporation DATE,
  registration_type TEXT DEFAULT 'regular',
  pan TEXT,
  gstin TEXT,
  phone TEXT,
  website TEXT,
  owner_user_id INTEGER,  -- FK to users(id) added in Part 3; circular with users.company_id, see note there
  industry TEXT,
  business_size_bracket TEXT,
  turnover_bracket TEXT,
  setup_completed BOOLEAN DEFAULT false,  -- was INTEGER 0/1 (added by migration 15)
  -- (added by migration 19)
  email TEXT
);

CREATE TABLE IF NOT EXISTS product_groups (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- kept for backward compatibility; group_id is the real FK
  group_id INTEGER,
  company_id INTEGER,
  cost_price DOUBLE PRECISION NOT NULL,
  selling_price DOUBLE PRECISION NOT NULL,
  hsn_code TEXT,
  use_custom_gst BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  gst_rate DOUBLE PRECISION,
  uqc TEXT,
  cess_rate DOUBLE PRECISION DEFAULT 0,
  supplier_id INTEGER
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at DATE DEFAULT CURRENT_DATE, -- source used date('now'), not datetime('now') — genuinely date-only, unlike most created_at columns
  -- (added by migration 1)
  state TEXT
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  head_id INTEGER,  -- FK to employees(id); circular with employees.department_id, see note in Part 3
  status TEXT DEFAULT 'Active',
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  -- (added by migration 16)
  branch_id INTEGER
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  department TEXT NOT NULL, -- legacy free-text column, kept for backward compatibility; department_id is the real FK
  salary DOUBLE PRECISION NOT NULL,
  revenue_generated DOUBLE PRECISION DEFAULT 0,
  joining_date DATE NOT NULL,
  performance_rating DOUBLE PRECISION DEFAULT 3.0,
  attendance DOUBLE PRECISION DEFAULT 95,
  status TEXT DEFAULT 'Active',
  user_id INTEGER,
  employee_code TEXT,
  avatar TEXT,
  phone TEXT,
  email TEXT,
  emergency_contact TEXT,
  job_title TEXT,
  manager_id INTEGER,  -- self-referencing FK, added in Part 3
  department_id INTEGER,  -- circular with departments.head_id, see note in Part 3
  employment_type TEXT DEFAULT 'Full Time',
  skills TEXT,
  date_of_birth DATE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- (added by migration 16)
  branch_id INTEGER,
  gender TEXT,
  blood_group TEXT,
  personal_email TEXT,
  permanent_address TEXT,
  current_address TEXT,
  pan TEXT,
  aadhaar TEXT,
  -- Employee profile Phase: qualification/education + structured emergency contact
  qualification TEXT,
  emergency_contact_name TEXT,
  emergency_contact_relation TEXT,
  emergency_contact_phone TEXT
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  product_id INTEGER NOT NULL,
  customer_id INTEGER,
  employee_id INTEGER,
  quantity INTEGER NOT NULL,
  revenue DOUBLE PRECISION NOT NULL,
  sale_date DATE NOT NULL,
  payment_status TEXT DEFAULT 'paid', -- 'paid' | 'unpaid'
  invoice_number TEXT,
  invoice_id INTEGER,
  -- (added by migration 1)
  taxable_value DOUBLE PRECISION,
  cgst DOUBLE PRECISION,
  sgst DOUBLE PRECISION,
  igst DOUBLE PRECISION,
  gst_amount DOUBLE PRECISION,
  -- (added by migration 17)
  branch_id INTEGER,
  warehouse_id INTEGER
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  product_id INTEGER NOT NULL,
  stock_quantity INTEGER NOT NULL,
  reorder_level INTEGER NOT NULL,
  last_restocked DATE,
  -- (added by migration 17)
  branch_id INTEGER,
  warehouse_id INTEGER
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  total_purchases DOUBLE PRECISION DEFAULT 0,
  last_purchase_date DATE,
  gstin TEXT,
  billing_address TEXT,
  -- (added by migration 1)
  state TEXT,
  -- (added by migration 2)
  email TEXT,
  phone TEXT,
  -- (added by migration 5)
  state_code TEXT,
  -- (added by migration 9)
  is_gst_registered BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  -- (added by migration 17)
  branch_id INTEGER
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  invoice_number TEXT UNIQUE NOT NULL, -- pre-existing issue, not fixed here: this should be UNIQUE(company_id, invoice_number), not global UNIQUE — see backend memory note "invoice_number schema fix deferred"; preserved as-is per Phase 1 scope (translate, don't redesign)
  customer_id INTEGER,
  subtotal DOUBLE PRECISION DEFAULT 0,
  taxable_value DOUBLE PRECISION DEFAULT 0,
  cgst DOUBLE PRECISION DEFAULT 0,
  sgst DOUBLE PRECISION DEFAULT 0,
  igst DOUBLE PRECISION DEFAULT 0,
  grand_total DOUBLE PRECISION NOT NULL,
  amount DOUBLE PRECISION NOT NULL, -- legacy compat
  invoice_date DATE NOT NULL,
  status TEXT DEFAULT 'paid', -- 'paid' | 'pending' | 'overdue'
  payment_status TEXT DEFAULT 'PAID',
  pdf_path TEXT,
  snapshot TEXT,
  -- (added by migration 5)
  place_of_supply TEXT,
  reverse_charge TEXT DEFAULT 'N', -- 'Y'/'N' text flag, NOT an integer 0/1 — left as TEXT, not converted to boolean (different affinity pattern than the INTEGER 0/1 columns; would need value-mapping, not a straight type swap)
  invoice_type TEXT DEFAULT 'Regular',
  ecommerce_gstin TEXT
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  invoice_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  rate DOUBLE PRECISION NOT NULL,
  taxable_value DOUBLE PRECISION NOT NULL,
  cgst DOUBLE PRECISION DEFAULT 0,
  sgst DOUBLE PRECISION DEFAULT 0,
  igst DOUBLE PRECISION DEFAULT 0,
  total DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS credits (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  customer_id INTEGER NOT NULL,
  sale_id INTEGER,
  total_amount DOUBLE PRECISION NOT NULL,
  paid_amount DOUBLE PRECISION DEFAULT 0,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending' | 'paid' | 'overdue'
  notes TEXT,
  created_at DATE DEFAULT CURRENT_DATE -- source used date('now'), genuinely date-only like suppliers.created_at
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  product_id INTEGER NOT NULL,
  supplier_id INTEGER,
  quantity INTEGER NOT NULL,
  cost_price DOUBLE PRECISION NOT NULL,
  gst_amount DOUBLE PRECISION NOT NULL,
  purchase_date DATE NOT NULL,
  invoice_number TEXT,
  -- (added by migration 1)
  taxable_value DOUBLE PRECISION,
  cgst DOUBLE PRECISION,
  sgst DOUBLE PRECISION,
  igst DOUBLE PRECISION,
  itc_amount DOUBLE PRECISION,
  itc_eligible BOOLEAN DEFAULT false  -- was INTEGER 0/1
);

-- DEPRECATED: kept for safety, no longer written to by any new code (see comment
-- in schema.sql). All fields migrated into satellite tables by Migration 15.
CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  gstin TEXT,
  state TEXT,
  default_hsn_prefix TEXT,
  company_name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo TEXT,
  -- (added by migration 5)
  legal_name TEXT,
  trade_name TEXT,
  pan TEXT,
  state_code TEXT,
  pincode TEXT,
  -- (added by migration 9)
  is_gst_registered BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  -- (added by migration 12)
  inclusive_pricing BOOLEAN DEFAULT true  -- was INTEGER 0/1
);

CREATE TABLE IF NOT EXISTS company_addresses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  address_type TEXT NOT NULL CHECK(address_type IN ('registered','branch','billing','shipping','warehouse')),
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  district TEXT,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'India',
  pincode TEXT NOT NULL,
  gstin TEXT, -- branch-level GSTIN for multi-state operations
  is_primary BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_licenses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  license_type TEXT NOT NULL CHECK(license_type IN (
    'GSTIN','PAN','CIN','LLPIN','UDYAM','TAN','IEC',
    'FSSAI','DRUG_LICENSE','TRADE_LICENSE','SHOP_ESTABLISHMENT',
    'PROFESSIONAL_TAX','EPFO','ESIC'
  )),
  license_number TEXT,
  issuing_authority TEXT,
  issue_date DATE,
  expiry_date DATE,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','expired','pending_renewal')),
  document_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_bank_accounts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  bank_name TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  ifsc TEXT NOT NULL,
  branch_name TEXT,
  upi_id TEXT,
  qr_code_url TEXT,
  is_primary BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  show_on_invoice BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_gst_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL UNIQUE,
  registration_type TEXT DEFAULT 'regular' CHECK(registration_type IN ('regular','composition','unregistered','casual')),
  place_of_supply TEXT,
  state_code TEXT,
  default_gst_rate DOUBLE PRECISION DEFAULT 18,
  reverse_charge_applicable BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  hsn_sac_mandatory BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  composition_scheme_rate DOUBLE PRECISION,
  is_gst_registered BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  inclusive_pricing BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- (added by migration 19)
  default_hsn_prefix TEXT
);

CREATE TABLE IF NOT EXISTS company_financial_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL UNIQUE,
  currency TEXT DEFAULT 'INR',
  financial_year_start_month INTEGER DEFAULT 4,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  accounting_method TEXT DEFAULT 'cash' CHECK(accounting_method IN ('cash','accrual')),
  invoice_prefix TEXT DEFAULT 'INV',
  purchase_prefix TEXT DEFAULT 'PO',
  credit_note_prefix TEXT DEFAULT 'CN',
  decimal_precision INTEGER DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_branding (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL UNIQUE,
  logo_url TEXT,
  signature_url TEXT,
  stamp_url TEXT,
  invoice_footer TEXT,
  brand_color TEXT DEFAULT '#2563EB',
  theme TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_subscriptions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL UNIQUE,
  plan_id TEXT DEFAULT 'free',
  status TEXT DEFAULT 'trialing' CHECK(status IN ('active','trialing','past_due','cancelled','paused')),
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  billing_cycle TEXT DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly','annual')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_security_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL UNIQUE,
  two_factor_enabled BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  password_policy TEXT DEFAULT '{}', -- JSON stored as TEXT — candidate for JSONB in a later phase, not converted here (see Phase 1 report)
  session_timeout_minutes INTEGER DEFAULT 60,
  login_restrictions TEXT DEFAULT '{}', -- JSON stored as TEXT — same JSONB note as above
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS license_category_map (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_category TEXT NOT NULL,
  license_type TEXT NOT NULL,
  is_mandatory BOOLEAN DEFAULT false,  -- was INTEGER 1=mandatory/0=recommended
  description TEXT,
  UNIQUE(business_category, license_type)
);

CREATE TABLE IF NOT EXISTS license_expiry_alerts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  license_id INTEGER NOT NULL,
  license_type TEXT NOT NULL,
  license_number TEXT,
  expiry_date DATE NOT NULL,
  days_until_expiry INTEGER NOT NULL,
  is_dismissed BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, license_id)
);

CREATE TABLE IF NOT EXISTS company_setup_progress (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  step_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','skipped')),
  completed_at TIMESTAMPTZ,
  UNIQUE(company_id, step_number)
);

CREATE TABLE IF NOT EXISTS ai_insights_cache (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  cache_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL, -- JSON stored as TEXT — JSONB candidate, not converted here
  confidence DOUBLE PRECISION,
  generated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_id INTEGER -- NOTE: 1 orphaned row in the live seeded DB (user_id with no matching users.id) — see Phase 1 report; will fail FK insert if this data is ever loaded into Postgres as-is
);

CREATE TABLE IF NOT EXISTS ai_chat_history (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  user_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_dismissed_insights (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  user_id INTEGER NOT NULL,
  insight_type TEXT NOT NULL,
  entity_id INTEGER,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  resurface_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS schema_versions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE,
  description TEXT NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gst_hsn_master (
  hsn_code TEXT PRIMARY KEY,
  description TEXT,
  gst_rate DOUBLE PRECISION DEFAULT 0,
  uqc TEXT DEFAULT 'NOS',
  cess_rate DOUBLE PRECISION DEFAULT 0,
  is_active BOOLEAN DEFAULT true  -- was INTEGER 0/1
);

CREATE TABLE IF NOT EXISTS gst_uqc_master (
  code TEXT PRIMARY KEY,
  description TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,  -- circular with companies.owner_user_id, see note in Part 3
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'OWNER',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT now(),
  -- (added by migration 16)
  last_login TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  opportunity_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  segment TEXT,
  objective TEXT,
  status TEXT DEFAULT 'draft',
  target_count INTEGER DEFAULT 0,
  customers_targeted INTEGER DEFAULT 0,
  customers_converted INTEGER DEFAULT 0,
  expected_impact DOUBLE PRECISION DEFAULT 0,
  actual_revenue DOUBLE PRECISION DEFAULT 0,
  campaign_cost DOUBLE PRECISION,
  conversion_rate DOUBLE PRECISION DEFAULT 0,
  roi DOUBLE PRECISION,
  notes TEXT,
  ai_content TEXT,
  campaign_snapshot TEXT,
  launched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- (added by migration 17)
  branch_id INTEGER
);

CREATE TABLE IF NOT EXISTS marketing_campaign_targets (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  campaign_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  code TEXT,
  location TEXT,
  address TEXT,
  phone TEXT,
  gstin TEXT,
  is_hq BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permission_groups (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id INTEGER,
  action TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN DEFAULT false  -- was INTEGER 0/1
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER,
  permission_id INTEGER,
  PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER,
  role_id INTEGER,
  company_id INTEGER,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by INTEGER,
  PRIMARY KEY(user_id, role_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  branch_id INTEGER,
  department_id INTEGER,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role_id INTEGER,
  status TEXT DEFAULT 'pending', -- pending|accepted|expired|revoked
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  invited_by INTEGER
);

CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  code TEXT,
  max_days_per_year DOUBLE PRECISION,
  carry_forward DOUBLE PRECISION DEFAULT 0, -- number of days carried forward, not a boolean flag (declared REAL, not INTEGER, in source)
  requires_approval BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  is_paid BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id INTEGER,
  leave_type_id INTEGER,
  company_id INTEGER,
  year INTEGER,
  total_days DOUBLE PRECISION DEFAULT 0,
  used_days DOUBLE PRECISION DEFAULT 0,
  remaining_days DOUBLE PRECISION DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id INTEGER,
  company_id INTEGER,
  leave_type_id INTEGER,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days DOUBLE PRECISION NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending', -- pending|approved|rejected|cancelled
  approved_by INTEGER,
  rejected_by INTEGER,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  ai_risk_score DOUBLE PRECISION,
  ai_risk_level TEXT,
  ai_risk_reason TEXT,
  ai_suggested_replacement_id INTEGER,
  ai_recommendation TEXT
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id INTEGER,
  company_id INTEGER,
  branch_id INTEGER,
  date DATE NOT NULL,
  clock_in TEXT, -- left as TEXT: source has no datetime()/date() default and app-level format (full timestamp vs "HH:MM") not confirmed from schema alone — don't guess-type this, confirm in services/ before Phase 2
  clock_out TEXT, -- same as clock_in
  break_start TEXT, -- same as clock_in
  break_end TEXT, -- same as clock_in
  total_hours DOUBLE PRECISION,
  break_hours DOUBLE PRECISION,
  overtime_hours DOUBLE PRECISION,
  status TEXT, -- present|absent|half_day|late|on_leave|holiday|remote|wfh|on_site
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS salary_components (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT, -- earning|deduction
  is_fixed BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  is_mandatory BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_salaries (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id INTEGER,
  company_id INTEGER,
  effective_from DATE,
  basic DOUBLE PRECISION DEFAULT 0,
  hra DOUBLE PRECISION DEFAULT 0,
  da DOUBLE PRECISION DEFAULT 0,
  medical DOUBLE PRECISION DEFAULT 0,
  travel DOUBLE PRECISION DEFAULT 0,
  bonus DOUBLE PRECISION DEFAULT 0,
  overtime DOUBLE PRECISION DEFAULT 0,
  incentives DOUBLE PRECISION DEFAULT 0,
  pf_employee DOUBLE PRECISION DEFAULT 0,
  pf_employer DOUBLE PRECISION DEFAULT 0,
  esi_employee DOUBLE PRECISION DEFAULT 0,
  esi_employer DOUBLE PRECISION DEFAULT 0,
  professional_tax DOUBLE PRECISION DEFAULT 0,
  tds DOUBLE PRECISION DEFAULT 0,
  other_deductions DOUBLE PRECISION DEFAULT 0,
  gross_salary DOUBLE PRECISION DEFAULT 0,
  net_salary DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  branch_id INTEGER,
  month INTEGER,
  year INTEGER,
  status TEXT DEFAULT 'draft', -- draft|processed|approved|paid
  total_employees INTEGER DEFAULT 0,
  total_gross DOUBLE PRECISION DEFAULT 0,
  total_deductions DOUBLE PRECISION DEFAULT 0,
  total_net DOUBLE PRECISION DEFAULT 0,
  processed_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_slips (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payroll_run_id INTEGER,
  employee_id INTEGER,
  company_id INTEGER,
  month INTEGER,
  year INTEGER,
  basic DOUBLE PRECISION DEFAULT 0,
  hra DOUBLE PRECISION DEFAULT 0,
  da DOUBLE PRECISION DEFAULT 0,
  medical DOUBLE PRECISION DEFAULT 0,
  travel DOUBLE PRECISION DEFAULT 0,
  bonus DOUBLE PRECISION DEFAULT 0,
  overtime DOUBLE PRECISION DEFAULT 0,
  incentives DOUBLE PRECISION DEFAULT 0,
  gross_salary DOUBLE PRECISION DEFAULT 0,
  pf_employee DOUBLE PRECISION DEFAULT 0,
  esi_employee DOUBLE PRECISION DEFAULT 0,
  professional_tax DOUBLE PRECISION DEFAULT 0,
  tds DOUBLE PRECISION DEFAULT 0,
  other_deductions DOUBLE PRECISION DEFAULT 0,
  net_salary DOUBLE PRECISION DEFAULT 0,
  working_days DOUBLE PRECISION,
  present_days DOUBLE PRECISION,
  lop_days DOUBLE PRECISION,
  status TEXT DEFAULT 'draft',
  pdf_path TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id INTEGER,
  company_id INTEGER,
  doc_type TEXT, -- PAN, Aadhaar, Resume, etc.
  doc_name TEXT,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by INTEGER,
  verified BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  verified_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  branch_id INTEGER,
  user_id INTEGER,
  action TEXT NOT NULL,
  module TEXT,
  target_type TEXT,
  target_id INTEGER,
  target_label TEXT,
  before_json TEXT, -- JSON stored as TEXT — JSONB candidate, not converted here
  after_json TEXT, -- JSON stored as TEXT — JSONB candidate, not converted here
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER,
  company_id INTEGER,
  token_hash TEXT NOT NULL,
  browser TEXT,
  os TEXT,
  ip_address TEXT,
  country TEXT,
  city TEXT,
  device_name TEXT,
  is_active BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  last_activity TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  user_id INTEGER,
  type TEXT,
  title TEXT,
  body TEXT,
  related_type TEXT,
  related_id INTEGER,
  is_read BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hr_settings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  work_week_start TEXT DEFAULT 'Monday',
  work_hours_per_day DOUBLE PRECISION DEFAULT 8,
  overtime_threshold_hours DOUBLE PRECISION DEFAULT 8,
  leave_approval_flow TEXT DEFAULT 'manager_then_hr',
  attendance_method TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- PHASE 0: MARKETING SIGNAL ENGINE (Knowledge Graph Foundation)

CREATE TABLE IF NOT EXISTS marketing_signals (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  engine_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  signal_name TEXT NOT NULL,
  signal_value DOUBLE PRECISION,
  confidence_score DOUBLE PRECISION,
  urgency_score DOUBLE PRECISION,
  metadata TEXT, -- JSON stored as TEXT — JSONB candidate, not converted here
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  node_a_type TEXT NOT NULL,
  node_a_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  node_b_type TEXT NOT NULL,
  node_b_id TEXT,
  weight DOUBLE PRECISION DEFAULT 1.0,
  metadata TEXT, -- JSON stored as TEXT — JSONB candidate, not converted here
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PHASE 1: CORE MARKETING FOUNDATION

CREATE TABLE IF NOT EXISTS customer_wallets (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  customer_id INTEGER,
  balance_type TEXT DEFAULT 'store_credit', -- 'store_credit', 'cashback', 'reward_points'
  balance DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, balance_type)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  wallet_id INTEGER,
  amount DOUBLE PRECISION NOT NULL, -- Positive for earn, Negative for burn
  transaction_type TEXT, -- 'earn', 'burn', 'refund', 'adjustment'
  reference_id TEXT, -- e.g., 'invoice_123', 'campaign_45'
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_segments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  segment_type TEXT, -- 'rfm', 'rule_based', 'ai_generated'
  logic_type TEXT DEFAULT 'AND',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS segment_rules (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  segment_id INTEGER,
  rule_type TEXT, -- 'recency', 'frequency', 'monetary', 'product_category'
  operator TEXT, -- '>', '<', '=', 'IN'
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  campaign_id INTEGER,
  code TEXT NOT NULL,
  discount_type TEXT, -- 'percentage', 'flat', 'bogo'
  discount_value DOUBLE PRECISION NOT NULL,
  min_order_value DOUBLE PRECISION DEFAULT 0,
  max_discount DOUBLE PRECISION,
  target_segment_id INTEGER,
  usage_limit INTEGER,
  times_used INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  coupon_id INTEGER,
  customer_id INTEGER,
  invoice_id INTEGER,
  discount_applied DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_codes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  customer_id INTEGER,
  campaign_id INTEGER,
  code TEXT NOT NULL UNIQUE,
  reward_referrer DOUBLE PRECISION, -- e.g., 50 cashback
  reward_referee DOUBLE PRECISION,  -- e.g., 50 cashback
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_uses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  referral_id INTEGER,
  new_customer_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_surveys (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  campaign_id INTEGER,
  invoice_id INTEGER,
  type TEXT, -- 'post_purchase', 'nps'
  question_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  survey_id INTEGER,
  customer_id INTEGER,
  rating INTEGER, -- 1 to 5
  feedback_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communication_campaigns (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  channel TEXT NOT NULL, -- 'whatsapp', 'sms', 'email'
  status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'processing', 'completed', 'cancelled'
  audience_type TEXT, -- 'segment', 'manual', 'all'
  segment_id INTEGER,
  template_id INTEGER, -- soft reference, no REFERENCES in source (no FK added here either, see Phase 1 report)
  schedule_time TEXT, -- left as TEXT: no datetime()/date() default in source, format not confirmed — don't guess-type
  total_recipients INTEGER DEFAULT 0,
  successful_deliveries INTEGER DEFAULT 0,
  failed_deliveries INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communication_templates (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  channel TEXT NOT NULL, -- 'whatsapp', 'sms', 'email'
  category TEXT DEFAULT 'marketing', -- 'marketing', 'utility'
  content TEXT NOT NULL, -- JSON or raw text
  variables TEXT, -- JSON array of variable names, stored as TEXT — JSONB candidate, not converted here
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communication_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  customer_id INTEGER,
  campaign_id INTEGER,
  marketing_campaign_id INTEGER,
  automation_id INTEGER,
  template_id INTEGER,
  segment_id INTEGER,
  channel TEXT, -- 'whatsapp', 'sms', 'email', 'push'
  provider TEXT, -- 'mock', 'twilio', 'sendgrid', etc.
  direction TEXT DEFAULT 'outbound',
  status TEXT, -- 'queued', 'processing', 'sent', 'delivered', 'read', 'failed', 'cancelled'
  message_payload TEXT, -- JSON stored as TEXT — JSONB candidate, not converted here
  job_id INTEGER,
  provider_message_id TEXT,
  error_details TEXT,
  cost DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

-- PHASE 2: SPEND INTELLIGENCE

CREATE TABLE IF NOT EXISTS store_health_history (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  score_date DATE NOT NULL,
  overall_score INTEGER,
  grade TEXT,
  spend_efficiency_score INTEGER,
  retention_trend_score INTEGER,
  engagement_score INTEGER,
  review_sentiment_score INTEGER,
  top_strength TEXT,
  biggest_weakness TEXT,
  metadata TEXT, -- JSON stored as TEXT — JSONB candidate, not converted here
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, score_date)
);

CREATE TABLE IF NOT EXISTS channel_costs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  channel TEXT NOT NULL,
  cost_per_message DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, channel)
);

CREATE TABLE IF NOT EXISTS channel_roi_history (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  channel TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  total_spend DOUBLE PRECISION,
  total_revenue DOUBLE PRECISION,
  roi DOUBLE PRECISION,
  messages_sent INTEGER,
  conversion_rate DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, channel, snapshot_date)
);

-- PHASE 3: AUTOMATION, EVENTS & MULTI-STORE

CREATE TABLE IF NOT EXISTS system_events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  correlation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_id INTEGER,
  payload TEXT, -- JSON stored as TEXT — JSONB candidate, not converted here
  status TEXT DEFAULT 'pending',
  error_log TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS background_jobs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  correlation_id TEXT,
  idempotency_key TEXT UNIQUE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON stored as TEXT — JSONB candidate, not converted here
  priority INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  run_at TIMESTAMPTZ DEFAULT now(),
  locked_at TIMESTAMPTZ,
  error_log TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_automations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  conditions TEXT, -- JSON stored as TEXT — JSONB candidate, not converted here
  delay_minutes INTEGER DEFAULT 0,
  action_type TEXT NOT NULL,
  action_payload TEXT, -- JSON stored as TEXT — JSONB candidate, not converted here
  is_active BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_execution_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  automation_id INTEGER,
  correlation_id TEXT NOT NULL,
  customer_id INTEGER,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  message TEXT,
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  branch_id INTEGER,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_branches (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER,
  company_id INTEGER,
  branch_id INTEGER,
  is_default BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

-- SPRINT 11: INTELLIGENT CAMPAIGN ASSISTANT (MARKETING COPILOT)

CREATE TABLE IF NOT EXISTS marketing_ai_recommendations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  type TEXT NOT NULL, -- e.g., 'campaign', 'insight', 'opportunity'
  title TEXT NOT NULL,
  reasoning TEXT,
  expected_impact DOUBLE PRECISION,
  confidence_score INTEGER,
  status TEXT DEFAULT 'pending', -- pending, accepted, rejected, launched
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_predictions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  predicted_roi DOUBLE PRECISION,
  predicted_revenue DOUBLE PRECISION,
  risk_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_forecasts (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  forecast_date DATE,
  expected_revenue DOUBLE PRECISION,
  seasonality_factor DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_experiments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  campaign_id INTEGER, -- soft reference, no REFERENCES in source
  name TEXT,
  variant_a_id INTEGER, -- soft reference, no REFERENCES in source
  variant_b_id INTEGER, -- soft reference, no REFERENCES in source
  winner_id INTEGER, -- soft reference, no REFERENCES in source
  status TEXT DEFAULT 'running',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_predictions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id INTEGER, -- soft reference, no REFERENCES in source
  predicted_reach INTEGER,
  predicted_conversion_rate DOUBLE PRECISION,
  confidence INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS generated_campaigns (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  recommendation_id INTEGER,
  name TEXT,
  description TEXT,
  target_audience TEXT,
  offer_details TEXT,
  budget DOUBLE PRECISION,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_calendar (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  event_date DATE,
  title TEXT,
  type TEXT, -- e.g., 'festival', 'deadline', 'business_anniversary'
  ai_suggested_campaign INTEGER, -- soft reference, no REFERENCES in source
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_templates (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  name TEXT,
  channel TEXT, -- whatsapp, sms, email
  tone TEXT,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_ai_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER,
  action TEXT,
  tokens_used INTEGER,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- COMPLIANCE INTELLIGENCE PLATFORM (Phase 1 — data-driven rule engine)
-- Reference tables (categories/rules/conditions/rule_documents) are GLOBAL and
-- admin-managed. business_* tables are COMPANY-SCOPED.

CREATE TABLE IF NOT EXISTS compliance_categories (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key TEXT UNIQUE NOT NULL, -- tax | licenses | filings | meetings | employee | operational | renewals | documents
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS compliance_rules (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- stable business key, e.g. 'IN_GSTR3B'
  country TEXT NOT NULL DEFAULT 'IN',
  state TEXT, -- NULL = applies to every state in the country
  title TEXT NOT NULL,
  description TEXT,
  category_key TEXT NOT NULL, -- soft FK -> compliance_categories.key, no REFERENCES in source
  department TEXT,
  portal_url TEXT,
  reference_url TEXT,
  mandatory BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  frequency TEXT NOT NULL, -- monthly | quarterly | half_yearly | annual | one_time | renewal
  renewal_interval_months INTEGER,
  due_day INTEGER, -- day-of-month anchor (e.g. 20 for GSTR-3B)
  due_month INTEGER, -- month-of-year anchor for annual items (e.g. 7 = July for ITR)
  grace_period_days INTEGER DEFAULT 0,
  penalty_info TEXT,
  priority TEXT DEFAULT 'medium', -- low | medium | high | critical
  ai_explanation TEXT,
  processing_fee TEXT, -- e.g. '₹0 (online)' / 'State-specific'
  typical_timeline TEXT, -- e.g. '7–15 working days'
  forms_json TEXT, -- JSON array of {name,url}, stored as TEXT — JSONB candidate, not converted here
  guide_url TEXT, -- official how-to guide
  is_active BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_rule_conditions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_id INTEGER NOT NULL,
  attribute TEXT NOT NULL, -- entity_type|industry|gst_registered|annual_turnover|employee_count|import_export|fssai_required|drug_license|has_factory|multiple_branches|msme|startup_registered
  operator TEXT NOT NULL, -- eq|neq|gt|gte|lt|lte|in|is_true|is_false
  value TEXT -- comparison value; CSV for 'in'
);

CREATE TABLE IF NOT EXISTS compliance_rule_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_id INTEGER NOT NULL,
  doc_name TEXT NOT NULL,
  is_required BOOLEAN DEFAULT true  -- was INTEGER 0/1
);

CREATE TABLE IF NOT EXISTS business_compliance_profile (
  company_id INTEGER PRIMARY KEY,
  country TEXT DEFAULT 'IN',
  state TEXT,
  entity_type TEXT, -- Sole Proprietorship|Partnership|LLP|Private Limited|OPC|Public Limited|NGO/Trust|Cooperative
  industry TEXT, -- Retail|Restaurant|Manufacturing|Pharmacy|Healthcare|IT Services|Ecommerce|...
  gst_registered BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  annual_turnover DOUBLE PRECISION DEFAULT 0,
  employee_count INTEGER DEFAULT 0,
  import_export BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  fssai_required BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  drug_license BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  has_factory BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  multiple_branches BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  msme BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  startup_registered BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  import_enabled BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  export_enabled BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  is_manufacturer BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  is_trader BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  is_service_provider BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  iec_number TEXT,
  extra_json TEXT, -- JSON stored as TEXT — JSONB candidate, not converted here
  computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_compliance_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  rule_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', -- pending|in_progress|completed|overdue|not_applicable
  due_date DATE,
  next_due_date DATE,
  completed_at TIMESTAMPTZ,
  last_renewed_at TIMESTAMPTZ,
  issue_date DATE,
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, rule_id)
);

CREATE TABLE IF NOT EXISTS compliance_item_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  doc_name TEXT NOT NULL, -- the required-document slot this satisfies
  document_type TEXT, -- free-form classification
  file_path TEXT,
  original_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  uploaded_by INTEGER,
  status TEXT DEFAULT 'uploaded', -- uploaded|expired|missing
  expiry_date DATE,
  verified BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  verification_notes TEXT,
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  item_id INTEGER,
  rule_id INTEGER,
  event_type TEXT NOT NULL, -- recomputed|status_changed|completed|renewed|document_uploaded|reminder_sent
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_meetings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  item_id INTEGER,
  meeting_type TEXT NOT NULL DEFAULT 'board', -- board | agm | egm
  title TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  venue TEXT,
  status TEXT DEFAULT 'scheduled', -- scheduled | held | cancelled
  quorum_met BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_meeting_agenda (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meeting_id INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0,
  item_text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compliance_meeting_attendees (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meeting_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  present BOOLEAN DEFAULT true  -- was INTEGER 0/1
);

CREATE TABLE IF NOT EXISTS compliance_meeting_resolutions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meeting_id INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0,
  resolution_text TEXT NOT NULL,
  resolution_type TEXT DEFAULT 'ordinary', -- ordinary | special
  passed BOOLEAN DEFAULT true  -- was INTEGER 0/1
);

CREATE TABLE IF NOT EXISTS compliance_meeting_minutes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meeting_id INTEGER NOT NULL,
  content TEXT,
  ai_generated BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WORKFORCE & ORGANIZATION MANAGEMENT — Phase 1 (Teams & Employee Groups)

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  branch_id INTEGER,
  department_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  icon TEXT,
  lead_id INTEGER,
  status TEXT DEFAULT 'Active',
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  role_in_team TEXT DEFAULT 'Member',
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (team_id, employee_id)
);

CREATE TABLE IF NOT EXISTS employee_groups (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  branch_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  avatar TEXT,
  group_type TEXT DEFAULT 'custom',
  status TEXT DEFAULT 'Active',
  created_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS employee_group_members (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (group_id, employee_id)
);

-- WORKFORCE & ORGANIZATION MANAGEMENT — Phase 2 (Task Management engine)

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  branch_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium', -- low | medium | high | urgent
  category TEXT,
  status TEXT DEFAULT 'todo', -- todo | in_progress | review | blocked | completed | cancelled
  progress INTEGER DEFAULT 0, -- 0..100
  labels TEXT, -- JSON array of strings, stored as TEXT — JSONB candidate, not converted here
  assigned_by INTEGER,
  department_id INTEGER,
  team_id INTEGER,
  start_date DATE,
  due_date DATE,
  estimated_minutes INTEGER,
  logged_minutes INTEGER DEFAULT 0,
  recurrence TEXT DEFAULT 'none', -- none | daily | weekly | monthly
  recurrence_interval INTEGER DEFAULT 1,
  parent_task_id INTEGER, -- self-referencing FK, added in Part 3
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id INTEGER NOT NULL,
  assignee_type TEXT NOT NULL, -- employee | team | department | branch
  assignee_id INTEGER NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (task_id, assignee_type, assignee_id)
);

CREATE TABLE IF NOT EXISTS task_comments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id INTEGER NOT NULL,
  user_id INTEGER,
  body TEXT NOT NULL,
  mentions TEXT, -- JSON array of employee ids, stored as TEXT — JSONB candidate, not converted here
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  is_done BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  position INTEGER DEFAULT 0,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_activity (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id INTEGER NOT NULL,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_attachments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  file_name TEXT,
  original_name TEXT,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- IMPORT & EXPORT INTELLIGENCE — mirrors the Compliance rule engine, but for
-- international trade. Applicability computed from the SAME
-- business_compliance_profile used by Compliance.

CREATE TABLE IF NOT EXISTS trade_authorities (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  description TEXT,
  website TEXT,
  country TEXT DEFAULT 'IN'
);

CREATE TABLE IF NOT EXISTS trade_guidelines (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  country TEXT DEFAULT 'IN',
  category TEXT NOT NULL, -- import | export | licensing | registration | certification
  title TEXT NOT NULL,
  description TEXT,
  business_types TEXT, -- JSON array, informational — stored as TEXT
  industries TEXT, -- JSON array, informational — stored as TEXT
  department TEXT,
  authority_id INTEGER,
  official_website TEXT,
  official_forms TEXT, -- JSON array of {name, url}, stored as TEXT
  fees TEXT,
  processing_time TEXT,
  renewal_requirement TEXT,
  penalty_info TEXT,
  faq_json TEXT, -- JSON array of {question, answer}, stored as TEXT
  ai_explanation TEXT,
  frequency TEXT DEFAULT 'one_time', -- one_time | annual | renewal
  renewal_interval_months INTEGER,
  mandatory BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  priority TEXT DEFAULT 'medium',
  is_active BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_rule_conditions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guideline_id INTEGER NOT NULL,
  attribute TEXT NOT NULL, -- country|state|business_type|industry|entity_type|import_enabled|export_enabled|is_manufacturer|is_trader|is_service_provider|product_category|annual_turnover|employee_count|gst_registered|msme|fssai_required|drug_license|has_factory|iec_registered
  operator TEXT NOT NULL, -- is_true|is_false|eq|neq|in|gt|gte|lt|lte
  value TEXT
);

CREATE TABLE IF NOT EXISTS trade_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guideline_id INTEGER NOT NULL,
  doc_name TEXT NOT NULL,
  is_required BOOLEAN DEFAULT true  -- was INTEGER 0/1
);

CREATE TABLE IF NOT EXISTS trade_countries (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_code TEXT UNIQUE NOT NULL,
  country_name TEXT NOT NULL,
  region TEXT,
  requirements_json TEXT, -- JSON array of strings, stored as TEXT
  restricted_products_json TEXT, -- JSON array of strings, stored as TEXT
  import_duties_notes TEXT,
  standards_json TEXT, -- JSON array of strings, stored as TEXT
  shipping_notes TEXT,
  official_links_json TEXT, -- JSON array of {label, url}, stored as TEXT
  is_active BOOLEAN DEFAULT true  -- was INTEGER 0/1
);

CREATE TABLE IF NOT EXISTS trade_products (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_name TEXT NOT NULL,
  category TEXT,
  hs_code TEXT,
  can_export BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  can_import BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  required_certifications_json TEXT, -- JSON array of strings, stored as TEXT
  restrictions TEXT,
  approvals_required_json TEXT, -- JSON array of strings, stored as TEXT
  notes TEXT
);

CREATE TABLE IF NOT EXISTS trade_certifications (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  authority_id INTEGER,
  description TEXT,
  validity_months INTEGER
);

CREATE TABLE IF NOT EXISTS trade_requirements (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  guideline_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', -- pending|in_progress|completed|not_applicable|overdue
  next_due_date DATE,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, guideline_id)
);

CREATE TABLE IF NOT EXISTS trade_checklists (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requirement_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  doc_name TEXT NOT NULL,
  original_name TEXT,
  file_path TEXT,
  mime_type TEXT,
  file_size INTEGER,
  status TEXT DEFAULT 'missing', -- missing|uploaded|verified|expired
  verified BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  verification_notes TEXT,
  expiry_date DATE,
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  uploaded_by INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_readiness (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  import_score INTEGER DEFAULT 0,
  export_score INTEGER DEFAULT 0,
  overall_score INTEGER DEFAULT 0,
  breakdown_json TEXT, -- stored as TEXT — JSONB candidate, not converted here
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id INTEGER NOT NULL,
  requirement_id INTEGER,
  guideline_id INTEGER,
  event_type TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- BUSINESS GROWTH HUB (from schema_growth.sql, applied by Migration 26)
-- All tables multi-tenant via company_id. country_code columns enable global
-- extensibility (not India-only).
-- ============================================================================

CREATE TABLE IF NOT EXISTS growth_profiles (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  stage               TEXT NOT NULL DEFAULT 'Idea',
  -- Idea | Registered | Revenue | Funded | Scaling | Profitable | Pre-IPO | Public
  country_code        TEXT NOT NULL DEFAULT 'IN',
  currency_code       TEXT NOT NULL DEFAULT 'INR',
  currency_symbol     TEXT NOT NULL DEFAULT '₹',
  annual_revenue      DOUBLE PRECISION DEFAULT 0,
  ebitda              DOUBLE PRECISION DEFAULT 0,
  total_assets        DOUBLE PRECISION DEFAULT 0,
  growth_rate_pct     DOUBLE PRECISION DEFAULT 0,
  industry_vertical   TEXT,
  target_raise_amount DOUBLE PRECISION DEFAULT 0,
  target_raise_currency TEXT DEFAULT 'INR',
  raise_purpose       TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS funding_types (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_code        TEXT, -- NULL = global; 'IN' = India; 'US' = USA etc.
  name                TEXT NOT NULL,
  category            TEXT NOT NULL, -- Equity | Debt | Grant | Alternative
  description         TEXT,
  eligibility         TEXT, -- JSON array of criteria strings, stored as TEXT
  advantages          TEXT, -- JSON array, stored as TEXT
  disadvantages       TEXT, -- JSON array, stored as TEXT
  typical_amount_min  DOUBLE PRECISION,
  typical_amount_max  DOUBLE PRECISION,
  typical_amount_unit TEXT DEFAULT 'INR',
  dilution_level      TEXT, -- None | Low | Medium | High
  risk_level          TEXT, -- Low | Medium | High
  timeline_days_min   INTEGER,
  timeline_days_max   INTEGER,
  required_documents  TEXT, -- JSON array, stored as TEXT
  how_to_apply        TEXT,
  official_resources  TEXT, -- JSON array of {label, url}, stored as TEXT
  is_active           BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  sort_order          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS government_schemes (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  country_code        TEXT NOT NULL DEFAULT 'IN',
  region              TEXT, -- State/Province; NULL = national
  name                TEXT NOT NULL,
  short_name          TEXT,
  category            TEXT, -- Startup | MSME | Export | Technology | Women | Agriculture | Loan | Grant
  administering_body  TEXT, -- e.g. "DPIIT", "SIDBI", "Ministry of Commerce"
  description         TEXT,
  eligibility         TEXT, -- JSON array, stored as TEXT
  benefits            TEXT, -- JSON array, stored as TEXT
  documents_required  TEXT, -- JSON array, stored as TEXT
  application_process TEXT, -- JSON array of steps, stored as TEXT
  official_links      TEXT, -- JSON array of {label, url}, stored as TEXT
  deadline_type       TEXT, -- Rolling | Annual | One-Time | Closed
  deadline_notes      TEXT,
  max_benefit_amount  DOUBLE PRECISION,
  benefit_unit        TEXT DEFAULT 'INR',
  benefit_type        TEXT, -- Loan | Grant | Subsidy | Tax Benefit | Recognition
  tags                TEXT, -- JSON array for search, stored as TEXT
  is_active           BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  sort_order          INTEGER DEFAULT 0,
  -- Nullable — no live government-data feed exists; NULL means "never
  -- manually verified by an admin". Bumped to now() by PUT /schemes/:id.
  last_verified_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Curated, browsable reference list of real investor firms/funds (analogous to
-- government_schemes above) — NOT the per-company investor CRM (see `investors`
-- table below). Global reference data, not scoped by company_id.
CREATE TABLE IF NOT EXISTS investor_directory (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                TEXT NOT NULL,
  org_type            TEXT, -- VC Firm | Angel Network | Accelerator | Government Fund
  focus_sectors       TEXT, -- JSON array, stored as TEXT
  investment_stage    TEXT, -- Seed | Series A | Growth | ...
  ticket_size_min     DOUBLE PRECISION,
  ticket_size_max     DOUBLE PRECISION,
  region              TEXT,
  country_code        TEXT DEFAULT 'IN',
  website_url         TEXT,
  contact_info        TEXT,
  description         TEXT,
  notable_portfolio   TEXT, -- JSON array of company names, optional, stored as TEXT
  is_active           BOOLEAN DEFAULT true,
  sort_order          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investors (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  name                TEXT NOT NULL,
  type                TEXT, -- Angel | VC | PE | Family Office | Corporate | Government | Crowdfund
  firm                TEXT,
  email               TEXT,
  phone               TEXT,
  linkedin_url        TEXT,
  website_url         TEXT,
  country_code        TEXT,
  focus_sectors       TEXT, -- JSON array, stored as TEXT
  ticket_size_min     DOUBLE PRECISION,
  ticket_size_max     DOUBLE PRECISION,
  ticket_currency     TEXT DEFAULT 'INR',
  status              TEXT DEFAULT 'Prospect',
  -- Prospect | Contacted | Meeting Scheduled | Pitched | Due Diligence | Term Sheet | Closed Won | Closed Lost
  stage_notes         TEXT,
  last_contact_date   DATE,
  next_follow_up      DATE,
  introduced_by       TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS investment_rounds (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  round_name          TEXT NOT NULL, -- Pre-Seed | Seed | Series A | Series B | Debt | Bridge | IPO
  round_type          TEXT NOT NULL DEFAULT 'Equity', -- Equity | Debt | Convertible Note | SAFE
  target_amount       DOUBLE PRECISION,
  raised_amount       DOUBLE PRECISION DEFAULT 0,
  currency_code       TEXT DEFAULT 'INR',
  pre_money_valuation DOUBLE PRECISION,
  post_money_valuation DOUBLE PRECISION,
  round_date          DATE,
  close_date          DATE,
  status              TEXT DEFAULT 'Planning',
  -- Planning | Open | Closed | Cancelled
  lead_investor_id    INTEGER,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shareholders (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  round_id            INTEGER,
  investor_id         INTEGER,
  name                TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'Founder',
  -- Founder | Co-Founder | Employee | ESOP Pool | Angel | VC | PE | Advisor | Strategic | Other
  email               TEXT,
  share_class         TEXT DEFAULT 'Ordinary',
  -- Ordinary | Preference | ESOP | Convertible | Warrant
  shares              DOUBLE PRECISION NOT NULL DEFAULT 0,
  ownership_pct       DOUBLE PRECISION NOT NULL DEFAULT 0,
  investment_amount   DOUBLE PRECISION DEFAULT 0,
  currency_code       TEXT DEFAULT 'INR',
  price_per_share     DOUBLE PRECISION,
  voting_rights       BOOLEAN DEFAULT true,  -- was INTEGER 0=No/1=Yes
  voting_multiplier   DOUBLE PRECISION DEFAULT 1.0,
  anti_dilution       BOOLEAN DEFAULT false,  -- was INTEGER 0/1
  issue_date          DATE,
  vesting_start       DATE,
  vesting_months      INTEGER,
  cliff_months        INTEGER DEFAULT 12,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS equity_transactions (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  shareholder_id      INTEGER,
  transaction_type    TEXT NOT NULL,
  -- Issue | Transfer | Buyback | Conversion | Split | Bonus | ESOP Grant | ESOP Exercise | ESOP Lapse
  shares_delta        DOUBLE PRECISION NOT NULL DEFAULT 0, -- positive = gain, negative = loss
  price_per_share     DOUBLE PRECISION,
  total_value         DOUBLE PRECISION,
  from_shareholder_id INTEGER,
  round_id            INTEGER,
  transaction_date    DATE DEFAULT CURRENT_DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cap_table_snapshots (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  snapshot_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  label               TEXT, -- e.g. "Pre-Seed Close", "Series A"
  total_shares        DOUBLE PRECISION NOT NULL DEFAULT 0,
  data_json           TEXT NOT NULL DEFAULT '[]', -- full cap table at this point, stored as TEXT — JSONB candidate, not converted here
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS valuations (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  method              TEXT NOT NULL,
  -- Revenue Multiple | EBITDA Multiple | DCF | Comparable | Asset Based | VC Method | Custom
  value_low           DOUBLE PRECISION,
  value_mid           DOUBLE PRECISION,
  value_high          DOUBLE PRECISION,
  currency_code       TEXT DEFAULT 'INR',
  inputs_json         TEXT, -- method-specific inputs, stored as TEXT
  assumptions_json    TEXT, -- key assumptions, stored as TEXT
  valuation_date      DATE DEFAULT CURRENT_DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ipo_checklist_items (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  category            TEXT NOT NULL,
  -- Corporate Governance | Board Structure | Audits | Financial Statements |
  -- Compliance | Legal Due Diligence | Internal Controls | Risk Management |
  -- Investor Relations | Prospectus | Regulatory Filing | Other
  title               TEXT NOT NULL,
  description         TEXT,
  is_mandatory        BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  status              TEXT DEFAULT 'Pending',
  -- Pending | In Progress | Complete | Not Applicable | Blocked
  assigned_to         TEXT,
  target_date         DATE,
  completed_date      DATE,
  notes               TEXT,
  sort_order          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ipo_documents (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  checklist_item_id   INTEGER,
  filename            TEXT NOT NULL,
  original_name       TEXT,
  mimetype            TEXT,
  size_bytes          INTEGER,
  path                TEXT,
  uploaded_by         INTEGER,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partnerships (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  type                TEXT NOT NULL DEFAULT 'Partnership',
  -- Partnership | Sponsorship | Distribution | Technology | Strategic | Co-Marketing | JV
  partner_name        TEXT NOT NULL,
  contact_name        TEXT,
  contact_email       TEXT,
  contact_phone       TEXT,
  website_url         TEXT,
  country_code        TEXT,
  status              TEXT DEFAULT 'Prospect',
  -- Prospect | Contacted | Negotiating | Active | Paused | Ended
  value_amount        DOUBLE PRECISION,
  currency_code       TEXT DEFAULT 'INR',
  value_type          TEXT, -- Cash | In-Kind | Revenue Share | Equity
  start_date          DATE,
  end_date            DATE,
  renewal_date        DATE,
  contract_file       TEXT, -- path to uploaded contract
  description         TEXT,
  tags                TEXT, -- JSON array, stored as TEXT
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pitch_decks (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  title               TEXT NOT NULL,
  deck_type           TEXT DEFAULT 'Pitch Deck',
  -- Pitch Deck | Financial Model | Business Plan | Market Analysis |
  -- Competitor Analysis | Product Demo | Investment Ask | Other
  version             TEXT DEFAULT 'v1.0',
  filename            TEXT,
  original_name       TEXT,
  mimetype            TEXT,
  size_bytes          INTEGER,
  path                TEXT,
  description         TEXT,
  is_current          BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  ai_review           TEXT, -- AI-generated review/feedback
  comments            TEXT, -- JSON array of {author, text, date}, stored as TEXT
  uploaded_by         INTEGER,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS due_diligence_documents (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  category            TEXT NOT NULL,
  -- Company Documents | Financial Statements | Tax Returns | Licenses |
  -- Compliance | IP Documents | HR Records | Customer Contracts | Vendor Contracts | Other
  title               TEXT NOT NULL,
  description         TEXT,
  is_required         BOOLEAN DEFAULT true,  -- was INTEGER 0/1
  status              TEXT DEFAULT 'Missing',
  -- Missing | Uploaded | Verified | Expired | Not Applicable
  filename            TEXT,
  original_name       TEXT,
  mimetype            TEXT,
  size_bytes          INTEGER,
  path                TEXT,
  expiry_date         DATE,
  notes               TEXT,
  uploaded_by         INTEGER,
  verified_by         INTEGER,
  verified_at         TIMESTAMPTZ,
  sort_order          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS growth_tasks (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  stage               TEXT, -- Which growth stage this milestone belongs to
  title               TEXT NOT NULL,
  description         TEXT,
  category            TEXT DEFAULT 'Milestone',
  -- Milestone | Legal | Financial | Product | Team | Marketing | Regulatory | Custom
  status              TEXT DEFAULT 'Not Started',
  -- Not Started | In Progress | Complete | Skipped
  priority            TEXT DEFAULT 'Medium', -- Low | Medium | High | Critical
  target_date         DATE,
  completed_date      DATE,
  assigned_to         TEXT,
  depends_on          TEXT, -- JSON array of task IDs, stored as TEXT
  sort_order          INTEGER DEFAULT 0,
  is_template         BOOLEAN DEFAULT false,  -- was INTEGER 0/1, 1 = system template row
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS growth_notes (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  entity_type         TEXT, -- investor | round | partnership | valuation | ipo_item | general
  entity_id           INTEGER,
  body                TEXT NOT NULL,
  author_id           INTEGER,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS growth_advisor_sessions (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  user_id             INTEGER,
  session_id          TEXT NOT NULL,
  role                TEXT NOT NULL, -- user | assistant
  content             TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- PART 2: INDEXES  (translated 1:1 from schema.sql / schema_growth.sql; plus
-- the four indexes Migration 11 creates directly rather than via schema.sql)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);

CREATE INDEX IF NOT EXISTS idx_chat_session ON ai_chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_user ON ai_chat_history(user_id, created_at DESC);

-- (added by migration 11 — Multi-Tenant Architecture)
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_company ON sales(company_id);
CREATE INDEX IF NOT EXISTS idx_purchases_company ON purchases(company_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_company_code ON companies(company_code); -- (added by migration 15; SQLite ALTER TABLE ADD COLUMN can't carry UNIQUE, so the source adds it as a separate index too)

CREATE INDEX IF NOT EXISTS idx_signals_company ON marketing_signals(company_id);
CREATE INDEX IF NOT EXISTS idx_signals_entity ON marketing_signals(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_kg_node_a ON knowledge_graph_edges(company_id, node_a_type, node_a_id);
CREATE INDEX IF NOT EXISTS idx_kg_node_b ON knowledge_graph_edges(company_id, node_b_type, node_b_id);
CREATE INDEX IF NOT EXISTS idx_kg_relationship ON knowledge_graph_edges(relationship_type);

CREATE INDEX IF NOT EXISTS idx_wallet_cust ON customer_wallets(customer_id);

CREATE INDEX IF NOT EXISTS idx_sys_evts ON system_events(company_id, status);

CREATE INDEX IF NOT EXISTS idx_jobs_run ON background_jobs(status, run_at, priority);

CREATE INDEX IF NOT EXISTS idx_comp_rules_country ON compliance_rules(country, is_active);
CREATE INDEX IF NOT EXISTS idx_comp_conditions_rule ON compliance_rule_conditions(rule_id);
CREATE INDEX IF NOT EXISTS idx_comp_ruledocs_rule ON compliance_rule_documents(rule_id);
CREATE INDEX IF NOT EXISTS idx_bci_company ON business_compliance_items(company_id);
CREATE INDEX IF NOT EXISTS idx_bci_due ON business_compliance_items(company_id, next_due_date);
CREATE INDEX IF NOT EXISTS idx_cid_item ON compliance_item_documents(item_id, is_current);
CREATE INDEX IF NOT EXISTS idx_cid_company ON compliance_item_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_cev_company ON compliance_events(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cmeet_company ON compliance_meetings(company_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_cmagenda_meeting ON compliance_meeting_agenda(meeting_id);
CREATE INDEX IF NOT EXISTS idx_cmatt_meeting ON compliance_meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_cmres_meeting ON compliance_meeting_resolutions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_cmmin_meeting ON compliance_meeting_minutes(meeting_id);

CREATE INDEX IF NOT EXISTS idx_teams_company ON teams(company_id);
CREATE INDEX IF NOT EXISTS idx_teams_department ON teams(department_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_employee ON team_members(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_groups_company ON employee_groups(company_id);
CREATE INDEX IF NOT EXISTS idx_egm_group ON employee_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_egm_employee ON employee_group_members(employee_id);

CREATE INDEX IF NOT EXISTS idx_tasks_company ON tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(company_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_task_assign_task ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assign_lookup ON task_assignments(assignee_type, assignee_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attach_task ON task_attachments(task_id);

CREATE INDEX IF NOT EXISTS idx_trade_guidelines_country ON trade_guidelines(country, category);
CREATE INDEX IF NOT EXISTS idx_trade_conditions_guideline ON trade_rule_conditions(guideline_id);
CREATE INDEX IF NOT EXISTS idx_trade_docdefs_guideline ON trade_documents(guideline_id);
CREATE INDEX IF NOT EXISTS idx_trade_products_name ON trade_products(product_name);
CREATE INDEX IF NOT EXISTS idx_trade_req_company ON trade_requirements(company_id);
CREATE INDEX IF NOT EXISTS idx_trade_req_due ON trade_requirements(next_due_date);
CREATE INDEX IF NOT EXISTS idx_trade_checklist_req ON trade_checklists(requirement_id);
CREATE INDEX IF NOT EXISTS idx_trade_checklist_company ON trade_checklists(company_id);
CREATE INDEX IF NOT EXISTS idx_trade_readiness_company ON trade_readiness(company_id);
CREATE INDEX IF NOT EXISTS idx_trade_events_company ON trade_events(company_id);

CREATE INDEX IF NOT EXISTS idx_growth_profiles_company   ON growth_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_funding_types_country     ON funding_types(country_code);
CREATE INDEX IF NOT EXISTS idx_gov_schemes_country       ON government_schemes(country_code, category);
CREATE INDEX IF NOT EXISTS idx_investor_directory_type   ON investor_directory(org_type, investment_stage);
CREATE INDEX IF NOT EXISTS idx_investors_company         ON investors(company_id, status);
CREATE INDEX IF NOT EXISTS idx_rounds_company            ON investment_rounds(company_id);
CREATE INDEX IF NOT EXISTS idx_shareholders_company      ON shareholders(company_id);
CREATE INDEX IF NOT EXISTS idx_equity_tx_company         ON equity_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_valuations_company        ON valuations(company_id);
CREATE INDEX IF NOT EXISTS idx_ipo_items_company         ON ipo_checklist_items(company_id, category);
CREATE INDEX IF NOT EXISTS idx_partnerships_company      ON partnerships(company_id, type);
CREATE INDEX IF NOT EXISTS idx_pitch_decks_company       ON pitch_decks(company_id);
CREATE INDEX IF NOT EXISTS idx_dd_docs_company           ON due_diligence_documents(company_id, category);
CREATE INDEX IF NOT EXISTS idx_growth_tasks_company      ON growth_tasks(company_id, status);
CREATE INDEX IF NOT EXISTS idx_advisor_sessions_company  ON growth_advisor_sessions(company_id, session_id);


-- ============================================================================
-- PART 3: FOREIGN KEYS  — every REFERENCES relationship declared in
-- schema.sql / schema_growth.sql, added now that all tables exist. None of
-- these were enforced in SQLite (see Phase 1 report: PRAGMA foreign_keys is
-- never turned on anywhere in this codebase) — Postgres enforces every one of
-- these by default. Columns that were commented "soft FK" or had no
-- REFERENCES clause in the source (e.g. compliance_rules.category_key,
-- communication_campaigns.template_id, marketing_experiments.campaign_id) are
-- deliberately left without a constraint here too — adding one they never had
-- would be a schema-shape decision beyond "translate what exists".
--
-- companies.owner_user_id <-> users.company_id is a genuine circular pair;
-- both columns are nullable in Part 1, so insertion order is: insert one row
-- with the FK column NULL, insert the other, then UPDATE the first — same
-- pattern the app's signup flow already uses today against SQLite.
-- ============================================================================

ALTER TABLE companies ADD CONSTRAINT fk_companies_owner_user_id FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE products ADD CONSTRAINT fk_products_group_id FOREIGN KEY (group_id) REFERENCES product_groups(id);
ALTER TABLE products ADD CONSTRAINT fk_products_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE products ADD CONSTRAINT fk_products_supplier_id FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

ALTER TABLE suppliers ADD CONSTRAINT fk_suppliers_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE departments ADD CONSTRAINT fk_departments_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE departments ADD CONSTRAINT fk_departments_head_id FOREIGN KEY (head_id) REFERENCES employees(id);
ALTER TABLE departments ADD CONSTRAINT fk_departments_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE employees ADD CONSTRAINT fk_employees_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE employees ADD CONSTRAINT fk_employees_user_id FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE employees ADD CONSTRAINT fk_employees_manager_id FOREIGN KEY (manager_id) REFERENCES employees(id);
ALTER TABLE employees ADD CONSTRAINT fk_employees_department_id FOREIGN KEY (department_id) REFERENCES departments(id);
ALTER TABLE employees ADD CONSTRAINT fk_employees_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE sales ADD CONSTRAINT fk_sales_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE sales ADD CONSTRAINT fk_sales_product_id FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE sales ADD CONSTRAINT fk_sales_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE sales ADD CONSTRAINT fk_sales_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE sales ADD CONSTRAINT fk_sales_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE sales ADD CONSTRAINT fk_sales_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE sales ADD CONSTRAINT fk_sales_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);

ALTER TABLE inventory ADD CONSTRAINT fk_inventory_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE inventory ADD CONSTRAINT fk_inventory_product_id FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE inventory ADD CONSTRAINT fk_inventory_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE inventory ADD CONSTRAINT fk_inventory_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);

ALTER TABLE customers ADD CONSTRAINT fk_customers_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE customers ADD CONSTRAINT fk_customers_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE invoices ADD CONSTRAINT fk_invoices_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE invoices ADD CONSTRAINT fk_invoices_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);

ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_product_id FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE credits ADD CONSTRAINT fk_credits_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE credits ADD CONSTRAINT fk_credits_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE credits ADD CONSTRAINT fk_credits_sale_id FOREIGN KEY (sale_id) REFERENCES sales(id);

ALTER TABLE purchases ADD CONSTRAINT fk_purchases_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE purchases ADD CONSTRAINT fk_purchases_product_id FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE purchases ADD CONSTRAINT fk_purchases_supplier_id FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

ALTER TABLE company_settings ADD CONSTRAINT fk_company_settings_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE company_addresses ADD CONSTRAINT fk_company_addresses_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE company_licenses ADD CONSTRAINT fk_company_licenses_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE company_bank_accounts ADD CONSTRAINT fk_company_bank_accounts_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE company_gst_settings ADD CONSTRAINT fk_company_gst_settings_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE company_financial_settings ADD CONSTRAINT fk_company_financial_settings_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE company_branding ADD CONSTRAINT fk_company_branding_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE company_subscriptions ADD CONSTRAINT fk_company_subscriptions_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE company_security_settings ADD CONSTRAINT fk_company_security_settings_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE license_expiry_alerts ADD CONSTRAINT fk_license_expiry_alerts_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE license_expiry_alerts ADD CONSTRAINT fk_license_expiry_alerts_license_id FOREIGN KEY (license_id) REFERENCES company_licenses(id);

ALTER TABLE company_setup_progress ADD CONSTRAINT fk_company_setup_progress_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

-- NOTE: ai_insights_cache.user_id has 1 orphaned row in the live seeded SQLite DB
-- (a user_id with no matching users.id) — this constraint is correct per the
-- source schema, but loading that specific seed data as-is into Postgres would
-- fail on this row. See Phase 1 report.
ALTER TABLE ai_insights_cache ADD CONSTRAINT fk_ai_insights_cache_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE ai_insights_cache ADD CONSTRAINT fk_ai_insights_cache_user_id FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ai_chat_history ADD CONSTRAINT fk_ai_chat_history_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE ai_chat_history ADD CONSTRAINT fk_ai_chat_history_user_id FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ai_dismissed_insights ADD CONSTRAINT fk_ai_dismissed_insights_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE ai_dismissed_insights ADD CONSTRAINT fk_ai_dismissed_insights_user_id FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE users ADD CONSTRAINT fk_users_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE marketing_campaigns ADD CONSTRAINT fk_marketing_campaigns_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE marketing_campaigns ADD CONSTRAINT fk_marketing_campaigns_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE marketing_campaign_targets ADD CONSTRAINT fk_marketing_campaign_targets_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE marketing_campaign_targets ADD CONSTRAINT fk_marketing_campaign_targets_campaign_id FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id);
ALTER TABLE marketing_campaign_targets ADD CONSTRAINT fk_marketing_campaign_targets_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);

ALTER TABLE branches ADD CONSTRAINT fk_branches_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE permissions ADD CONSTRAINT fk_permissions_group_id FOREIGN KEY (group_id) REFERENCES permission_groups(id);

ALTER TABLE roles ADD CONSTRAINT fk_roles_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_role_id FOREIGN KEY (role_id) REFERENCES roles(id);
ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_permission_id FOREIGN KEY (permission_id) REFERENCES permissions(id);

ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_user_id FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_role_id FOREIGN KEY (role_id) REFERENCES roles(id);
ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE user_roles ADD CONSTRAINT fk_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id);

ALTER TABLE invitations ADD CONSTRAINT fk_invitations_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE invitations ADD CONSTRAINT fk_invitations_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE invitations ADD CONSTRAINT fk_invitations_department_id FOREIGN KEY (department_id) REFERENCES departments(id);
ALTER TABLE invitations ADD CONSTRAINT fk_invitations_role_id FOREIGN KEY (role_id) REFERENCES roles(id);
ALTER TABLE invitations ADD CONSTRAINT fk_invitations_invited_by FOREIGN KEY (invited_by) REFERENCES users(id);

ALTER TABLE leave_types ADD CONSTRAINT fk_leave_types_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE leave_balances ADD CONSTRAINT fk_leave_balances_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE leave_balances ADD CONSTRAINT fk_leave_balances_leave_type_id FOREIGN KEY (leave_type_id) REFERENCES leave_types(id);
ALTER TABLE leave_balances ADD CONSTRAINT fk_leave_balances_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_requests_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_requests_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_requests_leave_type_id FOREIGN KEY (leave_type_id) REFERENCES leave_types(id);
ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_requests_approved_by FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_requests_rejected_by FOREIGN KEY (rejected_by) REFERENCES users(id);
ALTER TABLE leave_requests ADD CONSTRAINT fk_leave_requests_ai_suggested_replacement_id FOREIGN KEY (ai_suggested_replacement_id) REFERENCES employees(id);

ALTER TABLE attendance_records ADD CONSTRAINT fk_attendance_records_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE attendance_records ADD CONSTRAINT fk_attendance_records_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE attendance_records ADD CONSTRAINT fk_attendance_records_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE attendance_records ADD CONSTRAINT fk_attendance_records_created_by FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE salary_components ADD CONSTRAINT fk_salary_components_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE employee_salaries ADD CONSTRAINT fk_employee_salaries_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE employee_salaries ADD CONSTRAINT fk_employee_salaries_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE employee_salaries ADD CONSTRAINT fk_employee_salaries_created_by FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE payroll_runs ADD CONSTRAINT fk_payroll_runs_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE payroll_runs ADD CONSTRAINT fk_payroll_runs_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE payroll_runs ADD CONSTRAINT fk_payroll_runs_processed_by FOREIGN KEY (processed_by) REFERENCES users(id);

ALTER TABLE payroll_slips ADD CONSTRAINT fk_payroll_slips_payroll_run_id FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id);
ALTER TABLE payroll_slips ADD CONSTRAINT fk_payroll_slips_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE payroll_slips ADD CONSTRAINT fk_payroll_slips_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE employee_documents ADD CONSTRAINT fk_employee_documents_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE employee_documents ADD CONSTRAINT fk_employee_documents_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE employee_documents ADD CONSTRAINT fk_employee_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE employee_documents ADD CONSTRAINT fk_employee_documents_verified_by FOREIGN KEY (verified_by) REFERENCES users(id);

ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE sessions ADD CONSTRAINT fk_sessions_user_id FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE sessions ADD CONSTRAINT fk_sessions_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE notifications ADD CONSTRAINT fk_notifications_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE hr_settings ADD CONSTRAINT fk_hr_settings_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE marketing_signals ADD CONSTRAINT fk_marketing_signals_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE knowledge_graph_edges ADD CONSTRAINT fk_knowledge_graph_edges_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE customer_wallets ADD CONSTRAINT fk_customer_wallets_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE customer_wallets ADD CONSTRAINT fk_customer_wallets_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);

ALTER TABLE wallet_transactions ADD CONSTRAINT fk_wallet_transactions_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE wallet_transactions ADD CONSTRAINT fk_wallet_transactions_wallet_id FOREIGN KEY (wallet_id) REFERENCES customer_wallets(id);

ALTER TABLE custom_segments ADD CONSTRAINT fk_custom_segments_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE segment_rules ADD CONSTRAINT fk_segment_rules_segment_id FOREIGN KEY (segment_id) REFERENCES custom_segments(id);

ALTER TABLE coupons ADD CONSTRAINT fk_coupons_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE coupons ADD CONSTRAINT fk_coupons_campaign_id FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id);
ALTER TABLE coupons ADD CONSTRAINT fk_coupons_target_segment_id FOREIGN KEY (target_segment_id) REFERENCES custom_segments(id);

ALTER TABLE coupon_redemptions ADD CONSTRAINT fk_coupon_redemptions_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE coupon_redemptions ADD CONSTRAINT fk_coupon_redemptions_coupon_id FOREIGN KEY (coupon_id) REFERENCES coupons(id);
ALTER TABLE coupon_redemptions ADD CONSTRAINT fk_coupon_redemptions_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE coupon_redemptions ADD CONSTRAINT fk_coupon_redemptions_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices(id);

ALTER TABLE referral_codes ADD CONSTRAINT fk_referral_codes_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE referral_codes ADD CONSTRAINT fk_referral_codes_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE referral_codes ADD CONSTRAINT fk_referral_codes_campaign_id FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id);

ALTER TABLE referral_uses ADD CONSTRAINT fk_referral_uses_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE referral_uses ADD CONSTRAINT fk_referral_uses_referral_id FOREIGN KEY (referral_id) REFERENCES referral_codes(id);
ALTER TABLE referral_uses ADD CONSTRAINT fk_referral_uses_new_customer_id FOREIGN KEY (new_customer_id) REFERENCES customers(id);

ALTER TABLE feedback_surveys ADD CONSTRAINT fk_feedback_surveys_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE feedback_surveys ADD CONSTRAINT fk_feedback_surveys_campaign_id FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id);
ALTER TABLE feedback_surveys ADD CONSTRAINT fk_feedback_surveys_invoice_id FOREIGN KEY (invoice_id) REFERENCES invoices(id);

ALTER TABLE survey_responses ADD CONSTRAINT fk_survey_responses_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE survey_responses ADD CONSTRAINT fk_survey_responses_survey_id FOREIGN KEY (survey_id) REFERENCES feedback_surveys(id);
ALTER TABLE survey_responses ADD CONSTRAINT fk_survey_responses_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);

ALTER TABLE communication_campaigns ADD CONSTRAINT fk_communication_campaigns_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE communication_campaigns ADD CONSTRAINT fk_communication_campaigns_segment_id FOREIGN KEY (segment_id) REFERENCES custom_segments(id);

ALTER TABLE communication_templates ADD CONSTRAINT fk_communication_templates_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE communication_logs ADD CONSTRAINT fk_communication_logs_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE communication_logs ADD CONSTRAINT fk_communication_logs_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE communication_logs ADD CONSTRAINT fk_communication_logs_campaign_id FOREIGN KEY (campaign_id) REFERENCES communication_campaigns(id);
ALTER TABLE communication_logs ADD CONSTRAINT fk_communication_logs_marketing_campaign_id FOREIGN KEY (marketing_campaign_id) REFERENCES marketing_campaigns(id);
ALTER TABLE communication_logs ADD CONSTRAINT fk_communication_logs_automation_id FOREIGN KEY (automation_id) REFERENCES marketing_automations(id);
ALTER TABLE communication_logs ADD CONSTRAINT fk_communication_logs_template_id FOREIGN KEY (template_id) REFERENCES communication_templates(id);
ALTER TABLE communication_logs ADD CONSTRAINT fk_communication_logs_segment_id FOREIGN KEY (segment_id) REFERENCES custom_segments(id);
ALTER TABLE communication_logs ADD CONSTRAINT fk_communication_logs_job_id FOREIGN KEY (job_id) REFERENCES background_jobs(id);

ALTER TABLE store_health_history ADD CONSTRAINT fk_store_health_history_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE channel_costs ADD CONSTRAINT fk_channel_costs_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE channel_roi_history ADD CONSTRAINT fk_channel_roi_history_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE system_events ADD CONSTRAINT fk_system_events_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE background_jobs ADD CONSTRAINT fk_background_jobs_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE marketing_automations ADD CONSTRAINT fk_marketing_automations_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE automation_execution_logs ADD CONSTRAINT fk_automation_execution_logs_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE automation_execution_logs ADD CONSTRAINT fk_automation_execution_logs_automation_id FOREIGN KEY (automation_id) REFERENCES marketing_automations(id);

ALTER TABLE warehouses ADD CONSTRAINT fk_warehouses_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE warehouses ADD CONSTRAINT fk_warehouses_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE user_branches ADD CONSTRAINT fk_user_branches_user_id FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE user_branches ADD CONSTRAINT fk_user_branches_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE user_branches ADD CONSTRAINT fk_user_branches_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);

ALTER TABLE marketing_ai_recommendations ADD CONSTRAINT fk_marketing_ai_recommendations_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE marketing_predictions ADD CONSTRAINT fk_marketing_predictions_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE marketing_forecasts ADD CONSTRAINT fk_marketing_forecasts_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE marketing_experiments ADD CONSTRAINT fk_marketing_experiments_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE generated_campaigns ADD CONSTRAINT fk_generated_campaigns_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE generated_campaigns ADD CONSTRAINT fk_generated_campaigns_recommendation_id FOREIGN KEY (recommendation_id) REFERENCES marketing_ai_recommendations(id);

ALTER TABLE marketing_calendar ADD CONSTRAINT fk_marketing_calendar_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE content_templates ADD CONSTRAINT fk_content_templates_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE marketing_ai_logs ADD CONSTRAINT fk_marketing_ai_logs_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE compliance_rule_conditions ADD CONSTRAINT fk_compliance_rule_conditions_rule_id FOREIGN KEY (rule_id) REFERENCES compliance_rules(id);
ALTER TABLE compliance_rule_documents ADD CONSTRAINT fk_compliance_rule_documents_rule_id FOREIGN KEY (rule_id) REFERENCES compliance_rules(id);

ALTER TABLE business_compliance_profile ADD CONSTRAINT fk_business_compliance_profile_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE business_compliance_items ADD CONSTRAINT fk_business_compliance_items_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE business_compliance_items ADD CONSTRAINT fk_business_compliance_items_rule_id FOREIGN KEY (rule_id) REFERENCES compliance_rules(id);

ALTER TABLE compliance_item_documents ADD CONSTRAINT fk_compliance_item_documents_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE compliance_item_documents ADD CONSTRAINT fk_compliance_item_documents_item_id FOREIGN KEY (item_id) REFERENCES business_compliance_items(id);
ALTER TABLE compliance_item_documents ADD CONSTRAINT fk_compliance_item_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id);

ALTER TABLE compliance_events ADD CONSTRAINT fk_compliance_events_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE compliance_events ADD CONSTRAINT fk_compliance_events_item_id FOREIGN KEY (item_id) REFERENCES business_compliance_items(id);
ALTER TABLE compliance_events ADD CONSTRAINT fk_compliance_events_rule_id FOREIGN KEY (rule_id) REFERENCES compliance_rules(id);

ALTER TABLE compliance_meetings ADD CONSTRAINT fk_compliance_meetings_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE compliance_meetings ADD CONSTRAINT fk_compliance_meetings_item_id FOREIGN KEY (item_id) REFERENCES business_compliance_items(id);

ALTER TABLE compliance_meeting_agenda ADD CONSTRAINT fk_compliance_meeting_agenda_meeting_id FOREIGN KEY (meeting_id) REFERENCES compliance_meetings(id);
ALTER TABLE compliance_meeting_attendees ADD CONSTRAINT fk_compliance_meeting_attendees_meeting_id FOREIGN KEY (meeting_id) REFERENCES compliance_meetings(id);
ALTER TABLE compliance_meeting_resolutions ADD CONSTRAINT fk_compliance_meeting_resolutions_meeting_id FOREIGN KEY (meeting_id) REFERENCES compliance_meetings(id);
ALTER TABLE compliance_meeting_minutes ADD CONSTRAINT fk_compliance_meeting_minutes_meeting_id FOREIGN KEY (meeting_id) REFERENCES compliance_meetings(id);

ALTER TABLE teams ADD CONSTRAINT fk_teams_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE teams ADD CONSTRAINT fk_teams_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE teams ADD CONSTRAINT fk_teams_department_id FOREIGN KEY (department_id) REFERENCES departments(id);
ALTER TABLE teams ADD CONSTRAINT fk_teams_lead_id FOREIGN KEY (lead_id) REFERENCES employees(id);
ALTER TABLE teams ADD CONSTRAINT fk_teams_created_by FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE team_members ADD CONSTRAINT fk_team_members_team_id FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE team_members ADD CONSTRAINT fk_team_members_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);

ALTER TABLE employee_groups ADD CONSTRAINT fk_employee_groups_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE employee_groups ADD CONSTRAINT fk_employee_groups_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE employee_groups ADD CONSTRAINT fk_employee_groups_created_by FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE employee_group_members ADD CONSTRAINT fk_employee_group_members_group_id FOREIGN KEY (group_id) REFERENCES employee_groups(id);
ALTER TABLE employee_group_members ADD CONSTRAINT fk_employee_group_members_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id);

ALTER TABLE tasks ADD CONSTRAINT fk_tasks_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_branch_id FOREIGN KEY (branch_id) REFERENCES branches(id);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_department_id FOREIGN KEY (department_id) REFERENCES departments(id);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_team_id FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_parent_task_id FOREIGN KEY (parent_task_id) REFERENCES tasks(id);

ALTER TABLE task_assignments ADD CONSTRAINT fk_task_assignments_task_id FOREIGN KEY (task_id) REFERENCES tasks(id);

ALTER TABLE task_comments ADD CONSTRAINT fk_task_comments_task_id FOREIGN KEY (task_id) REFERENCES tasks(id);
ALTER TABLE task_comments ADD CONSTRAINT fk_task_comments_user_id FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE task_checklist_items ADD CONSTRAINT fk_task_checklist_items_task_id FOREIGN KEY (task_id) REFERENCES tasks(id);

ALTER TABLE task_activity ADD CONSTRAINT fk_task_activity_task_id FOREIGN KEY (task_id) REFERENCES tasks(id);
ALTER TABLE task_activity ADD CONSTRAINT fk_task_activity_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users(id);

ALTER TABLE task_attachments ADD CONSTRAINT fk_task_attachments_task_id FOREIGN KEY (task_id) REFERENCES tasks(id);
ALTER TABLE task_attachments ADD CONSTRAINT fk_task_attachments_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE task_attachments ADD CONSTRAINT fk_task_attachments_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id);

ALTER TABLE trade_guidelines ADD CONSTRAINT fk_trade_guidelines_authority_id FOREIGN KEY (authority_id) REFERENCES trade_authorities(id);

ALTER TABLE trade_rule_conditions ADD CONSTRAINT fk_trade_rule_conditions_guideline_id FOREIGN KEY (guideline_id) REFERENCES trade_guidelines(id);
ALTER TABLE trade_documents ADD CONSTRAINT fk_trade_documents_guideline_id FOREIGN KEY (guideline_id) REFERENCES trade_guidelines(id);
ALTER TABLE trade_certifications ADD CONSTRAINT fk_trade_certifications_authority_id FOREIGN KEY (authority_id) REFERENCES trade_authorities(id);

ALTER TABLE trade_requirements ADD CONSTRAINT fk_trade_requirements_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE trade_requirements ADD CONSTRAINT fk_trade_requirements_guideline_id FOREIGN KEY (guideline_id) REFERENCES trade_guidelines(id);

ALTER TABLE trade_checklists ADD CONSTRAINT fk_trade_checklists_requirement_id FOREIGN KEY (requirement_id) REFERENCES trade_requirements(id);
ALTER TABLE trade_checklists ADD CONSTRAINT fk_trade_checklists_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE trade_checklists ADD CONSTRAINT fk_trade_checklists_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id);

ALTER TABLE trade_readiness ADD CONSTRAINT fk_trade_readiness_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE trade_events ADD CONSTRAINT fk_trade_events_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE trade_events ADD CONSTRAINT fk_trade_events_requirement_id FOREIGN KEY (requirement_id) REFERENCES trade_requirements(id);
ALTER TABLE trade_events ADD CONSTRAINT fk_trade_events_guideline_id FOREIGN KEY (guideline_id) REFERENCES trade_guidelines(id);

ALTER TABLE growth_profiles ADD CONSTRAINT fk_growth_profiles_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE investors ADD CONSTRAINT fk_investors_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE investment_rounds ADD CONSTRAINT fk_investment_rounds_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE investment_rounds ADD CONSTRAINT fk_investment_rounds_lead_investor_id FOREIGN KEY (lead_investor_id) REFERENCES investors(id);

ALTER TABLE shareholders ADD CONSTRAINT fk_shareholders_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE shareholders ADD CONSTRAINT fk_shareholders_round_id FOREIGN KEY (round_id) REFERENCES investment_rounds(id);
ALTER TABLE shareholders ADD CONSTRAINT fk_shareholders_investor_id FOREIGN KEY (investor_id) REFERENCES investors(id);

ALTER TABLE equity_transactions ADD CONSTRAINT fk_equity_transactions_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE equity_transactions ADD CONSTRAINT fk_equity_transactions_shareholder_id FOREIGN KEY (shareholder_id) REFERENCES shareholders(id);
ALTER TABLE equity_transactions ADD CONSTRAINT fk_equity_transactions_from_shareholder_id FOREIGN KEY (from_shareholder_id) REFERENCES shareholders(id);
ALTER TABLE equity_transactions ADD CONSTRAINT fk_equity_transactions_round_id FOREIGN KEY (round_id) REFERENCES investment_rounds(id);

ALTER TABLE cap_table_snapshots ADD CONSTRAINT fk_cap_table_snapshots_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE valuations ADD CONSTRAINT fk_valuations_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE ipo_checklist_items ADD CONSTRAINT fk_ipo_checklist_items_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE ipo_documents ADD CONSTRAINT fk_ipo_documents_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE ipo_documents ADD CONSTRAINT fk_ipo_documents_checklist_item_id FOREIGN KEY (checklist_item_id) REFERENCES ipo_checklist_items(id);
ALTER TABLE ipo_documents ADD CONSTRAINT fk_ipo_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id);

ALTER TABLE partnerships ADD CONSTRAINT fk_partnerships_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE pitch_decks ADD CONSTRAINT fk_pitch_decks_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE pitch_decks ADD CONSTRAINT fk_pitch_decks_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id);

ALTER TABLE due_diligence_documents ADD CONSTRAINT fk_due_diligence_documents_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE due_diligence_documents ADD CONSTRAINT fk_due_diligence_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE due_diligence_documents ADD CONSTRAINT fk_due_diligence_documents_verified_by FOREIGN KEY (verified_by) REFERENCES users(id);

ALTER TABLE growth_tasks ADD CONSTRAINT fk_growth_tasks_company_id FOREIGN KEY (company_id) REFERENCES companies(id);

ALTER TABLE growth_notes ADD CONSTRAINT fk_growth_notes_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE growth_notes ADD CONSTRAINT fk_growth_notes_author_id FOREIGN KEY (author_id) REFERENCES users(id);

ALTER TABLE growth_advisor_sessions ADD CONSTRAINT fk_growth_advisor_sessions_company_id FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE growth_advisor_sessions ADD CONSTRAINT fk_growth_advisor_sessions_user_id FOREIGN KEY (user_id) REFERENCES users(id);
