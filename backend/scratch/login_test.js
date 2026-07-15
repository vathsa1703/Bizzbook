// login_test.js (updated password)
const fetch = require('node-fetch');
(async () => {
  try {
    const resp = await fetch('http://localhost:5003/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@business.com', password: 'admin123' })
    });
    const text = await resp.text();
    console.log('Status:', resp.status);
    console.log('Body:', text);
  } catch (e) {
    console.error('Error:', e);
  }
})();
