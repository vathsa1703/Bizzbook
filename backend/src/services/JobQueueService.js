const { getDb } = require('../config/db');
const { JobTypes } = require('../constants/jobs');

class JobQueueService {
  constructor() {
    this.handlers = {};
  }

  /**
   * Register a handler function for a specific JobType
   * @param {string} jobType 
   * @param {Function} handler async function(job)
   */
  registerHandler(jobType, handler) {
    this.handlers[jobType] = handler;
  }

  /**
   * Enqueue a new background job
   * @param {Object} params - { companyId, type, payload, priority = 5, correlationId = null, idempotencyKey = null, delayMinutes = 0 }
   */
  enqueue({ companyId, type, payload, priority = 5, correlationId = null, idempotencyKey = null, delayMinutes = 0 }) {
    const db = getDb();
    const runAt = delayMinutes > 0 ? `datetime('now', '+${delayMinutes} minutes')` : `datetime('now')`;
    
    try {
      const stmt = db.prepare(`
        INSERT INTO background_jobs (company_id, correlation_id, idempotency_key, type, payload, priority, status, run_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ${runAt})
      `);
      const info = stmt.run(
        companyId,
        correlationId,
        idempotencyKey,
        type,
        JSON.stringify(payload),
        priority
      );
      return { success: true, jobId: info.lastInsertRowid };
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed') && idempotencyKey) {
        console.log(`[JobQueueService] Ignored duplicate job due to idempotency key: ${idempotencyKey}`);
        return { success: true, duplicate: true };
      }
      throw err;
    }
  }

  /**
   * Claim pending jobs for processing
   * @param {number} limit 
   */
  claimJobs(limit = 10) {
    const db = getDb();
    
    // SQLite doesn't have SKIP LOCKED, but we can do a standard claim pattern
    // Find pending jobs that are ready to run, ordered by priority.
    // SELECT * (not an explicit column list) -- the previous explicit list
    // omitted company_id entirely, so every handler's `job.company_id` was
    // silently undefined. Confirmed live: this crashed
    // CommunicationService.processBatch's INSERT ("Provided value cannot be
    // bound to SQLite parameter 1" -- company_id is bind param 1 there).
    // Not just a communications bug -- any handler reading job.company_id
    // (or any other job column beyond this original five) hit the same
    // silent-undefined failure mode.
    const jobs = db.prepare(`
      SELECT *
      FROM background_jobs
      WHERE status = 'pending' AND run_at <= datetime('now')
      ORDER BY priority ASC, run_at ASC
      LIMIT ?
    `).all(limit);

    if (jobs.length === 0) return [];

    const jobIds = jobs.map(j => j.id);
    const placeholders = jobIds.map(() => '?').join(',');

    // Lock them
    db.prepare(`
      UPDATE background_jobs 
      SET status = 'processing', locked_at = datetime('now')
      WHERE id IN (${placeholders})
    `).run(...jobIds);

    return jobs;
  }

  completeJob(jobId) {
    const db = getDb();
    db.prepare(`UPDATE background_jobs SET status = 'completed', updated_at = datetime('now') WHERE id = ?`).run(jobId);
  }

  retryJob(jobId, attempts, maxAttempts, errorLog) {
    const db = getDb();
    const newAttempts = attempts + 1;
    
    if (newAttempts >= maxAttempts) {
      this.markDead(jobId, errorLog);
    } else {
      // Exponential backoff: minutes = attempts^2 * 5
      const delayMins = Math.pow(newAttempts, 2) * 5;
      db.prepare(`
        UPDATE background_jobs 
        SET status = 'pending', 
            attempts = ?, 
            error_log = ?, 
            run_at = datetime('now', '+${delayMins} minutes'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(newAttempts, errorLog, jobId);
    }
  }

  failJob(jobId, errorLog) {
    const db = getDb();
    db.prepare(`UPDATE background_jobs SET status = 'failed', error_log = ?, updated_at = datetime('now') WHERE id = ?`).run(errorLog, jobId);
  }

  markDead(jobId, errorLog) {
    const db = getDb();
    db.prepare(`UPDATE background_jobs SET status = 'dead', error_log = ?, updated_at = datetime('now') WHERE id = ?`).run(errorLog, jobId);
    console.error(`[JobQueueService] Job ${jobId} moved to DEAD LETTER QUEUE.`);
  }

  /**
   * Process a single job using the registry
   */
  async processJob(job) {
    try {
      const handler = this.handlers[job.type];
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      const payload = JSON.parse(job.payload);
      await handler(payload, job);
      
      this.completeJob(job.id);
    } catch (err) {
      console.error(`[JobQueueService] Job ${job.id} failed:`, err.message);
      this.retryJob(job.id, job.attempts, job.max_attempts, err.message || err.toString());
    }
  }

  /**
   * Called by the cron worker to sweep and process
   */
  async sweep() {
    const jobs = this.claimJobs(10);
    for (const job of jobs) {
      await this.processJob(job);
    }
  }
}

// Export a singleton instance
const jobQueueService = new JobQueueService();
module.exports = jobQueueService;
