const { getDb } = require('./src/config/db');

async function testSale() {
  try {
    const payload = {
      customer_id: 1,
      employee_id: 1,
      sale_date: '2026-06-26',
      payment_status: 'paid',
      items: [
        { product_id: 1, quantity: 2, revenue: 1000 }
      ]
    };
    console.log('Sending POST /api/sales...');
    const res = await fetch('http://localhost:5003/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    console.log('Sale created successfully');

    const db = getDb();
    const lastInvoiceId = db.prepare('SELECT MAX(id) as id FROM invoices').get().id;
    const item = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').get(lastInvoiceId);

    const expectedTotal = (item.taxable_value || 0) + (item.cgst || 0) + (item.sgst || 0) + (item.igst || 0);
    const roundedExpected = Math.round(expectedTotal * 100) / 100;

    console.log('\n--- NEW INVOICE ITEM AUDIT ---');
    console.log('taxable_value: ' + item.taxable_value);
    console.log('cgst: ' + item.cgst);
    console.log('sgst: ' + item.sgst);
    console.log('igst: ' + item.igst);
    console.log('cess: 0 (column does not exist in DB yet)');
    console.log('stored total: ' + item.total);
    console.log('expected total (gstEngine derived): ' + roundedExpected);
    console.log('Is correct?: ' + (item.total === roundedExpected));
  } catch (err) {
    console.error('Error creating sale:', err);
  }
}
testSale();
