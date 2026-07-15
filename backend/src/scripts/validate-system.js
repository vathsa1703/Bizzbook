require('dotenv').config();
const { validateSystem } = require('../services/systemValidator');

console.log('Starting Pre-Deployment System Validation...');
const passed = validateSystem();

if (!passed) {
  console.error('\x1b[31m[ERROR] Pre-deployment validation failed. Please fix the issues before deploying.\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32m[SUCCESS] Pre-deployment validation passed. System is ready.\x1b[0m');
  process.exit(0);
}
