const generateId = () => Math.random().toString(36).substr(2, 9);

// Field names in every mock below are chosen to match what the CONSUMING
// component actually reads (Home.jsx / Sales.jsx / Stock.jsx / Customers.jsx /
// ProductGroups.jsx / Credit.jsx / Purchases.jsx), not necessarily what the
// real backend endpoint happens to return — see the placeholder-shape audit
// on fix/employee-fk-and-credits for the full mock-vs-consumer-vs-real-backend
// cross-reference. A few endpoints (`topGroups`, and the aggregate `sales`
// list's real backend shape) have a separate, pre-existing mismatch between
// what the component reads and what the *real* backend returns — that's a
// different bug (affects real data too, not just placeholders) and is out of
// scope here; only the mock-vs-consumer shape is fixed in this file.
const BUSINESS_DATA = {
  grocery: {
    dashboardSummary: {
      total_revenue: 18450,
      total_units_sold: 312,
      transaction_count: 42,
      percent_change_vs_previous_month: 12.5,
    },
    topGroups: [
      { group_name: 'Staples & Grains', units_sold: 145, revenue: 5200 },
      { group_name: 'Dairy', units_sold: 89, revenue: 3400 },
      { group_name: 'Snacks & Beverages', units_sold: 67, revenue: 2100 },
    ],
    lowStock: [
      { id: generateId(), name: 'Aashirvaad Atta 5kg', stock_quantity: 2, reorder_level: 10, group_name: 'Staples & Grains' },
      { id: generateId(), name: 'Amul Butter 500g', stock_quantity: 1, reorder_level: 5, group_name: 'Dairy' },
      { id: generateId(), name: 'Maggi Noodles 400g', stock_quantity: 4, reorder_level: 15, group_name: 'Snacks & Beverages' },
    ],
    recommendations: [
      "Consider restocking 'Aashirvaad Atta 5kg' as it's a fast-moving staple.",
      "Bundle 'Maggi Noodles' with soft drinks to increase weekend sales.",
    ],
    products: [
      { id: generateId(), name: 'Aashirvaad Atta 5kg', selling_price: 210, cost_price: 150, stock_quantity: 2, group_name: 'Staples & Grains', group_id: 'staples' },
      { id: generateId(), name: 'Amul Butter 500g', selling_price: 250, cost_price: 190, stock_quantity: 1, group_name: 'Dairy', group_id: 'dairy' },
      { id: generateId(), name: 'Maggi Noodles 400g', selling_price: 56, cost_price: 38, stock_quantity: 4, group_name: 'Snacks & Beverages', group_id: 'snacks' },
      { id: generateId(), name: 'India Gate Basmati Rice 1kg', selling_price: 120, cost_price: 92, stock_quantity: 25, group_name: 'Staples & Grains', group_id: 'staples' },
    ],
    customers: [
      { id: generateId(), name: 'Ramesh Patel', phone: '9876543210', total_purchases: 15, gstin: null, state_code: null },
      { id: generateId(), name: 'Sunita Sharma', phone: '9876543211', total_purchases: 8, gstin: null, state_code: null },
    ],
    sales: [
      { id: generateId(), sale_date: new Date().toISOString(), revenue: 450, customer_name: 'Ramesh Patel', product_name: 'Aashirvaad Atta 5kg', quantity: 2, payment_status: 'paid', invoice_number: 'DEMO-0001', invoice_id: null },
      { id: generateId(), sale_date: new Date().toISOString(), revenue: 120, customer_name: 'Walk-in', product_name: 'Maggi Noodles 400g', quantity: 2, payment_status: 'paid', invoice_number: 'DEMO-0002', invoice_id: null },
    ],
    creditsSummary: { outstanding_amount: 2450, paid_amount: 1200, overdue_count: 2 },
  },
  clothing: {
    dashboardSummary: {
      total_revenue: 43200,
      total_units_sold: 71,
      transaction_count: 71,
      percent_change_vs_previous_month: 8.4,
    },
    topGroups: [
      { group_name: 'Men\'s Wear', units_sold: 35, revenue: 21000 },
      { group_name: 'Women\'s Wear', units_sold: 28, revenue: 18500 },
      { group_name: 'Accessories', units_sold: 8, revenue: 3700 },
    ],
    lowStock: [
      { id: generateId(), name: 'Black Hoodie XL', stock_quantity: 1, reorder_level: 5, group_name: 'Men\'s Wear' },
      { id: generateId(), name: 'Blue Denim 32', stock_quantity: 0, reorder_level: 3, group_name: 'Men\'s Wear' },
    ],
    recommendations: [
      "Winter season is approaching; stock up more on 'Black Hoodies' and jackets.",
      "Discount last season's denim collection to clear inventory."
    ],
    products: [
      { id: generateId(), name: 'Black Hoodie XL', selling_price: 1200, cost_price: 780, stock_quantity: 1, group_name: 'Men\'s Wear', group_id: 'mens' },
      { id: generateId(), name: 'Blue Denim 32', selling_price: 1500, cost_price: 980, stock_quantity: 0, group_name: 'Men\'s Wear', group_id: 'mens' },
      { id: generateId(), name: 'White Silk Shirt M', selling_price: 850, cost_price: 520, stock_quantity: 12, group_name: 'Women\'s Wear', group_id: 'womens' },
    ],
    customers: [
      { id: generateId(), name: 'Karan Singh', phone: '9123456780', total_purchases: 4, gstin: null, state_code: null },
      { id: generateId(), name: 'Priya Desai', phone: '9123456781', total_purchases: 7, gstin: null, state_code: null },
    ],
    sales: [
      { id: generateId(), sale_date: new Date().toISOString(), revenue: 2700, customer_name: 'Karan Singh', product_name: 'Black Hoodie XL', quantity: 1, payment_status: 'paid', invoice_number: 'DEMO-0001', invoice_id: null },
      { id: generateId(), sale_date: new Date().toISOString(), revenue: 850, customer_name: 'Walk-in', product_name: 'White Silk Shirt M', quantity: 1, payment_status: 'paid', invoice_number: 'DEMO-0002', invoice_id: null },
    ],
    creditsSummary: { outstanding_amount: 0, paid_amount: 1800, overdue_count: 0 },
  },
  // Default fallback
  default: {
    dashboardSummary: {
      total_revenue: 25000,
      total_units_sold: 50,
      transaction_count: 50,
      percent_change_vs_previous_month: 5.0,
    },
    topGroups: [
      { group_name: 'Category A', units_sold: 40, revenue: 15000 },
      { group_name: 'Category B', units_sold: 10, revenue: 10000 },
    ],
    lowStock: [
      { id: generateId(), name: 'Demo Item 1', stock_quantity: 1, reorder_level: 5, group_name: 'Category A' },
    ],
    recommendations: [
      "This is a demo AI recommendation. Add real products and sales to get personalized insights."
    ],
    products: [
      { id: generateId(), name: 'Demo Item 1', selling_price: 500, cost_price: 350, stock_quantity: 1, group_name: 'Category A', group_id: 'cat-a' },
      { id: generateId(), name: 'Demo Item 2', selling_price: 1000, cost_price: 700, stock_quantity: 20, group_name: 'Category B', group_id: 'cat-b' },
    ],
    customers: [
      { id: generateId(), name: 'Demo Customer', phone: '0000000000', total_purchases: 1, gstin: null, state_code: null },
    ],
    sales: [
      { id: generateId(), sale_date: new Date().toISOString(), revenue: 500, customer_name: 'Demo Customer', product_name: 'Demo Item 1', quantity: 1, payment_status: 'paid', invoice_number: 'DEMO-0001', invoice_id: null },
    ],
    creditsSummary: { outstanding_amount: 500, paid_amount: 300, overdue_count: 1 },
  }
};

export function getPlaceholderData(endpoint, type = 'default') {
  const data = BUSINESS_DATA[type] || BUSINESS_DATA['default'];

  // Match the endpoint to the correct mock data
  if (endpoint.includes('/analytics/sales-summary')) {
    return data.dashboardSummary;
  }
  if (endpoint.includes('/analytics/top-groups')) {
    return { data: data.topGroups }; // Some APIs wrap in data
  }
  if (endpoint.includes('/analytics/low-stock')) {
    return data.lowStock;
  }
  if (endpoint.includes('/analytics/recommendations')) {
    return data.recommendations;
  }
  if (endpoint.includes('/products')) {
    return data.products;
  }
  if (endpoint.includes('/customers')) {
    return data.customers;
  }
  if (endpoint.includes('/sales')) {
    return data.sales;
  }
  if (endpoint.includes('/credits/summary')) {
    return data.creditsSummary;
  }

  // Return null if no placeholder mapping found, allowing normal empty state
  return null;
}
