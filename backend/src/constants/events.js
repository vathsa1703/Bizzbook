const Events = {
  // Sales & Wallet
  INVOICE_CREATED: 'invoice.created.v1',
  INVOICE_UPDATED: 'invoice.updated.v1',
  INVOICE_CANCELLED: 'invoice.cancelled.v1',
  WALLET_UPDATED: 'wallet.updated.v1',
  
  // Inventory & Products
  INVENTORY_LOW: 'inventory.low.v1',
  STOCK_RECEIVED: 'stock.received.v1',
  INVENTORY_TRANSFER_STARTED: 'inventory.transfer.started.v1',
  INVENTORY_TRANSFER_COMPLETED: 'inventory.transfer.completed.v1',
  PRODUCT_CREATED: 'product.created.v1',
  
  // Marketing, Customers & CRM
  CUSTOMER_CREATED: 'customer.created.v1',
  CUSTOMER_UPDATED: 'customer.updated.v1',
  CUSTOMER_DELETED: 'customer.deleted.v1',
  COUPON_REDEEMED: 'coupon.redeemed.v1',
  CAMPAIGN_STARTED: 'campaign.started.v1',
  CAMPAIGN_COMPLETED: 'campaign.completed.v1',
  SURVEY_COMPLETED: 'survey.completed.v1',
  
  // Employees & Branches
  EMPLOYEE_CREATED: 'employee.created.v1',
  BRANCH_CREATED: 'branch.created.v1',
  BRANCH_UPDATED: 'branch.updated.v1'
};

module.exports = { Events };
