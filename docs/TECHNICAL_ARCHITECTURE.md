# BizBook / ORUDINA Technical Architecture

This document describes the code paths currently present in the repository. It is an implementation map, not a claim that every integration is production-enabled.

## 1. System overview

BizBook is a React/Vite client and Node.js/Express API deployed as one Render web service. The API serves the compiled frontend and `/api` routes from the same origin. PostgreSQL is the runtime database, accessed through `pg`. Optional AI paths use the OpenAI Node SDK against the configured OpenAI-compatible API base URL. A Capacitor Android packaging path shares the React client.

Primary source locations:

- Client bootstrap and shell: `frontend/src/main.jsx`, `frontend/src/App.jsx`
- Shared HTTP client: `frontend/src/api/client.js`
- API/server bootstrap and mounts: `backend/src/server.js`, `backend/src/app.js`
- PostgreSQL access: `backend/src/config/pgPool.js`, `pgDb.js`, `dbEngine.js`
- Schema/migration: `backend/src/db/schema.postgres.sql`, migration definitions in `pgDb.js`
- Deployment: root `render.yaml`

## 2. Component responsibilities

### Frontend

React pages compose operations areas; contexts provide auth/theme/AI UI state. The API client attaches a bearer token, handles JSON/error responses, and times out requests after 15 seconds. Web uses relative `/api`; Vite proxies it to port 5003. Native Capacitor detection selects the currently hardcoded `https://orudina.onrender.com/api` backend URL, which must track production domain changes. Vite emits `frontend/dist`, which Express serves.

### Express API

`app.js` installs JSON parsing and CORS, exposes `/api/health`, mounts the auth and invitation public paths, then applies authentication, branch scope, and RBAC to protected API routes. Core route load failures exit during app construction. Optional route load failures are represented by route-local 503 responses. Static frontend assets and the SPA fallback are registered after API mounts; unmatched API paths receive JSON 404s.

The route modules are grouped under `backend/src/routes` by auth, catalog/inventory, sales, workforce, marketing, AI, compliance, GST, trade, growth, reports, and administration. Service modules hold domain queries and calculations.

### PostgreSQL

`pgPool.js` lazily creates one `pg.Pool`. `DATABASE_URL` takes precedence; `PG*` discrete settings support local development. `pgDb.js` provides query/getOne/getAll and single-client transactions. SQL uses `?` placeholders at call sites; `toPgPlaceholders()` translates these centrally into PostgreSQL positional placeholders. `dbEngine.js` exposes query and executor helpers to business code.

The fresh-schema DDL is `backend/src/db/schema.postgres.sql`. `bootstrapPostgresSchema()` checks the `schema_versions` marker and applies the initial schema only when not bootstrapped. Numbered `PG_MIGRATIONS` run transactionally and are recorded in `schema_versions`; new schema changes should be represented in both the fresh schema and an incremental migration. The seed command verifies reference data and does not create demo business records.

The deployment configuration expects `DATABASE_URL` as a manually configured environment variable. The retained `orudina-db` declaration in `render.yaml` is not linked to the web service.

### Authentication and authorization

`authService.js` uses bcryptjs for password hashing and `jsonwebtoken` for JWT creation/verification. `JWT_SECRET` is read at module initialization and missing configuration throws. Tokens last seven days and include user/company/role claims. Middleware hashes the bearer token and reads its `sessions` row before allowing the request to continue; revoked sessions are denied. Lookup errors return 503 rather than trusting the JWT alone. Activity timestamp updates are periodic/best-effort.

After token authentication, branch middleware scopes access and RBAC evaluates roles/permission data. Permission query results are cached in process for five minutes with a user/company-scoped key. The database session table provides revocation state; the JWT itself remains stateless and signed.

## 3. Request lifecycle

1. Client sends an HTTP request to the same-origin API path (or configured native URL).
2. Express parses JSON and dispatches public authentication/invitation routes before the protected API gate.
3. Protected requests validate bearer JWT, verify the session row, then pass branch and role/permission checks.
4. A route validates the request and calls the domain service.
5. The service uses PostgreSQL query/executor helpers; a transaction pins a single client and commits on success or rolls back on error.
6. The response is JSON, a generated/exported file, or a centralized error response. Some mutations also persist domain events or jobs.

The global error handler is registered after API routes. Optional modules that failed during registration get a 503 fallback; missing endpoints get a JSON 404.

## 4. Authentication lifecycle

Signup/login routes verify credentials and use bcryptjs. Successful auth signs a seven-day JWT and stores session state in PostgreSQL. The client stores the token and attaches it to subsequent requests. Logout/session APIs update or revoke server-side session state. Each protected request checks both signature/expiry and the session hash. Missing/invalid token and revoked session return 401; inability to read session state returns 503. This keeps revocation enforcement dependent on database availability.

