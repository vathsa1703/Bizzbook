import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, AlertCircle, CheckCircle } from 'lucide-react';
import { api } from '../api/client';
import FormField from '../components/FormField';
import { useToast } from '../components/ToastContext';

function GstMaster() {
  const [hsnList, setHsnList] = useState([]);
  const [uqcList, setUqcList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const { showToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHsn, setEditingHsn] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [formValues, setFormValues] = useState({
    hsn_code: '',
    description: '',
    gst_rate: '18',
    uqc: 'NOS',
    cess_rate: '0',
    is_active: true
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    fetchData();
  }, [search]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [hsnData, uqcData] = await Promise.all([
        api.gstMaster.getHsnList(search),
        api.gstMaster.getUqcList().catch(() => [])
      ]);
      setHsnList(hsnData || []);
      if (uqcData.length > 0) setUqcList(uqcData);
    } catch (err) {
      showToast('error', 'Failed to fetch GST Master data');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingHsn(null);
    setFormValues({ hsn_code: '', description: '', gst_rate: '18', uqc: 'NOS', cess_rate: '0', is_active: true });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEdit = (hsn) => {
    setEditingHsn(hsn);
    setFormValues({
      hsn_code: hsn.hsn_code,
      description: hsn.description || '',
      gst_rate: String(hsn.gst_rate),
      uqc: hsn.uqc || 'NOS',
      cess_rate: String(hsn.cess_rate || '0'),
      is_active: Boolean(hsn.is_active)
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormValues(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formValues.hsn_code || !/^(\d{4}|\d{6}|\d{8})$/.test(formValues.hsn_code)) {
      newErrors.hsn_code = 'HSN must be exactly 4, 6, or 8 digits';
    }
    if (![0, 5, 12, 18, 28].includes(Number(formValues.gst_rate))) {
      newErrors.gst_rate = 'Invalid GST rate';
    }
    const cess = Number(formValues.cess_rate);
    if (isNaN(cess) || cess < 0) {
      newErrors.cess_rate = 'CESS rate cannot be negative';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setSubmitting(true);
    try {
      const payload = {
        ...formValues,
        gst_rate: Number(formValues.gst_rate),
        cess_rate: Number(formValues.cess_rate)
      };

      if (editingHsn) {
        await api.gstMaster.updateHsn(editingHsn.hsn_code, payload);
        showToast('success', 'HSN updated successfully');
      } else {
        await api.gstMaster.createHsn(payload);
        showToast('success', 'HSN created successfully');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      showToast('error', err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (hsnCode) => {
    if (!window.confirm('Are you sure you want to delete this HSN? Note: Deletion is blocked if products are using it.')) return;
    try {
      await api.gstMaster.deleteHsn(hsnCode);
      showToast('success', 'HSN deleted successfully');
      fetchData();
    } catch (err) {
      showToast('error', err.message || 'Deletion failed');
    }
  };

  const gstRateOptions = [
    { value: '0', label: '0% - Nil Rated' },
    { value: '5', label: '5%' },
    { value: '12', label: '12%' },
    { value: '18', label: '18%' },
    { value: '28', label: '28%' }
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-inkA dark:text-inkA-dark">GST Master</h1>
          <p className="text-inkB dark:text-inkB-dark text-sm mt-1">Manage official HSN codes, GST rates, and UQCs</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="bg-brand-primary text-white px-5 py-2.5 rounded-xl font-bold hover:bg-brand-primary/90 transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          <Plus size={18} />
          New HSN
        </button>
      </div>

      <div className="bg-panel dark:bg-panel-dark rounded-2xl shadow-sm border border-edge dark:border-edge-dark overflow-hidden">
        <div className="p-4 border-b border-edge dark:border-edge-dark flex gap-4 bg-panel2/50 dark:bg-panel2-dark/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={18} />
            <input
              type="text"
              placeholder="Search by HSN or Description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark font-semibold border-b border-edge dark:border-edge-dark">
              <tr>
                <th className="py-4 px-6 whitespace-nowrap">HSN Code</th>
                <th className="py-4 px-6">Description</th>
                <th className="py-4 px-6 whitespace-nowrap">GST Rate</th>
                <th className="py-4 px-6 whitespace-nowrap">UQC</th>
                <th className="py-4 px-6 whitespace-nowrap">CESS Rate</th>
                <th className="py-4 px-6 text-center">Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge dark:divide-edge-dark">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-gray-400 dark:text-slate-500">Loading...</td>
                </tr>
              ) : hsnList.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-gray-400 dark:text-slate-500">
                    <AlertCircle className="mx-auto mb-2 opacity-50" size={24} />
                    <p>No HSN codes found.</p>
                  </td>
                </tr>
              ) : (
                hsnList.map(hsn => (
                  <tr key={hsn.hsn_code} className="hover:bg-panel2/60 dark:hover:bg-panel2-dark/60 transition-colors group">
                    <td className="py-3 px-6 font-medium text-inkA dark:text-inkA-dark">{hsn.hsn_code}</td>
                    <td className="py-3 px-6 text-inkB dark:text-inkB-dark">{hsn.description || '-'}</td>
                    <td className="py-3 px-6 text-inkB dark:text-inkB-dark font-semibold">{hsn.gst_rate}%</td>
                    <td className="py-3 px-6 text-inkB dark:text-inkB-dark">{hsn.uqc}</td>
                    <td className="py-3 px-6 text-inkB dark:text-inkB-dark">{hsn.cess_rate}%</td>
                    <td className="py-3 px-6 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold ${
                        hsn.is_active ? 'bg-emerald-50 dark:bg-emerald-500/10 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:text-emerald-400' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark'
                      }`}>
                        {hsn.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenEdit(hsn)}
                          className="p-1.5 text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(hsn.hsn_code)}
                          className="p-1.5 text-red-600 dark:text-red-400 dark:text-red-400 hover:bg-brand-red/10 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-panel dark:bg-panel-dark rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-scale-in">
            <div className="px-6 py-4 border-b border-edge dark:border-edge-dark flex justify-between items-center bg-panel2/50 dark:bg-panel2-dark/50">
              <h2 className="text-lg font-bold text-inkA dark:text-inkA-dark">
                {editingHsn ? 'Edit HSN Code' : 'New HSN Code'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 dark:text-slate-500 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField
                  label="HSN Code (4, 6, or 8 digits)"
                  name="hsn_code"
                  value={formValues.hsn_code}
                  onChange={handleFormChange}
                  error={errors.hsn_code}
                  disabled={!!editingHsn} // cannot change PK
                  placeholder="e.g. 8517"
                  required
                />
                <FormField
                  label="Description"
                  name="description"
                  value={formValues.description}
                  onChange={handleFormChange}
                  placeholder="e.g. Smartphones"
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="GST Rate"
                    name="gst_rate"
                    type="select"
                    value={formValues.gst_rate}
                    onChange={handleFormChange}
                    options={gstRateOptions}
                    error={errors.gst_rate}
                    required
                  />
                  <FormField
                    label="UQC (Unit of Measure)"
                    name="uqc"
                    type="select"
                    value={formValues.uqc}
                    onChange={handleFormChange}
                    options={uqcList.length > 0 ? uqcList.map(u => ({ value: u.code, label: `${u.code} - ${u.description}` })) : [{value: 'NOS', label: 'NOS - Numbers'}]}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="CESS Rate (%)"
                    name="cess_rate"
                    type="number"
                    value={formValues.cess_rate}
                    onChange={handleFormChange}
                    error={errors.cess_rate}
                    min={0}
                    step="0.01"
                  />
                </div>
                
                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formValues.is_active}
                      onChange={handleFormChange}
                      className="w-4 h-4 text-brand-primary rounded border-gray-300 focus:ring-brand-primary focus:ring-offset-0"
                    />
                    <span className="text-sm font-medium text-inkB dark:text-inkB-dark">Active</span>
                  </label>
                </div>

                <div className="pt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl font-bold text-inkB dark:text-inkB-dark hover:bg-panel2 dark:hover:bg-panel2-dark transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-brand-primary text-white px-5 py-2.5 rounded-xl font-bold shadow-sm hover:bg-brand-primary/90 transition-all disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : (editingHsn ? 'Save Changes' : 'Create HSN')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GstMaster;
