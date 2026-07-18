import React, { useState, useEffect } from 'react';
import { Calendar, Plus, RefreshCw, CheckCircle, XCircle, Clock, FileText } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ToastContext';
import Modal from '../../components/Modal';
import FormField from '../../components/FormField';
import ConfirmDialog from '../../components/ConfirmDialog';

export default function LeavesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [leaves, setLeaves] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [targetLeave, setTargetLeave] = useState(null);
  const [actionType, setActionType] = useState(null); // 'approve', 'reject', 'cancel'
  const [rejectReason, setRejectReason] = useState('');

  const [form, setForm] = useState({
    employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: ''
  });

  const [employees, setEmployees] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [lData, typeData, empData] = await Promise.allSettled([
        api.getLeaves({ status: statusFilter !== 'All' ? statusFilter : undefined }),
        api.getLeaveTypes(),
        api.getEmployees({ status: 'Active' })
      ]);
      setLeaves(lData.status === 'fulfilled' ? lData.value : []);
      setLeaveTypes(typeData.status === 'fulfilled' ? typeData.value : []);
      setEmployees(empData.status === 'fulfilled' ? empData.value : []);
    } catch (e) {
      showToast('Failed to load leaves', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const openApply = () => {
    setForm({ employee_id: user?.employeeId || '', leave_type_id: leaveTypes[0]?.id || '', start_date: '', end_date: '', reason: '' });
    setShowModal(true);
  };

  const handleApply = async () => {
    if (!form.leave_type_id || !form.start_date || !form.end_date) {
      return showToast('Please fill all required fields', 'error');
    }
    setSubmitting(true);
    try {
      await api.submitLeave(form);
      showToast('Leave request submitted', 'success');
      setShowModal(false);
      load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async () => {
    if (!targetLeave || !actionType) return;
    try {
      if (actionType === 'approve') await api.approveLeave(targetLeave.id);
      else if (actionType === 'reject') await api.rejectLeave(targetLeave.id, rejectReason);
      else if (actionType === 'cancel') await api.cancelLeave(targetLeave.id);
      
      showToast(`Leave ${actionType}d successfully`, 'success');
      setTargetLeave(null);
      setActionType(null);
      setRejectReason('');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const isAdmin = user?.role === 'OWNER' || user?.role === 'admin' || user?.role === 'MANAGER';

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-inkA dark:text-inkA-dark">Leave Management</h1>
          <p className="text-sm text-inkB dark:text-inkB-dark mt-0.5">Track and manage employee time off</p>
        </div>
        <button onClick={openApply} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Apply Leave
        </button>
      </div>

      <div className="flex gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 min-w-[150px]">
          <option value="All">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button onClick={load} className="p-2.5 bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark rounded-xl text-inkB dark:text-inkB-dark hover:text-inkA dark:hover:text-white transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-inkB dark:text-inkB-dark">Loading...</div>
      ) : leaves.length === 0 ? (
        <div className="text-center py-20 text-inkB dark:text-inkB-dark bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark rounded-2xl">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-500 dark:text-blue-400" />
          <p className="font-medium text-inkA dark:text-inkA-dark">No leave records found</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {leaves.map(leave => (
            <div key={leave.id} className="bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark rounded-2xl p-4 flex-col md:flex-row md:items-center gap-4 hover:border-accent/40 transition-colors">
              <div className="flex-1 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-panel2 dark:bg-panel2-dark flex items-center justify-center font-bold text-inkA dark:text-inkA-dark uppercase flex-shrink-0">
                  {leave.employee_name?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-inkA dark:text-inkA-dark truncate">{leave.employee_name}</h3>
                    <span className="text-xs text-inkB dark:text-inkB-dark">{leave.leave_type_name}</span>
                  </div>
                  <p className="text-sm text-inkB dark:text-inkB-dark mt-1">{leave.start_date} to {leave.end_date} <span className="text-inkB dark:text-inkB-dark font-medium">({leave.total_days} days)</span></p>
                  {leave.reason && <p className="text-xs text-inkB dark:text-inkB-dark mt-1 italic truncate">"{leave.reason}"</p>}
                </div>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t border-edge dark:border-edge-dark md:border-0">
                <div className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5
                  ${leave.status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25 dark:border-emerald-500/20' : ''}
                  ${leave.status === 'rejected' ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/25 dark:border-red-500/20' : ''}
                  ${leave.status === 'pending' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/25 dark:border-amber-500/20' : ''}
                  ${leave.status === 'cancelled' ? 'bg-slate-500/10 text-inkB dark:text-inkB-dark border-slate-500/20' : ''}
                `}>
                  {leave.status === 'approved' && <CheckCircle className="w-3.5 h-3.5" />}
                  {leave.status === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
                  {leave.status === 'pending' && <Clock className="w-3.5 h-3.5" />}
                  {leave.status === 'cancelled' && <FileText className="w-3.5 h-3.5" />}
                  <span className="capitalize">{leave.status}</span>
                </div>

                {leave.status === 'pending' && (
                  <div className="flex gap-2">
                    {isAdmin && (
                      <>
                        <button onClick={() => { setTargetLeave(leave); setActionType('approve'); }} className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-semibold transition-colors">Approve</button>
                        <button onClick={() => { setTargetLeave(leave); setActionType('reject'); }} className="px-3 py-1.5 bg-red-50 dark:bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-xs font-semibold transition-colors">Reject</button>
                      </>
                    )}
                    {(!isAdmin || leave.employee_id === user?.employeeId) && (
                      <button onClick={() => { setTargetLeave(leave); setActionType('cancel'); }} className="px-3 py-1.5 bg-panel2 dark:bg-panel2-dark hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark rounded-lg text-xs font-semibold transition-colors">Cancel</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply Leave Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Apply Leave">
        <div className="space-y-4">
          {isAdmin && (
            <div>
              <label className="block text-xs font-medium text-inkB dark:text-inkB-dark mb-1">Employee (Admin Override)</label>
              <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                className="w-full bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
                <option value="">Select Employee</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-inkB dark:text-inkB-dark mb-1">Leave Type *</label>
            <select value={form.leave_type_id} onChange={e => setForm(f => ({ ...f, leave_type_id: e.target.value }))}
              className="w-full bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
              {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div className="grid-cols-2 gap-3">
            <FormField label="Start Date *" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            <FormField label="End Date *" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-inkB dark:text-inkB-dark mb-1">Reason</label>
            <textarea 
              value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="w-full bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 h-24 resize-none"
              placeholder="Why are you taking leave?"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-panel2 dark:bg-panel2-dark hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark text-sm font-medium rounded-xl transition-colors">Cancel</button>
            <button onClick={handleApply} disabled={submitting} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!targetLeave && actionType !== null}
        onCancel={() => { setTargetLeave(null); setActionType(null); }}
        onConfirm={handleAction}
        title={`${actionType === 'approve' ? 'Approve' : actionType === 'reject' ? 'Reject' : 'Cancel'} Leave`}
        message={
          actionType === 'reject' ? (
            <div className="mt-2 space-y-3 text-left">
              <p className="text-inkB dark:text-inkB-dark">Are you sure you want to reject this leave request from {targetLeave?.employee_name}?</p>
              <textarea 
                value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="Optional reason for rejection..."
                className="w-full bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-500 h-20 resize-none"
              />
            </div>
          ) : `Are you sure you want to ${actionType} this leave for ${targetLeave?.employee_name}?`
        }
        confirmLabel={actionType === 'approve' ? 'Approve' : actionType === 'reject' ? 'Reject' : 'Confirm'}
        danger={actionType === 'reject' || actionType === 'cancel'}
      />
    </div>
  );
}
