// reset_admin_password.js
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const dbPath = 'c:/Users/kishore/Downloads/ai-voice-assistant/backend/data/business.db';
const db = new sqlite3.Database(dbPath, err => {
  if (err) { console.error('DB open error', err); process.exit(1); }
});
const newPassword = 'admin123';
const hash = bcrypt.hashSync(newPassword, 10);
db.run('UPDATE users SET password_hash = ? WHERE email = ?', [hash, 'admin@business.com'], function(err) {
  if (err) {
    console.error('Update error', err);
  } else {
    console.log('Admin password reset to "admin123"');
  }
  db.close();
});
