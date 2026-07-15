const { getDb } = require('./src/config/db');
const { generateToken } = require('./src/services/authService');
const { runInsightCacheJob } = require('./src/jobs/insightCache');

async function testApi() {
  console.log('--- RE-RUNNING CACHE JOB ---');
  // Trigger cache manually first
  runInsightCacheJob();

  const db = getDb();
  // Find admin user
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE role = ? LIMIT 1').get('admin');
  db.close();

  if (!user) {
    console.error('No admin user found!');
    return;
  }

  const token = generateToken(user);
  console.log('Token generated for:', user.email);

  try {
    // 2. Fetch Dashboard Insights
    const dashRes = await fetch('http://localhost:5002/api/ai/insights/dashboard', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const dashData = await dashRes.json();
    console.log('\n--- DASHBOARD INSIGHTS ---');
    console.log(JSON.stringify(dashData, null, 2));

    // 3. Test Chat
    console.log('\n--- SENDING CHAT MESSAGE ---');
    const chatRes = await fetch('http://localhost:5002/api/ai/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ message: "What is my best-selling product?", sessionId: "test-session" })
    });
    const chatData = await chatRes.json();
    console.log('\n--- CHAT RESPONSE ---');
    console.log(JSON.stringify(chatData, null, 2));

    // 4. Test Marketing Opportunities
    console.log('\n--- MARKETING OPPORTUNITIES ---');
    const mktRes = await fetch('http://localhost:5002/api/marketing/opportunities', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const mktData = await mktRes.json();
    mktData.opportunities.forEach(o => {
      console.log(`  [${o.priority}] ${o.name} | Rs ${Math.round(o.expectedImpact).toLocaleString()} | ${o.confidenceScore}% confidence`);
      console.log('  Summary:', o.summary);
    });

    // 5. Test Strategy for first opportunity
    if (mktData.opportunities.length > 0) {
      const firstId = mktData.opportunities[0].id;
      console.log('\n--- STRATEGY FOR:', firstId, '---');
      const stratRes = await fetch(`http://localhost:5002/api/marketing/opportunities/${firstId}/strategy`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const stratData = await stratRes.json();
      console.log('Goal:', stratData.strategy?.goal);
      console.log('Actions:', stratData.strategy?.recommendedActions);
      console.log('Impact (Low/Med/High):', 
        stratData.strategy?.expectedImpact?.low?.amount,
        '/',
        stratData.strategy?.expectedImpact?.medium?.amount,
        '/',
        stratData.strategy?.expectedImpact?.high?.amount
      );
    }

  } catch (err) {
    console.error('Test Failed:', err);
  }
}

testApi();
