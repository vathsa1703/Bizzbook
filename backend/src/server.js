require('dotenv').config();
const app = require('./app');
const insightCache = require('./jobs/insightCache');
const licenseExpiry = require('./jobs/licenseExpiryChecker');
const complianceReminders = require('./jobs/complianceReminders');
const { validateSystem } = require('./services/systemValidator');
const marketingCron = require('./cron/marketingCron');
const { startJobWorker } = require('./workers/jobWorker');
const { initInventoryListener } = require('./listeners/inventoryListener');
const automationEngine = require('./services/AutomationEngine');

const PORT = process.env.PORT || 5000;

(async () => {
  const isHealthy = await validateSystem(app);

  // We start the server even if degraded, but we exit if core systems like DB completely fail.
  // Wait, validateSystem returns false if core DB fails.
  if (!isHealthy && app.get('env') === 'production') {
    console.error('[FATAL] System validation failed. Refusing to start in production.');
    process.exit(1);
  }

  app.listen(PORT, async () => {
    console.log(`AI Voice Business Assistant backend running on port ${PORT}`);
    if (isHealthy) {
      insightCache.startJob();
      licenseExpiry.startJob();
      complianceReminders.startJob();
      marketingCron.initCron();
      startJobWorker();
      initInventoryListener();
      await automationEngine.init();
    } else {
      console.warn('[WARN] Running in degraded mode. Background jobs may be suspended.');
    }
  });
})();
