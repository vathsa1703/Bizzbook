# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BizBook — an AI-powered Business Operating System for Indian SMEs, not just a POS or billing app. What
started as an "AI Voice Business Assistant" MVP (see `backend/README.md` / `frontend/README.md` — both
are stale status docs from the early prototype) has grown into a full multi-tenant ERP: sales, inventory,
purchases, GST invoicing/filing, HR/payroll, marketing and spend intelligence, automation, and an LLM
chat/insights layer on top. Don't trust the "Not built yet" sections in those READMEs — check
`backend/src/routes/` for what actually exists (see Documentation Rules below).

## Product Philosophy

BizBook is a Business Operating System, not a billing tool with AI bolted on. Every feature should map to
at least one of these goals — if it doesn't, question whether it belongs:
- **Increase Revenue**
- **Save Time**
- **Reduce Costs**
- **Improve Business Decisions**
- **Improve Customer Retention**

AI assists business operations; it never *is* the business logic. All deterministic calculations — GST,
ROI, AOV, LTV, payroll, accounting, permissions, and analytics of any kind — must always live in backend
services and run as real code/SQL. The LLM's job is limited to turning numbers that deterministic backend
code already selected and computed into a sentence — it does not decide what to look up itself (see "The
AI layer never does arithmetic" under Architecture for what actually decides that).

## UI Philosophy

The application is designed for **non-technical business owners** — shopkeepers, not developers.

Never design interfaces that resemble workflow/automation builders: no node-graph canvases, no
drag-and-drop flowcharts, nothing that looks like Zapier, n8n, Langflow, Node-RED, or a generic AI
workflow builder. Automations (`AutomationForm.jsx`, `AutomationTemplates.jsx`) must be configured through
forms and templates, not a visual graph editor, even though the backend implements them as event → condition
→ action rules.

Prefer, in this order of familiarity to a shop owner:
- Dashboards and stat cards
- Tables
- Forms
- Guided wizards (see `SetupWizard.jsx` for the pattern)
- Plain business terminology (₹, GST, stock, customers, invoices) over technical terms (events, webhooks,
  triggers, payloads)

Every screen and workflow should be understandable in under 10 seconds without training.

## Documentation Rules

When the code and the docs disagree, trust the code. In order of authority:
1. **Current codebase** — routes, services, schema.sql, migrations. Always the ground truth.
2. **This file (CLAUDE.md)**
3. **`docs/*`** (if present)
4. **Database migrations** (`backend/src/config/db.js` `runMigrations()`) — the most reliable signal for
   what's actually been built and in what order, since it's append-only and can't silently go stale the
   way prose docs can.
5. **Architecture contracts** (`architecture_guidelines.md`)

Do **not** rely on `backend/README.md` or `frontend/README.md` when they conflict with the implementation —
both contain "Not built yet" checklists that are already known to be wrong (e.g. customer detail view and
sale creation are both built despite the frontend README claiming otherwise). Treat them as historical
color, not a task list or a spec.

## Development Rules

Before implementing any feature:
1. Analyze the relevant architecture first (read the services/routes/schema involved — don't guess).
2. Explain the implementation plan before writing code.
3. Identify affected files.
4. Mention risks (migrations, shared services, multi-tenant scoping, RBAC).
5. If the change requires altering existing architecture (schema shape, module boundaries, the event/job
   system, auth) — wait for explicit approval before proceeding.
6. Implement only the requested scope. Don't opportunistically refactor unrelated code in the same change.
7. After implementing, run a regression review: does this break multi-tenant scoping, RBAC, GST math, or an
   existing consumer of a service you touched?

Minimize unnecessary file edits. Never rewrite working architecture without explicit approval — extend it
instead (see Engineering Principles).

## Engineering Principles

- Never duplicate business logic. If two features need "revenue for last N days," they call the same
  function — they don't each write their own SQL.
- Reuse existing services whenever possible. Check `services/` before writing a new calculation.
- Maintain a single source of truth for ROI, Margin, AOV, LTV, Confidence, Permissions, Branch Scope, GST
  calculations, and analytics. Concretely: `marketingMetricsService.js` for AOV/LTV/margin/confidence,
  `gstEngine.js` for all tax math, `BranchScopedQuery.js` for branch filtering, `middleware/auth.js` for
  permissions — don't reimplement any of these inline in a route or a new service.
- Preserve backward compatibility. Additive schema changes (`IF NOT EXISTS`, new nullable columns via
  numbered migrations) over breaking ones.
- Prefer extending an existing module (add a function to `dataService.js`, add a migration, add a tool
  schema) over creating a parallel implementation of something that already exists.

## Commands

Backend (`backend/`):
```bash
npm install
cp .env.example .env              # then fill in OPENAI_API_KEY etc. — this is the ACTIVE config file
npm run seed                      # generates data/business.db with mock data (src/db/seed.js)
npm run dev                       # nodemon src/server.js — default PORT 5003
npm run validate-system           # node src/scripts/validate-system.js — run before merging/deploying
```

Frontend (`frontend/`):
```bash
npm install
cp .env.example .env
npm run dev                       # Vite dev server, http://localhost:5173, proxies /api -> localhost:5003
npm run build
npm run preview
```

There is no automated test runner and no linter/formatter configured (no `test` script in either
`package.json`, no `.eslintrc*` anywhere in the repo) — don't assume `npm test` or `npm run lint` exist.

For manual local poking, use `backend/scratch/*.js` (`inspect_db.js`, `login_test.js`,
`reset_admin_password.js`) and `backend/get_token.js` — these reference real, current modules and are the
closest thing this repo has to dev tooling. Do **not** use the repo-root `run_validation.js` /
`dynamic_validation.js` scripts or their `*_results.json`/`*_results.txt` output files — they are broken
and obsolete (see Known Footguns).

Single most important local sanity check after any backend change: `npm run validate-system`, then hit
`GET /api/health` (checks DB connection, migrations, AI config, auth read/write).

## Architecture

### Two independent apps, one repo
`backend/` (Express + `node:sqlite` `DatabaseSync`) and `frontend/` (Vite + React, no router — tab-based
SPA). They only talk over HTTP; the frontend's `src/api/client.js` is the sole place that calls `fetch`.

### Request flow, or "read top to bottom"
`server.js` → `app.js` (route mounting + RBAC) → `routes/*.js` (thin controllers) → `services/*.js`
(business logic, all SQL lives here) → `config/db.js` (schema + migrations). Routes should not contain raw
SQL or business rules — that belongs in a service (see Module Isolation below).

### Database: single SQLite file, schema.sql + numbered migrations
- **`backend/data/business.db` is the only active database.** (Two other `.sqlite` files exist in the repo
  and are stale — see Known Footguns. Never point tooling at them.)
- Schema defined in `backend/src/db/schema.sql` using `CREATE TABLE IF NOT EXISTS` (never destructive).
- `backend/src/config/db.js` `getDb()` runs the schema file, then `runMigrations(db)`, on **every** call —
  migrations are idempotent and tracked in a `schema_versions` table (currently at version 28). Each
  migration is a numbered `if (!hasVersion(N))` block that adds columns via `addColumnIfNotExists` or
  creates new tables, wrapped in its own transaction with rollback on failure.
- **To change schema**: add the table/column to `schema.sql` (idempotent `IF NOT EXISTS`) AND, if altering
  an existing table with real data, add a new numbered migration block in `runMigrations()`. Never hand-edit
  the `.db` file or run ad hoc `ALTER TABLE` outside this system — see `architecture_guidelines.md`.
- `getDb()` returns a fresh connection per call; callers are expected to `db.close()` when done (see any
  service function for the pattern).

### Multi-tenancy and branch scoping
Every business table carries `company_id` (see migration 11). Most business tables additionally carry
`branch_id` (migration 17) for multi-store companies. The scoping chain:
1. `middleware/auth.js` — verifies JWT, attaches `req.user` (`userId`, `companyId`, `role`), checks the
   `sessions` table for revocation.
2. `middleware/branchAuth.js` — reads `X-Branch-ID` header, computes `req.scopeContext` (`{ type: 'global'
   | 'multi-branch' | 'branch', companyId, branchId?, allowedBranches }`) based on the user's role/assigned
   branches.
3. Service-layer queries call `utils/BranchScopedQuery.js`'s `withBranchScope(sql, params, scopeContext,
   branchColumn)` to append the right `AND branch_id ...` clause. The base SQL passed in must already filter
   `company_id = ?` itself — `withBranchScope` only adds the branch predicate.
4. RBAC on top of that: `app.js`'s `rbacMiddleware` enforces coarse rules (only admins/OWNER/MANAGER can
   DELETE, manage employees/suppliers); `middleware/auth.js`'s `requirePermission(action)` does granular
   permission checks against `user_roles` → `role_permissions` → `permissions` (Phase 2 RBAC, 5-min
   in-memory cache), falling back to legacy role checks for modules not yet migrated to granular perms.

### Route registration is fail-safe by design
`app.js` mounts **45 route files total** via two helpers: `registerCoreRoute` (crashes the process on load
failure — 10 files: auth, gst-master, product-groups, analytics, sales, customers, products, jobs,
automations, communication) vs `registerOptionalRoute` (catches load errors, logs a warning, and mounts a
503 stub instead of taking down the server — the other 35 files: AI, OCR, marketing (+ marketing-copilot),
HR/employee modules, GST filing/states, compliance, trade, growth, and the rest of the business-domain
routes). When adding a new feature module's route, default to `registerOptionalRoute` unless it's genuinely
core.

### Module isolation & dependency boundaries
- **Auth is untouchable.** Per `architecture_guidelines.md`: `middleware/auth.js` / `services/authService.js`
  must never import or depend on optional feature modules (Marketing, AI, Analytics, HR). A bug in an
  optional module must never be able to break login or session validation.
- **Optional modules degrade, core modules don't.** See Route registration above — this is enforced at the
  `app.js` mounting layer, not by convention alone.
- **Layering**: routes are thin controllers; all SQL and business logic lives in `services/`. Don't write
  raw SQL in a route file.
- **Frontend network boundary**: `frontend/src/api/client.js` is the only file allowed to call `fetch`.
  This is what makes the global 401-logout and 500-alert interception (`architecture_guidelines.md` §5)
  actually work everywhere — bypassing it with a local `fetch` call breaks that guarantee.

### The AI layer never does arithmetic
This is the one rule everything else defers to: the LLM never computes business numbers itself. In this
codebase that's achieved via **static context injection, not live tool/function-calling** — deterministic
backend code (`metricsService.js`, `marketingEngine.js`, a keyword-matched `isStrategicQuery()` check in
`aiService.js`) decides up front what data to fetch, formats it into a fixed-shape text block, and pastes
it into the prompt before the single chat-completion call is made. The LLM only turns that pre-assembled
context into a sentence; it never chooses what to query and the completion call is made without `tools`/
`tool_choice`. (An earlier `tools/toolDefinitions.js` sketched a function-calling schema for this, but it
was never wired to an agent loop — no `aiAgent.js` ever existed — and has been removed as dead code.) See
the AI Subsystem Breakdown below for how this plays out across all four AI integration points.

### AI subsystem breakdown
There are **four distinct LLM integration points** — don't assume there's a single "the AI":
1. **Chat AI** (`services/aiService.js`, `callLLM`) — the main business advisor behind the chat FAB/`/api/ai`
   endpoints. Uses the OpenAI-compatible client (Groq/OpenRouter/Ollama via `OPENAI_BASE_URL` +
   `OPENAI_API_KEY` + `CHAT_MODEL`). Builds a `BUSINESS SNAPSHOT` context block from `metricsService.js`,
   routes "strategic" queries (keyword-matched) through the Marketing Opportunity Engine, and persists chat
   history per `company_id`/`session_id`. Falls back to a canned mock response when `OPENAI_API_KEY` is
   unset — check `/api/health`'s `ai.fallback_mode` if responses look generic/repetitive.
2. **Marketing AI** (`services/marketingAI.js`) — same OpenAI-compatible client as Chat AI. Takes a detected
   opportunity (from `marketingEngine.js`) plus an objective, and generates a structured campaign (a
   "Business Consultant" report + marketing message) as JSON, explicitly instructed to ground every claim in
   the evidence passed in rather than invent numbers.
3. **HR AI** (`services/hrAIService.js`) — **deterministic, not LLM-backed.** It previously attempted a
   Google Gemini call, but `@google/generative-ai` was never added to `backend/package.json`, so that path
   always threw and every caller silently landed on rule-based logic. That Gemini code has since been
   removed entirely — the rule-based leave-risk scorer and the live-data HR chat context echo are now the
   real, intended implementation, not a fallback for a missing key. Don't assume HR AI shares Chat AI's
   provider or is LLM-backed.
4. **OCR parsing** (`parseOCR` in `services/aiService.js`) — same OpenAI-compatible client as Chat AI. Takes
   raw OCR text and extracts structured line items/totals/supplier info as JSON. This is a second
   responsibility bolted onto `aiService.js`, not a separate file — the image-to-text step happens in
   `ocrService.js` (see OCR Architecture below), separately from this text-to-JSON step.

To add a new AI capability: write the deterministic function in `dataService.js` (or `metricsService.js`/
`marketingEngine.js` for the Chat AI context) first, then have the relevant context-building function
(e.g. `buildAIContext()` in `aiService.js`) call it and format the result into the prompt — never let the
model free-form a number. There is no tool/function-calling agent loop to register a schema with.

### Marketing Intelligence architecture
A "detect → score → act" pipeline for growth opportunities, separate from ad hoc chat:
- `services/segmentationEngine.js` — pure SQL customer segmentation (VIP, At-Risk, High-Spend-Low-Frequency,
  Frequent-Low-Value, New, Inactive). The file's own header comment states the rule: "AI never selects
  customers — only SQL does."
- `services/marketingMetricsService.js` — the single shared source for AOV, LTV, margin, campaign
  performance, and confidence scoring (`getStoreEconomics`, `getConfidenceScore`, `getCampaignPerformance`),
  used by every other marketing/spend engine so these numbers are computed identically everywhere. This is
  the file to extend, not duplicate, if a new feature needs one of these metrics.
- `services/marketingEngine.js` — the Opportunity Engine: scans for Revenue Recovery (overdue credits),
  Customer Retention risk, Dead Stock, and Cross-Sell opportunities, each scored with confidence/urgency and
  three-tier impact estimates (conservative/expected/optimistic), cached per company for 1 hour
  (`getMarketingOpportunities`, `invalidateOpportunityCache`). This is what Chat AI injects for "strategic"
  queries and what Marketing AI turns into a campaign.
- `services/roiEngine.js` — campaign-level ROI (`calculateCampaignROI`): actual revenue attributed to a
  campaign's target list post-launch vs. `campaign_cost`.
- Persistence: `marketing_signals` (detection-engine outputs) and `knowledge_graph_edges` (a lightweight
  relationship graph, e.g. `customer is_at_risk`) — see `schema.sql`'s "PHASE 0: MARKETING SIGNAL ENGINE"
  section.

### Spend Intelligence architecture
`services/spendIntelligenceEngine.js` (~716 lines, the largest service file in the repo) sits on top of
Marketing Intelligence and answers "where should marketing budget go":
- `calculateStoreHealthScore` — a weighted A–F composite grade from spend efficiency/ROI (40%), customer
  retention trend sourced from `knowledge_graph_edges` (30%), coupon-redemption engagement (15%), and survey
  sentiment (15%).
- `getChannelROIRanking`, `getSuggestedBudgetSplit`, `getSegmentSpendPriority` — allocate/rank spend across
  channels and customer segments, built on the shared metrics from `marketingMetricsService.js`.
- `getBreakEvenCalculator`, `getWeeklyRecommendation`, `getPostSpendReportCards`, `getDoNotSpendFlags` —
  tactical outputs surfaced on the frontend's Spend Intelligence page.
- Like the rest of Marketing Intelligence, this entire file is deterministic SQL/JS — there is no LLM call
  inside it.

### Event Bus
`services/EventBusService.js` wraps Node's `EventEmitter`, persisted to a `system_events` table for
durability:
- `emit(companyId, eventType, entityId, payload, correlationId?)` writes a `pending` row to
  `system_events`, then dispatches to in-memory subscribers via `setImmediate` (so the emitting request
  isn't blocked). Returns/generates a `correlationId` used to trace a chain of downstream effects across the
  Automation Engine and Job Queue.
- `subscribe(eventType, handler)` wraps the handler so success marks the event `completed` and a thrown
  error marks it `failed` — the event row persists either way for audit/debugging.
- `sweep()` re-dispatches events stuck in `pending` for >1 minute (e.g. server crashed mid-handler). Called
  from `workers/jobWorker.js`'s poll loop alongside `jobQueueService.sweep()` — not a separate cron.
- Event type constants live in `constants/events.js` (e.g. `INVOICE_CREATED`, `INVENTORY_LOW`,
  `CUSTOMER_CREATED`, `CAMPAIGN_COMPLETED`).

### Automation Engine
`services/AutomationEngine.js` is the primary consumer of the Event Bus:
- On `init()`, loads active rows from `marketing_automations`, groups them by `event_type`, and subscribes
  to each unique event type on the Event Bus.
- `evaluateEvent` filters rules by `company_id`; `evaluateConditions` checks a fixed JSON condition shape
  (`{ field: { gt, lt, eq, includes } }`) against the event payload — there is no general expression
  language, only these four operators.
- On match, enqueues a job on the Job Queue with `delayMinutes`, and writes an audit row to
  `automation_execution_logs`. Idempotency key is `auto_{ruleId}_{correlationId}`, so the same triggering
  event can't double-fire the same rule.
- `reloadAutomations()` must be re-invoked if `marketing_automations` rows change at runtime — there is no
  DB-level watch/trigger for this. `routes/automations.js` does call it after create and after toggle, so
  new/updated automations go live without a restart as long as that route stays the only write path.
- Per UI Philosophy: automations are authored via forms/templates in the frontend
  (`components/automations/AutomationForm.jsx`, `AutomationTemplates.jsx`), never a visual node-graph editor,
  even though the underlying model is event → condition → action.

### Background Job Queue
`services/JobQueueService.js` is a polling-based queue backed by the `background_jobs` table — there is no
external queue (Redis/SQS/etc.):
- `enqueue({ companyId, type, payload, priority, correlationId, idempotencyKey, delayMinutes })` inserts a
  `pending` row; a `UNIQUE` constraint on `idempotency_key` makes duplicate enqueues a no-op.
- `claimJobs(limit)` selects and locks (`status = 'processing'`) due jobs ordered by priority; `sweep()`
  (driven by `workers/jobWorker.js`'s poll loop) claims and processes a batch.
- `processJob` looks up a handler registered via `registerHandler(jobType, handler)` (job types in
  `constants/jobs.js`, e.g. `communications.send_email`) — **a job type with no registered handler throws
  and gets retried/dead-lettered, it does not silently no-op.**
- Failure handling: exponential backoff (`attempts² × 5` minutes) via `retryJob` until `max_attempts` is
  hit, then `markDead` moves it to `status = 'dead'` (kept, not deleted — inspect
  `background_jobs WHERE status = 'dead'` to debug stuck automations).
- `workers/jobWorker.js` and `listeners/inventoryListener.js` are where handlers actually get registered and
  the poll loop started; both are started from `server.js` only on a healthy boot (`validateSystem()`
  passing).

### GST domain logic
India-specific tax logic is centralized in `services/gstEngine.js` (rate lookup, CGST/SGST vs IGST split
based on company vs. customer state code, HSN/UQC handling) and consumed by invoice creation and the GST
Filing module (`services/gstFilingService.js`, `routes/gstFiling.js`, `exporters/gst*Exporter.js` for
CSV/Excel/JSON GSTR exports). `data/gstStates.json` and the `gst_hsn_master`/`gst_uqc_master` tables
(migration 10) back state-code and HSN-rate lookups respectively. This is the single source of truth for
GST math — nothing else in the codebase should compute CGST/SGST/IGST independently.

### Invoice PDF generation pipeline
- `services/pdfService.js` renders `templates/invoice_template.ejs` (an EJS template that loads Tailwind
  from a CDN `<script>` tag — the Puppeteer-controlled page needs network access at render time) via
  **Puppeteer** (headless Chromium) into a PDF, writing to `backend/data/invoices/`.
- If `templates/invoice_template.ejs` is missing on disk, `pdfService.js` writes a default template there on
  first use — the template file may legitimately not exist until the first invoice is ever generated.
- Puppeteer downloads a full Chromium binary on `npm install` — the heaviest dependency in the backend;
  factor this into install time and any future container/deploy size decisions.
- All tax math (GST split, totals) is computed by `services/gstEngine.js` *before* the snapshot reaches
  `pdfService.js` — the PDF layer only renders a pre-computed snapshot, it never calculates tax itself.

### OCR architecture (Node + Python, dual-engine)
`services/ocrService.js` extracts text from an uploaded receipt/invoice image using two engines:
1. **Primary: PaddleOCR via Python** — `ocrService.js` shells out
   (`child_process.execFile('python', ...)`) to `backend/src/scripts/run_ocr.py`, which requires a `python`
   executable on PATH with PaddleOCR installed. This is the **only** place in the backend that depends on a
   Python runtime — local dev setup needs Python even though the rest of the stack is Node.
2. **Fallback: Tesseract.js** — if the Python call fails for any reason (missing Python, missing PaddleOCR,
   script error), `runTesseract` retries with the pure-JS `tesseract.js` library, using
   `backend/eng.traineddata` (English model) at the backend root.
3. Pipeline order (see `routes/ocr.js`): image → `ocrService.extractTextFromImage` (text) →
   `aiService.parseOCR` (LLM call, structured JSON) → `matchProducts` (fuzzy-match extracted line items
   against existing `products` by name) → returned to the frontend's `ScanModal.jsx` for user review before
   anything is committed to the database.

### Error handling contract
Route handlers should `try/catch` and call `next(err)`; `middleware/errorHandler.js` is the single place
that formats the JSON error response (`{ success: false, error, code }`) — don't send raw HTML errors or
ad hoc error shapes from a route.

### Environment file safety
Per `architecture_guidelines.md`: never overwrite `backend/.env` via `fs.writeFileSync` from a script.
Programmatic env updates must go through `node src/scripts/update-env.js KEY=VALUE ...`, which always
writes a timestamped backup (`backend/.env.<timestamp>.backup`) before touching the file and prompts for
confirmation. `backend/.env` is the only `.env` the running app reads — see Known Footguns for the legacy
root-level `.env`.

### Frontend structure
No router — `App.jsx` holds a `tab` string in state and an object map (`PAGES`) from tab name to page
component; `BottomNav` and page components call `onNavigate(tab)` to switch. Auth gates the whole tree
(`context/AuthContext.jsx`); unauthenticated users see `BusinessSelection` → `Login`/`Register`, then an
optional post-signup `SetupWizard` (rendered outside the normal app shell, no `BottomNav`) before landing on
`PAGES`. `contexts/AIContext.jsx` + `hooks/useAIChat.js` back the floating `ChatFAB`/`ChatModal` assistant
available on every authenticated page. `src/api/client.js` is the only file that touches `fetch`; it
auto-injects the JWT bearer token, has a 15s abort timeout, force-logs-out on 401, and (dev/demo aid) can
backfill empty API responses with mock data from `api/placeholders.js` keyed by the selected `businessType`
in `localStorage` — be aware of this when a page "shows data" against a fresh/empty backend.

## Known Footguns & Legacy Artifacts

**Database files — only one is live:**
- `backend/data/business.db` — **ACTIVE.** The only file `config/db.js`'s `DB_PATH` points at; all schema
  and migrations run against this file.
- `backend/data/database.sqlite` — **STALE.** An older snapshot, not written to by the running app. Don't
  read from or point tooling at it.
- `backend/database.sqlite` — **STALE/EMPTY** (0 bytes). Not referenced by any code path.

**Frontend entry point — two `App.jsx` files exist:**
- `frontend/src/App.jsx` — **ACTIVE.** Imported by `main.jsx`; this is the real tab-routing shell described
  under Frontend structure.
- `frontend/src/components/App.jsx` — **DEAD CODE.** Not imported anywhere (verified). Don't edit it
  expecting it to affect the running app, and don't treat it as a reference for current app structure.

**Migration / seed scripts — two of each exist:**
- `backend/src/db/seed.js` — **ACTIVE**, wired to `npm run seed`.
- `backend/seed_demo.js` (repo root) — **LEGACY**, not wired to any npm script. Confirm with the user before
  running it; it may be out of sync with the current schema.
- `backend/src/scripts/migrate.js` — the canonical location for manual-migration tooling alongside the
  other `src/scripts/*` utilities.
- `backend/migrate.js` (repo root) — **LEGACY**, a separate/older script. Do not assume it matches the
  numbered migrations in `config/db.js`. Schema changes always go through `schema.sql` +
  `runMigrations()`, not either of these standalone scripts.

**Validation/audit scripts at repo root — broken, not part of the supported workflow:**
- `run_validation.js`, `dynamic_validation.js`, and their output files (`backend_audit_results.json`,
  `campaign_audit_results.json`, `validation_results.txt`, `dynamic_validation_results.txt`) are one-off
  audit scripts, not a test suite.
- `run_validation.js` is confirmed **broken**: it `require()`s `backend/src/services/gstService`, which
  does not exist (the real module is `gstEngine.js`). Don't run it expecting a meaningful result, and don't
  copy it as a pattern for new tooling.
- The supported "does this work" checks are `npm run validate-system` and `GET /api/health`. For manual
  poking, use `backend/scratch/*.js` and `backend/get_token.js` instead (see Commands).

**Environment files — two `.env` files exist:**
- `backend/.env` — **ACTIVE.** Loaded via `require('dotenv').config()` in `backend/src/server.js`.
  `PORT=5003` by default; this is what the running backend and the Vite dev proxy both target.
- `.env` (repo root, `PORT=5002`) — **LEGACY.** No code path in the running backend or frontend loads it
  (there's no root `package.json`). Don't treat it as configuration for the app.

**Other loose ends:**
- `backend/src/routes/sales.js.bak` — a stray backup file, not loaded by Express.
- `backend/src/services/hrAIService.js` calls Google's Gemini SDK (`@google/generative-ai`) directly, but
  that package is **not listed in `backend/package.json`** and is not installed. The `require()` is wrapped
  in try/catch, so it fails silently and HR AI always falls back to its rule-based leave-risk scorer — it is
  not currently LLM-backed in practice, despite the code path existing. Don't assume it shares Chat AI's
  provider.
- SQLite access is the built-in `node:sqlite` `DatabaseSync` (synchronous, Node ≥22.5 required per
  `package.json` `engines`), not the `sqlite3` npm package — despite `sqlite3` being a listed dependency.
- **`FOREIGN KEY` constraints ARE enforced, not advisory.** `node:sqlite`'s `DatabaseSync` defaults
  `PRAGMA foreign_keys` to **ON** — confirmed directly by querying it on a fresh instance. This is
  different from the `better-sqlite3`/`sqlite3` npm bindings (default OFF), which is where the
  "SQLite doesn't enforce FKs" assumption usually comes from — it does not hold here. No code in the
  live path sets this pragma explicitly (`backend/seed_demo.js` toggles it, but that script is
  unwired legacy, never run by the app — see Migration/seed scripts above). Concretely: binding an
  empty string or any other non-matching value into an FK column (e.g. `department_id`, `manager_id`)
  throws `FOREIGN KEY constraint failed` at write time — route handlers must convert `''`/`undefined`
  to real `NULL` for optional references, not rely on `?? null` (which doesn't catch `''`) or assume
  the constraint is a no-op.
- No linter/formatter is configured anywhere in the repo (no `.eslintrc*`) — don't assume a `lint` script
  exists or invent a config unless asked.
