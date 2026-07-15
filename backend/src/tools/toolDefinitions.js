// JSON schemas describing each dataService function as a callable "tool" for the LLM.
// Adding a new capability = add the function to dataService.js, then register its
// schema here, then map it in aiAgent.js's TOOL_IMPLEMENTATIONS.

const tools = [
  {
    type: 'function',
    function: {
      name: 'getMonthlySalesSummary',
      description: 'Get total revenue, units sold, and transaction count for a specific month, compared to the previous month.',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'integer', description: 'Month number, 1-12' },
          year: { type: 'integer', description: 'Four digit year, e.g. 2026' },
        },
        required: ['month', 'year'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getRevenueTrend',
      description: 'Get revenue and profit for each of the last N months, useful for spotting trends over time.',
      parameters: {
        type: 'object',
        properties: {
          months: { type: 'integer', description: 'How many recent months to include, default 6' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTopProducts',
      description: 'Get the best-selling products by revenue, optionally for a specific month.',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'integer', description: 'Optional month number, 1-12' },
          year: { type: 'integer', description: 'Optional four digit year' },
          limit: { type: 'integer', description: 'How many products to return, default 5' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getLowPerformingProducts',
      description: 'Get the worst-selling products by revenue, optionally for a specific month.',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'integer', description: 'Optional month number, 1-12' },
          year: { type: 'integer', description: 'Optional four digit year' },
          limit: { type: 'integer', description: 'How many products to return, default 5' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getLowStockItems',
      description: 'Get products whose current stock is at or below their reorder level — these need restocking.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getOverstockedItems',
      description: 'Get products holding far more stock than their reorder level suggests they need.',
      parameters: {
        type: 'object',
        properties: {
          thresholdMultiplier: { type: 'number', description: 'How many times the reorder level counts as overstocked, default 4' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getSlowMovingInventory',
      description: 'Get products that have sold very little recently despite having significant stock on hand.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'integer', description: 'How many recent days counts as "recently", default 30' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getProfitAnalysis',
      description: 'Get revenue, cost, profit, and margin for a specific month, compared to the previous month. Use this for "why are profits up/down" questions.',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'integer', description: 'Month number, 1-12' },
          year: { type: 'integer', description: 'Four digit year' },
        },
        required: ['month', 'year'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPendingInvoices',
      description: 'Get all invoices that are pending or overdue payment.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getRecommendations',
      description: 'Get a list of rule-based business recommendations covering restocking, overstock, slow movers, top performers, and overdue invoices.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

module.exports = { tools };
