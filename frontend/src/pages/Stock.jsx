import React, { useEffect, useState } from 'react';
import { Package, AlertTriangle, TrendingDown, Archive, Plus, Search, Edit2, Trash2, ShieldAlert, Camera } from 'lucide-react';
import SectionCard from '../components/SectionCard';
import Modal from '../components/Modal';
import FormField from '../components/FormField';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ScanModal from '../components/ScanModal';
import DraftReviewModal from '../components/DraftReviewModal';

const TABS = ['All Products', 'Low Stock', 'Overstocked', 'Slow Moving'];

function StockRow({ name, value, sub, accent, onEdit, onDelete, showDelete = true, gstStatus }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/20 px-2 rounded-xl transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl ${accent.bg} flex items-center justify-center`}>
          <Package size={16} className={accent.text} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{name}</p>
            {gstStatus === 'complete' && <span className="bg-brand-emeraldSoft text-brand-emerald text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">GST OK</span>}
            {gstStatus === 'missing_hsn' && <span className="bg-brand-redSoft text-brand-red text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">Missing HSN</span>}
          </div>
          <p className="text-xs text-gray-500">{sub}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold ${accent.text}`}>{value}</span>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-brand-blue hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Edit2 size={13} />
          </button>
          {showDelete && (
            <button
              onClick={onDelete}
              className="p-1 text-gray-400 hover:text-brand-red hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Stock() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const isAdmin = !user || user.role === 'admin';
  
  
  // Tab states
  const [tab, setTab] = useState(0);

  // Data lists
  const [allProducts, setAllProducts] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [overstocked, setOverstocked] = useState([]);
  const [slowMoving, setSlowMoving] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [productGroups, setProductGroups] = useState([]);
  const [hsnMaster, setHsnMaster] = useState([]);

  // Filter and search
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Modal / Confirm state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState(null);
  
  // Inline group creation state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupForm, setNewGroupForm] = useState({ name: '', description: '' });
  const [groupSubmitting, setGroupSubmitting] = useState(false);

  // OCR states
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [draftStockData, setDraftStockData] = useState(null);

  // Form states
  const [formValues, setFormValues] = useState({
    name: '',
    group_id: '',
    cost_price: '',
    selling_price: '',
    hsn_code: '',
    use_custom_gst: false,
    gst_rate: '',
    cess_rate: '',
    uqc: 'NOS',
    stock_quantity: 0,
    reorder_level: 10,
    supplier_id: '',
  });
  const [errors, setErrors] = useState({});

  const refreshData = async () => {
    setLoading(true);
    try {
      const [allProds, ls, os, sm, sups, pGroups, hsnData] = await Promise.all([
        api.getProducts({ search, category: categoryFilter }).catch(() => []),
        api.lowStock().catch(() => []),
        api.overstocked().catch(() => []),
        api.slowMoving(30).catch(() => []),
        api.getSuppliers().catch(() => []),
        api.getProductGroups().catch(() => []),
        api.gstMaster.getHsnList().catch(() => []),
      ]);
      setAllProducts(allProds);
      setLowStock(Array.isArray(ls) ? ls : []);
      setOverstocked(Array.isArray(os) ? os : []);
      setSlowMoving(Array.isArray(sm) ? sm : []);
      setSuppliers(sups);
      setProductGroups(pGroups.data || []);
      setHsnMaster(hsnData || []);
    } catch (err) {
      showToast('error', 'Failed to fetch inventory data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [search, categoryFilter]);

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'group_id' && value === 'CREATE_NEW') {
      setNewGroupForm({ name: '', description: '' });
      setIsGroupModalOpen(true);
      return;
    }

    const val = type === 'checkbox' ? checked : value;
    setFormValues((prev) => {
      const next = { ...prev, [name]: val };
      // Auto-populate when HSN is selected and not overriding
      if (name === 'hsn_code' && !next.use_custom_gst) {
        const selected = hsnMaster.find(h => h.hsn_code === val);
        if (selected) {
          next.gst_rate = String(selected.gst_rate);
          next.uqc = selected.uqc;
          next.cess_rate = String(selected.cess_rate);
        }
      }
      if (name === 'use_custom_gst' && !val && next.hsn_code) {
        const selected = hsnMaster.find(h => h.hsn_code === next.hsn_code);
        if (selected) {
          next.gst_rate = String(selected.gst_rate);
          next.uqc = selected.uqc;
          next.cess_rate = String(selected.cess_rate);
        }
      }
      return next;
    });

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleGroupSubmit = async (e) => {
    e.preventDefault();
    if (!newGroupForm.name) return;
    setGroupSubmitting(true);
    try {
      const res = await api.createProductGroup(newGroupForm);
      const newGroup = res.data;
      setProductGroups(prev => [...prev, newGroup].sort((a, b) => a.name.localeCompare(b.name)));
      setFormValues(prev => ({ ...prev, group_id: newGroup.id }));
      setIsGroupModalOpen(false);
      showToast('success', 'Product group created successfully');
    } catch (err) {
      showToast('error', err.message || 'Failed to create group');
    } finally {
      setGroupSubmitting(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formValues.name) newErrors.name = 'Product name is required';
    if (!formValues.group_id) newErrors.group_id = 'Product Group is required';
    const cost = Number(formValues.cost_price);
    const sell = Number(formValues.selling_price);
    if (formValues.cost_price === '' || isNaN(cost) || cost < 0) newErrors.cost_price = 'Invalid cost price';
    if (formValues.selling_price === '' || isNaN(sell) || sell < 0) newErrors.selling_price = 'Invalid selling price';
    if (sell <= cost) {
      newErrors.selling_price = 'Selling price should be greater than cost price';
    }
    if (formValues.stock_quantity === '' || isNaN(Number(formValues.stock_quantity)) || Number(formValues.stock_quantity) < 0) newErrors.stock_quantity = 'Stock quantity cannot be negative';
    if (formValues.reorder_level === '' || isNaN(Number(formValues.reorder_level)) || Number(formValues.reorder_level) < 0) newErrors.reorder_level = 'Reorder level cannot be negative';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setFormValues({
      name: '',
      group_id: '',
      cost_price: '',
      selling_price: '',
      cess_rate: '',
      uqc: 'NOS',
      stock_quantity: 0,
      reorder_level: 10,
      supplier_id: '',
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEdit = (prod) => {
    setEditingProduct(prod);
    setFormValues({
      name: prod.name,
      group_id: prod.group_id || '',
      cost_price: prod.cost_price,
      selling_price: prod.selling_price,
      hsn_code: prod.hsn_code || '',
      use_custom_gst: Boolean(prod.use_custom_gst),
      cess_rate: prod.cess_rate != null ? prod.cess_rate : '',
      uqc: prod.uqc || 'NOS',
      gst_rate: prod.gst_rate != null ? prod.gst_rate : '',
      stock_quantity: prod.stock_quantity || 0,
      reorder_level: prod.reorder_level || 10,
      supplier_id: prod.supplier_id || '',
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, formValues);
        showToast('success', 'Product inventory updated successfully');
      } else {
        await api.createProduct(formValues);
        showToast('success', 'Product created with inventory record');
      }
      setIsModalOpen(false);
      refreshData();
    } catch (err) {
      showToast('error', err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmProduct) return;
    try {
      await api.deleteProduct(deleteConfirmProduct.id);
      showToast('success', 'Product catalog deleted successfully');
      setDeleteConfirmProduct(null);
      refreshData();
    } catch (err) {
      showToast('error', err.message || 'Deletion failed. Product may have active sales records.');
    }
  };

  const RED   = { bg: 'bg-brand-redSoft',   text: 'text-brand-red'   };
  const AMBER = { bg: 'bg-brand-amberSoft',  text: 'text-brand-amber' };
  const BLUE  = { bg: 'bg-brand-blueSoft',   text: 'text-brand-blue'  };
  const GREEN = { bg: 'bg-brand-greenSoft',  text: 'text-brand-green' };

  return (
    <div className="pb-20 bg-surface min-h-screen">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 border-b border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Stock</h1>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1 bg-brand-blue text-white px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-sm"
          >
            <Plus size={14} /> Add Product
          </button>
        </div>

        {/* Dynamic Metric indicators */}
        {!loading && (
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5 bg-brand-redSoft px-2.5 py-1 rounded-full text-[10px] font-bold text-brand-red">
              <AlertTriangle size={11} />
              <span>{lowStock.length} Low stock</span>
            </div>
            <div className="flex items-center gap-1.5 bg-brand-amberSoft px-2.5 py-1 rounded-full text-[10px] font-bold text-brand-amber">
              <Archive size={11} />
              <span>{overstocked.length} Overstocked</span>
            </div>
            <div className="flex items-center gap-1.5 bg-brand-blueSoft px-2.5 py-1 rounded-full text-[10px] font-bold text-brand-blue">
              <TrendingDown size={11} />
              <span>{slowMoving.length} Slow-moving</span>
            </div>
          </div>
        )}
      </div>

      {!loading && allProducts.filter(p => !p.hsn_code).length > 0 && (
        <div className="mx-4 mt-4 bg-brand-amberSoft border border-brand-amber/20 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-brand-amber" />
            <p className="text-brand-amber font-bold text-xs">{allProducts.filter(p => !p.hsn_code).length} Products require GST attention (Missing HSN).</p>
          </div>
          <button onClick={() => setSearch('missing_gst')} className="text-[10px] font-bold uppercase bg-white px-2 py-1 rounded text-brand-amber shadow-sm">View Products</button>
        </div>
      )}

      <div className="px-4 pt-4 space-y-4">
        {/* Filters & Search */}
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-brand-blue shadow-sm"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-2 py-2 text-xs text-gray-700 outline-none shadow-sm focus:border-brand-blue"
          >
            <option value="All">All Groups</option>
            {productGroups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shadow-sm ${
                tab === i ? 'bg-brand-blue text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* List of Products */}
        <SectionCard>
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-6">Loading inventory list...</p>
          ) : tab === 0 ? (
            // All Products tab
            allProducts.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No products found matching filters.</p>
            ) : (
              allProducts.filter(item => search === 'missing_gst' ? !item.hsn_code : true).map((item) => (
                <StockRow
                  key={item.id}
                  name={item.name}
                  value={`₹${item.selling_price}`}
                  sub={`Stock: ${item.stock_quantity ?? 0} · Cost: ₹${item.cost_price} · ${item.group_name || item.category}`}
                  accent={GREEN}
                  gstStatus={item.hsn_code ? 'complete' : 'missing_hsn'}
                  onEdit={() => handleOpenEdit(item)}
                  onDelete={() => setDeleteConfirmProduct(item)}
                  showDelete={isAdmin}
                />
              ))
            )
          ) : tab === 1 ? (
            // Low Stock tab
            lowStock.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">All items are well-stocked 🎉</p>
            ) : (
              lowStock.map((item) => (
                <StockRow
                  key={item.id}
                  name={item.name}
                  value={`${item.stock_quantity} left`}
                  sub={`Reorder level: ${item.reorder_level} · Group: ${item.group_name || item.category}`}
                  accent={RED}
                  onEdit={() => handleOpenEdit(item)}
                  onDelete={() => setDeleteConfirmProduct(item)}
                  showDelete={isAdmin}
                />
              ))
            )
          ) : tab === 2 ? (
            // Overstocked tab
            overstocked.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No overstocked items.</p>
            ) : (
              overstocked.map((item) => (
                <StockRow
                  key={item.id}
                  name={item.name}
                  value={`${item.stock_quantity} units`}
                  sub={`Reorder level: ${item.reorder_level} · Group: ${item.group_name || item.category}`}
                  accent={AMBER}
                  onEdit={() => handleOpenEdit(item)}
                  onDelete={() => setDeleteConfirmProduct(item)}
                  showDelete={isAdmin}
                />
              ))
            )
          ) : (
            // Slow Moving tab
            slowMoving.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No slow-moving items.</p>
            ) : (
              slowMoving.map((item) => (
                <StockRow
                  key={item.id}
                  name={item.name}
                  value={`${item.units_sold_recently} sold`}
                  sub={`Inventory hold: ${item.stock_quantity} units · Last 30 days`}
                  accent={BLUE}
                  onEdit={() => handleOpenEdit(item)}
                  onDelete={() => setDeleteConfirmProduct(item)}
                  showDelete={isAdmin}
                />
              ))
            )
          )}
        </SectionCard>
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <Modal
          title={editingProduct ? 'Edit Product details' : 'Add New Product'}
          onClose={() => setIsModalOpen(false)}
          size="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              label="Product Name"
              name="name"
              value={formValues.name}
              onChange={handleFormChange}
              error={errors.name}
              placeholder="e.g. Wireless Headphones"
              required
            />

            <FormField
              label="Product Group *"
              name="group_id"
              type="select"
              value={formValues.group_id}
              onChange={handleFormChange}
              options={[
                ...productGroups.map(g => ({ value: g.id, label: g.name })),
                { value: 'CREATE_NEW', label: '+ Create New Group' }
              ]}
              placeholder="-- Select Group --"
              error={errors.group_id}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Cost Price (₹)"
                name="cost_price"
                type="number"
                value={formValues.cost_price}
                onChange={handleFormChange}
                error={errors.cost_price}
                min={0}
                required
              />
              <FormField
                label="Selling Price (₹)"
                name="selling_price"
                type="number"
                value={formValues.selling_price}
                onChange={handleFormChange}
                error={errors.selling_price}
                min={0}
                required
              />
            </div>
            
            <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-800">GST Information</h3>
              <div className="grid grid-cols-2 gap-3 relative">
                <FormField
                  label="HSN Code *"
                  name="hsn_code"
                  type="text"
                  list="hsn-options"
                  value={formValues.hsn_code || ''}
                  onChange={handleFormChange}
                  placeholder="Type or select HSN"
                  error={errors.hsn_code}
                  required
                />
                <datalist id="hsn-options">
                  {hsnMaster.map(h => (
                    <option key={h.hsn_code} value={h.hsn_code}>{`${h.hsn_code} - ${h.description || ''}`}</option>
                  ))}
                </datalist>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="use_custom_gst"
                  id="use_custom_gst"
                  checked={formValues.use_custom_gst}
                  onChange={handleFormChange}
                  className="rounded text-brand-blue"
                />
                <label htmlFor="use_custom_gst" className="text-xs font-semibold text-gray-700">Override GST Details</label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <FormField
                  label="GST Rate (%)"
                  name="gst_rate"
                  type="number"
                  value={formValues.gst_rate || ''}
                  onChange={handleFormChange}
                  error={errors.gst_rate}
                  min={0}
                  max={100}
                  disabled={!formValues.use_custom_gst}
                />
                <FormField
                  label="CESS Rate (%)"
                  name="cess_rate"
                  type="number"
                  value={formValues.cess_rate || ''}
                  onChange={handleFormChange}
                  error={errors.cess_rate}
                  min={0}
                  max={100}
                  disabled={!formValues.use_custom_gst}
                />
                <FormField
                  label="UQC"
                  name="uqc"
                  type="select"
                  value={formValues.uqc || 'NOS'}
                  onChange={handleFormChange}
                  disabled={!formValues.use_custom_gst}
                  options={[
                    { value: 'NOS', label: 'NOS' },
                    { value: 'KGS', label: 'KGS' },
                    { value: 'LTR', label: 'LTR' },
                    { value: 'MTR', label: 'MTR' },
                    { value: 'PCS', label: 'PCS' },
                    { value: 'BOX', label: 'BOX' },
                    { value: 'BAG', label: 'BAG' },
                    { value: 'BTL', label: 'BTL' },
                    { value: 'DOZ', label: 'DOZ' },
                    { value: 'OTH', label: 'OTH' }
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Initial Stock Quantity"
                name="stock_quantity"
                type="number"
                value={formValues.stock_quantity}
                onChange={handleFormChange}
                error={errors.stock_quantity}
                min={0}
                required
              />
              <FormField
                label="Reorder Alert Level"
                name="reorder_level"
                type="number"
                value={formValues.reorder_level}
                onChange={handleFormChange}
                error={errors.reorder_level}
                min={0}
                required
              />
            </div>

            <FormField
              label="Supplier"
              name="supplier_id"
              type="select"
              value={formValues.supplier_id}
              onChange={handleFormChange}
              options={suppliers.map(s => ({ value: s.id, label: s.name }))}
              placeholder="-- Choose Supplier (Optional) --"
            />

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
                {submitting ? 'Adding...' : editingProduct ? 'Save Changes' : 'Add Product'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteConfirmProduct && (
        <ConfirmDialog
          title="Delete Product?"
          message={`Are you sure you want to delete product "${deleteConfirmProduct.name}" from catalog? This will delete the product and its inventory record.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirmProduct(null)}
        />
      )}

      {/* Inline Group Creation Modal */}
      {isGroupModalOpen && (
        <Modal
          title="Create New Product Group"
          onClose={() => setIsGroupModalOpen(false)}
          size="sm"
        >
          <form onSubmit={handleGroupSubmit} className="space-y-4">
            <FormField
              label="Group Name *"
              name="name"
              value={newGroupForm.name}
              onChange={(e) => setNewGroupForm({ ...newGroupForm, name: e.target.value })}
              placeholder="e.g. Laptops"
              required
            />
            <FormField
              label="Description (Optional)"
              name="description"
              type="text"
              value={newGroupForm.description}
              onChange={(e) => setNewGroupForm({ ...newGroupForm, description: e.target.value })}
              placeholder="Brief description"
            />
            <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="px-4 py-2 border border-gray-200 text-sm font-semibold text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={groupSubmitting}
                className="px-4 py-2 bg-brand-blue text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {groupSubmitting ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Floating Action Button for Scan */}
      <button 
        onClick={() => setIsScanModalOpen(true)}
        className="fixed bottom-24 right-5 w-14 h-14 bg-brand-blue text-white rounded-full flex flex-col items-center justify-center shadow-lg shadow-brand-blue/30 active:scale-95 transition-transform z-40"
      >
        <Camera size={22} />
        <span className="text-[9px] font-bold mt-0.5 tracking-tight">Scan Stock</span>
      </button>

      {/* Modals for OCR */}
      {isScanModalOpen && (
        <ScanModal 
          type="stock" 
          onClose={() => setIsScanModalOpen(false)} 
          onParsed={(data) => {
            setIsScanModalOpen(false);
            setDraftStockData(data);
          }} 
        />
      )}

      {draftStockData && (
        <DraftReviewModal
          type="stock"
          data={draftStockData}
          products={allProducts}
          onClose={() => setDraftStockData(null)}
          onSuccess={() => {
            setDraftStockData(null);
            refreshData();
          }}
        />
      )}
    </div>
  );
}
