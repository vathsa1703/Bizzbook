const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const INVOICE_DIR = path.join(__dirname, '..', '..', 'data', 'invoices');

// Ensure invoices directory exists
if (!fs.existsSync(INVOICE_DIR)) {
  fs.mkdirSync(INVOICE_DIR, { recursive: true });
}

const templatePath = path.join(__dirname, '..', 'templates', 'invoice_template.ejs');

async function generateInvoicePDF(snapshot) {
  try {
    // Basic EJS template for rendering
    // We will build a beautiful Tailwind-based HTML template here
    if (!fs.existsSync(path.dirname(templatePath))) {
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
    }
    
    if (!fs.existsSync(templatePath)) {
      const defaultTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Tax Invoice</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          body { font-family: 'Inter', -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        </style>
      </head>
      <body class="p-10 text-gray-800 bg-white">
        <div class="max-w-4xl mx-auto border border-gray-200 p-8 rounded-lg shadow-sm">
          <div class="flex justify-between items-start border-b border-gray-200 pb-6 mb-6">
            <div>
              <h1 class="text-3xl font-black tracking-tight text-gray-900"><%= company.name || 'Company Name' %></h1>
              <p class="text-sm text-gray-500 mt-1"><%= company.address || 'Company Address' %></p>
              <p class="text-sm text-gray-500">Phone: <%= company.phone || '-' %> | Email: <%= company.email || '-' %></p>
              <p class="text-sm font-bold text-gray-700 mt-2">GSTIN: <%= company.gstin || 'UNREGISTERED' %></p>
            </div>
            <div class="text-right">
              <h2 class="text-2xl font-black text-gray-300 uppercase tracking-widest mb-2">Tax Invoice</h2>
              <p class="text-sm font-bold text-gray-900"># <%= invoice.invoice_number %></p>
              <p class="text-xs text-gray-500 mt-1">Date: <%= new Date(invoice.invoice_date).toLocaleDateString('en-IN') %></p>
              <div class="mt-4 inline-block px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider
                <%= invoice.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700' %>">
                <%= invoice.payment_status %>
              </div>
            </div>
          </div>
          
          <div class="mb-8">
            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 border-b border-gray-100 pb-1">Bill To</h3>
            <p class="font-bold text-gray-900 text-lg"><%= customer.name %></p>
            <p class="text-sm text-gray-600"><%= customer.billing_address || 'Address not provided' %></p>
            <p class="text-sm text-gray-600">Phone: <%= customer.phone || '-' %></p>
            <p class="text-sm font-bold text-gray-700 mt-1">GSTIN: <%= customer.gstin || 'URP' %></p>
          </div>
          
          <table class="w-full text-left border-collapse mb-8">
            <thead>
              <tr class="border-y border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <th class="py-3 px-2 text-center">#</th>
                <th class="py-3 px-2">Item</th>
                <th class="py-3 px-2 text-right">Qty</th>
                <th class="py-3 px-2 text-right">Rate</th>
                <th class="py-3 px-2 text-right">Taxable</th>
                <th class="py-3 px-2 text-right">GST %</th>
                <th class="py-3 px-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-sm">
              <% items.forEach((item, i) => { %>
                <tr>
                  <td class="py-3 px-2 text-center text-gray-400"><%= i + 1 %></td>
                  <td class="py-3 px-2 font-medium text-gray-900"><%= item.product_name %><br><span class="text-xs text-gray-400 font-normal">HSN: <%= item.hsn_code || '-' %></span></td>
                  <td class="py-3 px-2 text-right"><%= item.quantity %></td>
                  <td class="py-3 px-2 text-right">₹<%= item.rate.toFixed(2) %></td>
                  <td class="py-3 px-2 text-right">₹<%= item.taxable_value.toFixed(2) %></td>
                  <td class="py-3 px-2 text-right"><%= item.gst_rate || 0 %>%</td>
                  <td class="py-3 px-2 text-right font-bold text-gray-900">₹<%= item.total.toFixed(2) %></td>
                </tr>
              <% }); %>
            </tbody>
          </table>
          
          <div class="flex justify-end mb-10">
            <div class="w-72 bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div class="flex justify-between text-sm mb-2"><span class="text-gray-500">Subtotal:</span> <span class="font-bold text-gray-900">₹<%= invoice.subtotal.toFixed(2) %></span></div>
              <div class="flex justify-between text-sm mb-2"><span class="text-gray-500">Taxable Value:</span> <span class="font-bold text-gray-900">₹<%= invoice.taxable_value.toFixed(2) %></span></div>
              
              <% if (invoice.igst > 0) { %>
                <div class="flex justify-between text-sm mb-2"><span class="text-gray-500">IGST:</span> <span class="font-bold text-gray-900">₹<%= invoice.igst.toFixed(2) %></span></div>
              <% } else { %>
                <div class="flex justify-between text-sm mb-2"><span class="text-gray-500">CGST:</span> <span class="font-bold text-gray-900">₹<%= invoice.cgst.toFixed(2) %></span></div>
                <div class="flex justify-between text-sm mb-2"><span class="text-gray-500">SGST:</span> <span class="font-bold text-gray-900">₹<%= invoice.sgst.toFixed(2) %></span></div>
              <% } %>
              
              <div class="border-t border-gray-200 mt-3 pt-3 flex justify-between items-center">
                <span class="text-xs font-bold text-gray-500 uppercase tracking-widest">Grand Total</span>
                <span class="text-xl font-black text-gray-900">₹<%= invoice.grand_total.toFixed(2) %></span>
              </div>
            </div>
          </div>
          
          <div class="mt-16 border-t border-gray-200 pt-8 flex justify-between items-end">
            <div>
              <p class="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Terms & Conditions</p>
              <ol class="text-xs text-gray-500 list-decimal pl-4">
                <li>Goods once sold will not be taken back.</li>
                <li>Interest @ 18% p.a. will be charged if payment is delayed.</li>
                <li>Subject to local jurisdiction.</li>
              </ol>
            </div>
            <div class="text-center">
              <div class="w-40 border-b border-gray-300 mb-2"></div>
              <p class="text-xs font-bold text-gray-500 uppercase tracking-widest">Authorized Signatory</p>
            </div>
          </div>
        </div>
      </body>
      </html>
      `;
      fs.writeFileSync(templatePath, defaultTemplate);
    }

    const htmlContent = await ejs.renderFile(templatePath, snapshot);

    const browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const filename = `${snapshot.invoice.invoice_number}.pdf`;
    const pdfPath = path.join(INVOICE_DIR, filename);
    
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    
    await browser.close();
    
    return filename; // Return relative path/name
  } catch (error) {
    console.error('[PDF Service] Error generating PDF:', error);
    throw error;
  }
}

// Generic HTML → PDF (returns a Buffer, does not write to disk). Reused by the
// compliance report exporter. Inline your CSS in the HTML — this uses
// waitUntil:'load' (no network) unlike the invoice template's CDN Tailwind.
async function renderHtmlToPdf(html, { landscape = false } = {}) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const out = await page.pdf({ format: 'A4', landscape, printBackground: true, margin: { top: '16mm', right: '12mm', bottom: '16mm', left: '12mm' } });
    return Buffer.isBuffer(out) ? out : Buffer.from(out); // Puppeteer returns Uint8Array — normalize for res.send()
  } finally {
    await browser.close();
  }
}

module.exports = { generateInvoicePDF, renderHtmlToPdf };
