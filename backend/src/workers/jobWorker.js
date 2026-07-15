const cron = require('node-cron');
const jobQueueService = require('../services/JobQueueService');
const eventBusService = require('../services/EventBusService');
const communicationService = require('../services/communication/CommunicationService');
const { JobTypes } = require('../constants/jobs');

// ============================================================================
// REGISTER JOB HANDLERS
// ============================================================================

const { getDb } = require('../config/db');

async function updateAutomationLog(correlationId, status, duration, message) {
  if (!correlationId) return;
  try {
    const db = getDb();
    db.prepare(`
      UPDATE automation_execution_logs 
      SET status = ?, duration_ms = ?, message = ? 
      WHERE correlation_id = ?
    `).run(status, duration, message, correlationId);
  } catch (err) {
    console.error('[JobWorker] Error updating automation log', err);
  }
}

function wrapAutomationAction(handler) {
  return async (payloadStr, job) => {
    const start = Date.now();
    const payload = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
    try {
      if (job.correlation_id) await updateAutomationLog(job.correlation_id, 'running', 0, 'Executing action...');
      await handler(payload, job);
      if (job.correlation_id) await updateAutomationLog(job.correlation_id, 'success', Date.now() - start, 'Action executed successfully.');
    } catch (err) {
      if (job.correlation_id) await updateAutomationLog(job.correlation_id, 'failed', Date.now() - start, err.message);
      throw err;
    }
  };
}

// 1. Messaging Handlers (via CommunicationService)
jobQueueService.registerHandler('SEND_WHATSAPP', wrapAutomationAction(async (payload, job) => {
  // Construct a pseudo-campaign for single sends or use direct service
  console.log(`[JobWorker] Sending WhatsApp (Template: ${payload.template}) to customer ${payload.triggerData?.customerId}`);
  // In a real dispatch, we'd use communicationService.sendSingleMessage(...)
  await new Promise(r => setTimeout(r, 200));
}));

jobQueueService.registerHandler('SEND_SMS', wrapAutomationAction(async (payload, job) => {
  console.log(`[JobWorker] Sending SMS (Template: ${payload.template}) to customer ${payload.triggerData?.customerId}`);
  await new Promise(r => setTimeout(r, 200));
}));

jobQueueService.registerHandler('SEND_EMAIL', wrapAutomationAction(async (payload, job) => {
  console.log(`[JobWorker] Sending Email (Template: ${payload.template}) to customer ${payload.triggerData?.customerId}`);
  await new Promise(r => setTimeout(r, 200));
}));

// 2. Financial/Loyalty Actions
jobQueueService.registerHandler('ISSUE_COUPON', wrapAutomationAction(async (payload, job) => {
  console.log(`[JobWorker] Issuing coupon ${payload.coupon_type} to customer ${payload.triggerData?.customerId}`);
  await new Promise(r => setTimeout(r, 200));
}));

jobQueueService.registerHandler('ADD_WALLET_CREDIT', wrapAutomationAction(async (payload, job) => {
  console.log(`[JobWorker] Adding wallet credit ${payload.amount} for customer ${payload.triggerData?.customerId}`);
  await new Promise(r => setTimeout(r, 200));
}));

// 3. System Actions
jobQueueService.registerHandler('INTERNAL_ALERT', wrapAutomationAction(async (payload, job) => {
  console.log(`[JobWorker] INTERNAL ALERT: ${payload.message}`);
  await new Promise(r => setTimeout(r, 200));
}));

jobQueueService.registerHandler('UPDATE_CUSTOMER_TAG', wrapAutomationAction(async (payload, job) => {
  console.log(`[JobWorker] Updating customer ${payload.triggerData?.customerId} with tag ${payload.tag}`);
  await new Promise(r => setTimeout(r, 200));
}));

// 4. Communication Center Batch Handler
jobQueueService.registerHandler(JobTypes.COMM_SEND_BATCH, async (payloadStr, job) => {
  const payload = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr;
  console.log(`[JobWorker] Processing COMM_SEND_BATCH for campaign ${payload.campaignId} batch ${payload.batchIndex}`);
  await communicationService.processBatch(payload, job);
});

// ============================================================================
// DAEMON START
// ============================================================================
let isRunning = false;

function startJobWorker() {
  console.log('[JobWorker] Initializing Background Job Daemon (Polling every 10s)...');
  
  // We use node-cron to run every 10 seconds.
  // cron syntax '*/10 * * * * *' runs every 10 seconds.
  cron.schedule('*/10 * * * * *', async () => {
    if (isRunning) return; // Prevent overlap if jobs take longer than 10s
    isRunning = true;
    
    try {
      await jobQueueService.sweep();
      eventBusService.sweep();
    } catch (err) {
      console.error('[JobWorker] Critical sweep failure:', err);
    } finally {
      isRunning = false;
    }
  });
}

module.exports = { startJobWorker };
