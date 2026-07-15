export const automationSchema = {
  triggers: [
    {
      id: 'customer.created.v1',
      label: 'Customer Created',
      icon: 'UserPlus',
      description: 'Triggers when a new customer is registered.',
      fields: [
        { id: 'segment', label: 'Customer Segment', type: 'text' },
        { id: 'city', label: 'City', type: 'text' }
      ]
    },
    {
      id: 'customer.birthday.v1',
      label: 'Customer Birthday',
      icon: 'Gift',
      description: "Triggers on a customer's birthday.",
      fields: [
        { id: 'segment', label: 'Customer Segment', type: 'text' }
      ]
    },
    {
      id: 'invoice.created.v1',
      label: 'Invoice Created',
      icon: 'ShoppingCart',
      description: 'Triggers when a new invoice is created.',
      fields: [
        { id: 'amount', label: 'Order Value (₹)', type: 'number' }
      ]
    },
    {
      id: 'invoice.paid.v1',
      label: 'Invoice Paid',
      icon: 'CheckCircle',
      description: 'Triggers when an invoice is fully paid.',
      fields: [
        { id: 'amount', label: 'Order Value (₹)', type: 'number' }
      ]
    },
    {
      id: 'coupon.redeemed.v1',
      label: 'Coupon Redeemed',
      icon: 'Tag',
      description: 'Triggers when a customer uses a coupon.',
      fields: [
        { id: 'coupon_code', label: 'Coupon Code', type: 'text' }
      ]
    },
    {
      id: 'wallet.credit_added.v1',
      label: 'Wallet Credit Added',
      icon: 'PlusCircle',
      description: 'Triggers when wallet balance is increased.',
      fields: [
        { id: 'amount', label: 'Amount Added', type: 'number' }
      ]
    },
    {
      id: 'wallet.balance_low.v1',
      label: 'Wallet Balance Low',
      icon: 'AlertCircle',
      description: 'Triggers when a customer\s wallet drops below a threshold.',
      fields: [
        { id: 'balance', label: 'Current Balance', type: 'number' }
      ]
    },
    {
      id: 'referral.successful.v1',
      label: 'Referral Successful',
      icon: 'Users',
      description: 'Triggers when a customer\s referral code is used.',
      fields: [
        { id: 'reward_earned', label: 'Reward Earned', type: 'number' }
      ]
    },
    {
      id: 'survey.submitted.v1',
      label: 'Survey Submitted',
      icon: 'FileText',
      description: 'Triggers when a customer submits feedback.',
      fields: [
        { id: 'rating', label: 'CSAT Rating (1-5)', type: 'number' }
      ]
    },
    {
      id: 'campaign.completed.v1',
      label: 'Campaign Completed',
      icon: 'Megaphone',
      description: 'Triggers when a marketing campaign finishes sending.',
      fields: [
        { id: 'roi', label: 'Campaign ROI', type: 'number' }
      ]
    }
  ],
  operators: [
    { id: '>', label: 'Greater Than' },
    { id: '<', label: 'Less Than' },
    { id: '=', label: 'Equals' },
    { id: '!=', label: 'Not Equals' },
    { id: 'IN', label: 'Is One Of' }
  ],
  delays: [
    { id: 0, label: 'Immediately' },
    { id: 15, label: 'After 15 Minutes' },
    { id: 60, label: 'After 1 Hour' },
    { id: 1440, label: 'After 1 Day' },
    { id: 2880, label: 'After 2 Days' },
    { id: 10080, label: 'After 1 Week' }
  ],
  actions: [
    {
      id: 'SEND_WHATSAPP',
      label: 'Send WhatsApp',
      icon: 'MessageCircle',
      configFields: [
        { id: 'template', label: 'Message Template', type: 'select', options: ['welcome_message', 'thank_you_coupon', 'birthday_offer', 'win_back'] }
      ]
    },
    {
      id: 'SEND_SMS',
      label: 'Send SMS',
      icon: 'MessageSquare',
      configFields: [
        { id: 'template', label: 'Message Template', type: 'select', options: ['welcome_message', 'discount_alert'] }
      ]
    },
    {
      id: 'SEND_EMAIL',
      label: 'Send Email',
      icon: 'Mail',
      configFields: [
        { id: 'subject', label: 'Email Subject', type: 'text' },
        { id: 'template', label: 'Email Template', type: 'select', options: ['monthly_newsletter', 'abandoned_cart', 'feedback_request'] }
      ]
    },
    {
      id: 'ISSUE_COUPON',
      label: 'Issue Coupon',
      icon: 'Tag',
      configFields: [
        { id: 'coupon_type', label: 'Coupon Type', type: 'select', options: ['10_PERCENT_OFF', 'FLAT_500_OFF'] }
      ]
    },
    {
      id: 'ADD_WALLET_CREDIT',
      label: 'Add Wallet Credit',
      icon: 'CreditCard',
      configFields: [
        { id: 'amount', label: 'Amount to Add (₹)', type: 'number' },
        { id: 'reason', label: 'Reason for Credit', type: 'text' }
      ]
    },
    {
      id: 'SEND_SURVEY',
      label: 'Send Survey',
      icon: 'HelpCircle',
      configFields: [
        { id: 'survey_id', label: 'Survey Type', type: 'select', options: ['NPS', 'CSAT', 'Post-Purchase'] }
      ]
    },
    {
      id: 'INTERNAL_ALERT',
      label: 'Notify Manager',
      icon: 'Bell',
      configFields: [
        { id: 'message', label: 'Alert Message', type: 'text' }
      ]
    },
    {
      id: 'UPDATE_CUSTOMER_TAG',
      label: 'Update Customer Tag',
      icon: 'Bookmark',
      configFields: [
        { id: 'tag', label: 'Tag to Apply', type: 'text' }
      ]
    }
  ],
  templates: [
    {
      id: 'welcome_customer',
      name: 'Welcome Customer',
      description: 'Send a welcome WhatsApp when a new customer registers.',
      icon: 'UserPlus',
      payload: {
        event_type: 'customer.created.v1',
        delay_minutes: 0,
        action_type: 'SEND_WHATSAPP',
        action_payload: { template: 'welcome_message' },
        conditions: []
      }
    },
    {
      id: 'high_value_purchase',
      name: 'High Value Purchase',
      description: 'Send a Thank You coupon 2 days after a large sale.',
      icon: 'Award',
      payload: {
        event_type: 'invoice.created.v1',
        delay_minutes: 2880,
        action_type: 'SEND_WHATSAPP',
        action_payload: { template: 'thank_you_coupon' },
        conditions: [{ field: 'amount', operator: '>', value: 5000 }]
      }
    },
    {
      id: 'birthday_offer',
      name: 'Birthday Offer',
      description: 'Send a special coupon on their birthday.',
      icon: 'Gift',
      payload: {
        event_type: 'customer.birthday.v1',
        delay_minutes: 0,
        action_type: 'ISSUE_COUPON',
        action_payload: { coupon_type: 'FLAT_500_OFF' },
        conditions: []
      }
    }
  ]
};
