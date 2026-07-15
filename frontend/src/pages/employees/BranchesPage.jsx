import React, { useState, useEffect } from 'react';
import { Building2, Search, Plus, Edit2, Trash2, MapPin, Phone } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../components/ToastContext';
import Modal from '../../components/Modal';
import FormField from '../../components/FormField';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function BranchesPage() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [form, setForm] = useState({
    name: '', code: '', location: '', address: '', phone: '', gstin: '', is_hq: false, status: 'Active'
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getBranches();
      setBranches(data || []);
    } catch (e) {
      showToast('Failed to load branches', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = branches.filter(b => {
    const s = search.toLowerCase();
    return b.name.toLowerCase().includes(s) || (b.location || '').toLowerCase().includes(s) || (b.code || '').toLowerCase().includes(s);
  });

  const openCreate = () => {
    setEditingBranch(null);
    setForm({ name: '', code: '', location: '', address: '', phone: '', gstin: '', is_hq: false, status: 'Active' });
    setShowModal(true);
  };

  const openEdit = (branch) => {
    setEditingBranch(branch);
    setForm({ ...branch });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name) {
      showToast('Branch name is required', 'error');
      return;
    }
    setSubmitting(true);
    try {
      if (editingBranch) {
        await api.updateBranch(editingBranch.id, form);
        showToast('Branch updated', 'success');
      } else {
        await api.createBranch(form);
        showToast('Branch created', 'success');
      }
      setShowModal(false);
      load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteBranch(deleteTarget.id);
      showToast('Branch deleted', 'success');
      setDeleteTarget(null);
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Branches</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage company locations and branches</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Add Branch
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          value={search} onChange={e => setSearch(e.target.value)} 
          placeholder="Search branches..."
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-blue-500" 
        />
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-500">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(b => (
            <div key={b.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors group">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${b.is_hq ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'}`}>
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white flex items-center gap-2">
                      {b.name}
                      {b.is_hq === 1 && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded uppercase font-bold">HQ</span>}
                    </h3>
                    <p className="text-xs text-slate-400">Code: {b.code || 'N/A'}</p>
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button onClick={() => openEdit(b)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget(b)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              
              <div className="space-y-2 mt-4 text-sm text-slate-400">
                {b.location && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 mt-0.5 text-slate-500 flex-shrink-0" />
                    <span>{b.location}</span>
                  </div>
                )}
                {b.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span>{b.phone}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingBranch ? 'Edit Branch' : 'Add Branch'}>
        <div className="space-y-4">
          <FormField label="Branch Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="E.g., North Regional Office" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Branch Code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="NRO-01" />
            <FormField label="Location (City/State)" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="New Delhi" />
          </div>
          <FormField label="Full Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Corporate Park, Block B..." />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 11 2345 6789" />
            <FormField label="GSTIN (Optional)" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} placeholder="07XXXXX0000X1Z5" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_hq" checked={form.is_hq} onChange={e => setForm(f => ({ ...f, is_hq: e.target.checked }))} className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500" />
            <label htmlFor="is_hq" className="text-sm text-slate-300 cursor-pointer">This is the Headquarters</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {submitting ? 'Saving...' : 'Save Branch'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Branch"
        message={`Are you sure you want to delete ${deleteTarget?.name}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
