const JobTypes = {
  // Communications
  SEND_EMAIL: 'communications.send_email',
  SEND_WHATSAPP: 'communications.send_whatsapp',
  SEND_SMS: 'communications.send_sms',
  
  // Automations & Marketing
  ISSUE_COUPON: 'marketing.issue_coupon',
  SEND_SURVEY: 'marketing.send_survey',
  
  // System
  DAILY_CLEANUP: 'system.daily_cleanup',
  SYNC_WALLET: 'system.sync_wallet'
};

module.exports = { JobTypes };
