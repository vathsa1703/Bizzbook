import React, { useEffect, useState } from 'react';
import { Download, Printer, ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';

export default function InvoiceView({ invoiceId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.getInvoice(invoiceId);
        setData(res);
      } catch (err) {
        setError(err.message || 'Failed to load invoice');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [invoiceId]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await api.downloadInvoicePdf(invoiceId);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${data?.invoice?.invoice_number || 'invoice'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      alert('Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    // In a real app we might open the PDF or trigger a print stylesheet
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <RefreshCw size={24} className="animate-spin text-brand-blue" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gray-50 p-6 text-center">
        <AlertTriangle size={48} className="text-brand-red mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Invoice Not Found</h2>
        <p className="text-gray-500 mb-6">{error}</p>
        <button onClick={onBack} className="px-4 py-2 bg-brand-blue text-white rounded-lg font-bold text-sm">
          Go Back
        </button>
      </div>
    );
  }

  // We use snapshot if it exists (frozen truth), otherwise fallback to the live fetched data
  const snapshot = data.snapshot;
  const company = snapshot ? snapshot.company : {};
  const customer = snapshot ? snapshot.customer : { name: data.invoice.customer_name, billing_address: data.invoice.billing_address, gstin: data.invoice.customer_gstin, phone: data.invoice.phone, email: data.invoice.email };
  const invoice = snapshot ? snapshot.invoice : data.invoice;
  const items = snapshot ? snapshot.items : data.items;

  return (
    <div className="min-h-screen bg-gray-100 pb-20 print:bg-white print:pb-0">
      {/* Top action bar (hidden in print) */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 print:hidden">
        <button onClick={onBack} className="flex items-center text-gray-600 hover:text-gray-900 text-sm font-semibold transition-colors">
          <ArrowLeft size={16} className="mr-1" /> Back
        </button>
        <div className="flex gap-3">
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-200 transition-colors">
            <Printer size={14} /> Print
          </button>
          <button onClick={handleDownload} disabled={downloading} className="flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white font-bold text-xs rounded-xl shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
            {downloading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />} 
            Download PDF
          </button>
        </div>
      </div>

      {/* Invoice Document Canvas */}
      <div className="max-w-4xl mx-auto mt-8 bg-white border border-gray-200 p-10 rounded-lg shadow-sm print:shadow-none print:border-none print:mt-0 print:p-0">
        <div className="flex justify-between items-start border-b border-gray-200 pb-6 mb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900">{company.company_name || 'ORUDINA'}</h1>
            <p className="text-sm text-gray-500 mt-1">{company.address || '123 Tech Park, Block A'}</p>
            <p className="text-sm text-gray-500">Phone: {company.phone || '+91 9876543210'} | Email: {company.email || 'billing@orudina.com'}</p>
            <p className="text-sm font-bold text-gray-700 mt-2">GSTIN: {company.gstin || '29ABCDE1234F1Z5'}</p>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-black text-gray-300 uppercase tracking-widest mb-2">Tax Invoice</h2>
            <p className="text-sm font-bold text-gray-900"># {invoice.invoice_number}</p>
            <p className="text-xs text-gray-500 mt-1">Date: {new Date(invoice.invoice_date).toLocaleDateString('en-IN')}</p>
            <div className={`mt-4 inline-block px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider
              ${invoice.payment_status === 'PAID' ? 'bg-brand-greenSoft text-brand-green' : 'bg-brand-redSoft text-brand-red'}`}>
              {invoice.payment_status}
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 border-b border-gray-100 pb-1">Bill To</h3>
          <p className="font-bold text-gray-900 text-lg">{customer.name}</p>
          <p className="text-sm text-gray-600">{customer.billing_address || 'Address not provided'}</p>
          <p className="text-sm text-gray-600">Phone: {customer.phone || '-'}</p>
          <p className="text-sm font-bold text-gray-700 mt-1">GSTIN: {customer.gstin || 'URP'}</p>
        </div>

        <table className="w-full text-left border-collapse mb-8">
          <thead>
            <tr className="border-y border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <th className="py-3 px-2 text-center">#</th>
              <th className="py-3 px-2">Item</th>
              <th className="py-3 px-2 text-right">Qty</th>
              <th className="py-3 px-2 text-right">Rate</th>
              <th className="py-3 px-2 text-right">Taxable</th>
              <th className="py-3 px-2 text-right">GST %</th>
              <th className="py-3 px-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {items.map((item, i) => (
              <tr key={i}>
                <td className="py-3 px-2 text-center text-gray-400">{i + 1}</td>
                <td className="py-3 px-2 font-medium text-gray-900">
                  {item.product_name}
                  <div className="text-[10px] text-gray-400 font-normal">HSN: {item.hsn_code || '-'}</div>
                </td>
                <td className="py-3 px-2 text-right">{item.quantity}</td>
                <td className="py-3 px-2 text-right">₹{Number(item.rate).toFixed(2)}</td>
                <td className="py-3 px-2 text-right">₹{Number(item.taxable_value).toFixed(2)}</td>
                <td className="py-3 px-2 text-right">{item.gst_rate || 0}%</td>
                <td className="py-3 px-2 text-right font-bold text-gray-900">₹{Number(item.total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-10">
          <div className="w-72 bg-gray-50 rounded-lg p-4 border border-gray-100">
            <div className="flex justify-between text-sm mb-2"><span className="text-gray-500">Subtotal:</span> <span className="font-bold text-gray-900">₹{Number(invoice.subtotal).toFixed(2)}</span></div>
            <div className="flex justify-between text-sm mb-2"><span className="text-gray-500">Taxable Value:</span> <span className="font-bold text-gray-900">₹{Number(invoice.taxable_value).toFixed(2)}</span></div>
            
            {Number(invoice.igst) > 0 ? (
              <div className="flex justify-between text-sm mb-2"><span className="text-gray-500">IGST:</span> <span className="font-bold text-gray-900">₹{Number(invoice.igst).toFixed(2)}</span></div>
            ) : (
              <>
                <div className="flex justify-between text-sm mb-2"><span className="text-gray-500">CGST:</span> <span className="font-bold text-gray-900">₹{Number(invoice.cgst).toFixed(2)}</span></div>
                <div className="flex justify-between text-sm mb-2"><span className="text-gray-500">SGST:</span> <span className="font-bold text-gray-900">₹{Number(invoice.sgst).toFixed(2)}</span></div>
              </>
            )}
            
            <div className="border-t border-gray-200 mt-3 pt-3 flex justify-between items-center">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Grand Total</span>
              <span className="text-xl font-black text-gray-900">₹{Number(invoice.grand_total).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-gray-200 pt-8 flex justify-between items-end">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Terms & Conditions</p>
            <ol className="text-xs text-gray-500 list-decimal pl-4">
              <li>Goods once sold will not be taken back.</li>
              <li>Interest @ 18% p.a. will be charged if payment is delayed.</li>
              <li>Subject to local jurisdiction.</li>
            </ol>
          </div>
          <div className="text-center">
            <div className="w-40 border-b border-gray-300 mb-2"></div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Authorized Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
