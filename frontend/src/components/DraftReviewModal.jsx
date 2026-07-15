import React, { useState } from 'react';
import Modal from './Modal';
import { api } from '../api/client';
import { useToast } from './ToastContext';
import { AlertTriangle, Check, Search } from 'lucide-react';

export default function DraftReviewModal({ type, data, products, onClose, onSuccess }) {
  const [items, setItems] = useState(data.items || []);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const handleUpdateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleMatchProduct = (index, productId) => {
    const prod = products.find(p => String(p.id) === String(productId));
    if (!prod) return;
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      product_id: prod.id,
      matched_name: prod.name,
      is_matched: true,
      price: newItems[index].price || prod.selling_price
    };
    setItems(newItems);
  };

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Validate
    const unmapped = items.filter(i => !i.is_matched && type === 'sales');
    if (unmapped.length > 0) {
      showToast('error', 'Please map all unknown products before saving a sale.');
      return;
    }

    if (items.length === 0) {
      showToast('error', 'No items to save.');
      return;
    }

    setSubmitting(true);
    try {
      if (type === 'sales') {
        const payload = {
          items: items.map(i => ({
            product_id: i.product_id,
            quantity: i.quantity || 1,
            revenue: (i.quantity || 1) * (i.price || 0)
          })),
          sale_date: new Date().toISOString().split('T')[0],
          payment_status: 'paid' // default
        };
        await api.createBulkSale(payload);
      } else {
        // Stock
        const payload = {
          items: items.map(i => ({
            product_id: i.product_id,
            product_name: !i.is_matched ? i.product_name : undefined,
            quantity: i.quantity || 1,
            price: i.price || 0
          })),
          date: data.date || new Date().toISOString().split('T')[0],
          supplier_name: data.supplier_name,
          invoice_number: data.invoice_number
        };
        await api.createBulkStock(payload);
      }
      
      showToast('success', `${type === 'sales' ? 'Sale' : 'Stock'} recorded successfully`);
      onSuccess();
    } catch (err) {
      showToast('error', err.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Review ${type === 'sales' ? 'Sale' : 'Stock'} Draft`} onClose={onClose} size="lg">
      <div className="p-4 max-h-[70vh] overflow-y-auto">
        
        {data.supplier_name && (
          <div className="mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500 font-bold uppercase mb-1">Invoice Details</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p><span className="text-gray-500">Supplier:</span> {data.supplier_name}</p>
              <p><span className="text-gray-500">Invoice:</span> {data.invoice_number || 'N/A'}</p>
              <p><span className="text-gray-500">Date:</span> {data.date || 'N/A'}</p>
              <p><span className="text-gray-500">Extracted Total:</span> ₹{data.total || 0}</p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className={`p-4 rounded-xl border ${item.is_matched ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50'}`}>
              
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-bold text-gray-900">{item.product_name || 'Unknown Item'}</h4>
                  {item.is_matched ? (
                    <p className="text-xs text-brand-green font-semibold flex items-center gap-1 mt-0.5">
                      <Check size={12} /> Matched to: {item.matched_name}
                    </p>
                  ) : (
                    <p className="text-xs text-brand-amber font-semibold flex items-center gap-1 mt-0.5">
                      <AlertTriangle size={12} /> Unknown Product
                    </p>
                  )}
                </div>
                <button onClick={() => handleRemoveItem(index)} className="text-xs text-red-500 font-semibold hover:underline">
                  Remove
                </button>
              </div>

              {!item.is_matched && (
                <div className="mb-3">
                  <label className="text-xs text-gray-600 font-semibold mb-1 block">Map to existing product {type === 'stock' ? '(or leave empty to create new)' : ''}</label>
                  <select 
                    onChange={(e) => handleMatchProduct(index, e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-800 focus:outline-brand-blue"
                  >
                    <option value="">-- Select Product --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500">Quantity</label>
                  <input 
                    type="number" 
                    value={item.quantity || 0}
                    onChange={(e) => handleUpdateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-brand-blue"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500">Price (₹)</label>
                  <input 
                    type="number" 
                    value={item.price || 0}
                    onChange={(e) => handleUpdateItem(index, 'price', parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-brand-blue"
                  />
                </div>
              </div>

            </div>
          ))}

          {items.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              No items extracted.
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button 
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-sm font-semibold text-gray-700 rounded-xl hover:bg-gray-50"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            disabled={submitting || items.length === 0}
            className="px-6 py-2 bg-brand-blue text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? 'Saving...' : `Confirm & Save ${type === 'sales' ? 'Sale' : 'Inventory'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