## 5. Database initialization and startup

The server imports `app.js` and background modules, then calls `validateSystem()` before `app.listen()`:

1. Validate `PORT` presence and mark AI configuration metadata from environment-variable presence.
2. Bootstrap PostgreSQL schema if `schema_versions` has no bootstrap marker.
3. Run numbered PostgreSQL migrations.
4. Execute a connectivity query and verify selected core tables.
5. Run a rollback-protected auth read/write transaction probe.
6. Mark health `healthy` or `degraded`.
7. In production, failed validation exits before listening. In non-production, the server can listen degraded. Healthy listener startup starts cron jobs, background/event polling, inventory event listening, and the automation engine.

The health endpoint is `GET /api/health`; it returns 200 only when status is `healthy`, otherwise 503 with component status JSON. AI status only means configuration was detected; no live provider request occurs during health validation.

### Local database commands

From repository root:

```powershell
docker compose up -d postgres
```

Then from `backend`, configure ignored `.env` using `backend/.env.example`, make its PostgreSQL settings match Compose, and set a local `JWT_SECRET`:

```powershell
npm install
npm run seed
npm run dev
```

`npm run seed` applies the bootstrap and migrations, verifies database connectivity and selected reference tables, and exits. The server also bootstraps/migrates at startup. `npm run validate-system` runs the validation script. None of these commands seed demo customers/users.

## 6. AI request lifecycle

`aiService.js` creates an OpenAI SDK client from `OPENAI_API_KEY` and `OPENAI_BASE_URL`. `CHAT_MODEL` controls chat/content completions; default is `openai/gpt-oss-120b`. The repo variable is named `OPENAI_API_KEY`, even when the configured endpoint is Groq-compatible; there is no `GROQ_API_KEY` reader.

For `/api/ai/chat`, the service loads company-scoped metrics, conditionally derives marketing opportunity context for strategic queries, loads recent chat history, sends prompts to the configured model, then stores user and assistant messages in `ai_chat_history`. When the API key is absent, this particular path uses a deterministic fallback response. Other AI paths may throw or return their own fallback depending on the caller.

Marketing campaign copy generation uses the shared provider settings and model. OCR uses Tesseract.js for image text extraction and then the model to structure fields and match products. Voice transcription converts uploaded WebM audio to WAV and calls the configured transcription model. Provider key presence is not a provider connectivity test.

## 7. Marketing intelligence lifecycle

Marketing Intelligence is principally database/rule-driven rather than an LLM deciding business facts:

1. PostgreSQL sales, customer, credit, product, and inventory records are queried by company.
2. SQL segmentation identifies cohorts such as VIP, at-risk, high-spend/low-frequency, frequent/low-value, new, and inactive customers.
3. Opportunity engines calculate revenue recovery, retention, dead stock, cross-sell and related signals from source records.
4. `marketingCron` runs nightly, rebuilds stored signals/knowledge-graph edges, and refreshes rule-based dashboard insights.
5. Marketing Copilot presents recommendations and can call campaign drafting through the configured LLM. Drafts are stored, then approval promotes them to the main campaign table.
6. Store-health scoring and channel ROI ranking provide additional marketing views. Campaign target/customer records and post-launch sales feed conversion and ROI calculations.

Some dashboard/fallback values and campaign predictions are deterministic estimates, not trained predictive models. Communication actions in worker handlers are currently simulated.

## 8. Automation and event lifecycle

`EventBusService.emit()` persists to `system_events`, assigns a correlation ID, then schedules in-process EventEmitter dispatch. Handlers mark events completed or failed. `AutomationEngine` loads active rules and subscribes handlers by event type. `JobQueueService` stores background jobs in PostgreSQL and claims ready jobs; `jobWorker` schedules a sweep every ten seconds and also retries stranded events. The inventory listener handles invoice-created events for low-stock detection. Marketing analysis is scheduled nightly at 02:00 using node-cron.

These mechanisms execute inside the same Node web process. There is no separate worker deployment, broker, or cross-instance distributed lock in the current Render blueprint. Horizontal web-service scaling therefore requires additional coordination before relying on singleton cron/polling behavior.

## 9. Domain modules

- **Operations:** products/groups, inventory, purchases, suppliers, sales, customers, credits, invoices, and communication/campaign records.
- **Dashboard/analytics:** data-service SQL summaries, cached insight records, branch/group comparisons, inventory signals, and revenue/profit reports.
- **Marketing:** segmentation, opportunities, recommendations, campaign draft/approval, ROI, signals, automations, and communication center.
- **Compliance:** profiles, applicable rules, tracked items, due dates, uploaded document metadata, reminders, meetings, and reports. It is an operational tracker, not legal advice.
- **HR/payroll:** employees, organization units, groups, attendance, leave, payroll, roles, and employee documents. `hrAIService` is deterministic/data-summary behavior and is not an LLM integration; letter generation is unavailable.
- **Trade:** country/authority/guideline reference data and workflows built around those references; no live legal/customs feed is evident in the code.
- **Growth/funding:** readiness, cap table, valuation/dilution calculations, investor records, funding, diligence, roadmap, IPO checklist, schemes, and advisor endpoints. `campaignPredictionService` and some growth values use heuristics/fixed assumptions.
- **Tasks/documents:** task routes and workforce tasks, invoice templates/exporters, GST exports, and employee/compliance/trade document flows.

