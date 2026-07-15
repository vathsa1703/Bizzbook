const { getDb } = require('./src/config/db');
const { hashPassword } = require('./src/services/authService');

const EMPLOYEES = [
  { name: 'Aarav Sharma', title: 'Store Manager', dept: 'Operations', role: 'MANAGER' },
  { name: 'Priya Patel', title: 'Senior Cashier', dept: 'Sales', role: 'CASHIER' },
  { name: 'Rohan Gupta', title: 'Inventory Specialist', dept: 'Inventory', role: 'INVENTORY' },
  { name: 'Sneha Desai', title: 'Accounts Executive', dept: 'Operations', role: 'ACCOUNTANT' },
  { name: 'Vikram Singh', title: 'Sales Executive', dept: 'Sales', role: 'CASHIER' },
  { name: 'Ananya Reddy', title: 'Customer Support', dept: 'Support', role: 'CASHIER' },
  { name: 'Rahul Verma', title: 'Delivery Coordinator', dept: 'Operations', role: 'INVENTORY' },
  { name: 'Neha Joshi', title: 'Junior Cashier', dept: 'Sales', role: 'CASHIER' },
  { name: 'Aditya Mehta', title: 'Warehouse Staff', dept: 'Inventory', role: 'INVENTORY' },
  { name: 'Kavya Nair', title: 'Marketing Assistant', dept: 'Marketing', role: 'MANAGER' }
];

const PRODUCTS = [
  { name: 'Sony Bravia 55" 4K TV', cost: 45000, sell: 55000, gst: 18, group: 'Televisions' },
  { name: 'Samsung Galaxy S23', cost: 60000, sell: 75000, gst: 18, group: 'Smartphones' },
  { name: 'Apple iPhone 15 Pro', cost: 110000, sell: 135000, gst: 18, group: 'Smartphones' },
  { name: 'LG 1.5 Ton Split AC', cost: 28000, sell: 35000, gst: 28, group: 'Air Conditioners' },
  { name: 'Whirlpool 265L Refrigerator', cost: 20000, sell: 26000, gst: 18, group: 'Appliances' },
  { name: 'Dell XPS 13 Laptop', cost: 85000, sell: 95000, gst: 18, group: 'Laptops' },
  { name: 'MacBook Air M2', cost: 90000, sell: 105000, gst: 18, group: 'Laptops' },
  { name: 'Sony PlayStation 5', cost: 40000, sell: 50000, gst: 18, group: 'Gaming' },
  { name: 'Bose QuietComfort 45', cost: 20000, sell: 25000, gst: 18, group: 'Audio' },
  { name: 'Apple AirPods Pro', cost: 18000, sell: 22000, gst: 18, group: 'Audio' },
  { name: 'Samsung 32" Monitor', cost: 15000, sell: 20000, gst: 18, group: 'Peripherals' },
  { name: 'Logitech MX Master 3', cost: 6000, sell: 8000, gst: 18, group: 'Peripherals' },
  { name: 'Dyson V11 Vacuum', cost: 40000, sell: 48000, gst: 18, group: 'Appliances' },
  { name: 'Philips Air Fryer', cost: 7000, sell: 10000, gst: 18, group: 'Appliances' },
  { name: 'Canon EOS R5', cost: 250000, sell: 280000, gst: 18, group: 'Cameras' },
  { name: 'GoPro HERO12', cost: 30000, sell: 38000, gst: 18, group: 'Cameras' },
  { name: 'OnePlus 12', cost: 50000, sell: 65000, gst: 18, group: 'Smartphones' },
  { name: 'Mi Smart Band 8', cost: 2000, sell: 3500, gst: 18, group: 'Wearables' },
  { name: 'Apple Watch Series 9', cost: 35000, sell: 42000, gst: 18, group: 'Wearables' },
  { name: 'JBL Charge 5', cost: 10000, sell: 14000, gst: 18, group: 'Audio' }
];

const CUSTOMERS = [
  'Ramesh Traders', 'Balaji Electronics', 'Suresh & Co', 'Tech Haven', 'Digital World',
  'Anita Sharma', 'Rahul Dravid', 'Meera Kapoor', 'Karan Singh', 'Pooja Hegde',
  'Amitabh Bachchan', 'Zoya Akhtar', 'Manoj Bajpayee', 'Radhika Apte', 'Nawazuddin Siddiqui',
  'Apex Enterprises', 'Nexus Solutions', 'Prime Technologies', 'Sunrise Retail', 'Global Tech'
];

const SUPPLIERS = [
  'Samsung India Electronics', 'Apple India', 'Sony India', 'LG Electronics India', 
  'Dell India', 'Tech Data', 'Redington India'
];

