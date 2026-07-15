import React, { useEffect, useState } from 'react';
import { useGstStates } from '../hooks/useGstStates';
import {
  Search, Plus, ChevronRight, Edit2, Trash2, ArrowLeft,
  ShoppingBag, CreditCard, RefreshCw, Hash, MapPin,
  Phone, Mail, CheckCircle2, AlertCircle, Receipt,
} from 'lucide-react';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SectionCard from '../components/SectionCard';
import { useToast } from '../components/ToastContext';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import InvoiceView from './InvoiceView';

// ─── State code lookup ────────────────────────────────────────────────────────


const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
function isValidGSTIN(v) { return GSTIN_REGEX.test((v || '').trim().toUpperCase()); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

const PASTEL_COLORS = [
  { bg: 'bg-blue-100',   text: 'text-blue-600'   },
  { bg: 'bg-green-100',  text: 'text-green-600'  },
  { bg: 'bg-amber-100',  text: 'text-amber-600'  },
  { bg: 'bg-purple-100', text: 'text-purple-600' },
  { bg: 'bg-pink-100',   text: 'text-pink-600'   },
  { bg: 'bg-teal-100',   text: 'text-teal-600'   },
];

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diffDays === 0)  return 'Today';
  if (diffDays === 1)  return 'Yesterday';
  if (diffDays < 7)   return `${diffDays}d ago`;
  if (diffDays < 30)  return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function fmt(n) {
  if (!n) return '₹0';
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

// ─── Empty form ───────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    name:             '',
    gstin:            '',
    phone:            '',
    email:            '',
    state:            '',
    state_code:       '',
    billing_address:  '',
    is_gst_registered: false,
  };
}

// ─── Customer form component ──────────────────────────────────────────────────

