const { getDb } = require('./src/config/db');
const gstEngine = require('./src/services/gstEngine');

const db = getDb();
const companySetting = db.prepare('SELECT state_code, state, gstin, company_name, legal_name, address, phone, email, is_gst_registered FROM company_settings WHERE id = 1').get() || {};
const companyStateCode = gstEngine.resolveStateCode(companySetting.state_code || companySetting.state);

const items = [{ product_id: 38, quantity: 1, revenue: 1999 }];
const enrichedItems = gstEngine.enrichItems(db, items);

const { lines } = gstEngine.buildInvoiceTotals({
  items: enrichedItems,
  companyStateCode,
  customerStateCode: companyStateCode // intrastate
});

const line = lines[0];
console.log('--- DIRECT ENGINE TEST ---');
console.log('taxable_value: ' + line.taxable_value);
console.log('cgst: ' + line.cgst);
console.log('sgst: ' + line.sgst);
console.log('igst: ' + line.igst);
console.log('total: ' + line.total);
console.log('computed: ' + (line.taxable_value + line.cgst + line.sgst + line.igst));

