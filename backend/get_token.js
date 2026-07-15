const { generateToken } = require('./src/services/authService');
const fs = require('fs');

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

const token = generateToken(userPayload);
console.log(token);
