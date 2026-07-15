const EventEmitter = require('events');
const crypto = require('crypto');
const { getDb } = require('../config/db');

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
        this.markProcessed(eventRecord.id);
      } catch (err) {
        console.error(`[EventBus] Handler failed for ${eventType}:`, err.message);
        this.markFailed(eventRecord.id, err.message);
      }
    });
  }

  /**
   * Emit a domain event. 
   * It persists the event to system_events and notifies subscribers.
   */
  emit(companyId, eventType, entityId, payload, correlationId = null) {
    const db = getDb();
    
    // Generate a correlation ID if one isn't passed down from a parent chain
    const finalCorrelationId = correlationId || `evt_${crypto.randomBytes(8).toString('hex')}`;

    const stmt = db.prepare(`
      INSERT INTO system_events (company_id, correlation_id, event_type, entity_id, payload, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);

    const info = stmt.run(
      companyId,
      finalCorrelationId,
      eventType,
      entityId,
      JSON.stringify(payload)
    );

    const eventRecord = {
      id: info.lastInsertRowid,
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

  markProcessed(eventId) {
    const db = getDb();
    db.prepare(`UPDATE system_events SET status = 'completed', processed_at = datetime('now') WHERE id = ?`).run(eventId);
  }

  markFailed(eventId, errorLog) {
    const db = getDb();
    db.prepare(`UPDATE system_events SET status = 'failed', error_log = ? WHERE id = ?`).run(errorLog, eventId);
  }

  /**
   * Called by a worker to pick up stranded 'pending' events
   * (e.g. if the server crashed right after emit before the handler completed)
   */
  sweep() {
    const db = getDb();
    const stranded = db.prepare(`
      SELECT id, company_id, correlation_id, event_type, entity_id, payload 
      FROM system_events 
      WHERE status = 'pending' AND created_at < datetime('now', '-1 minutes')
      LIMIT 20
    `).all();

    for (const record of stranded) {
      record.payload = JSON.parse(record.payload);
      // Re-emit internally
      this.emitter.emit(record.event_type, record);
    }
  }
}

const eventBusService = new EventBusService();
module.exports = eventBusService;
