-- ============================================================================
-- Business Growth Hub Schema
-- Applied via migrate.js after schema.sql
-- All tables are multi-tenant via company_id.
-- country_code columns enable global extensibility (not India-only).
-- ============================================================================

-- ── 1. Growth Profile ────────────────────────────────────────────────────────
-- One row per company; stores current stage, country, and growth goals.
CREATE TABLE IF NOT EXISTS growth_profiles (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  stage               TEXT NOT NULL DEFAULT 'Idea',
  -- Idea | Registered | Revenue | Funded | Scaling | Profitable | Pre-IPO | Public
  country_code        TEXT NOT NULL DEFAULT 'IN',
  currency_code       TEXT NOT NULL DEFAULT 'INR',
  currency_symbol     TEXT NOT NULL DEFAULT '₹',
  annual_revenue      REAL DEFAULT 0,
  ebitda              REAL DEFAULT 0,
  total_assets        REAL DEFAULT 0,
  growth_rate_pct     REAL DEFAULT 0,
  industry_vertical   TEXT,
  target_raise_amount REAL DEFAULT 0,
  target_raise_currency TEXT DEFAULT 'INR',
  raise_purpose       TEXT,
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now')),
  UNIQUE(company_id)
);

-- ── 2. Funding Types (Global Catalog) ────────────────────────────────────────
-- Reference table. country_code NULL = globally applicable.
CREATE TABLE IF NOT EXISTS funding_types (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code        TEXT,        -- NULL = global; 'IN' = India; 'US' = USA etc.
  name                TEXT NOT NULL,
  category            TEXT NOT NULL, -- Equity | Debt | Grant | Alternative
  description         TEXT,
  eligibility         TEXT,        -- JSON array of criteria strings
  advantages          TEXT,        -- JSON array
  disadvantages       TEXT,        -- JSON array
  typical_amount_min  REAL,
  typical_amount_max  REAL,
  typical_amount_unit TEXT DEFAULT 'INR',
  dilution_level      TEXT,        -- None | Low | Medium | High
  risk_level          TEXT,        -- Low | Medium | High
  timeline_days_min   INTEGER,
  timeline_days_max   INTEGER,
  required_documents  TEXT,        -- JSON array
  how_to_apply        TEXT,
  official_resources  TEXT,        -- JSON array of {label, url}
  is_active           INTEGER DEFAULT 1,
  sort_order          INTEGER DEFAULT 0,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- ── 3. Government Schemes (Searchable Database) ──────────────────────────────
CREATE TABLE IF NOT EXISTS government_schemes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code        TEXT NOT NULL DEFAULT 'IN',
  region              TEXT,        -- State/Province; NULL = national
  name                TEXT NOT NULL,
  short_name          TEXT,
  category            TEXT,        -- Startup | MSME | Export | Technology | Women | Agriculture | Loan | Grant
  administering_body  TEXT,        -- e.g. "DPIIT", "SIDBI", "Ministry of Commerce"
  description         TEXT,
  eligibility         TEXT,        -- JSON array
  benefits            TEXT,        -- JSON array
  documents_required  TEXT,        -- JSON array
  application_process TEXT,        -- JSON array of steps
  official_links      TEXT,        -- JSON array of {label, url}
  deadline_type       TEXT,        -- Rolling | Annual | One-Time | Closed
  deadline_notes      TEXT,
  max_benefit_amount  REAL,
  benefit_unit        TEXT DEFAULT 'INR',
  benefit_type        TEXT,        -- Loan | Grant | Subsidy | Tax Benefit | Recognition
  tags                TEXT,        -- JSON array for search
  is_active           INTEGER DEFAULT 1,
  sort_order          INTEGER DEFAULT 0,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- ── 4. Investors ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investors (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  name                TEXT NOT NULL,
  type                TEXT,        -- Angel | VC | PE | Family Office | Corporate | Government | Crowdfund
  firm                TEXT,
  email               TEXT,
  phone               TEXT,
  linkedin_url        TEXT,
  website_url         TEXT,
  country_code        TEXT,
  focus_sectors       TEXT,        -- JSON array
  ticket_size_min     REAL,
  ticket_size_max     REAL,
  ticket_currency     TEXT DEFAULT 'INR',
  status              TEXT DEFAULT 'Prospect',
  -- Prospect | Contacted | Meeting Scheduled | Pitched | Due Diligence | Term Sheet | Closed Won | Closed Lost
  stage_notes         TEXT,
  last_contact_date   TEXT,
  next_follow_up      TEXT,
  introduced_by       TEXT,
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now')),
  deleted_at          TEXT
);

-- ── 5. Investment Rounds ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investment_rounds (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  round_name          TEXT NOT NULL, -- Pre-Seed | Seed | Series A | Series B | Debt | Bridge | IPO
  round_type          TEXT NOT NULL DEFAULT 'Equity', -- Equity | Debt | Convertible Note | SAFE
  target_amount       REAL,
  raised_amount       REAL DEFAULT 0,
  currency_code       TEXT DEFAULT 'INR',
  pre_money_valuation REAL,
  post_money_valuation REAL,
  round_date          TEXT,
  close_date          TEXT,
  status              TEXT DEFAULT 'Planning',
  -- Planning | Open | Closed | Cancelled
  lead_investor_id    INTEGER REFERENCES investors(id),
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- ── 6. Shareholders (Cap Table entries) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS shareholders (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  round_id            INTEGER REFERENCES investment_rounds(id),
  investor_id         INTEGER REFERENCES investors(id),
  name                TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'Founder',
  -- Founder | Co-Founder | Employee | ESOP Pool | Angel | VC | PE | Advisor | Strategic | Other
  email               TEXT,
  share_class         TEXT DEFAULT 'Ordinary',
  -- Ordinary | Preference | ESOP | Convertible | Warrant
  shares              REAL NOT NULL DEFAULT 0,
  ownership_pct       REAL NOT NULL DEFAULT 0,
  investment_amount   REAL DEFAULT 0,
  currency_code       TEXT DEFAULT 'INR',
  price_per_share     REAL,
  voting_rights       INTEGER DEFAULT 1,   -- 0=No, 1=Yes
  voting_multiplier   REAL DEFAULT 1.0,
  anti_dilution       INTEGER DEFAULT 0,
  issue_date          TEXT,
  vesting_start       TEXT,
  vesting_months      INTEGER,
  cliff_months        INTEGER DEFAULT 12,
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now')),
  deleted_at          TEXT
);

-- ── 7. Equity Transactions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equity_transactions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  shareholder_id      INTEGER REFERENCES shareholders(id),
  transaction_type    TEXT NOT NULL,
  -- Issue | Transfer | Buyback | Conversion | Split | Bonus | ESOP Grant | ESOP Exercise | ESOP Lapse
  shares_delta        REAL NOT NULL DEFAULT 0, -- positive = gain, negative = loss
  price_per_share     REAL,
  total_value         REAL,
  from_shareholder_id INTEGER REFERENCES shareholders(id),
  round_id            INTEGER REFERENCES investment_rounds(id),
  transaction_date    TEXT DEFAULT (date('now')),
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- ── 8. Cap Table Snapshots ────────────────────────────────────────────────────
-- Point-in-time snapshots after each round or event
CREATE TABLE IF NOT EXISTS cap_table_snapshots (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  snapshot_date       TEXT NOT NULL DEFAULT (date('now')),
  label               TEXT,        -- e.g. "Pre-Seed Close", "Series A"
  total_shares        REAL NOT NULL DEFAULT 0,
  data_json           TEXT NOT NULL DEFAULT '[]', -- full cap table at this point
  created_at          TEXT DEFAULT (datetime('now'))
);

-- ── 9. Valuations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS valuations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  method              TEXT NOT NULL,
  -- Revenue Multiple | EBITDA Multiple | DCF | Comparable | Asset Based | VC Method | Custom
  value_low           REAL,
  value_mid           REAL,
  value_high          REAL,
  currency_code       TEXT DEFAULT 'INR',
  inputs_json         TEXT,        -- method-specific inputs stored as JSON
  assumptions_json    TEXT,        -- key assumptions
  valuation_date      TEXT DEFAULT (date('now')),
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- ── 10. IPO Checklist Items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ipo_checklist_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  category            TEXT NOT NULL,
  -- Corporate Governance | Board Structure | Audits | Financial Statements |
  -- Compliance | Legal Due Diligence | Internal Controls | Risk Management |
  -- Investor Relations | Prospectus | Regulatory Filing | Other
  title               TEXT NOT NULL,
  description         TEXT,
  is_mandatory        INTEGER DEFAULT 1,
  status              TEXT DEFAULT 'Pending',
  -- Pending | In Progress | Complete | Not Applicable | Blocked
  assigned_to         TEXT,
  target_date         TEXT,
  completed_date      TEXT,
  notes               TEXT,
  sort_order          INTEGER DEFAULT 0,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- ── 11. IPO Documents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ipo_documents (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  checklist_item_id   INTEGER REFERENCES ipo_checklist_items(id),
  filename            TEXT NOT NULL,
  original_name       TEXT,
  mimetype            TEXT,
  size_bytes          INTEGER,
  path                TEXT,
  uploaded_by         INTEGER REFERENCES users(id),
  created_at          TEXT DEFAULT (datetime('now'))
);

-- ── 12. Partnerships & Sponsorships ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partnerships (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
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
  value_amount        REAL,
  currency_code       TEXT DEFAULT 'INR',
  value_type          TEXT,        -- Cash | In-Kind | Revenue Share | Equity
  start_date          TEXT,
  end_date            TEXT,
  renewal_date        TEXT,
  contract_file       TEXT,        -- path to uploaded contract
  description         TEXT,
  tags                TEXT,        -- JSON array
  notes               TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now')),
  deleted_at          TEXT
);

-- ── 13. Pitch Decks ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pitch_decks (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
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
  is_current          INTEGER DEFAULT 1,
  ai_review           TEXT,        -- AI-generated review/feedback
  comments            TEXT,        -- JSON array of {author, text, date}
  uploaded_by         INTEGER REFERENCES users(id),
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- ── 14. Due Diligence Documents ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS due_diligence_documents (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  category            TEXT NOT NULL,
  -- Company Documents | Financial Statements | Tax Returns | Licenses |
  -- Compliance | IP Documents | HR Records | Customer Contracts | Vendor Contracts | Other
  title               TEXT NOT NULL,
  description         TEXT,
  is_required         INTEGER DEFAULT 1,
  status              TEXT DEFAULT 'Missing',
  -- Missing | Uploaded | Verified | Expired | Not Applicable
  filename            TEXT,
  original_name       TEXT,
  mimetype            TEXT,
  size_bytes          INTEGER,
  path                TEXT,
  expiry_date         TEXT,
  notes               TEXT,
  uploaded_by         INTEGER REFERENCES users(id),
  verified_by         INTEGER REFERENCES users(id),
  verified_at         TEXT,
  sort_order          INTEGER DEFAULT 0,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- ── 15. Growth Tasks (Roadmap Milestones) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_tasks (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  stage               TEXT,        -- Which growth stage this milestone belongs to
  title               TEXT NOT NULL,
  description         TEXT,
  category            TEXT DEFAULT 'Milestone',
  -- Milestone | Legal | Financial | Product | Team | Marketing | Regulatory | Custom
  status              TEXT DEFAULT 'Not Started',
  -- Not Started | In Progress | Complete | Skipped
  priority            TEXT DEFAULT 'Medium', -- Low | Medium | High | Critical
  target_date         TEXT,
  completed_date      TEXT,
  assigned_to         TEXT,
  depends_on          TEXT,        -- JSON array of task IDs
  sort_order          INTEGER DEFAULT 0,
  is_template         INTEGER DEFAULT 0, -- 1 = system template row
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

-- ── 16. Growth Notes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_notes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  entity_type         TEXT,        -- investor | round | partnership | valuation | ipo_item | general
  entity_id           INTEGER,
  body                TEXT NOT NULL,
  author_id           INTEGER REFERENCES users(id),
  created_at          TEXT DEFAULT (datetime('now'))
);

-- ── 17. AI Growth Advisor Sessions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_advisor_sessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id          INTEGER NOT NULL REFERENCES companies(id),
  user_id             INTEGER REFERENCES users(id),
  session_id          TEXT NOT NULL,
  role                TEXT NOT NULL,  -- user | assistant
  content             TEXT NOT NULL,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_growth_profiles_company   ON growth_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_funding_types_country     ON funding_types(country_code);
CREATE INDEX IF NOT EXISTS idx_gov_schemes_country       ON government_schemes(country_code, category);
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
