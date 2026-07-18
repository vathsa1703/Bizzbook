import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, Check, Plus, Edit2, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../components/ToastContext';
import Modal from '../../components/Modal';
import FormField from '../../components/FormField';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function RolesPermissionsPage() {
  const [data, setData] = useState({ roles: [], permissionGroups: [] });
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePerms, setRolePerms] = useState(new Set());

  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [form, setForm] = useState({ name: '', description: '', color: '#3b82f6' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getRolesAndPermissions();
      setData(res);
      if (res.roles.length > 0 && !selectedRole) {
        handleSelectRole(res.roles[0]);
      } else if (selectedRole) {
        // Refresh selected role perms
        handleSelectRole(res.roles.find(r => r.id === selectedRole.id) || res.roles[0]);
      }
    } catch (e) {
      showToast('Failed to load roles', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSelectRole = async (role) => {
    setSelectedRole(role);
    try {
      const perms = await api.getRolePermissions(role.id);
      setRolePerms(new Set(perms));
    } catch (e) {
      showToast('Failed to load role permissions', 'error');
    }
  };

  const togglePermission = (permId) => {
    if (selectedRole?.is_system === 1 && selectedRole.name === 'Owner') return; // Cannot edit Owner
    const next = new Set(rolePerms);
    if (next.has(permId)) next.delete(permId);
    else next.add(permId);
    setRolePerms(next);
  };

  const savePermissions = async () => {
    if (!selectedRole) return;
    setSubmitting(true);
    try {
      await api.updateRole(selectedRole.id, {
        name: selectedRole.name,
        description: selectedRole.description,
        color: selectedRole.color,
        permissions: Array.from(rolePerms)
      });
      showToast('Permissions updated', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openCreate = () => {
    setEditingRole(null);
    setForm({ name: '', description: '', color: '#3b82f6' });
    setRolePerms(new Set()); // Reset for new role
    setShowModal(true);
  };

  const openEdit = (e, role) => {
    e.stopPropagation();
    setEditingRole(role);
    setForm({ name: role.name, description: role.description || '', color: role.color || '#3b82f6' });
    setShowModal(true);
  };

  const handleSubmitRole = async () => {
    if (!form.name) return showToast('Name is required', 'error');
    setSubmitting(true);
    try {
      if (editingRole) {
        await api.updateRole(editingRole.id, form);
        showToast('Role updated', 'success');
      } else {
        const newRole = await api.createRole({ ...form, permissions: Array.from(rolePerms) });
        showToast('Role created', 'success');
        setSelectedRole(newRole);
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
      await api.deleteRole(deleteTarget.id);
      showToast('Role deleted', 'success');
      setDeleteTarget(null);
      if (selectedRole?.id === deleteTarget.id) setSelectedRole(null);
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  return (
    <div className="p-4 lg:p-6 flex flex-col h-full space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-inkA dark:text-inkA-dark">Roles & Permissions</h1>
          <p className="text-sm text-inkB dark:text-inkB-dark mt-0.5">Manage access control across the organization</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Create Role
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-inkB dark:text-inkB-dark">Loading...</div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
          {/* Roles List Sidebar */}
          <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-3">
            <h2 className="text-sm font-bold text-inkB dark:text-inkB-dark uppercase tracking-wider px-1">Available Roles</h2>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
              {data.roles.map(role => (
                <button
                  key={role.id}
                  onClick={() => handleSelectRole(role)}
                  className={`
                    w-full text-left p-4 rounded-2xl border transition-all relative group
                    ${selectedRole?.id === role.id 
                      ? 'bg-panel2 dark:bg-panel2-dark border-blue-500 shadow-lg shadow-blue-500/10' 
                      : 'bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark hover:border-accent/40'
                    }
                  `}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${role.color || '#3b82f6'}20`, color: role.color || '#3b82f6' }}>
                      {role.is_system ? <ShieldAlert className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-inkA dark:text-inkA-dark truncate flex items-center gap-2">
                        {role.name}
                        {role.is_system === 1 && <span className="text-[9px] bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark px-1.5 py-0.5 rounded uppercase">System</span>}
                      </div>
                      <div className="text-xs text-inkB dark:text-inkB-dark truncate">{role.member_count} users</div>
                    </div>
                  </div>
                  {role.is_system === 0 && (
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <div onClick={e => openEdit(e, role)} className="p-1.5 text-inkB dark:text-inkB-dark hover:text-blue-400 hover:bg-blue-500/10 rounded-lg">
                        <Edit2 className="w-3.5 h-3.5" />
                      </div>
                      <div onClick={e => { e.stopPropagation(); setDeleteTarget(role); }} className="p-1.5 text-inkB dark:text-inkB-dark hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                        <Trash2 className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Permissions Matrix */}
          <div className="flex-1 bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-2xl flex flex-col min-h-[500px]">
            {selectedRole ? (
              <>
                <div className="p-5 border-b border-edge dark:border-edge-dark flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-inkA dark:text-inkA-dark flex items-center gap-2">
                      Permissions for {selectedRole.name}
                      {selectedRole.is_system === 1 && selectedRole.name === 'Owner' && (
                        <span className="text-xs font-normal text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-lg">Read-only (Full Access)</span>
                      )}
                    </h2>
                    <p className="text-sm text-inkB dark:text-inkB-dark mt-1">{selectedRole.description || 'Define what users in this role can do.'}</p>
                  </div>
                  <button 
                    onClick={savePermissions} 
                    disabled={submitting || (selectedRole.is_system === 1 && selectedRole.name === 'Owner')}
                    className="bg-panel2 dark:bg-panel2-dark hover:bg-panel2 dark:hover:bg-panel2-dark text-inkA dark:text-inkA-dark px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save Permissions'}
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {data.permissionGroups.map(group => (
                      <div key={group.id} className="bg-slate-950/50 rounded-xl p-4 border border-edge dark:border-edge-dark">
                        <h3 className="text-sm font-bold text-inkB dark:text-inkB-dark mb-3 border-b border-edge dark:border-edge-dark pb-2">{group.name}</h3>
                        <div className="space-y-2">
                          {group.permissions.map(perm => (
                            <label key={perm.id} className="flex items-start gap-3 p-2 hover:bg-panel2/60 dark:hover:bg-panel2-dark/60 rounded-lg cursor-pointer transition-colors group/item">
                              <div className="mt-0.5 relative flex items-center justify-center">
                                <input 
                                  type="checkbox" 
                                  checked={rolePerms.has(perm.id)} 
                                  onChange={() => togglePermission(perm.id)}
                                  disabled={selectedRole.is_system === 1 && selectedRole.name === 'Owner'}
                                  className="w-4 h-4 rounded border-slate-600 bg-panel dark:bg-panel-dark checked:bg-blue-500 checked:border-blue-500 appearance-none transition-all peer"
                                />
                                <Check className="w-3 h-3 text-white absolute opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" strokeWidth={3} />
                              </div>
                              <div>
                                <div className="text-sm font-medium text-inkB dark:text-inkB-dark group-hover/item:text-white transition-colors">{perm.action}</div>
                                <div className="text-xs text-inkB dark:text-inkB-dark mt-0.5">{perm.description}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-inkB dark:text-inkB-dark">
                Select a role to view or edit permissions
              </div>
            )}
          </div>
        </div>
      )}

      {/* Role Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingRole ? 'Edit Role' : 'Create Custom Role'}>
        <div className="space-y-4">
          <FormField label="Role Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Regional Manager" />
          <FormField label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of responsibilities..." />
          <div>
            <label className="block text-xs font-medium text-inkB dark:text-inkB-dark mb-1">Role Color Indicator</label>
            <div className="flex gap-2">
              {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#64748b'].map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {!editingRole && (
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 dark:border-blue-500/20 rounded-xl mt-4">
              <p className="text-xs text-blue-600 dark:text-blue-400">After creating the role, you can assign granular permissions in the matrix view.</p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-panel2 dark:bg-panel2-dark hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark text-sm font-medium rounded-xl transition-colors">Cancel</button>
            <button onClick={handleSubmitRole} disabled={submitting} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {submitting ? 'Saving...' : (editingRole ? 'Update Role' : 'Create Role')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Role"
        message={`Are you sure you want to delete ${deleteTarget?.name}? Users with this role will lose its permissions.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
