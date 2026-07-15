# Architecture Guidelines: Anti-Regression Standards

To maintain system stability and prevent future feature modules from crashing core workflows (especially Authentication and Core Data), all future development must adhere to the following architectural guidelines.

## 1. Database Migrations & Schema
- **Single Source of Truth**: Every table, index, and core database structure MUST be defined in `backend/src/db/schema.sql` using `IF NOT EXISTS` syntax.
- **Idempotent Migrations**: Any modifications to existing tables (e.g., adding columns) MUST be done inside the `runMigrations()` function in `backend/src/config/db.js`.
- **Version Tracking**: Use the `schema_versions` table logic to ensure a migration runs exactly once. Do not use raw SQLite queries via REPL or standalone scripts to alter the production schema.

## 2. Module Isolation
- **No Tight Coupling**: Authentication (`auth.js`) must never import or depend on optional feature modules (e.g., Marketing, AI Assistant, Analytics). 
- **Graceful Degradation**: Optional modules must be wrapped in `try/catch` blocks during route registration (`backend/src/app.js`). If an optional module fails to compile or load, it must not prevent the server from starting.

## 3. Global Error Handling
- **No Uncaught Exceptions**: Route controllers must wrap logic in `try/catch` and pass errors to Express via `next(err)`.
- **Standardized Format**: Do not send generic HTML 500 error pages. The system uses a centralized error handler (`backend/src/middleware/errorHandler.js`) that returns a standard JSON structure:
  ```json
  {
    "success": false,
    "error": "Error details",
    "code": "ERROR_CODE"
  }
  ```

## 4. Startup Validation
- **System Validator**: `backend/src/services/systemValidator.js` must run successfully before the application starts listening for requests.
- **Pre-deployment Suite**: Always run `npm run validate-system` before merging or deploying code. If validation fails, the deployment should be aborted.

## 5. Frontend Resilience
- **Error Boundaries**: Wrap major component trees in `<ErrorBoundary />` to prevent blank screens when rendering crashes.
- **Graceful API Degradation**: `api/client.js` is equipped with automatic timeout handling and 500 error interception. Do not write localized network-failure handling unless specific behavior is required.

## 6. Environment Variable Protection
- **No Direct Overwrites**: No automated migration, validation script, or setup script should ever modify or overwrite `backend/.env` directly using file writing functions like `fs.writeFileSync`.
- **Safe Updater**: Any required programmatic updates to `.env` must be routed through `node src/scripts/update-env.js`, which strictly enforces the creation of timestamped backups (`.env.backup`) prior to modification.
