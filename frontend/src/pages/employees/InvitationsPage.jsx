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
    if (status === 'accepted') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === 'expired') return <XCircle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4 text-amber-500" />;
  };

  const getStatusColor = (status) => {
    if (status === 'accepted') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (status === 'expired') return 'text-red-400 bg-red-500/10 border-red-500/20';
    return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Invitations</h1>
          <p className="text-sm text-slate-400 mt-0.5">Invite team members to join your company workspace</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Send className="w-4 h-4" /> Send Invite
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            value={search} onChange={e => setSearch(e.target.value)} 
            placeholder="Search by email..."
            className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-blue-500" 
          />
        </div>
        <button onClick={load} className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-500">Loading invitations...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
          <Mail className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-500" />
          <p className="font-medium text-white">No invitations found</p>
          <p className="text-sm mt-1">Send an invitation to onboard a new employee</p>
          <button onClick={openCreate} className="mt-4 text-sm text-blue-400 hover:text-blue-300 font-semibold">Send Invite Now →</button>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase bg-slate-900/50">
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Branch</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Sent By</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-800/50">
                {filtered.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-4 font-medium text-white">{inv.email}</td>
                    <td className="px-5 py-4 text-slate-300">{inv.role_name || 'N/A'}</td>
                    <td className="px-5 py-4 text-slate-400">{inv.branch_name || 'Any'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${getStatusColor(inv.status)}`}>
                        {getStatusIcon(inv.status)}
                        <span className="capitalize">{inv.status}</span>
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-400">
                      <div className="truncate w-32">{inv.inviter_name}</div>
                      <div className="text-[10px] text-slate-500">{new Date(inv.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {inv.status === 'pending' && (
                        <button onClick={() => setDeleteTarget(inv)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Revoke Invitation">
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
          <FormField label="Email Address *" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="employee@company.com" />
          
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Role *</label>
            <select value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <p className="text-[10px] text-slate-500 mt-1">Determine what this user can access upon joining.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Assign to Branch</label>
            <select value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
              <option value="">No Branch (Global Access)</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <FormField label="Expires In (Days)" type="number" value={form.expires_in_days} onChange={v => setForm(f => ({ ...f, expires_in_days: v }))} />

          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors">Cancel</button>
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
