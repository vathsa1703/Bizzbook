const jwt = require('jsonwebtoken');
const fetch = require('node-fetch'); // wait, fetch is built-in in Node 18+

async function run() {
  const BASE_URL = 'http://localhost:5003/api';

  // 1. Sign up a new user
  const signupData = {
    businessName: 'Test Business ' + Date.now(),
    businessType: 'Retail',
    ownerName: 'Test Owner',
    email: 'test' + Date.now() + '@example.com',
    password: 'password123'
  };

  const signupRes = await fetch(`${BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signupData)
  });

  const signupJson = await signupRes.json();
  console.log('Signup response:', signupJson);
  
  if (!signupRes.ok) {
    console.error('Signup failed');
    return;
  }

  const token = signupJson.token;
  
  // Check 1: JWT payload
  console.log('\n--- CHECK 1: JWT PAYLOAD ---');
  try {
    const payload = jwt.decode(token);
    console.log(payload);
  } catch (err) {
    console.error('Failed to decode JWT', err);
  }

  // Check 2: Actual Error from /api/products
  console.log('\n--- CHECK 2: ACTUAL ERROR ---');
  const productsRes = await fetch(`${BASE_URL}/products`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log(`Response status: ${productsRes.status}`);
  const productsBody = await productsRes.text();
  console.log(`Response body: ${productsBody}`);
}

run().catch(console.error);
