const { getDb } = require('../config/db');

console.log('Running database migrations...');
const db = getDb();
console.log('Migrations complete.');
db.close();
