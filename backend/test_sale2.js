const { getDb } = require('./src/config/db');

async function testSale() {
  try {
    const payload = {
      customer_id: 1,
      employee_id: 1,
      sale_date: '2026-06-26',
      payment_status: 'paid',
      items: [
        { product_id: 38, quantity: 1, revenue: 1999 }
      ]
    };
    console.log('Sending POST...');
    const res = await fetch('http://localhost:5003/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    console.log('Response:', data);

    if (!data.success && data.error) throw new Error(data.error);

    const db = getDb();
    const lastInvoiceId = db.prepare('SELECT MAX(id) as id FROM invoices').get().id;
    const item = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(lastInvoiceId);

    console.log('\n--- NEW INVOICE ITEM AUDIT (ID: ' + lastInvoiceId + ') ---');
    console.log('taxable_value: ' + item.taxable_value);
    console.log('cgst: ' + item.cgst);
    console.log('sgst: ' + item.sgst);
    console.log('stored total: ' + item.total);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
testSale();
