import React, { useState, useEffect } from 'react';
import { Mail, Plus, Search, Trash2, RefreshCw, Send, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../components/ToastContext';
import Modal from '../../components/Modal';
import FormField from '../../components/FormField';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState([]);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [form, setForm] = useState({ email: '', role_id: '', branch_id: '', expires_in_days: 7 });

  const load = async () => {
    setLoading(true);
    try {
      const [invData, rolesData, branchesData] = await Promise.allSettled([
        api.getInvitations(),
        api.getRolesAndPermissions(),
        api.getBranches()
      ]);
      setInvitations(invData.status === 'fulfilled' ? invData.value : []);
      setRoles(rolesData.status === 'fulfilled' ? rolesData.value.roles : []);
      setBranches(branchesData.status === 'fulfilled' ? branchesData.value : []);
    } catch (e) {
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = invitations.filter(i => i.email.toLowerCase().includes(search.toLowerCase()));

  const openCreate = () => {
    setForm({ email: '', role_id: roles[0]?.id || '', branch_id: '', expires_in_days: 7 });
    setShowModal(true);
  };

  const handleSend = async () => {
    if (!form.email || !form.role_id) {
      return showToast('Email and role are required', 'error');
    }
    setSubmitting(true);
    try {
      const res = await api.createInvitation({ ...form, branch_id: form.branch_id || null });
      showToast('Invitation sent successfully!', 'success');
      // If we are in dev/local mode, it's helpful to show the link so user can test it easily without email
      console.log('Invite Link:', res.invite_link);
      showToast('Invite link generated (check console)', 'info');
      setShowModal(false);
      load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!deleteTarget) return;
    try {
      await api.revokeInvitation(deleteTarget.id);
      showToast('Invitation revoked', 'success');
      setDeleteTarget(null);
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const getStatusIcon = (status) => {
    if (status === 'accepted') return <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />;
    if (status === 'expired') return <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />;
    return <Clock className="w-4 h-4 text-amber-500 dark:text-amber-400" />;
  };

  const getStatusColor = (status) => {
    if (status === 'accepted') return 'text-emerald-600 dark:text-emerald-400 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25 dark:border-emerald-500/20';
    if (status === 'expired') return 'text-red-600 dark:text-red-400 dark:text-red-400 bg-red-50 dark:bg-red-500/10 dark:bg-red-500/10 border-red-200 dark:border-red-500/25 dark:border-red-500/20';
    return 'text-amber-600 dark:text-amber-400 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25 dark:border-amber-500/20';
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-inkA dark:text-inkA-dark">Invitations</h1>
          <p className="text-sm text-inkB dark:text-inkB-dark mt-0.5">Invite team members to join your company workspace</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Send className="w-4 h-4" /> Send Invite
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-inkB dark:text-inkB-dark" />
          <input 
            value={search} onChange={e => setSearch(e.target.value)} 
            placeholder="Search by email..."
            className="w-full bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark placeholder-gray-400 dark:placeholder-slate-500 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-blue-500" 
          />
        </div>
        <button onClick={load} className="p-2.5 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-inkB dark:text-inkB-dark hover:text-inkA dark:hover:text-white transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-inkB dark:text-inkB-dark">Loading invitations...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-inkB dark:text-inkB-dark bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-2xl">
          <Mail className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-500 dark:text-blue-400" />
          <p className="font-medium text-inkA dark:text-inkA-dark">No invitations found</p>
          <p className="text-sm mt-1">Send an invitation to onboard a new employee</p>
          <button onClick={openCreate} className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-300 font-semibold">Send Invite Now →</button>
        </div>
      ) : (
        <div className="bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-edge dark:border-edge-dark text-xs font-semibold text-inkB dark:text-inkB-dark uppercase bg-panel2/50 dark:bg-panel2-dark/50">
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Branch</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Sent By</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-edge dark:divide-edge-dark">
                {filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-panel2/60 dark:hover:bg-panel2-dark/60 transition-colors">
                    <td className="px-5 py-4 font-medium text-inkA dark:text-inkA-dark">{inv.email}</td>
                    <td className="px-5 py-4 text-inkB dark:text-inkB-dark">{inv.role_name || 'N/A'}</td>
                    <td className="px-5 py-4 text-inkB dark:text-inkB-dark">{inv.branch_name || 'Any'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${getStatusColor(inv.status)}`}>
                        {getStatusIcon(inv.status)}
                        <span className="capitalize">{inv.status}</span>
                      </span>
                    </td>
                    <td className="px-5 py-4 text-inkB dark:text-inkB-dark">
                      <div className="truncate w-32">{inv.inviter_name}</div>
                      <div className="text-[10px] text-inkB dark:text-inkB-dark">{new Date(inv.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {inv.status === 'pending' && (
                        <button onClick={() => setDeleteTarget(inv)} className="p-1.5 text-inkB dark:text-inkB-dark hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Revoke Invitation">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Send Invitation">
        <div className="space-y-4">
          <FormField label="Email Address *" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="employee@company.com" />
          
          <div>
            <label className="block text-xs font-medium text-inkB dark:text-inkB-dark mb-1">Role *</label>
            <select value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}
              className="w-full bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <p className="text-[10px] text-inkB dark:text-inkB-dark mt-1">Determine what this user can access upon joining.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-inkB dark:text-inkB-dark mb-1">Assign to Branch</label>
            <select value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
              className="w-full bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
              <option value="">No Branch (Global Access)</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <FormField label="Expires In (Days)" type="number" value={form.expires_in_days} onChange={e => setForm(f => ({ ...f, expires_in_days: e.target.value }))} />

          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-panel2 dark:bg-panel2-dark hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark text-sm font-medium rounded-xl transition-colors">Cancel</button>
            <button onClick={handleSend} disabled={submitting} className="flex-1 flex justify-center items-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {submitting ? 'Sending...' : <><Send className="w-4 h-4" /> Send Invite</>}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke Invitation"
        message={`Are you sure you want to revoke the invitation sent to ${deleteTarget?.email}? They will no longer be able to use the invite link.`}
        confirmLabel="Revoke"
        danger
      />
    </div>
  );
}
