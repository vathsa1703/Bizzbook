const fetch = require('node-fetch');
const sqlite3 = require('sqlite3').verbose();

const BASE_URL = 'http://localhost:5003/api';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('Starting cross-company contamination test...');

  const uniqueA = Date.now() + '_a';
  const uniqueB = Date.now() + '_b';

  // 1. Create Company A
  const resA = await fetch(`${BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessName: 'Company A ' + uniqueA,
      businessType: 'Grocery / Kirana',
      ownerName: 'Owner A',
      email: `owner_${uniqueA}@companya.com`,
      password: 'password123'
    })
  });
  const dataA = await resA.json();
  if (!dataA.token) throw new Error('Company A creation failed: ' + JSON.stringify(dataA));
  const tokenA = dataA.token;
  console.log('Company A created successfully.');

  // 2. Create Company B
  const resB = await fetch(`${BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessName: 'Company B ' + uniqueB,
      businessType: 'Electronics',
      ownerName: 'Owner B',
      email: `owner_${uniqueB}@companyb.com`,
      password: 'password123'
    })
  });
  const dataB = await resB.json();
  if (!dataB.token) throw new Error('Company B creation failed: ' + JSON.stringify(dataB));
  const tokenB = dataB.token;
  console.log('Company B created successfully.');

  // 3. Create a Product in Company A
  const prodResA = await fetch(`${BASE_URL}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      name: 'Test Product A',
      cost_price: 100,
      selling_price: 150
    })
  });
  const prodA = await prodResA.json();
  console.log('Product created in Company A with ID:', prodA.id);

  // 4. Fetch Products as Company B
  const getProdResB = await fetch(`${BASE_URL}/products`, {
    headers: {
      'Authorization': `Bearer ${tokenB}`
    }
  });
  const prodsB = await getProdResB.json();
  
  const foundProdAInB = prodsB.find(p => p.id === prodA.id || p.name === 'Test Product A');
  if (foundProdAInB) {
    console.error('❌ FAIL: Company B can see Company A\'s product!');
    process.exit(1);
  } else {
    console.log('✅ PASS: Company B cannot see Company A\'s product.');
  }

  // 5. Create a Customer in Company B
  const custResB = await fetch(`${BASE_URL}/customers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenB}`
    },
    body: JSON.stringify({
      name: 'Test Customer B',
      state_code: '27'
    })
  });
  const custB = await custResB.json();
  console.log('Customer created in Company B with ID:', custB.id);

  // 6. Fetch Customers as Company A
  const getCustResA = await fetch(`${BASE_URL}/customers`, {
    headers: {
      'Authorization': `Bearer ${tokenA}`
    }
  });
  const custsA = await getCustResA.json();

  const foundCustBInA = custsA.find(c => c.id === custB.id || c.name === 'Test Customer B');
  if (foundCustBInA) {
    console.error('❌ FAIL: Company A can see Company B\'s customer!');
    process.exit(1);
  } else {
    console.log('✅ PASS: Company A cannot see Company B\'s customer.');
  }

  console.log('\nAll cross-company contamination tests passed!');
}

runTest().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
