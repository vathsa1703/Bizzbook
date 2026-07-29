const EventEmitter = require('events');
const crypto = require('crypto');
const { dbGet, dbAll, engine } = require('../config/dbEngine');

class EventBusService {
  constructor() {
    this.emitter = new EventEmitter();
  }

  /**
   * Subscribe to a system event
   * @param {string} eventType from Events registry
   * @param {Function} handler async (payload, eventRecord) => {}
   */
  subscribe(eventType, handler) {
    this.emitter.on(eventType, async (eventRecord) => {
      try {
        await handler(eventRecord.payload, eventRecord);
        await this.markProcessed(eventRecord.id);
      } catch (err) {
        console.error(`[EventBus] Handler failed for ${eventType}:`, err.message);
        await this.markFailed(eventRecord.id, err.message);
      }
    });
  }

  /**
   * Emit a domain event.
   * It persists the event to system_events and notifies subscribers.
   */
  async emit(companyId, eventType, entityId, payload, correlationId = null) {
    // Generate a correlation ID if one isn't passed down from a parent chain
    const finalCorrelationId = correlationId || `evt_${crypto.randomBytes(8).toString('hex')}`;

    const row = await dbGet(`
      INSERT INTO system_events (company_id, correlation_id, event_type, entity_id, payload, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
      RETURNING id
    `, [companyId, finalCorrelationId, eventType, entityId, JSON.stringify(payload)]);

    const eventRecord = {
      id: row.id,
      companyId,
      correlationId: finalCorrelationId,
      eventType,
      entityId,
      payload
    };

    // Dispatch to in-memory listeners asynchronously
    setImmediate(() => {
      this.emitter.emit(eventType, eventRecord);
    });

    return finalCorrelationId;
  }

  async markProcessed(eventId) {
    const now = engine() === 'postgres' ? 'now()' : "datetime('now')";
    await dbGet(`UPDATE system_events SET status = 'completed', processed_at = ${now} WHERE id = ?`, [eventId]);
  }

  async markFailed(eventId, errorLog) {
    await dbGet(`UPDATE system_events SET status = 'failed', error_log = ? WHERE id = ?`, [errorLog, eventId]);
  }

  /**
   * Called by a worker to pick up stranded 'pending' events
   * (e.g. if the server crashed right after emit before the handler completed)
   */
  async sweep() {
    // created_at < now - 1 minute: SQLite modifier vs Postgres interval.
    const staleExpr = engine() === 'postgres'
      ? `(now() - interval '1 minutes')`
      : `datetime('now', '-1 minutes')`;
    const stranded = await dbAll(`
      SELECT id, company_id, correlation_id, event_type, entity_id, payload
      FROM system_events
      WHERE status = 'pending' AND created_at < ${staleExpr}
      LIMIT 20
    `);

    for (const record of stranded) {
      record.payload = JSON.parse(record.payload);
      // Re-emit internally
      this.emitter.emit(record.event_type, record);
    }
  }
}

const eventBusService = new EventBusService();
module.exports = eventBusService;
