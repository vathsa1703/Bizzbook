import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import SectionCard from '../components/SectionCard';
import Modal from '../components/Modal';
import FormField from '../components/FormField';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Purchases({ onNavigate }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const isAdmin = !user || user.role === 'admin';

  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [setupError, setSetupError] = useState(false);
  const [form, setForm] = useState({
    product_id: '',
    supplier_id: '',
    quantity: '',
    cost_price: '',
    gst_amount: '',
    purchase_date: '',
    invoice_number: ''
  });
  const [errors, setErrors] = useState({});

  const loadData = async () => {
    setLoading(true);
    try {
      const [purch, prod, supp] = await Promise.all([
        api.getPurchases(),
        api.getProducts(),
        api.getSuppliers()
      ]);
      setPurchases(purch);
      setProducts(prod);
      setSuppliers(supp);
    } catch (err) {
      showToast('error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      product_id: '',
      supplier_id: '',
      quantity: '',
      cost_price: '',
      gst_amount: '',
      purchase_date: new Date().toISOString().split('T')[0],
      invoice_number: ''
    });
    setErrors({});
    setSetupError(false);
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      product_id: p.product_id,
      supplier_id: p.supplier_id || '',
      quantity: p.quantity,
      cost_price: p.cost_price,
      gst_amount: p.gst_amount,
      purchase_date: p.purchase_date,
      invoice_number: p.invoice_number || ''
    });
    setErrors({});
    setSetupError(false);
    setModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const newErrors = {};
    if (!form.product_id) newErrors.product_id = 'Product required';
    if (!form.quantity || Number(form.quantity) <= 0) newErrors.quantity = 'Invalid quantity';
    if (!form.cost_price || Number(form.cost_price) < 0) newErrors.cost_price = 'Invalid cost price';
    if (form.gst_amount === '' || Number(form.gst_amount) < 0) newErrors.gst_amount = 'Invalid GST amount';
    if (!form.purchase_date) newErrors.purchase_date = 'Date required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSetupError(false);
    try {
      if (editing) {
        await api.updatePurchase(editing.id, form);
        showToast('success', 'Purchase updated');
      } else {
        await api.createPurchase(form);
        showToast('success', 'Purchase created');
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      if (err.message && err.message.includes('Company state not configured')) {
        setSetupError(true);
      } else {
        showToast('error', err.message || 'Operation failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.deletePurchase(confirmDelete.id);
      showToast('success', 'Purchase deleted');
      setConfirmDelete(null);
      loadData();
    } catch (err) {
      showToast('error', err.message || 'Delete failed');
    }
  };

  return (
    <div className="pb-20 bg-surface min-h-screen">
      <div className="bg-white px-5 pt-12 pb-4 border-b border-gray-100 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
        {isAdmin && (
          <button onClick={openCreate} className="flex items-center gap-1 bg-brand-blue text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-sm">
            <Plus size={14} /> Add Purchase
          </button>
        )}
      </div>
      <div className="px-4 pt-4">
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-6">Loading purchases...</p>
        ) : purchases.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No purchases recorded.</p>
        ) : (
          <SectionCard>
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left">Product</th>
                  <th className="p-2 text-left">Qty</th>
                  <th className="p-2 text-left">Cost</th>
                  <th className="p-2 text-left">GST</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Invoice</th>
                  {isAdmin && <th className="p-2 text-left">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {purchases.map(p => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="p-2">{products.find(pr => pr.id === p.product_id)?.name || p.product_id}</td>
                    <td className="p-2">{p.quantity}</td>
                    <td className="p-2">₹{p.cost_price}</td>
                    <td className="p-2">₹{p.gst_amount}</td>
                    <td className="p-2">{p.purchase_date}</td>
                    <td className="p-2">{p.invoice_number || '-'}</td>
                    {isAdmin && (
                      <td className="p-2 space-x-1">
                        <button onClick={() => openEdit(p)} className="p-1 text-gray-400 hover:text-brand-blue hover:bg-gray-100 rounded-lg">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => setConfirmDelete(p)} className="p-1 text-gray-400 hover:text-brand-red hover:bg-gray-100 rounded-lg">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}
      </div>

      {/* Modal for create / edit */}
      {modalOpen && (
        <Modal title={editing ? 'Edit Purchase' : 'New Purchase'} onClose={() => setModalOpen(false)}>
          {setupError && (
            <div className="mb-4 bg-brand-redSoft border border-brand-red/20 rounded-xl p-6 flex flex-col items-center justify-center text-center">
              <AlertTriangle size={32} className="text-brand-red mb-3" />
              <p className="text-brand-red font-bold text-base mb-2">Company Setup Required</p>
              <p className="text-brand-red/80 text-sm mb-4">Please configure your company information before creating taxable transactions.</p>
              <button 
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  if (onNavigate) onNavigate('more');
                }}
                className="bg-brand-red text-white px-5 py-2 rounded-xl text-sm font-bold shadow-sm"
              >
                Go to Company Settings
              </button>
            </div>
          )}
          {!setupError && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField label="Product" name="product_id" type="select" value={form.product_id} onChange={handleChange} options={products.map(p => ({ value: p.id, label: p.name }))} error={errors.product_id} required />
            <FormField label="Supplier" name="supplier_id" type="select" value={form.supplier_id} onChange={handleChange} options={[{ value: '', label: '-- None --' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]} />
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Quantity" name="quantity" type="number" value={form.quantity} onChange={handleChange} error={errors.quantity} required />
              <FormField label="Cost Price (₹)" name="cost_price" type="number" value={form.cost_price} onChange={handleChange} error={errors.cost_price} required />
            </div>
            <FormField label="GST Amount (₹)" name="gst_amount" type="number" value={form.gst_amount} onChange={handleChange} error={errors.gst_amount} required />
            <FormField label="Purchase Date" name="purchase_date" type="date" value={form.purchase_date} onChange={handleChange} error={errors.purchase_date} required />
            <FormField label="Invoice Number" name="invoice_number" value={form.invoice_number} onChange={handleChange} />
            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm">Cancel</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 bg-brand-blue text-white rounded-xl text-sm disabled:opacity-50">
                {submitting ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
          )}
        </Modal>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDialog title="Delete Purchase?" message={`Are you sure you want to delete this purchase of ${confirmDelete.quantity} units?`} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}
