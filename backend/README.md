# BizBook backend

## Stack and database

The backend runs on Node.js 22+ and Express. PostgreSQL is the only database
engine used by the application. `src/config/pgPool.js` creates a shared `pg`
pool from `DATABASE_URL` (preferred) or the local `PG*` settings.

`src/config/pgDb.js` provides query and transaction helpers. Application SQL
uses `?` placeholders, converted centrally to PostgreSQL `$1`, `$2`, etc.
`src/db/schema.postgres.sql` is the initial schema; versioned migrations and
reference-data seeding run from `pgDb.runPostgresMigrations()`.

## Local setup

Start PostgreSQL using the root `docker-compose.yml` (host port 5433), then:

```powershell
cd backend
npm install
Copy-Item .env.example .env
# Set JWT_SECRET and DATABASE_URL (or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)
npm run seed
npm run dev
```

The seed command applies the idempotent PostgreSQL bootstrap and migrations,
then verifies required tables and reference data. It does not create demo
users or business records. The server also applies pending schema migrations
before listening. `PORT` defaults to 5000 for the server; the startup health
validator expects it to be explicitly set, so local `.env` uses 5003.

Health check: `GET /api/health`.

## Environment variables

Required: `JWT_SECRET`, `DATABASE_URL` (or the complete `PG*` connection
settings), and `PORT` for startup validation. Render supplies `PORT`.

Optional: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CHAT_MODEL`, `WHISPER_MODEL`,
and `FRONTEND_URL`. AI routes can use fallback behavior without a provider key.

See `.env.example` for names and placeholder formats. Never commit real
credentials.

## Commands

- `npm start` — `node src/server.js`
- `npm run dev` — `nodemon src/server.js`
- `npm run seed` — PostgreSQL schema setup, migrations, and reference-data check
- `npm run validate-system` — database and startup validation
