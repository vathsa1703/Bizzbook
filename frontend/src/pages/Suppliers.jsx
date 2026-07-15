import React, { useEffect, useState } from 'react';
import { Search, Plus, Trash2, Edit2, Phone, Mail, MapPin, RefreshCw, ArrowLeft, Package, ChevronRight } from 'lucide-react';
import SectionCard from '../components/SectionCard';
import Modal from '../components/Modal';
import FormField from '../components/FormField';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { api } from '../api/client';

export default function Suppliers() {
  const { showToast } = useToast();

  // Navigation / detailed states
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [supplierDetails, setSupplierDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Lists & Filters
  const [suppliersList, setSuppliersList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Action Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [deleteConfirmSup, setDeleteConfirmSup] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [formValues, setFormValues] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
  });
  const [errors, setErrors] = useState({});

  const refreshData = async () => {
    setLoading(true);
    try {
      const list = await api.getSuppliers({ search: searchQuery }).catch(() => []);
      setSuppliersList(list);
    } catch (err) {
      showToast('error', 'Failed to retrieve suppliers index');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [searchQuery]);

  const loadSupplierDetails = async (id) => {
    setLoadingDetails(true);
    setSelectedSupplierId(id);
    try {
      const details = await api.getSupplier(id);
      setSupplierDetails(details);
    } catch (err) {
      showToast('error', 'Failed to fetch supplier details');
      setSelectedSupplierId(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setFormValues({
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      address: '',
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEdit = (e, sup) => {
    e.stopPropagation();
    setEditingSupplier(sup);
    setFormValues({
      name: sup.name,
      contact_person: sup.contact_person || '',
      phone: sup.phone || '',
      email: sup.email || '',
      address: sup.address || '',
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formValues.name) newErrors.name = 'Supplier name is required';
    if (!formValues.contact_person) newErrors.contact_person = 'Contact person is required';
    if (!formValues.phone && !formValues.email) {
      newErrors.phone = 'At least one contact field (phone or email) must be provided';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      if (editingSupplier) {
        await api.updateSupplier(editingSupplier.id, formValues);
        showToast('success', 'Supplier credentials updated successfully');
        if (selectedSupplierId === editingSupplier.id) {
          loadSupplierDetails(editingSupplier.id);
        }
      } else {
        await api.createSupplier(formValues);
        showToast('success', 'New supplier profile registered');
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
    if (!deleteConfirmSup) return;
    try {
      await api.deleteSupplier(deleteConfirmSup.id);
      showToast('success', 'Supplier record deleted successfully');
      setDeleteConfirmSup(null);
      setSelectedSupplierId(null);
      refreshData();
    } catch (err) {
      showToast('error', err.message || 'Deletion failed. Supplier may have linked products.');
    }
  };

  return (
    <div className="pb-20 min-h-screen bg-surface">
      {!selectedSupplierId ? (
        // SUPPLIERS LISTING VIEW
        <>
          <div className="bg-white px-5 pt-12 pb-4 border-b border-gray-100 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
              <button
                onClick={handleOpenCreate}
                className="w-9 h-9 rounded-full bg-brand-blue flex items-center justify-center shadow-card-md hover:bg-blue-700 transition-colors"
              >
                <Plus size={18} className="text-white" strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <Search size={15} className="text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search suppliers..."
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
          </div>

          <div className="px-4 py-4 space-y-3">
            {loading && suppliersList.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">
                <RefreshCw size={16} className="animate-spin inline mr-2" /> Loading roster...
              </div>
            ) : suppliersList.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">No suppliers found.</div>
            ) : (
              suppliersList.map((sup) => (
                <button
                  key={sup.id}
                  onClick={() => loadSupplierDetails(sup.id)}
                  className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:bg-gray-50/50 flex justify-between items-center transition-colors"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-gray-950">{sup.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">Person: {sup.contact_person}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{sup.phone || sup.email}</p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div className="bg-brand-blueSoft text-brand-blue px-2.5 py-1 rounded-full text-[10px] font-bold">
                      {sup.product_count} products
                    </div>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        // DETAILED SUPPLIER PROFILE
        <div className="animate-fadeIn pb-6">
          <div className="bg-white px-5 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
            <button
              onClick={() => setSelectedSupplierId(null)}
              className="p-1 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-bold text-gray-900 flex-1">Supplier profile</h1>
            {supplierDetails && (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => handleOpenEdit(e, supplierDetails)}
                  className="p-1.5 text-gray-500 hover:text-brand-blue hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => setDeleteConfirmSup(supplierDetails)}
                  className="p-1.5 text-gray-500 hover:text-brand-red hover:bg-brand-redSoft rounded-xl transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>

          {loadingDetails ? (
            <div className="py-24 text-center text-xs text-gray-400">
              <RefreshCw size={16} className="animate-spin inline mr-2" /> Loading supplier info...
            </div>
          ) : !supplierDetails ? (
            <div className="py-24 text-center text-xs text-gray-400">Supplier not found.</div>
          ) : (
            <div className="px-4 py-4 space-y-4">
              {/* Contact Card */}
              <div className="bg-white rounded-2xl p-5 shadow-card space-y-3.5">
                <h2 className="text-base font-extrabold text-gray-950 border-b border-gray-100 pb-2">{supplierDetails.name}</h2>
                <div className="space-y-2 text-xs text-gray-700">
                  <div className="flex items-center gap-2.5">
                    <Phone size={14} className="text-gray-400" />
                    <span className="font-medium">{supplierDetails.contact_person} ({supplierDetails.phone || 'No Phone'})</span>
                  </div>
                  {supplierDetails.email && (
                    <div className="flex items-center gap-2.5">
                      <Mail size={14} className="text-gray-400" />
                      <span>{supplierDetails.email}</span>
                    </div>
                  )}
                  {supplierDetails.address && (
                    <div className="flex items-start gap-2.5">
                      <MapPin size={14} className="text-gray-400 mt-0.5" />
                      <span className="leading-relaxed">{supplierDetails.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Linked products */}
              <SectionCard>
                <div className="flex items-center gap-1.5 mb-3 text-brand-blue border-b border-gray-50 pb-2">
                  <Package size={15} />
                  <h3 className="text-xs font-bold uppercase tracking-wider">Supplied Products</h3>
                </div>

                {supplierDetails.products.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">No products are linked to this supplier catalog.</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {supplierDetails.products.map((p) => (
                      <div key={p.id} className="py-3 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-semibold text-gray-800">{p.name}</p>
                          <p className="text-[10px] text-gray-400">{p.category}</p>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-gray-950">₹{p.selling_price}</span>
                          <p className="text-[10px] text-gray-400">Stock: {p.stock_quantity ?? 0} units</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Supplier Modal */}
      {isModalOpen && (
        <Modal
          title={editingSupplier ? 'Edit Supplier' : 'Register New Supplier'}
          onClose={() => setIsModalOpen(false)}
          size="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              label="Supplier Company Name"
              name="name"
              value={formValues.name}
              onChange={handleFormChange}
              error={errors.name}
              placeholder="e.g. Mahadev Distributors"
              required
            />

            <FormField
              label="Contact Person Name"
              name="contact_person"
              value={formValues.contact_person}
              onChange={handleFormChange}
              error={errors.contact_person}
              placeholder="e.g. Ramesh Patel"
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Phone Number"
                name="phone"
                value={formValues.phone}
                onChange={handleFormChange}
                error={errors.phone}
                placeholder="e.g. 9822******"
              />
              <FormField
                label="Email Address"
                name="email"
                type="email"
                value={formValues.email}
                onChange={handleFormChange}
                placeholder="e.g. ramesh@company.com"
              />
            </div>

            <FormField
              label="Warehouse / Office Address"
              name="address"
              type="textarea"
              value={formValues.address}
              onChange={handleFormChange}
              placeholder="Street name, City..."
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
                {submitting ? 'Registering...' : editingSupplier ? 'Save Changes' : 'Register Supplier'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteConfirmSup && (
        <ConfirmDialog
          title="Delete Supplier Record?"
          message={`Are you sure you want to delete supplier record for "${deleteConfirmSup.name}"? This will fail if they supply existing catalog products.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirmSup(null)}
        />
      )}
    </div>
  );
}
