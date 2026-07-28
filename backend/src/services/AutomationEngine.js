const eventBusService = require('./EventBusService');
const jobQueueService = require('./JobQueueService');
const { dbGet, dbAll, engine } = require('../config/dbEngine');

class AutomationEngine {
  async init() {
    console.log('[AutomationEngine] Binding to EventBus...');

    // We bind a global interceptor to the EventBus.
    // Instead of intercepting everything via monkey patching, we can just fetch
    // all active automations and subscribe the AutomationEngine to those specific eventTypes.

    await this.reloadAutomations();
  }

  async reloadAutomations() {
    // is_active is BOOLEAN on Postgres vs INTEGER 0/1 on SQLite -- bind as a
    // param rather than a literal `1` so each engine gets its own native type.
    const activeVal = engine() === 'postgres' ? true : 1;
    const rules = await dbAll('SELECT id, company_id, event_type, conditions, delay_minutes, action_type, action_payload FROM marketing_automations WHERE is_active = ?', [activeVal]);

    // Group rules by event_type
    this.rulesByEvent = {};
    for (const rule of rules) {
      if (!this.rulesByEvent[rule.event_type]) {
        this.rulesByEvent[rule.event_type] = [];
      }
      this.rulesByEvent[rule.event_type].push(rule);
    }

    // Subscribe to unique event types
    for (const eventType of Object.keys(this.rulesByEvent)) {
      eventBusService.subscribe(eventType, async (payload, eventRecord) => {
        await this.evaluateEvent(eventRecord.companyId, eventType, payload, eventRecord.correlationId);
      });
    }

    console.log(`[AutomationEngine] Loaded ${rules.length} active automations.`);
  }

  async evaluateEvent(companyId, eventType, payload, correlationId) {
    const rules = this.rulesByEvent[eventType] || [];
    const companyRules = rules.filter(r => r.company_id === companyId);

    for (const rule of companyRules) {
      const isMatch = this.evaluateConditions(rule.conditions, payload);

      if (isMatch) {
        console.log(`[AutomationEngine] Rule ${rule.id} matched! Scheduling ${rule.action_type} for ${rule.delay_minutes} mins.`);

        // Ensure idempotency: one action per rule + correlation_id
        const idempotencyKey = `auto_${rule.id}_${correlationId}`;

        let parsedActionPayload = {};
        try {
          parsedActionPayload = JSON.parse(rule.action_payload);
        } catch (e) {
          // ignore
        }

        // Enrich action payload with the triggering event data
        parsedActionPayload.triggerData = payload;

        await jobQueueService.enqueue({
          companyId,
          type: rule.action_type,
          payload: parsedActionPayload,
          delayMinutes: rule.delay_minutes,
          correlationId: correlationId,
          idempotencyKey: idempotencyKey,
          priority: 5
        });

        // Log execution
        await dbGet(`
          INSERT INTO automation_execution_logs (company_id, automation_id, correlation_id, customer_id, status, message)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [companyId, rule.id, correlationId, payload.customerId || null, 'scheduled', 'Action scheduled successfully.']);
      }
    }
  }

  evaluateConditions(conditionsJson, payload) {
    if (!conditionsJson) return true; // No conditions = run always
    try {
      let conditions = JSON.parse(conditionsJson);
      if (!Array.isArray(conditions)) {
        // Handle legacy format if any
        conditions = Object.entries(conditions).map(([field, rules]) => {
          if (rules.gt !== undefined) return { field, operator: '>', value: rules.gt };
          if (rules.lt !== undefined) return { field, operator: '<', value: rules.lt };
          if (rules.eq !== undefined) return { field, operator: '=', value: rules.eq };
          if (rules.includes !== undefined) return { field, operator: 'IN', value: rules.includes };
          return { field, operator: '=', value: rules.eq };
        });
      }

      for (const cond of conditions) {
        let val = payload[cond.field];
        if (val === undefined || val === null) {
          // Attempt to extract from embedded objects or default to 0/empty
          val = 0; // fallback if field is missing but expected for comparison
        }

        let condValue = cond.value;
        if (!isNaN(condValue) && condValue !== '') {
          condValue = Number(condValue);
          val = Number(val);
        }

        switch (cond.operator) {
          case '>':
            if (!(val > condValue)) return false;
            break;
          case '<':
            if (!(val < condValue)) return false;
            break;
          case '=':
            // loose equality to match string '50' vs number 50
            if (val != condValue) return false;
            break;
          case '!=':
            if (val != condValue) return false;
            break;
          case 'IN':
            if (typeof val === 'string' && typeof condValue === 'string') {
              if (!val.toLowerCase().includes(condValue.toLowerCase())) return false;
            } else {
              return false;
            }
            break;
          default:
            return false;
        }
      }
      return true;
    } catch (e) {
      console.error('[AutomationEngine] Failed to parse conditions:', e.message);
      return false; // Fail safe
    }
  }

  // Single source of truth for automation dashboard stats. Consumed by
  // routes/automations.js (/dashboard) and routes/home.js (marketing-summary)
  // so the failed/success-rate numbers are computed identically in both places.
  async getStats(companyId) {
    const stats = await dbGet(`
      SELECT
        COUNT(*) as total_automations,
        SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active_automations,
        SUM(CASE WHEN is_active = FALSE THEN 1 ELSE 0 END) as disabled_automations
      FROM marketing_automations
      WHERE company_id = ?
    `, [companyId]);

    const execStats = await dbGet(`
      SELECT
        COUNT(*) as total_executions,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_executions,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_executions
      FROM automation_execution_logs
      WHERE company_id = ?
    `, [companyId]);

    const successRate = execStats.total_executions > 0
      ? Math.round((execStats.success_executions / execStats.total_executions) * 100)
      : 0;

    return {
      total: stats.total_automations || 0,
      active: stats.active_automations || 0,
      disabled: stats.disabled_automations || 0,
      executions: execStats.total_executions || 0,
      successRate,
      failed: execStats.failed_executions || 0
    };
  }
}

const automationEngine = new AutomationEngine();
module.exports = automationEngine;
