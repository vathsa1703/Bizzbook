/**
 * License Expiry Checker Job
 * Resolution 5: Writes to license_expiry_alerts table (not console logs).
 * Company Profile's Licenses tab queries and displays dismissible banners.
 * Runs once on startup and then every 24 hours.
 */
const { getDb } = require('../config/db');

function runLicenseExpiryCheck() {
  const db = getDb();
  try {
    console.log('[LicenseExpiry] Running daily license expiry check...');

    // Find all licenses expiring within 30 days (across all companies)
    const expiringLicenses = db.prepare(`
      SELECT
        cl.id AS license_id,
        cl.company_id,
        cl.license_type,
        cl.license_number,
        cl.expiry_date,
        CAST(julianday(cl.expiry_date) - julianday('now') AS INTEGER) AS days_until_expiry
      FROM company_licenses cl
      WHERE
        cl.expiry_date IS NOT NULL
        AND julianday(cl.expiry_date) - julianday('now') BETWEEN 0 AND 30
        AND cl.status != 'expired'
    `).all();

    let upserted = 0;
    let alreadyExpired = 0;

    const upsertAlert = db.prepare(`
      INSERT INTO license_expiry_alerts
        (company_id, license_id, license_type, license_number, expiry_date, days_until_expiry, is_dismissed, dismissed_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
      ON CONFLICT(company_id, license_id) DO UPDATE SET
        days_until_expiry = excluded.days_until_expiry,
        expiry_date       = excluded.expiry_date,
        is_dismissed      = CASE WHEN excluded.days_until_expiry <= 0 THEN 0 ELSE is_dismissed END
    `);

    const markExpired = db.prepare(`
      UPDATE company_licenses SET status = 'expired'
      WHERE id = ? AND julianday(expiry_date) < julianday('now')
    `);

    for (const lic of expiringLicenses) {
      if (lic.days_until_expiry < 0) {
        // Already expired: update status
        markExpired.run(lic.license_id);
        alreadyExpired++;
      }
      upsertAlert.run(
        lic.company_id,
        lic.license_id,
        lic.license_type,
        lic.license_number,
        lic.expiry_date,
        lic.days_until_expiry
      );
      upserted++;
    }

    console.log(`[LicenseExpiry] Alerts upserted: ${upserted}, expired: ${alreadyExpired}`);
  } catch (err) {
    console.error('[LicenseExpiry] Error during check:', err.message);
  } finally {
    db.close();
  }
}

function startJob() {
  // Run once immediately on startup, then every 24 hours
  runLicenseExpiryCheck();
  setInterval(runLicenseExpiryCheck, 24 * 60 * 60 * 1000);
}

module.exports = { runLicenseExpiryCheck, startJob };
