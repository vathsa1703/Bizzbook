import React, { useState, useEffect } from 'react';
import { DollarSign, Play, CheckCircle, Search, RefreshCw, FileText, ChevronRight, X, User } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ToastContext';
import Modal from '../../components/Modal';
import FormField from '../../components/FormField';
import ConfirmDialog from '../../components/ConfirmDialog';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function PayrollPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), branch_id: '' });
  const [branches, setBranches] = useState([]);

  const [selectedRun, setSelectedRun] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rData, bData] = await Promise.allSettled([
        api.getPayrollRuns(),
        api.getBranches()
      ]);
      setRuns(rData.status === 'fulfilled' ? rData.value : []);
      setBranches(bData.status === 'fulfilled' ? bData.value : []);
    } catch (e) {
      showToast('Failed to load payroll data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRunPayroll = async () => {
    setSubmitting(true);
    try {
      await api.createPayrollRun(form);
      showToast('Payroll processed successfully', 'success');
      setShowModal(false);
      load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.approvePayrollRun(id);
      showToast('Payroll approved', 'success');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const handlePay = async (id) => {
    try {
      await api.payPayrollRun(id);
      showToast('Payroll marked as paid', 'success');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const openRunDetails = async (run) => {
    try {
      const data = await api.getPayrollRun(run.id);
      setSelectedRun(data);
    } catch (e) {
      showToast('Failed to load run details', 'error');
    }
  };

  const formatCurrency = (amt) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amt || 0);

  if (selectedRun) {
    return (
      <div className="p-4 lg:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedRun(null)} className="p-2 bg-panel2 dark:bg-panel2-dark hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-inkA dark:text-inkA-dark">Payroll Run Details</h1>
            <p className="text-sm text-inkB dark:text-inkB-dark mt-0.5">{MONTHS[selectedRun.month - 1]} {selectedRun.year}</p>
          </div>
        </div>

        <div className="grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark rounded-2xl p-5">
            <div className="text-sm text-inkB dark:text-inkB-dark mb-1">Total Net Pay</div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedRun.total_net)}</div>
          </div>
          <div className="bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark rounded-2xl p-5">
            <div className="text-sm text-inkB dark:text-inkB-dark mb-1">Total Deductions</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(selectedRun.total_deductions)}</div>
          </div>
          <div className="bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark rounded-2xl p-5">
            <div className="text-sm text-inkB dark:text-inkB-dark mb-1">Total Gross</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(selectedRun.total_gross)}</div>
          </div>
        </div>

        <div className="bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-edge dark:border-edge-dark text-xs font-semibold text-inkB dark:text-inkB-dark uppercase bg-panel2/50 dark:bg-panel2-dark/50">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Days (Pres/Work)</th>
                  <th className="px-5 py-3">Gross</th>
                  <th className="px-5 py-3">Deductions</th>
                  <th className="px-5 py-3 text-emerald-600 dark:text-emerald-400">Net Pay</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-edge dark:divide-edge-dark">
                {selectedRun.slips.map(slip => (
                  <tr key={slip.id} className="hover:bg-panel2/60 dark:hover:bg-panel2-dark/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-bold text-inkA dark:text-inkA-dark">{slip.employee_name}</div>
                      <div className="text-[10px] text-inkB dark:text-inkB-dark">{slip.employee_code || slip.job_title}</div>
                    </td>
                    <td className="px-5 py-3 text-inkB dark:text-inkB-dark">
                      {slip.present_days} / {slip.working_days}
                      {slip.lop_days > 0 && <span className="ml-2 text-xs text-red-600 dark:text-red-400">({slip.lop_days} LOP)</span>}
                    </td>
                    <td className="px-5 py-3 text-inkB dark:text-inkB-dark">{formatCurrency(slip.gross_salary)}</td>
                    <td className="px-5 py-3 text-red-600 dark:text-red-400/90">{formatCurrency(slip.pf_employee + slip.esi_employee + slip.professional_tax + slip.tds + slip.other_deductions)}</td>
                    <td className="px-5 py-3 font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(slip.net_salary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-inkA dark:text-inkA-dark">Payroll Runs</h1>
          <p className="text-sm text-inkB dark:text-inkB-dark mt-0.5">Process and manage monthly employee salaries</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Play className="w-4 h-4" fill="currentColor" /> Run Payroll
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-inkB dark:text-inkB-dark">Loading payroll history...</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-20 text-inkB dark:text-inkB-dark bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark rounded-2xl">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-500 dark:text-blue-400" />
          <p className="font-medium text-inkA dark:text-inkA-dark">No payroll runs found</p>
          <p className="text-sm mt-1">Start by running payroll for the current month</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {runs.map(run => (
            <div key={run.id} onClick={() => openRunDetails(run)} className="bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark hover:border-accent/40 rounded-2xl p-4 flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer transition-all hover:shadow-lg hover:shadow-blue-500/5 group">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${run.status === 'paid' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 dark:text-emerald-400' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400'}`}>
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-inkA dark:text-inkA-dark">{MONTHS[run.month - 1]} {run.year}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-inkB dark:text-inkB-dark">
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {run.total_employees} Employees</span>
                    <span className="text-gray-400 dark:text-slate-500">|</span>
                    <span className="font-medium text-inkB dark:text-inkB-dark">Total Net: {formatCurrency(run.total_net)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto mt-2 md:mt-0 pt-3 md:pt-0 border-t border-edge dark:border-edge-dark md:border-0" onClick={e => e.stopPropagation()}>
                <div className={`px-3 py-1 rounded-full text-xs font-bold border capitalize
                  ${run.status === 'processed' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/25 dark:border-amber-500/20' : ''}
                  ${run.status === 'approved' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/25 dark:border-blue-500/20' : ''}
                  ${run.status === 'paid' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25 dark:border-emerald-500/20' : ''}
                `}>
                  {run.status}
                </div>

                <div className="flex gap-2">
                  {run.status === 'processed' && (
                    <button onClick={() => handleApprove(run.id)} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors">Approve</button>
                  )}
                  {run.status === 'approved' && (
                    <button onClick={() => handlePay(run.id)} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors">Mark Paid</button>
                  )}
                  <ChevronRight className="w-5 h-5 text-gray-400 dark:text-slate-500 group-hover:text-blue-500 ml-2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Run Payroll">
        <div className="space-y-4">
          <div className="grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-inkB dark:text-inkB-dark mb-1">Month</label>
              <select value={form.month} onChange={e => setForm(f => ({ ...f, month: parseInt(e.target.value) }))}
                className="w-full bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
                {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-inkB dark:text-inkB-dark mb-1">Year</label>
              <select value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))}
                className="w-full bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
                {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-inkB dark:text-inkB-dark mb-1">Branch (Optional)</label>
            <select value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
              className="w-full bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
              <option value="">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25 dark:border-amber-500/20 rounded-xl">
            <h4 className="text-sm font-bold text-amber-600 dark:text-amber-400 mb-1">Important</h4>
            <p className="text-xs text-amber-200/70">
              This will calculate salaries for all active employees based on their current salary structure and attendance/LOP for the selected period. This cannot be easily undone once processed.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-panel2 dark:bg-panel2-dark hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark text-sm font-medium rounded-xl transition-colors">Cancel</button>
            <button onClick={handleRunPayroll} disabled={submitting} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {submitting ? 'Processing...' : 'Process Payroll'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
