/**
 * License Expiry Checker Job
 * Resolution 5: Writes to license_expiry_alerts table (not console logs).
 * Company Profile's Licenses tab queries and displays dismissible banners.
 * Runs once on startup and then every 24 hours.
 */
const { dbGet, dbAll } = require('../config/dbEngine');

async function runLicenseExpiryCheck() {
  try {
    console.log('[LicenseExpiry] Running daily license expiry check...');

    const daysUntilExpr = `(cl.expiry_date::date - CURRENT_DATE)`;

    // Find all licenses expiring within 30 days (across all companies)
    const expiringLicenses = await dbAll(`
      SELECT
        cl.id AS license_id,
        cl.company_id,
        cl.license_type,
        cl.license_number,
        cl.expiry_date,
        ${daysUntilExpr} AS days_until_expiry
      FROM company_licenses cl
      WHERE
        cl.expiry_date IS NOT NULL
        AND ${daysUntilExpr} BETWEEN 0 AND 30
        AND cl.status != 'expired'
    `);

    let upserted = 0;
    let alreadyExpired = 0;

    for (const lic of expiringLicenses) {
      if (lic.days_until_expiry < 0) {
        // Already expired: update status
        await dbGet(`UPDATE company_licenses SET status = 'expired' WHERE id = ? AND expiry_date::date < CURRENT_DATE`, [lic.license_id]);
        alreadyExpired++;
      }
      await dbGet(`
        INSERT INTO license_expiry_alerts
          (company_id, license_id, license_type, license_number, expiry_date, days_until_expiry, is_dismissed, dismissed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(company_id, license_id) DO UPDATE SET
          days_until_expiry = excluded.days_until_expiry,
          expiry_date       = excluded.expiry_date,
          -- The ELSE branch must be table-qualified: inside ON CONFLICT DO
          -- UPDATE SET, both the existing row and the proposed 'excluded' row
          -- are in scope, so a bare is_dismissed is an ambiguous reference and
          -- the whole upsert errors out. Qualifying with the table name pins
          -- it to the EXISTING row, which is the intent: a still-valid
          -- license keeps whatever dismissal state the user already chose,
          -- and only an expired one (days <= 0) resets it so the banner
          -- comes back.
          is_dismissed      = CASE WHEN excluded.days_until_expiry <= 0 THEN false ELSE license_expiry_alerts.is_dismissed END
      `, [lic.company_id, lic.license_id, lic.license_type, lic.license_number, lic.expiry_date, lic.days_until_expiry, false]);
      upserted++;
    }

    console.log(`[LicenseExpiry] Alerts upserted: ${upserted}, expired: ${alreadyExpired}`);
  } catch (err) {
    console.error('[LicenseExpiry] Error during check:', err.message);
  }
}

function startJob() {
  // Run once immediately on startup, then every 24 hours
  runLicenseExpiryCheck();
  setInterval(runLicenseExpiryCheck, 24 * 60 * 60 * 1000);
}

module.exports = { runLicenseExpiryCheck, startJob };
