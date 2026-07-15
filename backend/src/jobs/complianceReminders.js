/**
 * Compliance Reminder Engine
 * Runs daily (same pattern as licenseExpiryChecker): scans every company's active
 * compliance items and raises dashboard notifications at 90/60/30/15/7/3/1-day
 * windows plus 'expired'. Reuses the existing `notifications` table (surfaced by
 * /api/notifications and the notification bell). Idempotent: a compliance_events
 * 'reminder_sent' marker per (item, window) prevents duplicate reminders.
 *
 * Email / WhatsApp / SMS channels are future work — the spec lists them as such —
 * so this generates the dashboard channel now and leaves a single well-defined
 * emission point to extend.
 */
const { getDb } = require('../config/db');

const THRESHOLDS = [1, 3, 7, 15, 30, 60, 90]; // ascending

function bucketFor(daysRemaining) {
  if (daysRemaining < 0) return 'expired';
  for (const t of THRESHOLDS) if (daysRemaining <= t) return String(t);
  return null; // more than 90 days away — no reminder yet
}

function ownerUserId(db, companyId) {
  const c = db.prepare('SELECT owner_user_id FROM companies WHERE id = ?').get(companyId);
  if (c && c.owner_user_id) return c.owner_user_id;
  const u = db.prepare("SELECT id FROM users WHERE company_id = ? ORDER BY (role='OWNER') DESC, id ASC LIMIT 1").get(companyId);
  return u ? u.id : null;
}

function runComplianceReminders() {
  const db = getDb();
  try {
    console.log('[ComplianceReminders] Running daily compliance reminder scan...');

    // Mark newly-overdue items so the score & UI stay accurate.
    db.prepare(`
      UPDATE business_compliance_items
      SET status = 'overdue'
      WHERE status IN ('pending','in_progress')
        AND next_due_date IS NOT NULL AND next_due_date < date('now')
    `).run();

    const items = db.prepare(`
      SELECT i.id, i.company_id, i.next_due_date, i.rule_id, r.title, r.priority,
             CAST(julianday(i.next_due_date) - julianday('now') AS INTEGER) AS days_remaining
      FROM business_compliance_items i
      JOIN compliance_rules r ON r.id = i.rule_id
      WHERE i.status NOT IN ('completed','not_applicable')
        AND i.next_due_date IS NOT NULL
    `).all();

    const wasSent = db.prepare("SELECT 1 FROM compliance_events WHERE company_id = ? AND item_id = ? AND event_type = 'reminder_sent' AND detail = ? LIMIT 1");
    const markSent = db.prepare("INSERT INTO compliance_events (company_id, item_id, rule_id, event_type, detail) VALUES (?, ?, ?, 'reminder_sent', ?)");
    const insertNotif = db.prepare(`
      INSERT INTO notifications (company_id, user_id, type, title, body, related_type, related_id)
      VALUES (?, ?, 'compliance', ?, ?, 'compliance_item', ?)
    `);

    const ownerCache = {};
    let created = 0;

    for (const it of items) {
      const bucket = bucketFor(it.days_remaining);
      if (!bucket) continue;
      if (wasSent.get(it.company_id, it.id, bucket)) continue;

      const uid = ownerCache[it.company_id] !== undefined
        ? ownerCache[it.company_id]
        : (ownerCache[it.company_id] = ownerUserId(db, it.company_id));

      const title = bucket === 'expired' ? `Overdue: ${it.title}` : `Reminder: ${it.title}`;
      const body = bucket === 'expired'
        ? `${it.title} is overdue (was due ${it.next_due_date}). File as soon as possible to limit penalties.`
        : `${it.title} is due in ${it.days_remaining} day(s) on ${it.next_due_date}.`;

      db.exec('BEGIN TRANSACTION');
      try {
        insertNotif.run(it.company_id, uid, title, body, it.id);
        markSent.run(it.company_id, it.id, it.rule_id, bucket);
        db.exec('COMMIT');
        created++;
      } catch (e) {
        db.exec('ROLLBACK');
        console.error('[ComplianceReminders] failed for item', it.id, e.message);
      }
    }

    console.log(`[ComplianceReminders] Reminders created: ${created} (scanned ${items.length} items).`);
    return { scanned: items.length, created };
  } catch (err) {
    console.error('[ComplianceReminders] Error:', err.message);
    return { error: err.message };
  } finally {
    db.close();
  }
}

function startJob() {
  runComplianceReminders();
  setInterval(runComplianceReminders, 24 * 60 * 60 * 1000);
}

module.exports = { runComplianceReminders, startJob };
