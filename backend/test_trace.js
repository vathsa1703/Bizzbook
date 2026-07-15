const { getDb } = require('./src/config/db');
const gstEngine = require('./src/services/gstEngine');

const db = getDb();
const items = [{ product_id: 1, quantity: 2, revenue: 1000 }];
const enrichedItems = gstEngine.enrichItems(db, items);
console.log('Enriched:', enrichedItems);

const { lines } = gstEngine.buildInvoiceTotals({ items: enrichedItems, companyStateCode: '29', customerStateCode: '29' });
console.log('Lines:', lines);

