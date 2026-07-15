const { getDb } = require('./src/config/db');
const { executeMarketingCron } = require('./src/cron/marketingCron');

async function test() {
  console.log('Initializing DB (which should apply schema.sql)...');
  const db = getDb();
  
  console.log('Running marketing cron manually...');
  const result = await executeMarketingCron();
  console.log('Cron Result:', result);
  
  console.log('Checking inserted marketing_signals...');
  const signals = db.prepare('SELECT COUNT(*) as count FROM marketing_signals').get();
  console.log(`marketing_signals count: ${signals.count}`);
  
  console.log('Checking inserted knowledge_graph_edges...');
  const edges = db.prepare('SELECT COUNT(*) as count FROM knowledge_graph_edges').get();
  console.log(`knowledge_graph_edges count: ${edges.count}`);
}

test().catch(console.error);
