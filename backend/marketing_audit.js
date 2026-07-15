const fs = require('fs');
const { generateToken } = require('./src/services/authService');

const API_BASE = 'http://localhost:5003/api';
let TOKEN = '';
const report = {
  passed: [],
  failed: []
};

function login() {
  const userPayload = {
    id: 1,
    userId: 1,
    companyId: 1,
    name: 'Test Owner',
    email: 'test@bizbook.com',
    role: 'OWNER',
    companyName: 'Test Company',
    businessType: 'Retail',
  };
  TOKEN = generateToken(userPayload);
  console.log('Logged in successfully using direct JWT generation.');
}

async function apiCall(method, path, body = null) {
  const options = {
    method,
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, options);
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = await res.text();
  }
  return { status: res.status, data };
}

async function test(name, fn) {
  try {
    await fn();
    report.passed.push(name);
    console.log(`✅ PASS: ${name}`);
  } catch (e) {
    report.failed.push({ feature: name, error: e.message });
    console.log(`❌ FAIL: ${name} -> ${e.message}`);
  }
}

async function runTests() {
  login();

  // 1. Legacy Overview / Dashboard
  await test('GET /marketing/dashboard', async () => {
    const res = await apiCall('GET', '/marketing/dashboard');
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (typeof res.data.activeCampaigns !== 'number') throw new Error('Missing KPIs');
  });

  // 2. Spend Intelligence
  const spendEndpoints = [
    '/marketing/health-score',
    '/marketing/channel-roi',
    '/marketing/segment-priority?timeframe=30',
    '/marketing/break-even?timeframe=1year',
    '/marketing/weekly-recommendation',
    '/marketing/report-cards',
    '/marketing/flags'
  ];
  for (const ep of spendEndpoints) {
    await test(`GET ${ep}`, async () => {
      const res = await apiCall('GET', ep);
      if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    });
  }

  // Budget split
  await test('POST /marketing/budget-split', async () => {
    const res = await apiCall('POST', '/marketing/budget-split', { budget: 5000 });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  });

  // 3. AI Copilot
  const copilotEndpoints = [
    '/marketing-copilot/copilot',
    '/marketing-copilot/recommendations',
    '/marketing-copilot/insights',
    '/marketing-copilot/opportunities',
    '/marketing-copilot/calendar',
    '/marketing-copilot/experiments'
  ];
  for (const ep of copilotEndpoints) {
    await test(`GET ${ep}`, async () => {
      const res = await apiCall('GET', ep);
      if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    });
  }

  // 4. Customer Segments
  await test('GET /marketing/segments', async () => {
    const res = await apiCall('GET', '/marketing/segments');
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (!res.data.segments || !Array.isArray(res.data.segments)) throw new Error('Segments not returned');
  });

  let newSegmentId;
  await test('POST /marketing/segments (Create Custom)', async () => {
    const res = await apiCall('POST', '/marketing/segments', {
      name: 'Test Segment', description: 'Test', logic_type: 'AND', rules: [{ rule_type: 'purchases', operator: '>', value: 2 }]
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    newSegmentId = res.data.segmentId;
  });

  // 5. Campaigns
  await test('GET /marketing/campaigns', async () => {
    const res = await apiCall('GET', '/marketing/campaigns');
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  });

  let campaignId;
  await test('POST /marketing/campaigns/generate', async () => {
    const res = await apiCall('POST', '/marketing/campaigns/generate', {
      segmentId: 'vip', objective: 'Increase Sales'
    });
    if (res.status !== 201) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    campaignId = res.data.campaign.id;
  });

  await test('PUT /marketing/campaigns/:id', async () => {
    const res = await apiCall('PUT', `/marketing/campaigns/${campaignId}`, { status: 'active', notes: 'Testing' });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  });

  await test('DELETE /marketing/campaigns/:id', async () => {
    const res = await apiCall('DELETE', `/marketing/campaigns/${campaignId}`);
    if (res.status !== 204) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  });

  // 6. Coupons
  await test('GET /marketing/coupons', async () => {
    const res = await apiCall('GET', '/marketing/coupons');
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  });

  let couponId;
  let uniqueCode = 'TEST' + Date.now();
  await test('POST /marketing/coupons (Create)', async () => {
    const res = await apiCall('POST', '/marketing/coupons', {
      code: uniqueCode, discount_type: 'percentage', discount_value: 10
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    couponId = res.data.couponId;
  });

  await test('POST /marketing/coupons/validate', async () => {
    const res = await apiCall('POST', '/marketing/coupons/validate', { code: uniqueCode, cart_value: 100 });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
    if (!res.data.valid) throw new Error('Coupon should be valid');
  });

  // 7. Referrals
  let customerId = 49; 
  await test('GET /marketing/referrals/:customerId', async () => {
    const res = await apiCall('GET', `/marketing/referrals/${customerId}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  });

  // 8. Wallet
  await test('GET /marketing/wallet/:customerId', async () => {
    const res = await apiCall('GET', `/marketing/wallet/${customerId}`);
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  });

  await test('POST /marketing/wallet/adjust', async () => {
    const res = await apiCall('POST', '/marketing/wallet/adjust', {
      customer_id: customerId, balance_type: 'store_credit', amount: 50, transaction_type: 'refund', description: 'Test'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  });

  fs.writeFileSync('audit_report.json', JSON.stringify(report, null, 2));
  console.log(`\nAudit Complete! Passed: ${report.passed.length}, Failed: ${report.failed.length}`);
}

runTests();
