const { getDb } = require('./src/config/db');
const db = getDb();

const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoice_items'").get().sql;
console.log("SCHEMA:\n" + schema);

const rows = db.prepare("SELECT * FROM invoice_items").all();

let discrepancies = [];
for (const row of rows) {
    const computed = (row.taxable_value || 0) + (row.cgst || 0) + (row.sgst || 0) + (row.igst || 0) + (row.cess || 0);
    const rounded = Math.round(computed * 100) / 100;
    if (row.total !== rounded) {
        discrepancies.push({ id: row.id, invoice_id: row.invoice_id, stored: row.total, computed: rounded });
    }
}
console.log("\nFound " + discrepancies.length + " discrepancies in invoice_items");
console.log(discrepancies);
