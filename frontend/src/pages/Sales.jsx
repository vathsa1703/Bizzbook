import React, { useEffect, useState, useRef } from 'react';
import { Send, ShoppingBag, Plus, Trash2, Edit2, Search, Calendar, User, ShoppingCart, UserCheck, RefreshCw, AlertTriangle, Camera } from 'lucide-react';
import RevenueWeekCard from '../components/RevenueWeekCard';
import SectionCard from '../components/SectionCard';
import ChatBubble from '../components/ChatBubble';
import VoiceButton from '../components/VoiceButton';
import Modal from '../components/Modal';
import FormField from '../components/FormField';
import ConfirmDialog from '../components/ConfirmDialog';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { useToast } from '../components/ToastContext';
import { api } from '../api/client';
import InvoiceView from './InvoiceView';
import ScanModal from '../components/ScanModal';
import DraftReviewModal from '../components/DraftReviewModal';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmt(n) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

export default function Sales({ onNavigate }) {
  const { showToast } = useToast();
  
  // View states
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'list' | 'chat'
  
  // Data states
  const [trend, setTrend] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [topGroups, setTopGroups] = useState([]);
  const [summary, setSummary] = useState(null);
  
  // Lists for dropdowns & search
  const [salesList, setSalesList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [productGroups, setProductGroups] = useState([]);
  const [gstStates, setGstStates] = useState([]);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  
  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [deleteConfirmSale, setDeleteConfirmSale] = useState(null);
  const [setupError, setSetupError] = useState(false);
  const [viewingInvoiceId, setViewingInvoiceId] = useState(null);
  const [saleSuccessInvoice, setSaleSuccessInvoice] = useState(null);

  // OCR states
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [draftSaleData, setDraftSaleData] = useState(null);

  // Backend error state for validation
  const [backendValidationErrors, setBackendValidationErrors] = useState([]);

  // Customer Inline Creation states
  const [customerFlow, setCustomerFlow] = useState('existing'); // 'existing' | 'new'
  const [customerType, setCustomerType] = useState('b2b'); // 'b2b' | 'b2c'
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    gstin: '',
    state_code: '',
  });

  // Form states
  const [formValues, setFormValues] = useState({
    product_id: '',
    customer_id: '',
    employee_id: '',
    quantity: 1,
    revenue: 0,
    sale_date: new Date().toISOString().split('T')[0],
    payment_status: 'paid',
    invoice_number: '',
    due_date: '',
  });
  const [errors, setErrors] = useState({});

  // Chat/AI states
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! Ask me anything about your sales — today's numbers, top products, monthly trends, or anything else." },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const now = new Date();

  // Load everything
  const refreshData = async () => {
    setLoading(true);
    try {
      const [t, tp, tg, s, sl, custs, prods, emps, groups, statesRes] = await Promise.all([
        api.revenueTrend(7).catch(() => []),
        api.topProducts().catch(() => []),
        api.topGroups(5).catch(() => []),
        api.salesSummary(now.getMonth() + 1, now.getFullYear()).catch(() => null),
        api.getSales({ search: searchQuery, customerId: filterCustomer, date: filterDate, groupId: filterGroup }).catch(() => []),
        api.getCustomersList().catch(() => []),
        api.getProducts().catch(() => []),
        api.getEmployees().catch(() => []),
        api.getProductGroups().catch(() => []),
        api.getGstStates().catch(() => []),
      ]);
      setTrend(Array.isArray(t) ? t : []);
      setTopProducts(Array.isArray(tp) ? tp : []);
      setTopGroups(Array.isArray(tg.data ? tg.data : tg) ? (tg.data || tg) : []);
      setSummary(s);
      setSalesList(sl);
      setCustomers(custs);
      setProducts(prods);
      setEmployees(emps.filter(emp => emp.department === 'Sales'));
      setProductGroups(groups.data || []);
      setGstStates(Array.isArray(statesRes) ? statesRes : (statesRes.data || []));
    } catch (err) {
      showToast('error', 'Failed to fetch sales data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [searchQuery, filterCustomer, filterDate, filterGroup]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle Form changes
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormValues((prev) => {
      const updated = { ...prev, [name]: value };
      
      // Auto-calculate revenue if product or quantity changes
      if (name === 'product_id' || name === 'quantity') {
        const prod = products.find((p) => String(p.id) === String(updated.product_id));
        if (prod) {
          updated.revenue = prod.selling_price * parseInt(updated.quantity || 1, 10);
        }
      }
      return updated;
    });
    // Clear error
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Open Modal for Create
  const handleOpenCreate = () => {
    setEditingSale(null);
    setCustomerFlow('existing');
    setCustomerType('b2b');
    setNewCustomer({ name: '', phone: '', gstin: '', state_code: '' });
    setFormValues({
      product_id: '',
      customer_id: '',
      employee_id: '',
      quantity: 1,
      revenue: 0,
      sale_date: new Date().toISOString().split('T')[0],
      payment_status: 'paid',
      invoice_number: '',
      due_date: '',
    });
    setErrors({});
    setBackendValidationErrors([]);
    setSetupError(false);
    setIsModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEdit = (sale) => {
    setEditingSale(sale);
    setFormValues({
      product_id: sale.product_id || '',
      customer_id: sale.customer_id || '',
      employee_id: sale.employee_id || '',
      quantity: sale.quantity || 1,
      revenue: sale.revenue || 0,
      sale_date: sale.sale_date || '',
      payment_status: sale.payment_status || 'paid',
      invoice_number: sale.invoice_number || '',
      due_date: '',
    });
    setErrors({});
    setBackendValidationErrors([]);
    setSetupError(false);
    setIsModalOpen(true);
  };

  // Validate form
  const validateForm = () => {
    const newErrors = {};
    if (!formValues.product_id) newErrors.product_id = 'Product is required';
    if (!formValues.employee_id) newErrors.employee_id = 'Assigned sales employee is required';
    if (!formValues.quantity || formValues.quantity <= 0) newErrors.quantity = 'Quantity must be greater than 0';
    if (!formValues.revenue || formValues.revenue <= 0) newErrors.revenue = 'Revenue must be greater than 0';
    if (!formValues.sale_date) newErrors.sale_date = 'Date is required';

    if (customerFlow === 'existing') {
      if (!formValues.customer_id) newErrors.customer_id = 'Customer is required';
    } else {
      if (!newCustomer.name || !newCustomer.name.trim()) {
        newErrors.new_customer_name = 'Customer/Business name is required';
      }
      if (customerType === 'b2b') {
        if (!newCustomer.gstin) {
          newErrors.new_customer_gstin = 'GSTIN is required for B2B';
        } else if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(newCustomer.gstin)) {
          newErrors.new_customer_gstin = 'Invalid GSTIN format';
        }
      } else {
        if (!newCustomer.state_code) {
          newErrors.new_customer_state = 'State is required for B2C';
        }
      }
    }
    
    // Quantity stock validation (only for new sales)
    if (!editingSale && formValues.product_id) {
      const selectedProduct = products.find(p => String(p.id) === String(formValues.product_id));
      if (selectedProduct && selectedProduct.stock_quantity < formValues.quantity) {
        newErrors.quantity = `Insufficient stock (Available: ${selectedProduct.stock_quantity})`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNewCustomerChange = (e) => {
    const { name, value } = e.target;
    setNewCustomer(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'gstin' && customerType === 'b2b') {
        const val = value.toUpperCase();
        updated.gstin = val;
        if (/^[0-9]{2}/.test(val)) {
          updated.state_code = val.substring(0, 2);
        }
      }
      return updated;
    });
    if (errors[`new_customer_${name}`]) {
      setErrors(prev => ({ ...prev, [`new_customer_${name}`]: null }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    setSetupError(false);
    setBackendValidationErrors([]);
    try {
      let finalCustomerId = formValues.customer_id;

      if (!editingSale && customerFlow === 'new') {
        // Create customer inline first
        let stateName = null;
        if (newCustomer.state_code) {
          const st = gstStates.find(s => s.code === newCustomer.state_code);
          if (st) stateName = st.name;
        }

        const customerPayload = {
          name: newCustomer.name,
          phone: newCustomer.phone || null,
          gstin: customerType === 'b2b' ? newCustomer.gstin : null,
          state_code: newCustomer.state_code,
          state: stateName,
          is_gst_registered: customerType === 'b2b'
        };

        const createdCustomer = await api.createCustomer(customerPayload);
        finalCustomerId = createdCustomer.id;
        
        // Refresh customer list so it shows in UI later
        const custs = await api.getCustomersList();
        setCustomers(custs);
      }

      const salePayload = { ...formValues, customer_id: finalCustomerId };

      if (editingSale) {
        await api.updateSale(editingSale.id, salePayload);
        showToast('success', 'Sale transaction updated successfully');
        setIsModalOpen(false);
      } else {
        const data = await api.createSale(salePayload);
        showToast('success', 'Sale created, inventory and ledger updated automatically');
        setIsModalOpen(false);
        setSaleSuccessInvoice(data);
      }
      refreshData();
    } catch (err) {
      if (err.message && err.message.includes('Company state not configured')) {
        setSetupError(true);
      } else if (err.validationErrors && err.validationErrors.length > 0) {
        setBackendValidationErrors(err.validationErrors);
      } else {
        showToast('error', err.message || 'Operation failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Delete
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmSale) return;
    try {
      await api.deleteSale(deleteConfirmSale.id);
      showToast('success', 'Sale deleted. Inventory and customer purchases restored.');
      setDeleteConfirmSale(null);
      refreshData();
    } catch (err) {
      showToast('error', err.message || 'Failed to delete sale');
    }
  };

  // Chat send
  const send = async (text) => {
    const msg = (text !== undefined ? text : input).trim();
    if (!msg) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', content: msg }]);
    setThinking(true);
    setView('chat');
    try {
      const data = await api.chat(msg);
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry, I had trouble reaching the server. Please try again.' }]);
    } finally {
      setThinking(false);
    }
  };

  // Voice handle
  const handleTranscript = (text) => {
    setInput(text);
    setView('chat');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const { recording, transcribing, error: voiceError, start, stop, cancel } = useVoiceRecorder(handleTranscript);

  const weekData = trend.slice(-7).map((item, i) => ({
    day: DAYS[i % 7],
    value: item.revenue || 0,
  }));
  const todayRevenue = summary?.total_revenue || 0;
  const lastWeekRevenue = weekData.length > 1
    ? weekData.slice(0, -1).reduce((s, d) => s + d.value, 0) / Math.max(weekData.length - 1, 1)
    : 0;
  const todayValue = weekData[weekData.length - 1]?.value || todayRevenue;
  const pct = lastWeekRevenue > 0 ? Math.round(((todayValue - lastWeekRevenue) / lastWeekRevenue) * 100) : 0;

  if (viewingInvoiceId) {
    return <InvoiceView invoiceId={viewingInvoiceId} onBack={() => setViewingInvoiceId(null)} />;
  }

  return (
    <div className="flex flex-col h-screen pb-20 bg-surface">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 flex flex-col gap-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setView('dashboard')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                view === 'dashboard' ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                view === 'list' ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              Sales Log
            </button>
            <button
              onClick={() => setView('chat')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                view === 'chat' ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              Ask AI
            </button>
          </div>
        </div>

        {/* Action bar for Sales Log */}
        {view === 'list' && (
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search invoice, customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:border-brand-blue"
              />
            </div>
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-2 py-1.5 text-xs text-gray-700 outline-none shadow-sm focus:border-brand-blue max-w-[120px]"
            >
              <option value="">All Groups</option>
              {productGroups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1 bg-brand-blue text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-sm"
            >
              <Plus size={14} /> New Sale
            </button>
          </div>
        )}
      </div>

      {/* Main View Container */}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        {view === 'dashboard' && (
          <div className="p-4 space-y-4">
            {weekData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-brand-blueSoft flex items-center justify-center">
                  <ShoppingBag size={28} className="text-brand-blue" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-gray-900 text-lg">No Sales Data Yet</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-[240px]">
                    Create a sale or run seed script to initialize data.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <RevenueWeekCard
                  label="Last 7 Months"
                  value={fmt(weekData.reduce((s, d) => s + d.value, 0))}
                  percentChange={pct}
                  data={weekData}
                  highlightIndex={weekData.length - 1}
                />
                
                <SectionCard>
                  <p className="text-sm font-bold text-gray-900 mb-3">Top Products</p>
                  {topProducts.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-brand-blueSoft text-brand-blue text-[10px] font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="text-xs text-gray-800 font-semibold">{p.name}</span>
                      </div>
                      <span className="text-xs font-bold text-gray-950">{fmt(p.revenue || 0)}</span>
                    </div>
                  ))}
                </SectionCard>

                <SectionCard>
                  <p className="text-sm font-bold text-gray-900 mb-3">Top Performing Groups</p>
                  {topGroups.slice(0, 5).map((g, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-brand-greenSoft text-brand-green text-[10px] font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="text-xs text-gray-800 font-semibold">{g.group_name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-950 block">{fmt(g.revenue || 0)}</span>
                        <span className="text-[10px] text-gray-500">{g.units_sold} units</span>
                      </div>
                    </div>
                  ))}
                </SectionCard>

                <SectionCard>
                  <p className="text-sm font-bold text-gray-900 mb-1">This Month</p>
                  <p className="text-3xl font-bold text-gray-950">{fmt(todayRevenue)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {summary?.transaction_count || 0} transactions · {summary?.total_units_sold || 0} units sold
                  </p>
                </SectionCard>
              </>
            )}
          </div>
        )}

        {view === 'list' && (
          <div className="p-4">
            <SectionCard className="p-0 overflow-hidden">
              {loading && salesList.length === 0 ? (
                <div className="py-12 flex items-center justify-center text-gray-400 text-xs">
                  <RefreshCw size={16} className="animate-spin mr-2" /> Loading sales log...
                </div>
              ) : salesList.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-xs">
                  No sales transactions found matching query.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                        <th className="px-4 py-3">Invoice</th>
                        <th className="px-4 py-3">Customer / Product</th>
                        <th className="px-4 py-3 text-right">Revenue</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-xs">
                      {salesList.map((sale) => (
                        <tr key={sale.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                            {sale.invoice_number || `S-${sale.id}`}
                            <p className="text-[10px] text-gray-400 font-normal">{sale.sale_date}</p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-800">{sale.customer_name || 'Walk-in'}</div>
                            <div className="text-[10px] text-gray-500">
                              {sale.product_name} x {sale.quantity}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-950 whitespace-nowrap">
                            ₹{sale.revenue.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                sale.payment_status === 'unpaid'
                                  ? 'bg-brand-redSoft text-brand-red'
                                  : 'bg-brand-greenSoft text-brand-green'
                              }`}
                            >
                              {sale.payment_status === 'unpaid' ? 'Unpaid' : 'Paid'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {sale.invoice_id && (
                                <button
                                  onClick={() => setViewingInvoiceId(sale.invoice_id)}
                                  className="px-2 py-1 bg-brand-blue/10 text-brand-blue hover:bg-brand-blue hover:text-white rounded-lg text-[10px] font-bold transition-colors"
                                >
                                  View Invoice
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenEdit(sale)}
                                className="p-1 text-gray-500 hover:text-brand-blue hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmSale(sale)}
                                className="p-1 text-gray-500 hover:text-brand-red hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {view === 'chat' && (
          <div className="flex flex-col h-full bg-surface">
            <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-3">
              {messages.map((m, i) => (
                <ChatBubble key={i} role={m.role} content={m.content} />
              ))}
              {thinking && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-brand-blue flex items-center justify-center">
                    <span className="text-white text-xs font-bold">AI</span>
                  </div>
                  <div className="bg-white shadow-card rounded-2xl rounded-bl-sm px-4 py-2.5 flex gap-1">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Error banners */}
            {voiceError === 'mic_denied' && (
              <p className="text-xs text-brand-red text-center px-4 py-1 bg-brand-redSoft">
                Microphone access denied. Please allow mic access in browser settings.
              </p>
            )}
            {voiceError === 'transcription_failed' && (
              <p className="text-xs text-brand-amber text-center px-4 py-1 bg-brand-amberSoft">
                Transcription failed. Please try again or type your message.
              </p>
            )}

            {/* Recording indicator */}
            {recording && (
              <div className="flex items-center justify-center gap-2 py-1.5 bg-brand-redSoft">
                <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" />
                <p className="text-xs text-brand-red font-semibold">Recording… tap mic to stop</p>
              </div>
            )}
            {transcribing && (
              <div className="flex items-center justify-center gap-2 py-1.5 bg-brand-purpleSoft">
                <p className="text-xs text-brand-purple font-semibold">Transcribing your voice…</p>
              </div>
            )}

            <div className="px-4 pb-4 bg-surface border-t border-gray-100 pt-2">
              <div className="flex items-center gap-2 bg-white rounded-2xl shadow-card px-3 py-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !thinking && send()}
                  placeholder={transcribing ? 'Transcribing…' : recording ? 'Recording…' : 'Ask about your business…'}
                  className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder-gray-400"
                  disabled={recording || transcribing}
                />
                <VoiceButton
                  recording={recording}
                  transcribing={transcribing}
                  onStart={start}
                  onStop={stop}
                  onCancel={cancel}
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || thinking || recording || transcribing}
                  className="w-9 h-9 rounded-full bg-brand-blue flex items-center justify-center disabled:opacity-40 transition-opacity"
                >
                  <Send size={15} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Sale Modal */}
      {isModalOpen && (
        <Modal
          title={editingSale ? 'Edit Sale Transaction' : 'Record New Sale'}
          onClose={() => setIsModalOpen(false)}
        >
          {setupError && (
            <div className="mb-4 bg-brand-redSoft border border-brand-red/20 rounded-xl p-6 flex flex-col items-center justify-center text-center">
              <AlertTriangle size={32} className="text-brand-red mb-3" />
              <p className="text-brand-red font-bold text-base mb-2">Company Setup Required</p>
              <p className="text-brand-red/80 text-sm mb-4">Please configure your company information before creating taxable invoices.</p>
              <button 
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  if (onNavigate) onNavigate('more');
                }}
                className="bg-brand-red text-white px-5 py-2 rounded-xl text-sm font-bold shadow-sm"
              >
                Go to Company Settings
              </button>
            </div>
          )}
          
          {backendValidationErrors.length > 0 && (
            <div className="mb-4 bg-brand-redSoft border border-brand-red/20 rounded-xl p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-brand-red" />
                <p className="text-brand-red font-bold text-sm">GST Validation Failed</p>
              </div>
              <ul className="list-disc pl-7 text-xs text-brand-red/90 space-y-1 font-medium">
                {backendValidationErrors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {!setupError && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField
              label="Select Product"
              name="product_id"
              type="select"
              value={formValues.product_id}
              onChange={handleFormChange}
              options={products.map(p => ({ value: p.id, label: `${p.name} (₹${p.selling_price} · Stock: ${p.stock_quantity})` }))}
              placeholder="-- Choose Product --"
              error={errors.product_id}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Quantity"
                name="quantity"
                type="number"
                value={formValues.quantity}
                onChange={handleFormChange}
                error={errors.quantity}
                min={1}
                required
              />
              <FormField
                label="Total Revenue (₹)"
                name="revenue"
                type="number"
                value={formValues.revenue}
                onChange={handleFormChange}
                error={errors.revenue}
                disabled
              />
            </div>

            {/* Customer Selection / Inline Creation */}
            <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl space-y-3">
              {!editingSale && (
                <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setCustomerFlow('existing')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${customerFlow === 'existing' ? 'bg-brand-blue text-white shadow' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    Existing Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerFlow('new')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${customerFlow === 'new' ? 'bg-brand-blue text-white shadow' : 'text-gray-500 hover:text-gray-900'}`}
                  >
                    New Customer
                  </button>
                </div>
              )}

              {customerFlow === 'existing' || editingSale ? (
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
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer">
                      <input type="radio" name="customerType" value="b2b" checked={customerType === 'b2b'} onChange={() => setCustomerType('b2b')} className="accent-brand-blue" />
                      Business Customer (B2B)
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 cursor-pointer">
                      <input type="radio" name="customerType" value="b2c" checked={customerType === 'b2c'} onChange={() => setCustomerType('b2c')} className="accent-brand-blue" />
                      Consumer (B2C)
                    </label>
                  </div>

                  {customerType === 'b2b' ? (
                    <>
                      <FormField
                        label="Business Name"
                        name="name"
                        value={newCustomer.name}
                        onChange={handleNewCustomerChange}
                        placeholder="e.g. Acme Corp"
                        error={errors.new_customer_name}
                        required
                      />
                      <FormField
                        label="GSTIN"
                        name="gstin"
                        value={newCustomer.gstin}
                        onChange={handleNewCustomerChange}
                        placeholder="15-character GSTIN"
                        error={errors.new_customer_gstin}
                        required
                        helpText={newCustomer.state_code ? `Auto-derived State Code: ${newCustomer.state_code}` : ''}
                      />
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          label="Customer Name (Optional)"
                          name="name"
                          value={newCustomer.name}
                          onChange={handleNewCustomerChange}
                          placeholder="e.g. John Doe"
                          error={errors.new_customer_name}
                          required
                        />
                        <FormField
                          label="Phone (Optional)"
                          name="phone"
                          value={newCustomer.phone}
                          onChange={handleNewCustomerChange}
                          placeholder="e.g. 9876543210"
                        />
                      </div>
                      <FormField
                        label="State"
                        name="state_code"
                        type="select"
                        value={newCustomer.state_code}
                        onChange={handleNewCustomerChange}
                        options={gstStates.map(s => ({ value: s.code, label: `${s.name} (${s.code})` }))}
                        placeholder="-- Choose State --"
                        error={errors.new_customer_state}
                        required
                      />
                    </>
                  )}
                </div>
              )}
            </div>

            <FormField
              label="Assigned Sales Representative"
              name="employee_id"
              type="select"
              value={formValues.employee_id}
              onChange={handleFormChange}
              options={employees.map(e => ({ value: e.id, label: `${e.name} (${e.department})` }))}
              placeholder="-- Choose Employee --"
              error={errors.employee_id}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Sale Date"
                name="sale_date"
                type="date"
                value={formValues.sale_date}
                onChange={handleFormChange}
                error={errors.sale_date}
                required
              />
              <FormField
                label="Payment Status"
                name="payment_status"
                type="select"
                value={formValues.payment_status}
                onChange={handleFormChange}
                options={[
                  { value: 'paid', label: 'Paid in Full' },
                  { value: 'unpaid', label: 'Unpaid (Add to Credit)' }
                ]}
              />
            </div>

            {formValues.payment_status === 'unpaid' && (
              <FormField
                label="Credit Due Date"
                name="due_date"
                type="date"
                value={formValues.due_date}
                onChange={handleFormChange}
                placeholder="Choose due date (Optional: default 30 days)"
              />
            )}

            <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-gray-200 text-sm font-semibold text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-brand-blue text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Processing...' : editingSale ? 'Save Changes' : 'Complete Sale'}
              </button>
            </div>
          </form>
          )}
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteConfirmSale && (
        <ConfirmDialog
          title="Delete Sale Transaction?"
          message={`Are you sure you want to delete sale ${deleteConfirmSale.invoice_number || 'S-' + deleteConfirmSale.id}? This will restore the product stock and recalculate customer metrics.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirmSale(null)}
        />
      )}

      {/* Sale Success Modal */}
      {saleSuccessInvoice && (
        <Modal title="Sale Complete" onClose={() => setSaleSuccessInvoice(null)}>
          <div className="flex flex-col items-center justify-center text-center p-6 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="w-16 h-16 bg-brand-greenSoft text-brand-green rounded-full flex items-center justify-center mb-4">
              <ShoppingBag size={28} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Sale Recorded Successfully</h2>
            <p className="text-gray-500 text-sm mt-1 mb-6">Invoice <strong>{saleSuccessInvoice.invoice_number || 'Generated'}</strong> has been recorded.</p>
            
            <div className="flex flex-col gap-3 w-full max-w-xs">
              {saleSuccessInvoice.id && (
                <button
                  onClick={() => {
                    setViewingInvoiceId(saleSuccessInvoice.id);
                    setSaleSuccessInvoice(null);
                  }}
                  className="w-full py-2.5 bg-brand-blue text-white rounded-xl text-sm font-bold shadow-sm hover:bg-blue-700 transition-colors flex justify-center items-center gap-2"
                >
                  View Invoice
                </button>
              )}
              <button
                onClick={() => setSaleSuccessInvoice(null)}
                className="w-full py-2 text-gray-500 hover:text-gray-900 font-semibold text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Floating Action Button for Scan */}
      <button 
        onClick={() => setIsScanModalOpen(true)}
        className="fixed bottom-24 right-5 w-14 h-14 bg-brand-blue text-white rounded-full flex flex-col items-center justify-center shadow-lg shadow-brand-blue/30 active:scale-95 transition-transform z-40"
      >
        <Camera size={22} />
        <span className="text-[9px] font-bold mt-0.5 tracking-tight">Scan Sale</span>
      </button>

      {/* Modals for OCR */}
      {isScanModalOpen && (
        <ScanModal 
          type="sales" 
          onClose={() => setIsScanModalOpen(false)} 
          onParsed={(data) => {
            setIsScanModalOpen(false);
            setDraftSaleData(data);
          }} 
        />
      )}

      {draftSaleData && (
        <DraftReviewModal
          type="sales"
          data={draftSaleData}
          products={products}
          onClose={() => setDraftSaleData(null)}
          onSuccess={() => {
            setDraftSaleData(null);
            refreshData();
          }}
        />
      )}
    </div>
  );
}