function r2(num) { return Math.round(num * 100) / 100; }

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seed() {
  const db = getDb();
  console.log('Starting DB Seed...');

  try {
    // 0. Cleanup existing test data (Must be done outside transaction in SQLite)
    db.exec('PRAGMA foreign_keys = OFF;');
    const existingUser = db.prepare('SELECT company_id FROM users WHERE email = ?').get('jrsrivatsa@gmail.com');
    if (existingUser) {
      db.prepare('DELETE FROM users WHERE email = ?').run('jrsrivatsa@gmail.com');
      db.prepare('DELETE FROM employees WHERE email = ?').run('jrsrivatsa@gmail.com');
      // Also delete any existing testing company associated with it if possible
    }
    
    db.prepare("DELETE FROM users WHERE email LIKE '%@testingcompany.com'").run();
    db.prepare("DELETE FROM employees WHERE email LIKE '%@testingcompany.com'").run();
    db.prepare("DELETE FROM companies WHERE name = 'Testing company'").run();
    db.exec('PRAGMA foreign_keys = ON;');

    db.exec('BEGIN TRANSACTION');

    // 1. Create Company
    const compInsert = db.prepare('INSERT INTO companies (name, business_type) VALUES (?, ?)').run('Testing company', 'Electronics');
    const companyId = compInsert.lastInsertRowid;
    console.log('Company created:', companyId);

    // 1b. Company Settings
    db.prepare('INSERT INTO company_settings (company_id, inclusive_pricing, gstin, state) VALUES (?, ?, ?, ?)').run(companyId, 1, '29ABCDE1234F1Z5', 'Karnataka');

    // 2. Create Owner
    const ownerHash = await hashPassword('ViratKohli@2005');
    const ownerUser = db.prepare('INSERT INTO users (company_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)').run(companyId, 'J R Srivatsa', 'jrsrivatsa@gmail.com', ownerHash, 'OWNER', 'Active');
    const ownerUserId = ownerUser.lastInsertRowid;
    
    // Auto-generate employee code based on max ID
    const maxEmp = db.prepare('SELECT MAX(id) as maxId FROM employees').get();
    let empIdCounter = (maxEmp.maxId || 0) + 1;
    const ownerCode = `EMP${String(empIdCounter).padStart(5, '0')}`;

    db.prepare(`
      INSERT INTO employees (company_id, name, department, salary, joining_date, status, user_id, employee_code, email, job_title) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, 'J R Srivatsa', 'Operations', 150000, '2025-01-01', 'Active', ownerUserId, ownerCode, 'jrsrivatsa@gmail.com', 'Owner / CEO');
    
    // 3. Create Employees
    empIdCounter++;
    for (const emp of EMPLOYEES) {
      const email = emp.name.toLowerCase().replace(' ', '.') + '@testingcompany.com';
      const hash = await hashPassword('Demo@1234');
      const uInsert = db.prepare('INSERT INTO users (company_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)').run(companyId, emp.name, email, hash, emp.role, 'Active');
      
      const code = `EMP${String(empIdCounter).padStart(5, '0')}`;
      db.prepare(`
        INSERT INTO employees (company_id, name, department, salary, joining_date, status, user_id, employee_code, email, job_title) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(companyId, emp.name, emp.dept, Math.floor(Math.random() * 30000) + 20000, '2025-02-15', 'Active', uInsert.lastInsertRowid, code, email, emp.title);
      empIdCounter++;
    }
    console.log('Employees created');

    // 4. Create Groups & Products
    const groups = {};
    for (const p of PRODUCTS) {
      if (!groups[p.group]) {
        const gInsert = db.prepare('INSERT INTO product_groups (name) VALUES (?)').run(p.group);
        groups[p.group] = gInsert.lastInsertRowid;
      }
    }
    
    const prodIds = [];
    for (const p of PRODUCTS) {
      const pInsert = db.prepare(`
        INSERT INTO products (name, category, group_id, company_id, cost_price, selling_price, gst_rate, hsn_code, uqc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(p.name, p.group, groups[p.group], companyId, p.cost, p.sell, p.gst, '8517', 'NOS');
      prodIds.push(pInsert.lastInsertRowid);
      
      // Add inventory
      db.prepare('INSERT INTO inventory (company_id, product_id, stock_quantity, reorder_level) VALUES (?, ?, ?, ?)').run(companyId, pInsert.lastInsertRowid, Math.floor(Math.random() * 50) + 10, 5);
    }
    console.log('Products created');

    // 5. Customers
    const custIds = [];
    for (const c of CUSTOMERS) {
      const isB2b = Math.random() > 0.5;
      const gstin = isB2b ? '29TESTING' + Math.floor(Math.random()*1000) + '1Z5' : null;
      const cInsert = db.prepare('INSERT INTO customers (company_id, name, gstin) VALUES (?, ?, ?)').run(companyId, c, gstin);
      custIds.push(cInsert.lastInsertRowid);
    }
    
    // 6. Suppliers
    const suppIds = [];
    for (const s of SUPPLIERS) {
      const sInsert = db.prepare('INSERT INTO suppliers (company_id, name) VALUES (?, ?)').run(companyId, s);
      suppIds.push(sInsert.lastInsertRowid);
    }

    // Fetch the list of new employees to assign sales
    const newEmps = db.prepare('SELECT employees.id FROM employees LEFT JOIN users u ON employees.user_id = u.id WHERE employees.company_id = ? AND u.role != \'OWNER\'').all(companyId).map(e => e.id);

    // 7. Generate historical sales
    const startDate = new Date('2026-03-01');
    const endDate = new Date('2026-06-29');
    
    let invoiceCounter = 1;
    for (let i = 0; i < 120; i++) {
      const date = randomDate(startDate, endDate);
      const custId = custIds[Math.floor(Math.random() * custIds.length)];
      
      const numItems = Math.floor(Math.random() * 3) + 1;
      let totalGross = 0;
      let totalTaxable = 0;
      let totalCgst = 0;
      let totalSgst = 0;
      
      const items = [];
      for (let j=0; j<numItems; j++) {
         const prodIndex = Math.floor(Math.random() * prodIds.length);
         const pId = prodIds[prodIndex];
         const p = PRODUCTS[prodIndex];
         const qty = Math.floor(Math.random() * 2) + 1;
         
         const lineGross = p.sell * qty;
         const taxFactor = 100 + p.gst;
         const gstAmt = r2((lineGross * p.gst) / taxFactor);
         const tv = r2(lineGross - gstAmt);
         const cgst = r2(gstAmt / 2);
         const sgst = r2(gstAmt / 2);
         
         items.push({ pId, qty, tv, cgst, sgst, tot: lineGross, rate: p.sell });
         totalGross += lineGross;
         totalTaxable += tv;
         totalCgst += cgst;
         totalSgst += sgst;
      }
      
      const isoDate = date.toISOString().split('T')[0];
      const invNum = `INV-C${companyId}-${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}-${String(invoiceCounter++).padStart(4,'0')}`;
      
      const invInsert = db.prepare(`
        INSERT INTO invoices (company_id, invoice_number, customer_id, subtotal, taxable_value, cgst, sgst, igst, grand_total, amount, invoice_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'paid')
      `).run(companyId, invNum, custId, totalGross, totalTaxable, totalCgst, totalSgst, totalGross, totalGross, isoDate);
      const invId = invInsert.lastInsertRowid;
      
      // Random employee (sales rep) from the newly created ones
      // Find employees for this company
      const companyEmps = db.prepare('SELECT id FROM employees WHERE company_id = ?').all(companyId);
      const empId = companyEmps[Math.floor(Math.random() * companyEmps.length)].id;
      
      for (const item of items) {
        db.prepare(`
          INSERT INTO invoice_items (company_id, invoice_id, product_id, quantity, rate, taxable_value, cgst, sgst, igst, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `).run(companyId, invId, item.pId, item.qty, item.rate, item.tv, item.cgst, item.sgst, item.tot);
        
        db.prepare(`
          INSERT INTO sales (company_id, product_id, customer_id, employee_id, quantity, revenue, sale_date, invoice_id, invoice_number)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(companyId, item.pId, custId, empId, item.qty, item.tot, isoDate, invId, invNum);
        
        // Add revenue to employee
        db.prepare('UPDATE employees SET revenue_generated = revenue_generated + ? WHERE id = ?').run(item.tot, empId);
        
        // Deduct inventory
        db.prepare('UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE product_id = ? AND company_id = ?').run(item.qty, item.pId, companyId);
      }
    }
    
    console.log('Sales & Invoices generated');

    db.exec('COMMIT');
    console.log('Seed Complete!');
    
    // Output employee table for user
    const finalEmps = db.prepare('SELECT e.employee_code, e.name, u.role, e.department, u.email, e.status FROM employees e LEFT JOIN users u ON e.user_id = u.id WHERE e.company_id = ?').all(companyId);
    
    let md = '| Employee ID | Name | Role | Department | Email | Password | Status |\n';
    md += '|---|---|---|---|---|---|---|\n';
    for (const fe of finalEmps) {
       const pass = fe.role === 'OWNER' ? 'ViratKohli@2005' : 'Demo@1234';
       md += `| ${fe.employee_code} | ${fe.name} | ${fe.role || ''} | ${fe.department} | ${fe.email || ''} | ${pass} | ${fe.status} |\n`;
    }
    console.log('---OUTPUT---');
    console.log(md);

  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Seed failed:', err);
  } finally {
    db.close();
  }
}

seed();
