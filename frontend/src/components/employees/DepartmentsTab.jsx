import React, { useEffect, useState } from 'react';
import { Building2, Users, Archive, Edit2, Plus, ArrowRight, X } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../ToastContext';
import ConfirmDialog from '../ConfirmDialog';

export default function DepartmentsTab() {
  const { showToast } = useToast();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(null);
  
  const [formData, setFormData] = useState({ name: '', code: '', description: '', status: 'Active' });

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.getDepartments();
      setDepartments(data);
    } catch (err) {
      showToast('Failed to load departments', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await api.updateDepartment(isEditing.id, formData);
        showToast('Department updated successfully');
      } else {
        await api.createDepartment(formData);
        showToast('Department created successfully');
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to save department', 'error');
    }
  };

  const handleArchive = async (id) => {
    if (!window.confirm('Are you sure you want to archive this department?')) return;
    try {
      await api.deleteDepartment(id);
      showToast('Department archived');
      loadData();
    } catch (err) {
      showToast(err.message || 'Cannot archive this department', 'error');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-inkB dark:text-inkB-dark">Loading departments...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-inkA dark:text-inkA-dark">Departments</h2>
        <button 
          onClick={() => { setIsEditing(null); setFormData({ name: '', code: '', description: '', status: 'Active' }); setShowModal(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> Create Department
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {departments.map(dept => (
          <div key={dept.id} className={`bg-panel dark:bg-panel-dark rounded-xl shadow-sm border p-6 flex flex-col hover:shadow-md transition-shadow ${dept.status === 'Archived' ? 'border-edge dark:border-edge-dark opacity-60' : 'border-edge dark:border-edge-dark'}`}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${dept.status === 'Archived' ? 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-inkA dark:text-inkA-dark leading-tight">{dept.name}</h3>
                  <p className="text-xs text-inkB dark:text-inkB-dark">{dept.code || 'NO-CODE'}</p>
                </div>
              </div>
              {dept.status === 'Archived' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark uppercase tracking-wider">Archived</span>
              )}
            </div>
            
            <p className="text-sm text-inkB dark:text-inkB-dark mb-6 flex-1 line-clamp-2">{dept.description || 'No description provided.'}</p>
            
            <div className="flex items-center justify-between pt-4 border-t border-edge dark:border-edge-dark">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-400 dark:text-slate-500 font-medium uppercase">Head</span>
                  <span className="font-semibold text-inkA dark:text-inkA-dark truncate max-w-[100px]">{dept.head_name || 'Unassigned'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-400 dark:text-slate-500 font-medium uppercase">Employees</span>
                  <div className="flex items-center gap-1 font-semibold text-inkA dark:text-inkA-dark">
                    <Users className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" /> {dept.employee_count}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => { setIsEditing(dept); setFormData({ name: dept.name, code: dept.code || '', description: dept.description || '', status: dept.status }); setShowModal(true); }}
                  className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                {dept.status !== 'Archived' && (
                  <button 
                    onClick={() => handleArchive(dept.id)}
                    className="p-1.5 text-gray-400 dark:text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    title="Archive"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {departments.length === 0 && (
          <div className="col-span-full py-12 text-center text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark rounded-xl border border-edge dark:border-edge-dark border-dashed">
            <Building2 className="w-10 h-10 mx-auto text-gray-300 dark:text-slate-600 mb-3" />
            <p>No departments defined yet.</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-panel dark:bg-panel-dark rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-edge dark:border-edge-dark flex justify-between items-center bg-panel2 dark:bg-panel2-dark">
              <h3 className="font-bold text-inkA dark:text-inkA-dark">{isEditing ? 'Edit Department' : 'New Department'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-inkB dark:text-inkB-dark mb-1">Department Name *</label>
                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="e.g. Sales" />
              </div>
              <div>
                <label className="block text-sm font-medium text-inkB dark:text-inkB-dark mb-1">Department Code</label>
                <input value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="e.g. SLS-01" />
              </div>
              <div>
                <label className="block text-sm font-medium text-inkB dark:text-inkB-dark mb-1">Description</label>
                <textarea rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Describe this department..." />
              </div>
              {isEditing && (
                <div>
                  <label className="block text-sm font-medium text-inkB dark:text-inkB-dark mb-1">Status</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500">
                    <option value="Active">Active</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>
              )}
              <div className="pt-4 flex justify-end gap-3 border-t border-edge dark:border-edge-dark">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-inkB dark:text-inkB-dark bg-panel dark:bg-panel-dark border border-gray-300 rounded-lg hover:bg-panel2 dark:hover:bg-panel2-dark">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm">{isEditing ? 'Save Changes' : 'Create Department'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