function CustomerForm({ initial, onSubmit, onCancel, submitting, gstStates }) {
  const [form, setForm]         = useState(initial || emptyForm());
  const [gstinErr, setGstinErr] = useState('');
  const STATE_MAP = Object.fromEntries((gstStates || []).map(s => [s.code, s.name]));

  const isGstReg = !!form.is_gst_registered;

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };

      if (field === 'gstin') {
        const v = value.trim().toUpperCase();
        next.gstin = v;
        if (v.length === 0) {
          setGstinErr('');
        } else if (isValidGSTIN(v)) {
          // Auto-fill state from GSTIN
          const code = v.slice(0, 2);
          next.state_code = code;
          next.state      = STATE_MAP[code] || prev.state;
          setGstinErr('');
        } else if (v.length === 15) {
          setGstinErr('Invalid GSTIN format');
        } else {
          setGstinErr('');
        }
      }

      if (field === 'state_code') {
        next.state = STATE_MAP[value] || prev.state;
      }

      if (field === 'is_gst_registered' && !value) {
        // Clear GSTIN when toggled off
        next.gstin = '';
        setGstinErr('');
      }

      return next;
    });
  }

  const gstinValid   = isValidGSTIN(form.gstin);
  const hasGstin     = form.gstin.trim().length > 0;
  const stateOk      = !!form.state_code;
  // GST-registered customers must have a valid GSTIN; all need a state
  const canSubmit    = form.name.trim() && stateOk && (!isGstReg || gstinValid) && !submitting;

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Name */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Customer Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="e.g. Rahul Sharma"
          required
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
        />
      </div>

      {/* GST Registered toggle */}
      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3.5 py-2.5">
        <div>
          <p className="text-sm font-semibold text-gray-700">GST Registered?</p>
          <p className="text-xs text-gray-400">{isGstReg ? 'Business customer — GSTIN required' : 'Retail / unregistered customer'}</p>
        </div>
        <button
          type="button"
          id="customer-gst-toggle"
          onClick={() => set('is_gst_registered', !isGstReg)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            isGstReg ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
              isGstReg ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* GSTIN — only for GST-registered customers */}
      {isGstReg && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            GSTIN <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={form.gstin}
              maxLength={15}
              onChange={e => set('gstin', e.target.value)}
              placeholder="29AABCU9603R1ZX"
              className={`w-full px-3.5 py-2.5 pr-9 rounded-xl border text-sm font-mono tracking-widest focus:outline-none focus:ring-2 transition-all ${
                gstinErr
                  ? 'border-red-300 focus:ring-red-200 bg-red-50'
                  : (hasGstin && gstinValid)
                  ? 'border-emerald-300 focus:ring-emerald-200 bg-emerald-50'
                  : 'border-gray-200 focus:ring-blue-200'
              }`}
            />
            {hasGstin && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                {gstinValid
                  ? <CheckCircle2 size={14} className="text-emerald-500" />
                  : <AlertCircle  size={14} className="text-red-400" />
                }
              </span>
            )}
          </div>
          {gstinErr && <p className="mt-1 text-xs text-red-600">{gstinErr}</p>}
          {hasGstin && gstinValid && (
            <p className="mt-1 text-xs text-emerald-600">
              ✓ B2B customer · State auto-filled from GSTIN
            </p>
          )}
        </div>
      )}

      {/* State — required for POS derivation */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          State / Place of Supply <span className="text-red-500">*</span>
        </label>
        <select
          value={form.state_code}
          onChange={e => set('state_code', e.target.value)}
          required
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
        >
          <option value="">Select state…</option>
          {(gstStates || []).map(s => (
            <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
          ))}
        </select>
        {!stateOk && (
          <p className="mt-1 text-xs text-amber-600">
            Required for GST filing — determines intrastate vs interstate tax
          </p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Phone</label>
        <input
          type="tel"
          value={form.phone || ''}
          onChange={e => set('phone', e.target.value)}
          placeholder="+91 98765 43210"
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
        />
      </div>

      {/* Email */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
        <input
          type="email"
          value={form.email || ''}
          onChange={e => set('email', e.target.value)}
          placeholder="customer@example.com"
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
        />
      </div>

      {/* Billing Address */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Billing Address</label>
        <textarea
          value={form.billing_address || ''}
          onChange={e => set('billing_address', e.target.value)}
          rows={2}
          placeholder="Street, city, pincode"
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
        />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-200 text-xs font-semibold text-gray-700 rounded-xl hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-4 py-2 bg-brand-blue text-white text-xs font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Saving…' : 'Save Customer'}
        </button>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Customers() {
  const { showToast } = useToast();
  const { user }      = useAuth();
  const { states: GST_STATES, loading: statesLoading } = useGstStates();
  const STATE_MAP = Object.fromEntries(GST_STATES.map(s => [s.code, s.name]));
  const [customers,        setCustomers]        = useState([]);
  const [search,           setSearch]           = useState('');
  const [loading,          setLoading]          = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerDetails,  setCustomerDetails]  = useState(null);
  const [loadingDetails,   setLoadingDetails]   = useState(false);
  const [viewingInvoiceId, setViewingInvoiceId] = useState(null);
  const [isModalOpen,      setIsModalOpen]      = useState(false);
  const [editingCustomer,  setEditingCustomer]  = useState(null);
  const [deleteConfirmCust,setDeleteConfirmCust]= useState(null);
  const [submitting,       setSubmitting]       = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const data = await api.getCustomersList({ search });
      setCustomers(Array.isArray(data) ? data : []);
    } catch {
      showToast('Failed to fetch customer directory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, [search]);

  const loadCustomerDetails = async (id) => {
    setLoadingDetails(true);
    setSelectedCustomerId(id);
    try {
      setCustomerDetails(await api.getCustomer(id));
    } catch {
      showToast('Failed to fetch customer profile', 'error');
      setSelectedCustomerId(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenCreate = () => { setEditingCustomer(null); setIsModalOpen(true); };

  const handleOpenEdit = (e, cust) => {
    e.stopPropagation();
    setEditingCustomer(cust);
    setIsModalOpen(true);
  };

  const handleSubmit = async (formData) => {
    setSubmitting(true);
    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, formData);
        showToast('Customer updated', 'success');
        if (selectedCustomerId === editingCustomer.id) loadCustomerDetails(editingCustomer.id);
      } else {
        await api.createCustomer(formData);
        showToast('Customer created', 'success');
      }
      setIsModalOpen(false);
      fetchCustomers();
    } catch (err) {
      showToast(err.message || 'Failed to save customer', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmCust) return;
    try {
      await api.deleteCustomer(deleteConfirmCust.id);
      showToast('Customer deleted', 'success');
      setDeleteConfirmCust(null);
      setSelectedCustomerId(null);
      fetchCustomers();
    } catch (err) {
      showToast(err.message || 'Cannot delete — customer has active transactions', 'error');
    }
  };

  if (viewingInvoiceId) {
    return <InvoiceView invoiceId={viewingInvoiceId} onBack={() => setViewingInvoiceId(null)} />;
  }

  return (
    <div className="pb-20 min-h-screen bg-surface">
      {!selectedCustomerId ? (
        // ── LIST VIEW ──────────────────────────────────────────────────────────
        <>
          <div className="bg-white px-5 pt-12 pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
              <button
                onClick={handleOpenCreate}
                className="w-9 h-9 rounded-full bg-brand-blue flex items-center justify-center shadow-card-md hover:bg-blue-700 transition-colors"
              >
                <Plus size={18} className="text-white" strokeWidth={2.5} />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <Search size={15} className="text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, GSTIN or phone…"
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
          </div>

          <div className="px-4 py-2">
            {loading && customers.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
            ) : customers.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No customers found.</p>
            ) : (
              <div className="bg-white rounded-2xl shadow-card overflow-hidden mt-2">
                {customers.map((c, i) => {
                  const color    = PASTEL_COLORS[i % PASTEL_COLORS.length];
                  const stateOk  = !!c.state_code;
                  return (
                    <button
                      key={c.id}
                      onClick={() => loadCustomerDetails(c.id)}
                      className="flex items-center gap-3 w-full px-4 py-4 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 active:bg-gray-100 transition-colors text-left"
                    >
                      <div className={`w-10 h-10 rounded-full ${color.bg} ${color.text} flex items-center justify-center flex-shrink-0 font-bold text-sm shadow-sm`}>
                        {initials(c.name || '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {c.gstin
                            ? <span className="font-mono text-blue-600">{c.gstin}</span>
                            : <span>B2C · {c.phone || 'No phone'}</span>
                          }
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right flex items-center gap-2">
                        {!stateOk && (
                          <span title="Missing state code — POS unknown">
                            <AlertCircle size={12} className="text-amber-400" />
                          </span>
                        )}
                        <div>
                          <p className="text-xs font-bold text-gray-900">{fmt(c.total_purchases)}</p>
                          <p className="text-[10px] text-gray-400">spent</p>
                        </div>
                        <ChevronRight size={14} className="text-gray-300" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        // ── PROFILE VIEW ───────────────────────────────────────────────────────
        <div className="animate-fadeIn pb-6">
          <div className="bg-white px-5 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="p-1 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-bold text-gray-900 flex-1">Customer Profile</h1>
            {customerDetails && (
              <div className="flex items-center gap-1">
                <button
                  onClick={e => handleOpenEdit(e, customerDetails)}
                  className="p-1.5 text-gray-500 hover:text-brand-blue hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => setDeleteConfirmCust(customerDetails)}
                    className="p-1.5 text-gray-500 hover:text-brand-red hover:bg-brand-redSoft rounded-xl transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            )}
          </div>

          {loadingDetails ? (
            <div className="py-24 text-center text-xs text-gray-400">
              <RefreshCw size={16} className="animate-spin inline mr-2" /> Loading…
            </div>
          ) : !customerDetails ? (
            <div className="py-24 text-center text-xs text-gray-400">Profile not found.</div>
          ) : (
            <div className="px-4 py-4 space-y-4">
              {/* Header card */}
              <div className="bg-white rounded-2xl p-5 shadow-card">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-brand-blueSoft text-brand-blue flex items-center justify-center font-bold text-lg shadow-inner">
                    {initials(customerDetails.name)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{customerDetails.name}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Total Purchases: <span className="font-bold text-gray-800">₹{customerDetails.total_purchases.toLocaleString('en-IN')}</span>
                    </p>
                  </div>
                </div>

                {/* GST info row */}
                <div className="space-y-2 pt-3 border-t border-gray-50">
                  {customerDetails.gstin ? (
                    <div className="flex items-center gap-2">
                      <Hash size={12} className="text-blue-500 shrink-0" />
                      <span className="text-xs font-mono font-semibold text-blue-700">{customerDetails.gstin}</span>
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">B2B</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Hash size={12} className="text-gray-300 shrink-0" />
                      <span className="text-xs text-gray-400 italic">No GSTIN · B2C Customer</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <MapPin size={12} className="text-teal-500 shrink-0" />
                    {customerDetails.state_code ? (
                      <span className="text-xs text-gray-700">
                        {customerDetails.state_code} — {STATE_MAP[customerDetails.state_code] || customerDetails.state || 'Unknown state'}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                        <AlertCircle size={11} /> State missing — edit to add
                      </span>
                    )}
                  </div>
                  {customerDetails.phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-700">{customerDetails.phone}</span>
                    </div>
                  )}
                  {customerDetails.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={12} className="text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-700">{customerDetails.email}</span>
                    </div>
                  )}
                  {customerDetails.billing_address && (
                    <div className="flex items-start gap-2">
                      <MapPin size={12} className="text-gray-300 shrink-0 mt-0.5" />
                      <span className="text-xs text-gray-500 leading-snug">{customerDetails.billing_address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Invoices */}
              <SectionCard>
                <div className="flex items-center gap-1.5 mb-3 text-gray-700 border-b border-gray-50 pb-2">
                  <Receipt size={15} />
                  <h3 className="text-xs font-bold uppercase tracking-wider">Invoices</h3>
                </div>
                {!customerDetails.invoices?.length ? (
                  <p className="text-xs text-gray-400 py-4 text-center">No invoices found.</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {customerDetails.invoices.map(inv => (
                      <div key={inv.id} className="py-3 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-semibold text-gray-800">{inv.invoice_number}</p>
                          <p className="text-[10px] text-gray-400">{inv.invoice_date} · ₹{Number(inv.grand_total).toLocaleString('en-IN')}</p>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                            inv.payment_status === 'PAID'
                              ? 'bg-brand-greenSoft text-brand-green'
                              : 'bg-brand-redSoft text-brand-red'
                          }`}>
                            {inv.payment_status}
                          </span>
                          <button
                            onClick={() => setViewingInvoiceId(inv.id)}
                            className="text-brand-blue font-semibold hover:underline"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Purchase history */}
              <SectionCard>
                <div className="flex items-center gap-1.5 mb-3 text-brand-blue border-b border-gray-50 pb-2">
                  <ShoppingBag size={15} />
                  <h3 className="text-xs font-bold uppercase tracking-wider">Purchase History</h3>
                </div>
                {customerDetails.sales.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">No purchases recorded.</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {customerDetails.sales.map(sale => (
                      <div key={sale.id} className="py-3 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-semibold text-gray-800">{sale.product_name}</p>
                          <p className="text-[10px] text-gray-400">{sale.sale_date} · Qty: {sale.quantity}</p>
                        </div>
                        <span className="font-bold text-gray-950">₹{sale.revenue.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Credit */}
              <SectionCard>
                <div className="flex items-center gap-1.5 mb-3 text-brand-amber border-b border-gray-50 pb-2">
                  <CreditCard size={15} />
                  <h3 className="text-xs font-bold uppercase tracking-wider">Outstanding Credit</h3>
                </div>
                {customerDetails.credits.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">Clean ledger!</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {customerDetails.credits.map(credit => (
                      <div key={credit.id} className="py-3 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-semibold text-gray-800">₹{(credit.total_amount - credit.paid_amount).toLocaleString('en-IN')} Outstanding</p>
                          <p className="text-[10px] text-gray-400">Due: {credit.due_date} · {credit.notes || '—'}</p>
                        </div>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          credit.status === 'paid'    ? 'bg-brand-greenSoft text-brand-green' :
                          credit.status === 'overdue' ? 'bg-brand-redSoft text-brand-red animate-pulse' :
                          'bg-brand-amberSoft text-brand-amber'
                        }`}>
                          {credit.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <Modal
          title={editingCustomer ? 'Edit Customer' : 'New Customer'}
          onClose={() => setIsModalOpen(false)}
          size="sm"
        >
          <CustomerForm
            initial={editingCustomer
              ? {
                  name:              editingCustomer.name              || '',
                  gstin:             editingCustomer.gstin             || '',
                  phone:             editingCustomer.phone             || '',
                  email:             editingCustomer.email             || '',
                  state:             editingCustomer.state             || '',
                  state_code:        editingCustomer.state_code        || '',
                  billing_address:   editingCustomer.billing_address   || '',
                  is_gst_registered: !!editingCustomer.is_gst_registered,
                }
              : emptyForm()
            }
            onSubmit={handleSubmit}
            onCancel={() => setIsModalOpen(false)}
            submitting={submitting}
            gstStates={GST_STATES}
          />
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteConfirmCust && (
        <ConfirmDialog
          title="Delete Customer?"
          message={`Delete profile for "${deleteConfirmCust.name}"? This cannot be undone.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirmCust(null)}
        />
      )}
    </div>
  );
}
