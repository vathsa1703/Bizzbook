// Departments — CRUD with colour/icon (extended departments API) + member view.
import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Edit2, Trash2, Users } from 'lucide-react';
import { api } from '../../../api/client';
import { useToast } from '../../../components/ToastContext';
import Modal from '../../../components/Modal';
import FormField from '../../../components/FormField';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Avatar, Loading, EmptyState, PageHeader, COLOR_SWATCHES, btnPrimary, useEmployees } from './_shared';

const ICONS = ['🏢', '💼', '🛒', '📦', '📣', '💰', '🧑‍💻', '🔧', '🚚', '🛎️', '📊', '⚙️'];

export default function DepartmentsPage() {
  const { showToast } = useToast();
  const employees = useEmployees();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', description: '', color: COLOR_SWATCHES[0], icon: ICONS[0], head_id: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [membersOf, setMembersOf] = useState(null);
  const [members, setMembers] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDepartments(await api.getDepartments() || []); }
    catch { showToast('Failed to load departments', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ name: '', code: '', description: '', color: COLOR_SWATCHES[0], icon: ICONS[0], head_id: '' }); setShowModal(true); };
  const openEdit = (d) => { setEditing(d); setForm({ name: d.name || '', code: d.code || '', description: d.description || '', color: d.color || COLOR_SWATCHES[0], icon: d.icon || ICONS[0], head_id: d.head_id || '' }); setShowModal(true); };

  const submit = async () => {
    if (!form.name.trim()) return showToast('Department name is required', 'error');
    setSubmitting(true);
    try {
      const payload = { ...form, head_id: form.head_id || null };
      if (editing) { await api.updateDepartment(editing.id, payload); showToast('Department updated', 'success'); }
      else { await api.createDepartment(payload); showToast('Department created', 'success'); }
      setShowModal(false); load();
    } catch (e) { showToast(e.message, 'error'); } finally { setSubmitting(false); }
  };

  const remove = async () => {
    try { await api.deleteDepartment(deleteTarget.id); showToast('Department archived', 'success'); setDeleteTarget(null); load(); }
    catch (e) { showToast(e.message, 'error'); setDeleteTarget(null); }
  };

  const viewMembers = async (d) => {
    setMembersOf(d); setMembers([]);
    try { const r = await api.getDepartmentMembers(d.id); setMembers(r.members || []); } catch { setMembers([]); }
  };

  if (loading) return <div className="p-6"><Loading /></div>;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader icon={Building2} title="Departments" subtitle={`${departments.length} department${departments.length !== 1 ? 's' : ''}`}>
        <button onClick={openCreate} className={btnPrimary}><Plus className="w-4 h-4" />New Department</button>
      </PageHeader>

      {departments.length === 0 ? (
        <EmptyState icon={Building2} title="No departments yet" subtitle="Create your first department to organise your workforce." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {departments.map(d => (
            <div key={d.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1" style={{ background: d.color || '#3b82f6' }} />
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl" style={{ background: `${d.color || '#3b82f6'}22` }}>{d.icon || '🏢'}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">{d.name}</div>
                  <div className="text-[11px] text-slate-500">{d.code || 'No code'}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setDeleteTarget(d)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {d.description && <p className="text-xs text-slate-400 mt-2 line-clamp-2">{d.description}</p>}
              <div className="mt-3 flex items-center justify-between">
                <div className="text-[11px] text-slate-500">Head: <span className="text-slate-300">{d.head_name || '—'}</span></div>
                <button onClick={() => viewMembers(d)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300">
                  <Users className="w-3.5 h-3.5" />{d.employee_count || 0} members
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal isOpen title={editing ? 'Edit Department' : 'New Department'} onClose={() => setShowModal(false)} size="md">
          <div className="p-5 space-y-3">
            <FormField label="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sales" />
            <FormField label="Code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. SAL" />
            <FormField label="Description" type="textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <FormField label="Department Head" type="select" value={form.head_id} onChange={e => setForm({ ...form, head_id: e.target.value })}
              options={[{ value: '', label: '— None —' }, ...employees.map(e => ({ value: e.id, label: e.name }))]} />
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Colour</label>
              <div className="flex gap-2 flex-wrap">{COLOR_SWATCHES.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })} className={`w-7 h-7 rounded-lg border-2 ${form.color === c ? 'border-gray-900' : 'border-transparent'}`} style={{ background: c }} />
              ))}</div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Icon</label>
              <div className="flex gap-1.5 flex-wrap">{ICONS.map(ic => (
                <button key={ic} onClick={() => setForm({ ...form, icon: ic })} className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border-2 ${form.icon === ic ? 'border-brand-blue bg-brand-blueSoft' : 'border-gray-100'}`}>{ic}</button>
              ))}</div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100">Cancel</button>
              <button onClick={submit} disabled={submitting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 disabled:opacity-50">{submitting ? 'Saving…' : editing ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </Modal>
      )}

      {membersOf && (
        <Modal isOpen title={`${membersOf.name} — Members`} onClose={() => setMembersOf(null)} size="md">
          <div className="p-5">
            {members.length === 0 ? <div className="text-sm text-gray-400 text-center py-6">No members in this department.</div> : (
              <div className="space-y-2 max-h-80 overflow-y-auto">{members.map(m => (
                <div key={m.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-gray-50">
                  <Avatar name={m.name} src={m.avatar} size="sm" />
                  <div className="min-w-0"><div className="text-sm font-medium text-gray-900 truncate">{m.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{m.job_title || '—'}</div></div>
                </div>
              ))}</div>
            )}
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog isOpen title="Archive department?" message={`"${deleteTarget.name}" will be archived. Departments with active employees can't be archived.`}
          confirmText="Archive" onConfirm={remove} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
