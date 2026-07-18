// Teams — CRUD + member management (/api/teams).
import React, { useState, useEffect, useCallback } from 'react';
import { Users2, Plus, Trash2, UserPlus, X, Crown } from 'lucide-react';
import { api } from '../../../api/client';
import { useToast } from '../../../components/ToastContext';
import Modal from '../../../components/Modal';
import FormField from '../../../components/FormField';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Avatar, Loading, EmptyState, PageHeader, COLOR_SWATCHES, MemberPicker, btnPrimary, useEmployees } from './_shared';

export default function TeamsPage() {
  const { showToast } = useToast();
  const employees = useEmployees();
  const [teams, setTeams] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: COLOR_SWATCHES[0], department_id: '', lead_id: '', member_ids: [] });
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  const [newMembers, setNewMembers] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, d] = await Promise.allSettled([api.getTeams(), api.getDepartments()]);
      setTeams(t.status === 'fulfilled' ? (t.value.teams || []) : []);
      setDepartments(d.status === 'fulfilled' ? (d.value || []) : []);
    } catch { showToast('Failed to load teams', 'error'); } finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const openDetail = async (team) => {
    setDetail({ team }); setDetailLoading(true);
    try { const r = await api.getTeam(team.id); setDetail(r); } catch { showToast('Failed to load team', 'error'); } finally { setDetailLoading(false); }
  };

  const submit = async () => {
    if (!form.name.trim()) return showToast('Team name is required', 'error');
    setSubmitting(true);
    try {
      await api.createTeam({ ...form, department_id: form.department_id || null, lead_id: form.lead_id || null });
      showToast('Team created', 'success'); setShowCreate(false);
      setForm({ name: '', description: '', color: COLOR_SWATCHES[0], department_id: '', lead_id: '', member_ids: [] });
      load();
    } catch (e) { showToast(e.message, 'error'); } finally { setSubmitting(false); }
  };

  const addMembers = async () => {
    if (!newMembers.length) return;
    try { await api.addTeamMembers(detail.team.id, newMembers); showToast('Members added', 'success'); setAddingMembers(false); setNewMembers([]); openDetail(detail.team); load(); }
    catch (e) { showToast(e.message, 'error'); }
  };
  const removeMember = async (empId) => {
    try { await api.removeTeamMember(detail.team.id, empId); openDetail(detail.team); load(); } catch (e) { showToast(e.message, 'error'); }
  };
  const remove = async () => {
    try { await api.deleteTeam(deleteTarget.id); showToast('Team archived', 'success'); setDeleteTarget(null); setDetail(null); load(); }
    catch (e) { showToast(e.message, 'error'); setDeleteTarget(null); }
  };

  if (loading) return <div className="p-6"><Loading /></div>;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader icon={Users2} title="Teams" subtitle={`${teams.length} team${teams.length !== 1 ? 's' : ''}`}>
        <button onClick={() => setShowCreate(true)} className={btnPrimary}><Plus className="w-4 h-4" />New Team</button>
      </PageHeader>

      {teams.length === 0 ? (
        <EmptyState icon={Users2} title="No teams yet" subtitle="Group employees into teams — often under a department." />
      ) : (
        <div className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teams.map(t => (
            <button key={t.id} onClick={() => openDetail(t)} className="text-left rounded-2xl border-edge dark:border-edge-dark bg-panel dark:bg-panel-dark hover:border-accent/40 p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1" style={{ background: t.color || '#3b82f6' }} />
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${t.color || '#3b82f6'}22` }}><Users2 className="w-5 h-5" style={{ color: t.color || '#3b82f6' }} /></div>
                <div className="min-w-0 flex-1"><div className="text-sm font-bold text-inkA dark:text-inkA-dark truncate">{t.name}</div>
                  <div className="text-[11px] text-inkB dark:text-inkB-dark truncate">{t.department_name || 'No department'}</div></div>
              </div>
              {t.description && <p className="text-xs text-inkB dark:text-inkB-dark mt-2 line-clamp-2">{t.description}</p>}
              <div className="mt-3 flex items-center justify-between text-[11px]">
                <span className="text-inkB dark:text-inkB-dark">{t.member_count || 0} members</span>
                {t.lead_name && <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Crown className="w-3 h-3" />{t.lead_name}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal isOpen title="New Team" onClose={() => setShowCreate(false)} size="lg">
          <div className="p-5 space-y-3">
            <FormField label="Team name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Warehouse Team" />
            <FormField label="Description" type="textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="grid-cols-2 gap-3">
              <FormField label="Department" type="select" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}
                options={[{ value: '', label: '— None —' }, ...departments.map(d => ({ value: d.id, label: d.name }))]} />
              <FormField label="Team Lead" type="select" value={form.lead_id} onChange={e => setForm({ ...form, lead_id: e.target.value })}
                options={[{ value: '', label: '— None —' }, ...employees.map(e => ({ value: e.id, label: e.name }))]} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-inkB dark:text-inkB-dark mb-1.5">Colour</label>
              <div className="flex gap-2 flex-wrap">{COLOR_SWATCHES.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })} className={`w-7 h-7 rounded-lg border-2 ${form.color === c ? 'border-gray-900' : 'border-transparent'}`} style={{ background: c }} />
              ))}</div>
            </div>
            <div><label className="block text-xs font-semibold text-inkB dark:text-inkB-dark mb-1.5">Members</label>
              <MemberPicker employees={employees} value={form.member_ids} onChange={ids => setForm({ ...form, member_ids: ids })} /></div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-xl text-sm font-semibold text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark">Cancel</button>
              <button onClick={submit} disabled={submitting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 disabled:opacity-50">{submitting ? 'Creating…' : 'Create Team'}</button>
            </div>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal isOpen title={detail.team?.name || 'Team'} onClose={() => setDetail(null)} size="lg">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-inkB dark:text-inkB-dark">{detail.team?.department_name || 'No department'} · {detail.members?.length || 0} members</div>
              <div className="flex gap-2">
                <button onClick={() => { setAddingMembers(true); setNewMembers([]); }} className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><UserPlus className="w-4 h-4" />Add</button>
                <button onClick={() => setDeleteTarget(detail.team)} className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 dark:text-red-400"><Trash2 className="w-4 h-4" />Archive</button>
              </div>
            </div>
            {detailLoading ? <Loading /> : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(detail.members || []).length === 0 && <div className="text-sm text-gray-400 dark:text-slate-500 text-center py-6">No members yet.</div>}
                {(detail.members || []).map(m => (
                  <div key={m.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-panel2 dark:bg-panel2-dark">
                    <Avatar name={m.name} src={m.avatar} size="sm" />
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium text-inkA dark:text-inkA-dark truncate">{m.name}{m.role_in_team === 'Lead' && <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">LEAD</span>}</div>
                      <div className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{m.job_title || '—'}</div></div>
                    <button onClick={() => removeMember(m.id)} className="p-1 text-gray-400 dark:text-slate-500 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
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

      {deleteTarget && (
        <ConfirmDialog isOpen title="Archive team?" message={`"${deleteTarget.name}" will be archived.`} confirmText="Archive" onConfirm={remove} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
