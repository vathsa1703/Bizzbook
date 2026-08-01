const { dbGet, dbAll } = require('../config/dbEngine');
const { JobTypes } = require('../constants/jobs');

// True for a duplicate-primary-key/unique-constraint violation on either
// engine (see routes/gstMaster.js for the canonical version of this check).
function isDuplicateKeyError(e) {
  return e.code === '23505' || (e.message && e.message.includes('UNIQUE constraint failed'));
}

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
  async enqueue({ companyId, type, payload, priority = 5, correlationId = null, idempotencyKey = null, delayMinutes = 0 }) {
    const runAt = delayMinutes > 0 ? `(now() + interval '${delayMinutes} minutes')` : 'now()';

    try {
      const row = await dbGet(`
        INSERT INTO background_jobs (company_id, correlation_id, idempotency_key, type, payload, priority, status, run_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ${runAt})
        RETURNING id
      `, [companyId, correlationId, idempotencyKey, type, JSON.stringify(payload), priority]);
      return { success: true, jobId: row.id };
    } catch (err) {
      if (isDuplicateKeyError(err) && idempotencyKey) {
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
  async claimJobs(limit = 10) {
    const now = 'now()';

    // Find pending jobs that are ready to run, ordered by priority.
    // SELECT * (not an explicit column list) -- an earlier explicit list
    // omitted company_id entirely, so every handler's `job.company_id` was
    // silently undefined. Confirmed live: this crashed
    // CommunicationService.processBatch's INSERT ("Provided value cannot be
    // bound to SQLite parameter 1" -- company_id is bind param 1 there).
    // Not just a communications bug -- any handler reading job.company_id
    // (or any other job column beyond the original explicit five) hit the
    // same silent-undefined failure mode.
    const jobs = await dbAll(`
      SELECT *
      FROM background_jobs
      WHERE status = 'pending' AND run_at <= ${now}
      ORDER BY priority ASC, run_at ASC
      LIMIT ?
    `, [limit]);

    if (jobs.length === 0) return [];

    const jobIds = jobs.map(j => j.id);
    const placeholders = jobIds.map(() => '?').join(',');

    // Lock them
    await dbGet(`
      UPDATE background_jobs
      SET status = 'processing', locked_at = ${now}
      WHERE id IN (${placeholders})
    `, jobIds);

    return jobs;
  }

  async completeJob(jobId) {
    const now = 'now()';
    await dbGet(`UPDATE background_jobs SET status = 'completed', updated_at = ${now} WHERE id = ?`, [jobId]);
  }

  async retryJob(jobId, attempts, maxAttempts, errorLog) {
    const newAttempts = attempts + 1;

    if (newAttempts >= maxAttempts) {
      await this.markDead(jobId, errorLog);
    } else {
      // Exponential backoff: minutes = attempts^2 * 5
      const delayMins = Math.pow(newAttempts, 2) * 5;
      const now = 'now()';
      const runAt = `(now() + interval '${delayMins} minutes')`;
      await dbGet(`
        UPDATE background_jobs
        SET status = 'pending',
            attempts = ?,
            error_log = ?,
            run_at = ${runAt},
            updated_at = ${now}
        WHERE id = ?
      `, [newAttempts, errorLog, jobId]);
    }
  }

  async failJob(jobId, errorLog) {
    const now = 'now()';
    await dbGet(`UPDATE background_jobs SET status = 'failed', error_log = ?, updated_at = ${now} WHERE id = ?`, [errorLog, jobId]);
  }

  async markDead(jobId, errorLog) {
    const now = 'now()';
    await dbGet(`UPDATE background_jobs SET status = 'dead', error_log = ?, updated_at = ${now} WHERE id = ?`, [errorLog, jobId]);
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

      await this.completeJob(job.id);
    } catch (err) {
      console.error(`[JobQueueService] Job ${job.id} failed:`, err.message);
      await this.retryJob(job.id, job.attempts, job.max_attempts, err.message || err.toString());
    }
  }

  /**
   * Called by the cron worker to sweep and process
   */
  async sweep() {
    const jobs = await this.claimJobs(10);
    for (const job of jobs) {
      await this.processJob(job);
    }
  }
}

// Export a singleton instance
const jobQueueService = new JobQueueService();
module.exports = jobQueueService;
