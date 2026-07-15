import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, Filter, Edit2, Trash2, ChevronRight,
  Users, Phone, Mail, Briefcase, Award, MapPin, RefreshCw,
  Building2, Clock, Star, MoreVertical, Eye, X, Check, AlertCircle
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ToastContext';
import EmployeeProfileFull from './EmployeeProfileFull';
import Modal from '../../components/Modal';
import FormField from '../../components/FormField';
import ConfirmDialog from '../../components/ConfirmDialog';

const STATUSES = ['Active', 'Inactive', 'On Leave', 'Terminated', 'Probation'];
const EMPLOYMENT_TYPES = ['Full Time', 'Part Time', 'Contract', 'Intern'];

function StatusBadge({ status }) {
  const colors = {
    Active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    Inactive: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
    'On Leave': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    Terminated: 'bg-red-500/15 text-red-400 border-red-500/20',
    Probation: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colors[status] || colors.Active}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function EmployeeAvatar({ emp, size = 'md' }) {
  const s = size === 'lg' ? 'w-12 h-12 text-base' : 'w-9 h-9 text-sm';
  const colors = ['from-blue-500 to-violet-600','from-emerald-500 to-teal-600','from-orange-500 to-red-600','from-pink-500 to-rose-600','from-cyan-500 to-blue-600'];
  const color = colors[(emp?.name?.charCodeAt(0) || 0) % colors.length];
  if (emp?.avatar) return <img src={emp.avatar} alt={emp.name} className={`${s} rounded-xl object-cover flex-shrink-0`} />;
  return (
    <div className={`${s} rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {emp?.name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

export default function EmployeeDirectory({ onViewChange }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [form, setForm] = useState({
    name: '', department: '', salary: '', joining_date: new Date().toISOString().split('T')[0],
    job_title: '', phone: '', email: '', employment_type: 'Full Time', status: 'Active',
    department_id: '', branch_id: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, depts, brnch] = await Promise.allSettled([
        api.getEmployees(statusFilter !== 'All' ? { status: statusFilter } : {}),
        api.getDepartments(),
        api.getBranches()
      ]);
      setEmployees(emps.status === 'fulfilled' ? (emps.value || []) : []);
      setDepartments(depts.status === 'fulfilled' ? (depts.value || []) : []);
      setBranches(brnch.status === 'fulfilled' ? (brnch.value || []) : []);
    } catch { showToast('Failed to load employees', 'error'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = employees.filter(e => {
    const s = search.toLowerCase();
    const matchesSearch = !s || e.name?.toLowerCase().includes(s) || e.email?.toLowerCase().includes(s) || e.employee_code?.toLowerCase().includes(s) || e.job_title?.toLowerCase().includes(s);
    const matchesDept = deptFilter === 'All' || e.department === deptFilter || e.department_name === deptFilter;
    return matchesSearch && matchesDept;
  });

  const openCreate = () => {
    setEditingEmp(null);
    setForm({ name: '', department: '', salary: '', joining_date: new Date().toISOString().split('T')[0], job_title: '', phone: '', email: '', employment_type: 'Full Time', status: 'Active', department_id: '', branch_id: '' });
    setShowModal(true);
  };

  const openEdit = (emp) => {
    setEditingEmp(emp);
    setForm({ name: emp.name || '', department: emp.department || '', salary: emp.salary || '', joining_date: emp.joining_date || '', job_title: emp.job_title || '', phone: emp.phone || '', email: emp.email || '', employment_type: emp.employment_type || 'Full Time', status: emp.status || 'Active', department_id: emp.department_id || '', branch_id: emp.branch_id || '' });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.department || !form.salary || !form.joining_date) {
      showToast('Name, department, salary and joining date are required', 'error'); return;
    }
    setSubmitting(true);
    try {
      if (editingEmp) {
        await api.updateEmployee(editingEmp.id, form);
        showToast('Employee updated!', 'success');
      } else {
        await api.createEmployee(form);
        showToast('Employee created!', 'success');
      }
      setShowModal(false);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteEmployee(deleteTarget.id);
      showToast('Employee removed', 'success');
      setDeleteTarget(null);
      load();
    } catch (e) { showToast(e.message, 'error'); }
  };

  if (selectedEmployee) {
    return <EmployeeProfileFull employee={selectedEmployee} onBack={() => setSelectedEmployee(null)} onRefresh={load} />;
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Employee Directory</h1>
          <p className="text-sm text-slate-400 mt-0.5">{employees.length} employees</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Add Employee
        </button>
      </div>

      {/* Stats Row — derived directly from the loaded employees list rather than the
          analytics endpoint, whose response shape (deptBreakdown/rankings/attendance/
          roleBreakdown/empTypeBreakdown) never actually had total_employees/
          active_employees/status_breakdown/avg_performance fields to begin with. */}
      {employees.length > 0 && (() => {
        const ratings = employees.map(e => e.performance_rating).filter(r => r > 0);
        const avgRating = ratings.length > 0 ? (ratings.reduce((s, r) => s + r, 0) / ratings.length) : null;
        return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: employees.length, color: 'blue' },
            { label: 'Active', value: employees.filter(e => e.status === 'Active').length, color: 'emerald' },
            { label: 'On Leave', value: employees.filter(e => e.status === 'On Leave').length, color: 'amber' },
            { label: 'Avg Rating', value: avgRating !== null ? avgRating.toFixed(1) : '—', color: 'violet' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`bg-${color}-500/10 border border-${color}-500/20 rounded-xl p-4`}>
              <div className={`text-2xl font-bold text-${color}-400`}>{value ?? '—'}</div>
              <div className="text-xs text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        );
      })()}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, code…"
            className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-blue-500 transition-colors" />
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
          <option value="All">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
          <option value="All">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Employee Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">Loading employees…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No employees found</p>
          <p className="text-sm mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(emp => (
            <div key={emp.id} onClick={() => setSelectedEmployee(emp)}
              className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-lg hover:shadow-blue-500/10 group">
              <div className="flex items-start gap-3">
                <EmployeeAvatar emp={emp} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white truncate">{emp.name}</h3>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{emp.job_title || emp.department || 'Employee'}</p>
                  <div className="mt-2"><StatusBadge status={emp.status} /></div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(emp)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget(emp)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-2">
                {emp.email && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{emp.email}</span>
                  </div>
                )}
                {emp.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Phone className="w-3 h-3 flex-shrink-0" />
                    <span>{emp.phone}</span>
                  </div>
                )}
                {emp.employee_code && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Briefcase className="w-3 h-3 flex-shrink-0" />
                    <span>{emp.employee_code}</span>
                  </div>
                )}
                {emp.department_name || emp.department ? (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Building2 className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{emp.department_name || emp.department}</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-600">{emp.joining_date ? `Joined ${emp.joining_date}` : ''}</span>
                <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-blue-400 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingEmp ? 'Edit Employee' : 'Add New Employee'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Full Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Rahul Sharma" />
            <FormField label="Job Title" value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} placeholder="Sales Manager" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Department *</label>
              <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
                <option value="">Select Department</option>
                {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Branch</label>
              <select value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
                <option value="">No Branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Salary (₹) *" type="number" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} placeholder="50000" />
            <FormField label="Joining Date *" type="date" value={form.joining_date} onChange={e => setForm(f => ({ ...f, joining_date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="rahul@company.com" />
            <FormField label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 9876543210" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Employment Type</label>
              <select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
                {EMPLOYMENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500">
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {submitting ? 'Saving…' : editingEmp ? 'Update Employee' : 'Create Employee'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Employee"
        message={`Remove ${deleteTarget?.name} from the system? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
