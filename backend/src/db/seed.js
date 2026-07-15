const { getDb } = require('../config/db');
const bcrypt = require('bcryptjs');

const db = getDb();

const PRODUCTS = [
  { name: 'Wireless Earbuds', category: 'Electronics', cost: 800, price: 1500, baseTxn: 40, trend: 'bestseller' },
  { name: 'Bluetooth Speaker', category: 'Electronics', cost: 1200, price: 2200, baseTxn: 24, trend: 'steady' },
  { name: 'Phone Case', category: 'Accessories', cost: 80, price: 250, baseTxn: 34, trend: 'steady' },
  { name: 'Power Bank', category: 'Electronics', cost: 600, price: 1100, baseTxn: 20, trend: 'steady' },
  { name: 'Smart Watch', category: 'Electronics', cost: 2500, price: 4500, baseTxn: 18, trend: 'stockout_may' },
  { name: 'USB Cable', category: 'Accessories', cost: 50, price: 150, baseTxn: 30, trend: 'steady' },
  { name: 'Laptop Bag', category: 'Accessories', cost: 700, price: 1300, baseTxn: 6, trend: 'worst' },
  { name: 'Screen Protector', category: 'Accessories', cost: 30, price: 100, baseTxn: 22, trend: 'steady' },
];

const CUSTOMERS = [
  'Rohan Mehta', 'Priya Nair', 'Arjun Reddy', 'Sneha Kulkarni', 'Vikram Singh',
  'Ananya Iyer', 'Karthik Rao', 'Divya Menon', 'Aditya Sharma', 'Neha Gupta',
  'Sanjay Patel', 'Lakshmi Krishnan', 'Rahul Verma', 'Pooja Joshi', 'Manoj Pillai',
];

const SUPPLIERS = [
  { name: 'A-1 Electronics Distributors', contact_person: 'Amit Shah', phone: '9876543210', email: 'amit@a1distributors.com', address: 'Lamington Road, Mumbai' },
  { name: 'Mahadev Accessories', contact_person: 'Rajesh Patel', phone: '9823456789', email: 'rajesh@mahadev.com', address: 'Chandni Chowk, Delhi' },
  { name: 'Supertech Solutions', contact_person: 'Srinivas Murthy', phone: '9845012345', email: 'sales@supertech.co.in', address: 'SP Road, Bangalore' },
  { name: 'Om Mobile Wholesalers', contact_person: 'Vijay Sharma', phone: '9988776655', email: 'vijay@ommobiles.com', address: 'Gaffar Market, Delhi' },
  { name: 'Apex Components Ltd', contact_person: 'Kiran Rao', phone: '9765432109', email: 'kiran@apexcomp.com', address: 'Secunderabad, Hyderabad' }
];

const EMPLOYEES = [
  { name: 'Arjun Mehta', dept: 'Sales', salary: 35000, joined: '2024-03-15', rating: 4.8, attendance: 96 },
  { name: 'Priya Sharma', dept: 'Sales', salary: 32000, joined: '2024-05-10', rating: 4.6, attendance: 98 },
  { name: 'Rohan Nair', dept: 'Marketing', salary: 40000, joined: '2023-11-01', rating: 4.2, attendance: 94 },
  { name: 'Sneha Iyer', dept: 'Inventory', salary: 28000, joined: '2024-01-20', rating: 4.5, attendance: 99 },
  { name: 'Karthik Reddy', dept: 'Sales', salary: 33000, joined: '2024-07-01', rating: 4.3, attendance: 92 },
  { name: 'Divya Pillai', dept: 'Marketing', salary: 38000, joined: '2023-09-15', rating: 4.1, attendance: 97 },
  { name: 'Manoj Kumar', dept: 'Inventory', salary: 26000, joined: '2024-08-12', rating: 3.8, attendance: 90 },
  { name: 'Ananya Rao', dept: 'Support', salary: 29000, joined: '2024-06-18', rating: 4.0, attendance: 95 },
  { name: 'Vijay Patel', dept: 'Support', salary: 27000, joined: '2024-09-05', rating: 3.9, attendance: 93 },
  { name: 'Lakshmi Menon', dept: 'Sales', salary: 34000, joined: '2024-04-22', rating: 4.4, attendance: 98 }
];

