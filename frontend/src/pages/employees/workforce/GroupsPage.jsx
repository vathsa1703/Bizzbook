// Employee Groups — dynamic ad-hoc collections. CRUD + members + transfer + search.
import React, { useState, useEffect, useCallback } from 'react';
import { Boxes, Plus, Trash2, UserPlus, X, Search, ArrowRightLeft } from 'lucide-react';
import { api } from '../../../api/client';
import { useToast } from '../../../components/ToastContext';
import Modal from '../../../components/Modal';
import FormField from '../../../components/FormField';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Avatar, Loading, EmptyState, PageHeader, COLOR_SWATCHES, MemberPicker, btnPrimary, useEmployees } from './_shared';

export default function GroupsPage() {
  const { showToast } = useToast();
  const employees = useEmployees();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: COLOR_SWATCHES[1], member_ids: [] });
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [addingMembers, setAddingMembers] = useState(false);
  const [newMembers, setNewMembers] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [transfer, setTransfer] = useState(null); // { memberIds, toGroupId }

  const load = useCallback(async (q) => {
    setLoading(true);
    try { const r = await api.getGroups(q); setGroups(r.groups || []); }
    catch { showToast('Failed to load groups', 'error'); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { const t = setTimeout(() => load(search), 250); return () => clearTimeout(t); }, [search, load]);

  const openDetail = async (g) => {
    setDetail({ group: g });
    try { setDetail(await api.getGroup(g.id)); } catch { showToast('Failed to load group', 'error'); }
  };

  const submit = async () => {
    if (!form.name.trim()) return showToast('Group name is required', 'error');
    setSubmitting(true);
    try { await api.createGroup(form); showToast('Group created', 'success'); setShowCreate(false); setForm({ name: '', description: '', color: COLOR_SWATCHES[1], member_ids: [] }); load(search); }
    catch (e) { showToast(e.message, 'error'); } finally { setSubmitting(false); }
  };
  const addMembers = async () => {
    if (!newMembers.length) return;
    try { await api.addGroupMembers(detail.group.id, newMembers); showToast('Members added', 'success'); setAddingMembers(false); setNewMembers([]); openDetail(detail.group); load(search); }
    catch (e) { showToast(e.message, 'error'); }
  };
  const removeMember = async (empId) => {
    try { await api.removeGroupMember(detail.group.id, empId); openDetail(detail.group); load(search); } catch (e) { showToast(e.message, 'error'); }
  };
  const doTransfer = async () => {
    try { await api.transferGroupMembers(detail.group.id, transfer.toGroupId, transfer.memberIds); showToast('Members transferred', 'success'); setTransfer(null); openDetail(detail.group); load(search); }
    catch (e) { showToast(e.message, 'error'); }
  };
  const remove = async () => {
    try { await api.deleteGroup(deleteTarget.id); showToast('Group deleted', 'success'); setDeleteTarget(null); setDetail(null); load(search); }
    catch (e) { showToast(e.message, 'error'); setDeleteTarget(null); }
  };

  return (
    <div className="p-4 sm:p-6">
      <PageHeader icon={Boxes} title="Employee Groups" subtitle="Dynamic collections — an employee can belong to many">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-inkB dark:text-inkB-dark" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search groups…"
            className="pl-8 pr-3 py-2 text-sm bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-inkA dark:text-inkA-dark placeholder-gray-400 dark:placeholder-slate-500 outline-none focus:border-blue-500 w-40" />
        </div>
        <button onClick={() => setShowCreate(true)} className={btnPrimary}><Plus className="w-4 h-4" />New Group</button>
      </PageHeader>

      {loading ? <Loading /> : groups.length === 0 ? (
        <EmptyState icon={Boxes} title="No groups found" subtitle="Create groups like Project Alpha, Night Shift or Festival Team." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map(g => (
            <button key={g.id} onClick={() => openDetail(g)} className="text-left rounded-2xl border border-edge dark:border-edge-dark bg-panel dark:bg-panel-dark hover:border-accent/40 p-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-inkA dark:text-inkA-dark font-bold" style={{ background: g.color || '#8b5cf6' }}>{g.name?.[0]?.toUpperCase()}</div>
                <div className="min-w-0 flex-1"><div className="text-sm font-bold text-inkA dark:text-inkA-dark truncate">{g.name}</div>
                  <div className="text-[11px] text-inkB dark:text-inkB-dark">{g.member_count || 0} members</div></div>
              </div>
              {g.description && <p className="text-xs text-inkB dark:text-inkB-dark mt-2 line-clamp-2">{g.description}</p>}
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal isOpen title="New Group" onClose={() => setShowCreate(false)} size="lg">
          <div className="p-5 space-y-3">
            <FormField label="Group name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Project Alpha" />
            <FormField label="Description" type="textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div><label className="block text-xs font-semibold text-inkB dark:text-inkB-dark mb-1.5">Colour</label>
              <div className="flex gap-2 flex-wrap">{COLOR_SWATCHES.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })} className={`w-7 h-7 rounded-lg border-2 ${form.color === c ? 'border-gray-900' : 'border-transparent'}`} style={{ background: c }} />
              ))}</div></div>
            <div><label className="block text-xs font-semibold text-inkB dark:text-inkB-dark mb-1.5">Members</label>
              <MemberPicker employees={employees} value={form.member_ids} onChange={ids => setForm({ ...form, member_ids: ids })} /></div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-xl text-sm font-semibold text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark">Cancel</button>
              <button onClick={submit} disabled={submitting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 disabled:opacity-50">{submitting ? 'Creating…' : 'Create Group'}</button>
            </div>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal isOpen title={detail.group?.name || 'Group'} onClose={() => setDetail(null)} size="lg">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-inkB dark:text-inkB-dark">{detail.members?.length || 0} members</div>
              <div className="flex gap-2">
                <button onClick={() => { setAddingMembers(true); setNewMembers([]); }} className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><UserPlus className="w-4 h-4" />Add</button>
                <button onClick={() => setDeleteTarget(detail.group)} className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 dark:text-red-400"><Trash2 className="w-4 h-4" />Delete</button>
              </div>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {(detail.members || []).length === 0 && <div className="text-sm text-gray-400 dark:text-slate-500 text-center py-6">No members yet.</div>}
              {(detail.members || []).map(m => (
                <div key={m.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-panel2 dark:bg-panel2-dark">
                  <Avatar name={m.name} src={m.avatar} size="sm" />
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium text-inkA dark:text-inkA-dark truncate">{m.name}</div>
                    <div className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{m.job_title || '—'}</div></div>
                  <button onClick={() => setTransfer({ memberIds: [m.id], toGroupId: '' })} className="p-1 text-gray-400 dark:text-slate-500 hover:text-accent" title="Transfer"><ArrowRightLeft className="w-4 h-4" /></button>
                  <button onClick={() => removeMember(m.id)} className="p-1 text-gray-400 dark:text-slate-500 hover:text-red-500"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {addingMembers && (
        <Modal isOpen title="Add Members" onClose={() => setAddingMembers(false)} size="md">
          <div className="p-5 space-y-3">
            <MemberPicker employees={employees.filter(e => !(detail?.members || []).some(m => m.id === e.id))} value={newMembers} onChange={setNewMembers} />
            <div className="flex gap-2">
              <button onClick={() => setAddingMembers(false)} className="flex-1 py-2 rounded-xl text-sm font-semibold text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark">Cancel</button>
              <button onClick={addMembers} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600">Add {newMembers.length || ''}</button>
            </div>
          </div>
        </Modal>
      )}

      {transfer && (
        <Modal isOpen title="Transfer Member" onClose={() => setTransfer(null)} size="sm">
          <div className="p-5 space-y-3">
            <FormField label="Move to group" type="select" value={transfer.toGroupId} onChange={e => setTransfer({ ...transfer, toGroupId: e.target.value })}
              options={[{ value: '', label: '— Select —' }, ...groups.filter(g => g.id !== detail?.group?.id).map(g => ({ value: g.id, label: g.name }))]} />
            <div className="flex gap-2">
              <button onClick={() => setTransfer(null)} className="flex-1 py-2 rounded-xl text-sm font-semibold text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark">Cancel</button>
              <button onClick={doTransfer} disabled={!transfer.toGroupId} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 disabled:opacity-50">Transfer</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog isOpen title="Delete group?" message={`"${deleteTarget.name}" will be deleted.`} confirmText="Delete" onConfirm={remove} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
