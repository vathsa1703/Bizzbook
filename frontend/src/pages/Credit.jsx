import React, { useEffect, useState } from 'react';
import { CreditCard, Plus, Search, CheckCircle, RefreshCw, DollarSign, Calendar, Trash2 } from 'lucide-react';
import SectionCard from '../components/SectionCard';
import StatCard from '../components/StatCard';
import Modal from '../components/Modal';
import FormField from '../components/FormField';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const STATUS_TABS = ['All', 'Pending', 'Paid', 'Overdue'];

export default function Credit() {
  const { showToast } = useToast();
  const { user } = useAuth();

  // Navigation / Tab states
  const [statusTab, setStatusTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [credits, setCredits] = useState([]);
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal actions
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingCredit, setEditingCredit] = useState(null);
  const [deleteConfirmCredit, setDeleteConfirmCredit] = useState(null);
  const [activePaymentCredit, setActivePaymentCredit] = useState(null);

  // Form states
  const [formValues, setFormValues] = useState({
    customer_id: '',
    total_amount: '',
    paid_amount: 0,
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: '',
  });
  const [paymentAmount, setPaymentAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const refreshData = async () => {
    setLoading(true);
    try {
      const filters = { search: searchQuery };
      if (statusTab !== 'All') {
        filters.status = statusTab.toLowerCase();
      }
      
      const [list, sum, custs] = await Promise.all([
        api.getCredits(filters).catch(() => []),
        api.getCreditsSummary().catch(() => null),
        api.getCustomersList().catch(() => []),
      ]);
      setCredits(list);
      setSummary(sum);
      setCustomers(custs);
    } catch (err) {
      showToast('error', 'Failed to retrieve credit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [statusTab, searchQuery]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleOpenCreate = () => {
    setEditingCredit(null);
    setFormValues({
      customer_id: '',
      total_amount: '',
      paid_amount: 0,
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: '',
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEdit = (credit) => {
    setEditingCredit(credit);
    setFormValues({
      customer_id: credit.customer_id || '',
      total_amount: credit.total_amount || '',
      paid_amount: credit.paid_amount || 0,
      due_date: credit.due_date || '',
      notes: credit.notes || '',
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleOpenPayment = (credit) => {
    setActivePaymentCredit(credit);
    setPaymentAmount('');
    setIsPaymentModalOpen(true);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formValues.customer_id) newErrors.customer_id = 'Customer is required';
    if (formValues.total_amount === '' || formValues.total_amount <= 0) newErrors.total_amount = 'Total amount must be greater than 0';
    if (!formValues.due_date) newErrors.due_date = 'Due date is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      if (editingCredit) {
        await api.updateCredit(editingCredit.id, formValues);
        showToast('success', 'Credit ledger record updated');
      } else {
        await api.createCredit(formValues);
        showToast('success', 'Manual credit ledger entry created successfully');
      }
      setIsModalOpen(false);
      refreshData();
    } catch (err) {
      showToast('error', err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(paymentAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      showToast('warning', 'Please enter a valid positive payment amount');
      return;
    }
    setSubmitting(true);
    try {
      await api.recordPayment(activePaymentCredit.id, amt);
      showToast('success', `Recorded payment of ₹${amt.toLocaleString('en-IN')}`);
      setIsPaymentModalOpen(false);
      refreshData();
    } catch (err) {
      showToast('error', err.message || 'Payment recording failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmCredit) return;
    try {
      await api.deleteCredit(deleteConfirmCredit.id);
      showToast('success', 'Credit ledger entry deleted successfully');
      setDeleteConfirmCredit(null);
      refreshData();
    } catch (err) {
      showToast('error', err.message || 'Deletion failed');
    }
  };

  return (
    <div className="pb-20 min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 border-b border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Credit Ledger</h1>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1 bg-brand-blue text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-sm"
          >
            <Plus size={14} /> Add Credit
          </button>
        </div>

        {/* Dynamic Metric indicators */}
        {!loading && summary && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-brand-redSoft rounded-xl p-2.5">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Outstanding</p>
              <p className="text-xs font-extrabold text-brand-red mt-0.5">₹{summary.outstanding_amount.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-brand-greenSoft rounded-xl p-2.5">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Total Paid</p>
              <p className="text-xs font-extrabold text-brand-green mt-0.5">₹{summary.paid_amount.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-brand-amberSoft rounded-xl p-2.5">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Overdue</p>
              <p className="text-xs font-extrabold text-brand-amber mt-0.5">{summary.overdue_count} items</p>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Filters & Search */}
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-brand-blue shadow-sm"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setStatusTab(t)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shadow-sm ${
                statusTab === t ? 'bg-brand-blue text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Credit logs */}
        <SectionCard className="p-0 overflow-hidden">
          {loading && credits.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-400">
              <RefreshCw size={16} className="animate-spin inline mr-2" /> Loading ledger logs...
            </div>
          ) : credits.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-400">No credit entries found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                    <th className="px-4 py-3">Customer / Invoice</th>
                    <th className="px-4 py-3 text-right">Outstanding / Total</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-xs">
                  {credits.map((cr) => {
                    const outstanding = cr.total_amount - cr.paid_amount;
                    const isOverdue = new Date(cr.due_date) < new Date() && cr.status !== 'paid';
                    const displayStatus = isOverdue ? 'overdue' : cr.status;

                    return (
                      <tr key={cr.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {cr.customer_name}
                          <p className="text-[10px] font-normal text-gray-400">
                            {cr.invoice_number ? `Link: ${cr.invoice_number}` : 'Manual Entry'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-bold text-gray-950">₹{outstanding.toLocaleString('en-IN')}</p>
                          <p className="text-[10px] text-gray-400">of ₹{cr.total_amount.toLocaleString('en-IN')}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-800">{cr.due_date}</p>
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                              displayStatus === 'paid' ? 'bg-brand-greenSoft text-brand-green' :
                              displayStatus === 'overdue' ? 'bg-brand-redSoft text-brand-red animate-pulse' :
                              'bg-brand-amberSoft text-brand-amber'
                            }`}
                          >
                            {displayStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {outstanding > 0 && (
                              <button
                                onClick={() => handleOpenPayment(cr)}
                                className="flex items-center gap-0.5 bg-brand-greenSoft hover:bg-brand-green/20 text-brand-green px-2 py-1 rounded-lg font-bold text-[10px] transition-colors"
                              >
                                Pay
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEdit(cr)}
                              className="p-1 text-gray-400 hover:text-brand-blue hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <Search size={12} />
                            </button>
                            {user && user.role === 'admin' && (
                              <button
                                onClick={() => setDeleteConfirmCredit(cr)}
                                className="p-1 text-gray-400 hover:text-brand-red hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Add / Edit Credit Modal */}
      {isModalOpen && (
        <Modal
          title={editingCredit ? 'Edit Credit Detail' : 'Create Manual Credit Log'}
          onClose={() => setIsModalOpen(false)}
          size="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              label="Select Customer"
              name="customer_id"
              type="select"
              value={formValues.customer_id}
              onChange={handleFormChange}
              options={customers.map(c => ({ value: c.id, label: c.name }))}
              placeholder="-- Choose Customer --"
              error={errors.customer_id}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Total Amount (₹)"
                name="total_amount"
                type="number"
                value={formValues.total_amount}
                onChange={handleFormChange}
                error={errors.total_amount}
                min={0}
                required
              />
              <FormField
                label="Already Paid Amount (₹)"
                name="paid_amount"
                type="number"
                value={formValues.paid_amount}
                onChange={handleFormChange}
                min={0}
              />
            </div>

            <FormField
              label="Payment Due Date"
              name="due_date"
              type="date"
              value={formValues.due_date}
              onChange={handleFormChange}
              error={errors.due_date}
              required
            />

            <FormField
              label="Notes"
              name="notes"
              type="textarea"
              value={formValues.notes}
              onChange={handleFormChange}
              placeholder="Record any terms or collateral..."
            />

            <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-gray-200 text-sm font-semibold text-gray-700 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-brand-blue text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : editingCredit ? 'Save Changes' : 'Create Credit'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Record Payment modal */}
      {isPaymentModalOpen && activePaymentCredit && (
        <Modal
          title="Record Credit Payment"
          onClose={() => setIsPaymentModalOpen(false)}
          size="sm"
        >
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-xs space-y-1">
              <p className="text-gray-500">Customer: <span className="font-semibold text-gray-900">{activePaymentCredit.customer_name}</span></p>
              <p className="text-gray-500">Outstanding: <span className="font-bold text-brand-red">₹{(activePaymentCredit.total_amount - activePaymentCredit.paid_amount).toLocaleString('en-IN')}</span></p>
            </div>

            <FormField
              label="Payment Amount (₹)"
              name="payment"
              type="number"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              placeholder="e.g. 500"
              min={0.1}
              required
            />

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 border border-gray-200 text-xs font-semibold text-gray-700 rounded-xl hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-brand-green text-white text-xs font-bold rounded-xl hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteConfirmCredit && (
        <ConfirmDialog
          title="Delete Credit Entry?"
          message={`Are you sure you want to delete this credit entry?`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirmCredit(null)}
        />
      )}
    </div>
  );
}