## 10. Deployment architecture

`render.yaml` defines a Node web service with one build command that installs/builds the frontend then installs the backend, and one start command (`node backend/src/server.js`). Express serves `frontend/dist`, so this Blueprint is a single-origin deployment. The configured health check is `/api/health`; Render provides `PORT`.

The service needs a manually configured `DATABASE_URL` for the new BizBook database; the YAML marks it `sync: false`. The existing database resource block is retained but not connected. Before Blueprint synchronization, review Render's displayed changes and preserve unrelated services/databases. Never paste production secrets into this repository.

## 11. Security architecture

- Password hashing via bcryptjs; signed expiring JWTs; server-side revocation through hashed session identifiers.
- Authentication and database lookup fail closed; company/branch scope and permission middleware guard protected APIs.
- Environment variables carry JWT/database/provider secrets; `.env` is gitignored while `.env.example` is tracked.
- AI/OCR has rate-limit middleware. Other endpoint-level rate limiting should be reviewed for public exposure.
- CORS is currently initialized with default `cors()` settings. Narrow origins if the API becomes separately hosted or exposed beyond the same-origin deployment.
- Upload paths use service filesystem storage. Production needs an explicit persistence, retention, and access policy.
- Avoid logging credentials; ensure provider/client error logging remains free of authorization headers and secrets.

## 12. Failure handling

- Missing `JWT_SECRET` throws while auth modules load, preventing successful app initialization.
- Database bootstrap, migration, connection, core-table, or auth-probe failure marks startup invalid; production exits before `app.listen()`.
- `/api/health` returns 503 until system status is healthy.
- Session lookup errors return 503; invalid/expired/revoked tokens return 401.
- Optional route import failures register a local 503 response; core route import failures exit.
- AI route errors are logged and generally become HTTP 500; frontend catches some AI errors and may show generic connection copy. Provider availability/model permission is not checked at startup.
- Queue/event handler failures are recorded on the event/job and logged; retries/sweeps are process-local.

## 13. Scalability considerations

- A shared connection pool and company-scoped queries support a single API process, but pool limits/timeouts and database capacity should be tuned against load.
- In-process cron, worker polling, event dispatch, and in-memory permission/opportunity caches are not coordinated across multiple web instances. A separate worker role and shared queue/lock strategy are needed before horizontal scaling.
- File uploads on the service filesystem need durable object storage before relying on restart survival or multiple instances.
- The frontend build currently has a large main chunk; code splitting can reduce initial download cost.
- API health validation does not include provider checks, communication delivery, or every optional module's data path; monitoring should add external dependency probes without making core readiness misleading.

## 14. Current technical debt

- `sqlite3` is still a backend runtime dependency even though the active startup DB path is PostgreSQL; some legacy/unwired files/comments still mention or use SQLite APIs.
- AI key/model configuration health reports presence rather than validating a provider request. Fallback/mock responses can look like successful assistant responses.
- Marketing estimates and campaign prediction values are partly fixed/heuristic; they should be labeled as planning estimates in product output.
- HR assistant/letter behavior is limited and should not be presented as general AI functionality.
- Communication handlers are mock/simulated rather than connected to real SMS/WhatsApp/email delivery providers.
- Event and scheduled work run within the web server process and are not safe to assume exactly-once across multiple instances.
- Upload persistence and retention are based on local filesystem code paths.
- Default permissive CORS should be reviewed for the actual deployment topology.
- The frontend bundle size warning remains.

## 15. Future architecture improvements

These are recommendations, not current implementations:

1. Move uploads to private object storage with lifecycle/backup policies.
2. Split scheduled/queue processing into an independently scalable worker and use distributed queue locking or a managed broker.
3. Add provider readiness/AI smoke checks, operational metrics, and alerts without exposing secrets.
4. Replace simulated messaging with explicitly configured, consent-aware providers and delivery tracking.
5. Remove obsolete SQLite dependency/code after complete reference and deployment verification.
6. Label heuristic projections and distinguish measured outcomes from estimates throughout APIs/UI.
7. Narrow CORS, add comprehensive API rate limits, and document retention/backup/disaster-recovery policies.
8. Split frontend bundles and add deployment-level browser/API smoke checks.