const YEAR = 2026;
const MONTHS = [1, 2, 3, 4, 5];

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function monthFactor(trend, month) {
  switch (trend) {
    case 'bestseller':
      if (month <= 4) return 0.85 + month * 0.07;
      return 1.0;
    case 'steady':
      if (month <= 4) return 0.9 + month * 0.04;
      return 0.85;
    case 'stockout_may':
      if (month <= 4) return 1.0;
      return 0.25;
    case 'worst':
      return 0.95;
    default:
      return 1.0;
  }
}

function seed() {
  console.log('Clearing existing data...');
  db.exec('DELETE FROM credits; DELETE FROM sales; DELETE FROM inventory; DELETE FROM invoices; DELETE FROM customers; DELETE FROM products; DELETE FROM employees; DELETE FROM suppliers; DELETE FROM users;');

  // 0. Insert Auth Users
  const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
  
  const adminHash = bcrypt.hashSync('admin123', 10);
  insertUser.run('Admin User', 'admin@business.com', adminHash, 'admin');
  
  const empHash = bcrypt.hashSync('employee123', 10);
  insertUser.run('Employee User', 'employee@business.com', empHash, 'employee');
  
  console.log('Inserted 2 demo users (admin, employee).');

  // 1. Insert Suppliers
  const insertSupplier = db.prepare(
    'INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)'
  );
  const supplierIds = [];
  for (const s of SUPPLIERS) {
    const res = insertSupplier.run(s.name, s.contact_person, s.phone, s.email, s.address);
    supplierIds.push(res.lastInsertRowid);
  }
  console.log(`Inserted ${supplierIds.length} suppliers.`);

  // 2. Insert Employees
  const insertEmployee = db.prepare(
    'INSERT INTO employees (name, department, salary, joining_date, performance_rating, attendance, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const employeeIds = [];
  const salesEmployeeIds = [];
  for (const e of EMPLOYEES) {
    const res = insertEmployee.run(e.name, e.dept, e.salary, e.joined, e.rating, e.attendance, 'active');
    const empId = res.lastInsertRowid;
    employeeIds.push(empId);
    if (e.dept === 'Sales') {
      salesEmployeeIds.push(empId);
    }
  }
  console.log(`Inserted ${employeeIds.length} employees.`);

  // 3. Insert Products with supplier mapping
  const insertProduct = db.prepare(
    'INSERT INTO products (name, category, cost_price, selling_price, supplier_id) VALUES (?, ?, ?, ?, ?)'
  );
  const productIds = {};
  for (const p of PRODUCTS) {
    const randomSupplierId = supplierIds[randInt(0, supplierIds.length - 1)];
    const result = insertProduct.run(p.name, p.category, p.cost, p.price, randomSupplierId);
    productIds[p.name] = result.lastInsertRowid;
  }
  console.log(`Inserted ${PRODUCTS.length} products.`);

  // 4. Insert Customers
  const insertCustomer = db.prepare(
    'INSERT INTO customers (name, total_purchases, last_purchase_date) VALUES (?, ?, ?)'
  );
  const customerIds = [];
  for (const name of CUSTOMERS) {
    const totalPurchases = randInt(2000, 60000);
    const lastPurchaseMonth = MONTHS[randInt(0, MONTHS.length - 1)];
    const lastPurchaseDay = randInt(1, daysInMonth(lastPurchaseMonth, YEAR));
    const lastPurchaseDate = `${YEAR}-${String(lastPurchaseMonth).padStart(2, '0')}-${String(lastPurchaseDay).padStart(2, '0')}`;
    const result = insertCustomer.run(name, totalPurchases, lastPurchaseDate);
    customerIds.push(result.lastInsertRowid);
  }
  console.log(`Inserted ${CUSTOMERS.length} customers.`);

  // 5. Insert Sales
  const insertSale = db.prepare(
    'INSERT INTO sales (product_id, customer_id, employee_id, quantity, revenue, sale_date, payment_status, invoice_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertCredit = db.prepare(
    'INSERT INTO credits (customer_id, sale_id, total_amount, paid_amount, due_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  let totalSales = 0;
  let invoiceIndex = 1;
  const employeeRevenue = {};

  for (const p of PRODUCTS) {
    for (const month of MONTHS) {
      const txnCount = Math.max(1, Math.round(p.baseTxn * monthFactor(p.trend, month)));
      const dim = daysInMonth(month, YEAR);
      for (let i = 0; i < txnCount; i++) {
        const day = randInt(1, dim);
        const dateStr = `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const quantity = randInt(1, 3);
        const priceVariance = 0.95 + Math.random() * 0.1;
        const revenue = Math.round(quantity * p.price * priceVariance);
        const customerId = customerIds[randInt(0, customerIds.length - 1)];
        const employeeId = salesEmployeeIds[randInt(0, salesEmployeeIds.length - 1)];
        
        // payment status: ~85% paid, ~15% unpaid
        const paymentRoll = Math.random();
        const paymentStatus = paymentRoll < 0.85 ? 'paid' : 'unpaid';
        const invoiceNum = `INV-${YEAR}${String(month).padStart(2, '0')}-${String(invoiceIndex++).padStart(4, '0')}`;

        const saleRes = insertSale.run(productIds[p.name], customerId, employeeId, quantity, revenue, dateStr, paymentStatus, invoiceNum);
        const saleId = saleRes.lastInsertRowid;

        // Keep track of employee revenue for update later
        if (!employeeRevenue[employeeId]) employeeRevenue[employeeId] = 0;
        employeeRevenue[employeeId] += revenue;

        // If unpaid, generate credit entry
        if (paymentStatus === 'unpaid') {
          const dueDay = randInt(1, 28);
          // Due next month
          const dueMonth = month === 12 ? 1 : month + 1;
          const dueYear = month === 12 ? YEAR + 1 : YEAR;
          const dueDateStr = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
          
          let creditStatus = 'pending';
          let paidAmount = 0;
          
          const creditRoll = Math.random();
          if (creditRoll < 0.4) {
            paidAmount = Math.round(revenue * 0.4);
          } else if (creditRoll < 0.7 && month < 5) {
            creditStatus = 'overdue';
          }
          
          insertCredit.run(customerId, saleId, revenue, paidAmount, dueDateStr, creditStatus, `Auto-generated credit from ${invoiceNum}`);
        }

        totalSales++;
      }
    }
  }
  console.log(`Inserted ${totalSales} sale transactions.`);

  // 6. Update employees with actual revenue generated
  const updateEmpRevenue = db.prepare('UPDATE employees SET revenue_generated = ? WHERE id = ?');
  for (const empId of employeeIds) {
    const rev = employeeRevenue[empId] || randInt(50000, 150000);
    updateEmpRevenue.run(rev, empId);
  }
  console.log('Updated employee revenue_generated statistics.');

  // 7. Insert Inventory levels
  const insertInventory = db.prepare(
    'INSERT INTO inventory (product_id, stock_quantity, reorder_level, last_restocked) VALUES (?, ?, ?, ?)'
  );
  const inventoryState = {
    'Wireless Earbuds': { stock: 45, reorder: 30, restocked: '2026-05-20' },
    'Bluetooth Speaker': { stock: 38, reorder: 20, restocked: '2026-05-10' },
    'Phone Case': { stock: 90, reorder: 40, restocked: '2026-05-15' },
    'Power Bank': { stock: 12, reorder: 15, restocked: '2026-04-28' },
    'Smart Watch': { stock: 3, reorder: 15, restocked: '2026-04-05' },
    'USB Cable': { stock: 70, reorder: 25, restocked: '2026-05-18' },
    'Laptop Bag': { stock: 180, reorder: 20, restocked: '2026-02-10' },
    'Screen Protector': { stock: 55, reorder: 25, restocked: '2026-05-12' },
  };
  for (const [name, state] of Object.entries(inventoryState)) {
    insertInventory.run(productIds[name], state.stock, state.reorder, state.restocked);
  }
  console.log('Inserted inventory levels.');

  // 8. Insert Invoices (standalone invoices)
  const insertInvoice = db.prepare(
    'INSERT INTO invoices (invoice_number, customer_id, amount, invoice_date, status) VALUES (?, ?, ?, ?, ?)'
  );
  let invoiceCount = 0;
  for (const month of MONTHS) {
    const invoicesThisMonth = randInt(6, 10);
    for (let i = 0; i < invoicesThisMonth; i++) {
      invoiceCount++;
      const invoiceNumber = `INV-${YEAR}${String(month).padStart(2, '0')}-${String(invoiceCount).padStart(4, '0')}`;
      const customerId = customerIds[randInt(0, customerIds.length - 1)];
      const amount = randInt(500, 8000);
      const day = randInt(1, daysInMonth(month, YEAR));
      const date = `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const statusRoll = Math.random();
      const status = statusRoll < 0.8 ? 'paid' : statusRoll < 0.93 ? 'pending' : 'overdue';
      insertInvoice.run(invoiceNumber, customerId, amount, date, status);
    }
  }
  console.log(`Inserted ${invoiceCount} standalone invoices.`);

  console.log('Seed complete.');
}

seed();
db.close();
