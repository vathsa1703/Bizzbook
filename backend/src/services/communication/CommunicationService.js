const { dbGet, engine } = require('../../config/dbEngine');
const jobQueueService = require('../JobQueueService');
const { JobTypes } = require('../../constants/jobs');
const MockProvider = require('./providers/MockProvider');

class CommunicationService {
  constructor() {
    this.providers = {
      whatsapp: new MockProvider({ name: 'MockWhatsApp' }),
      sms: new MockProvider({ name: 'MockSMS' }),
      email: new MockProvider({ name: 'MockEmail' })
    };
    this.DEFAULT_BATCH_SIZE = 500;
  }

  /**
   * Main entry point to dispatch a campaign
   * @param {Object} campaignData
   * @param {Array} recipients
   */
  async dispatchCampaign(companyId, campaignData, recipients) {
    // 1. Create campaign record
    const scheduleTime = campaignData.schedule_time || null;
    const status = scheduleTime ? 'scheduled' : 'processing';

    const row = await dbGet(`
      INSERT INTO communication_campaigns
      (company_id, name, channel, status, audience_type, segment_id, template_id, schedule_time, total_recipients)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [
      companyId,
      campaignData.name,
      campaignData.channel,
      status,
      campaignData.audience_type,
      campaignData.segment_id || null,
      campaignData.template_id || null,
      scheduleTime,
      recipients.length
    ]);
    const campaignId = row.id;

    // 2. Split into batches
    const batches = [];
    for (let i = 0; i < recipients.length; i += this.DEFAULT_BATCH_SIZE) {
      batches.push(recipients.slice(i, i + this.DEFAULT_BATCH_SIZE));
    }

    // 3. Queue each batch
    // If it's scheduled, compute delay minutes
    let delayMinutes = 0;
    if (scheduleTime) {
      const msDiff = new Date(scheduleTime).getTime() - Date.now();
      if (msDiff > 0) delayMinutes = Math.floor(msDiff / 60000);
    }

    // JobQueueService.enqueue() is async (Postgres dual-engine conversion) --
    // must be awaited in a real loop, not fire-and-forgotten inside forEach,
    // or a duplicate-idempotency-key error becomes an unhandled rejection
    // instead of surfacing to this method's caller.
    for (let idx = 0; idx < batches.length; idx++) {
      await jobQueueService.enqueue({
        companyId,
        type: JobTypes.COMM_SEND_BATCH,
        payload: JSON.stringify({
          campaignId,
          channel: campaignData.channel,
          templateId: campaignData.template_id,
          marketingCampaignId: campaignData.marketing_campaign_id || null,
          automationId: campaignData.automation_id || null,
          segmentId: campaignData.segment_id || null,
          batchIndex: idx,
          recipients: batches[idx]
        }),
        delayMinutes
      });
    }

    return { campaignId, status, batchesCreated: batches.length };
  }

  /**
   * Process a single batch (Called by JobWorker)
   */
  async processBatch(payload, job) {
    const { campaignId, channel, templateId, marketingCampaignId, automationId, segmentId, recipients } = payload;
    const provider = this.providers[channel];
    if (!provider) {
      throw new Error(`Unsupported channel: ${channel}`);
    }

    const now = engine() === 'postgres' ? 'now()' : `datetime('now')`;
    let successful = 0;
    let failed = 0;

    for (const recipient of recipients) {
      // 1. Initial log entry as queued/processing
      const logRow = await dbGet(`
        INSERT INTO communication_logs
        (company_id, customer_id, campaign_id, marketing_campaign_id, automation_id, template_id, segment_id, channel, provider, status, message_payload, job_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        job.company_id,
        recipient.customer_id,
        campaignId,
        marketingCampaignId,
        automationId,
        templateId,
        segmentId,
        channel,
        provider.constructor.name,
        'processing',
        JSON.stringify(recipient.metadata || {}),
        job.id
      ]);
      const logId = logRow.id;

      // 2. Call provider
      try {
        const result = await provider.send({
          to: recipient.identifier, // phone or email
          content: recipient.content,
          metadata: recipient.metadata
        });

        // 3. Update log
        await dbGet(`
          UPDATE communication_logs
          SET status = ?, provider_message_id = ?, error_details = ?, delivered_at = CASE WHEN ? = 'sent' THEN ${now} ELSE NULL END
          WHERE id = ?
        `, [
          result.success ? 'sent' : 'failed',
          result.providerMessageId,
          result.error || null,
          result.success ? 'sent' : 'failed',
          logId
        ]);

        if (result.success) successful++; else failed++;

      } catch (err) {
        // Unexpected hard error (network, auth, etc.) for this individual message
        await dbGet(`
          UPDATE communication_logs
          SET status = 'failed', error_details = ?
          WHERE id = ?
        `, [err.message, logId]);
        failed++;
      }
    }

    // Update campaign stats
    if (campaignId) {
      await dbGet(`
        UPDATE communication_campaigns
        SET successful_deliveries = successful_deliveries + ?,
            failed_deliveries = failed_deliveries + ?,
            updated_at = ${now}
        WHERE id = ?
      `, [successful, failed, campaignId]);

      // Check if all recipients are done to mark completed
      await dbGet(`
        UPDATE communication_campaigns
        SET status = 'completed'
        WHERE id = ? AND (successful_deliveries + failed_deliveries) >= total_recipients
      `, [campaignId]);
    }
  }
}

const communicationService = new CommunicationService();
module.exports = communicationService;
