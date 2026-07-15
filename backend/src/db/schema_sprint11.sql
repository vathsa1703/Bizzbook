
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
