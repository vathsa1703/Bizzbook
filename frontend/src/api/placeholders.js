const generateId = () => Math.random().toString(36).substr(2, 9);

const BUSINESS_DATA = {
  grocery: {
    dashboardSummary: {
      total_revenue: 18450,
      transaction_count: 42,
      percent_change_vs_previous_month: 12.5,
    },
    topGroups: [
      { group_name: 'Staples & Grains', units_sold: 145, revenue: 5200 },
      { group_name: 'Dairy', units_sold: 89, revenue: 3400 },
      { group_name: 'Snacks & Beverages', units_sold: 67, revenue: 2100 },
    ],
    lowStock: [
      { id: generateId(), name: 'Aashirvaad Atta 5kg', current_stock: 2, min_stock_level: 10 },
      { id: generateId(), name: 'Amul Butter 500g', current_stock: 1, min_stock_level: 5 },
      { id: generateId(), name: 'Maggi Noodles 400g', current_stock: 4, min_stock_level: 15 },
    ],
    recommendations: [
      "Consider restocking 'Aashirvaad Atta 5kg' as it's a fast-moving staple.",
      "Bundle 'Maggi Noodles' with soft drinks to increase weekend sales.",
    ],
    products: [
      { id: generateId(), name: 'Aashirvaad Atta 5kg', price: 210, current_stock: 2, group: 'Staples & Grains' },
      { id: generateId(), name: 'Amul Butter 500g', price: 250, current_stock: 1, group: 'Dairy' },
      { id: generateId(), name: 'Maggi Noodles 400g', price: 56, current_stock: 4, group: 'Snacks & Beverages' },
      { id: generateId(), name: 'India Gate Basmati Rice 1kg', price: 120, current_stock: 25, group: 'Staples & Grains' },
    ],
    customers: [
      { id: generateId(), name: 'Ramesh Patel', phone: '9876543210', total_purchases: 15 },
      { id: generateId(), name: 'Sunita Sharma', phone: '9876543211', total_purchases: 8 },
    ],
    sales: [
      { id: generateId(), date: new Date().toISOString(), total_amount: 450, customer_name: 'Ramesh Patel' },
      { id: generateId(), date: new Date().toISOString(), total_amount: 120, customer_name: 'Walk-in' },
    ],
    creditsSummary: { outstanding_amount: 2450, overdue_count: 2 },
  },
  clothing: {
    dashboardSummary: {
      total_revenue: 43200,
      transaction_count: 71,
      percent_change_vs_previous_month: 8.4,
    },
    topGroups: [
      { group_name: 'Men\'s Wear', units_sold: 35, revenue: 21000 },
      { group_name: 'Women\'s Wear', units_sold: 28, revenue: 18500 },
      { group_name: 'Accessories', units_sold: 8, revenue: 3700 },
    ],
    lowStock: [
      { id: generateId(), name: 'Black Hoodie XL', current_stock: 1, min_stock_level: 5 },
      { id: generateId(), name: 'Blue Denim 32', current_stock: 0, min_stock_level: 3 },
    ],
    recommendations: [
      "Winter season is approaching; stock up more on 'Black Hoodies' and jackets.",
      "Discount last season's denim collection to clear inventory."
    ],
    products: [
      { id: generateId(), name: 'Black Hoodie XL', price: 1200, current_stock: 1, group: 'Men\'s Wear' },
      { id: generateId(), name: 'Blue Denim 32', price: 1500, current_stock: 0, group: 'Men\'s Wear' },
      { id: generateId(), name: 'White Silk Shirt M', price: 850, current_stock: 12, group: 'Women\'s Wear' },
    ],
    customers: [
      { id: generateId(), name: 'Karan Singh', phone: '9123456780', total_purchases: 4 },
      { id: generateId(), name: 'Priya Desai', phone: '9123456781', total_purchases: 7 },
    ],
    sales: [
      { id: generateId(), date: new Date().toISOString(), total_amount: 2700, customer_name: 'Karan Singh' },
      { id: generateId(), date: new Date().toISOString(), total_amount: 850, customer_name: 'Walk-in' },
    ],
    creditsSummary: { outstanding_amount: 0, overdue_count: 0 },
  },
  // Default fallback
  default: {
    dashboardSummary: {
      total_revenue: 25000,
      transaction_count: 50,
      percent_change_vs_previous_month: 5.0,
    },
    topGroups: [
      { group_name: 'Category A', units_sold: 40, revenue: 15000 },
      { group_name: 'Category B', units_sold: 10, revenue: 10000 },
    ],
    lowStock: [
      { id: generateId(), name: 'Demo Item 1', current_stock: 1, min_stock_level: 5 },
    ],
    recommendations: [
      "This is a demo AI recommendation. Add real products and sales to get personalized insights."
    ],
    products: [
      { id: generateId(), name: 'Demo Item 1', price: 500, current_stock: 1, group: 'Category A' },
      { id: generateId(), name: 'Demo Item 2', price: 1000, current_stock: 20, group: 'Category B' },
    ],
    customers: [
      { id: generateId(), name: 'Demo Customer', phone: '0000000000', total_purchases: 1 },
    ],
    sales: [
      { id: generateId(), date: new Date().toISOString(), total_amount: 500, customer_name: 'Demo Customer' },
    ],
    creditsSummary: { outstanding_amount: 500, overdue_count: 1 },
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
