import React, { useState, useEffect } from 'react';
import { ChevronLeft, Mail, Phone, MapPin, Briefcase, Calendar, DollarSign, Clock, FileText, User, Upload, Download, Trash2, MoreVertical, Edit2 } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ToastContext';
import FormField from '../../components/FormField';

export default function EmployeeProfileFull({ employee, onBack, onRefresh }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  
  const [activeTab, setActiveTab] = useState('overview'); // overview, documents, salary, attendance, audit
  const [documents, setDocuments] = useState([]);
  const [salarySlips, setSalarySlips] = useState([]);
  const [salaryStructure, setSalaryStructure] = useState(null);
  const [loading, setLoading] = useState(false);

  const [editSalaryMode, setEditSalaryMode] = useState(false);
  const [salaryForm, setSalaryForm] = useState({});

  const loadDocs = async () => {
    try {
      setDocuments(await api.getEmployeeDocuments(employee.id));
    } catch { showToast('Failed to load documents', 'error'); }
  };

  const loadPayrollInfo = async () => {
    try {
      const [slips, structure] = await Promise.all([
        api.getPayrollSlips(employee.id),
        api.getEmployeeSalary(employee.id)
      ]);
      setSalarySlips(slips || []);
      setSalaryStructure(structure || null);
      if (structure) {
        setSalaryForm(structure);
      }
    } catch { showToast('Failed to load payroll info', 'error'); }
  };

  useEffect(() => {
    if (activeTab === 'documents') loadDocs();
    if (activeTab === 'salary') loadPayrollInfo();
  }, [activeTab]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', 'Document');
    
    setLoading(true);
    try {
      await api.uploadEmployeeDocument(employee.id, formData);
      showToast('Document uploaded successfully', 'success');
      loadDocs();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setLoading(false); e.target.value = ''; }
  };

  const handleDeleteDoc = async (id) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await api.deleteEmployeeDocument(id);
      showToast('Document deleted', 'success');
      loadDocs();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const saveSalaryStructure = async () => {
    try {
      await api.updateEmployeeSalary(employee.id, salaryForm);
      showToast('Salary structure updated', 'success');
      setEditSalaryMode(false);
      loadPayrollInfo();
      onRefresh(); // Refresh parent directory view since net salary might change
    } catch (err) { showToast(err.message, 'error'); }
  };

  const TABS = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'salary', label: 'Salary & Slips', icon: DollarSign },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header Profile Area */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 lg:p-6 shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors mb-4">
          <ChevronLeft className="w-4 h-4" /> Back to Directory
        </button>

        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-4xl font-bold text-white shadow-xl shadow-blue-900/20">
            {employee.name[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">{employee.name}</h1>
            <p className="text-lg text-slate-400 mt-1">{employee.job_title || 'Employee'} • {employee.department_name || employee.department || 'No Dept'}</p>
            <div className="flex flex-wrap gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-sm text-slate-400"><Briefcase className="w-4 h-4" /> Code: {employee.employee_code || 'N/A'}</span>
              <span className="flex items-center gap-1.5 text-sm text-slate-400"><Mail className="w-4 h-4" /> {employee.email || 'N/A'}</span>
              <span className="flex items-center gap-1.5 text-sm text-slate-400"><Phone className="w-4 h-4" /> {employee.phone || 'N/A'}</span>
              <span className="flex items-center gap-1.5 text-sm text-slate-400"><Calendar className="w-4 h-4" /> Joined: {employee.joining_date}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6 overflow-x-auto pb-2 scrollbar-hide">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all
                ${activeTab === t.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}
              `}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="font-bold text-white mb-4">Employment Details</h3>
              <div className="space-y-4">
                <div><div className="text-xs text-slate-500 mb-1">Status</div><div className="text-sm font-semibold text-emerald-400">{employee.status}</div></div>
                <div><div className="text-xs text-slate-500 mb-1">Employment Type</div><div className="text-sm font-medium text-white">{employee.employment_type || 'Full Time'}</div></div>
                <div><div className="text-xs text-slate-500 mb-1">Branch</div><div className="text-sm font-medium text-white">{employee.branch_name || 'Headquarters'}</div></div>
                <div><div className="text-xs text-slate-500 mb-1">Basic Salary</div><div className="text-sm font-medium text-white">₹{employee.salary?.toLocaleString() || 0} / month</div></div>
              </div>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="font-bold text-white mb-4">Personal Info</h3>
              <div className="space-y-4">
                <div><div className="text-xs text-slate-500 mb-1">Date of Birth</div><div className="text-sm font-medium text-white">{employee.dob || 'Not provided'}</div></div>
                <div><div className="text-xs text-slate-500 mb-1">Blood Group</div><div className="text-sm font-medium text-white">{employee.blood_group || 'Not provided'}</div></div>
                <div><div className="text-xs text-slate-500 mb-1">Emergency Contact</div><div className="text-sm font-medium text-white">{employee.emergency_contact || 'Not provided'}</div></div>
                <div><div className="text-xs text-slate-500 mb-1">Address</div><div className="text-sm font-medium text-white">{employee.address || 'Not provided'}</div></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">Employee Documents</h2>
              <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl cursor-pointer transition-colors">
                <Upload className="w-4 h-4" /> Upload Document
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={loading} accept=".pdf,.png,.jpg,.jpeg" />
              </label>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map(doc => (
                <div key={doc.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{doc.doc_name}</div>
                      <div className="text-[10px] text-slate-500">{(doc.file_size / 1024).toFixed(1)} KB • {new Date(doc.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a href={api.getDocumentUrl(doc.id)} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-blue-400 bg-slate-800 hover:bg-blue-500/10 rounded-lg transition-colors">
                      <Download className="w-4 h-4" />
                    </a>
                    <button onClick={() => handleDeleteDoc(doc.id)} className="p-2 text-slate-400 hover:text-red-400 bg-slate-800 hover:bg-red-500/10 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {documents.length === 0 && (
                <div className="col-span-full py-10 text-center text-slate-500">No documents uploaded yet.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'salary' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Salary Structure */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                <h3 className="font-bold text-white">Salary Structure</h3>
                {!editSalaryMode ? (
                  <button onClick={() => setEditSalaryMode(true)} className="text-blue-400 hover:text-blue-300 text-sm font-semibold flex items-center gap-1">
                    <Edit2 className="w-4 h-4" /> Edit
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setEditSalaryMode(false)} className="text-slate-400 hover:text-white text-sm font-semibold">Cancel</button>
                    <button onClick={saveSalaryStructure} className="text-emerald-400 hover:text-emerald-300 text-sm font-semibold">Save</button>
                  </div>
                )}
              </div>
              <div className="p-5 flex-1 overflow-y-auto">
                {editSalaryMode ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Basic" type="number" value={salaryForm.basic || 0} onChange={v => setSalaryForm(f => ({ ...f, basic: Number(v) }))} />
                      <FormField label="HRA" type="number" value={salaryForm.hra || 0} onChange={v => setSalaryForm(f => ({ ...f, hra: Number(v) }))} />
                      <FormField label="DA" type="number" value={salaryForm.da || 0} onChange={v => setSalaryForm(f => ({ ...f, da: Number(v) }))} />
                      <FormField label="Medical" type="number" value={salaryForm.medical || 0} onChange={v => setSalaryForm(f => ({ ...f, medical: Number(v) }))} />
                      <FormField label="Travel" type="number" value={salaryForm.travel || 0} onChange={v => setSalaryForm(f => ({ ...f, travel: Number(v) }))} />
                    </div>
                    <div className="border-t border-slate-800 pt-4 mt-4 grid grid-cols-2 gap-4">
                      <FormField label="PF (Employee)" type="number" value={salaryForm.pf_employee || 0} onChange={v => setSalaryForm(f => ({ ...f, pf_employee: Number(v) }))} />
                      <FormField label="ESI (Employee)" type="number" value={salaryForm.esi_employee || 0} onChange={v => setSalaryForm(f => ({ ...f, esi_employee: Number(v) }))} />
                      <FormField label="TDS" type="number" value={salaryForm.tds || 0} onChange={v => setSalaryForm(f => ({ ...f, tds: Number(v) }))} />
                      <FormField label="Prof. Tax" type="number" value={salaryForm.professional_tax || 0} onChange={v => setSalaryForm(f => ({ ...f, professional_tax: Number(v) }))} />
                    </div>
                  </div>
                ) : salaryStructure ? (
                  <div className="space-y-6">
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Earnings</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-slate-400">Basic</span><span className="text-white font-medium">₹{salaryStructure.basic}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">HRA</span><span className="text-white font-medium">₹{salaryStructure.hra}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">DA</span><span className="text-white font-medium">₹{salaryStructure.da}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Medical</span><span className="text-white font-medium">₹{salaryStructure.medical}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Travel</span><span className="text-white font-medium">₹{salaryStructure.travel}</span></div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between font-bold">
                        <span className="text-blue-400">Gross Salary</span><span className="text-blue-400">₹{salaryStructure.gross_salary}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Deductions</div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-slate-400">PF (Employee)</span><span className="text-white font-medium">₹{salaryStructure.pf_employee}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">ESI (Employee)</span><span className="text-white font-medium">₹{salaryStructure.esi_employee}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">TDS</span><span className="text-white font-medium">₹{salaryStructure.tds}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Professional Tax</span><span className="text-white font-medium">₹{salaryStructure.professional_tax}</span></div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between font-bold">
                        <span className="text-red-400">Total Deductions</span>
                        <span className="text-red-400">₹{salaryStructure.pf_employee + salaryStructure.esi_employee + salaryStructure.tds + salaryStructure.professional_tax + salaryStructure.other_deductions}</span>
                      </div>
                    </div>
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex justify-between items-center">
                      <span className="font-bold text-emerald-400">Net Take Home</span>
                      <span className="text-xl font-black text-emerald-400">₹{salaryStructure.net_salary}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-500">No salary structure defined yet.</div>
                )}
              </div>
            </div>

            {/* Salary Slips */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="font-bold text-white mb-4">Salary Slips</h3>
              <div className="space-y-3">
                {salarySlips.map(slip => (
                  <div key={slip.id} className="p-4 rounded-xl border border-slate-800 bg-slate-800/30 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white">Month: {slip.month}/{slip.year}</div>
                      <div className="text-xs text-slate-400 mt-0.5">Net Pay: ₹{slip.net_salary} • Status: <span className="capitalize text-slate-300">{slip.status}</span></div>
                    </div>
                    <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors">
                      View Slip
                    </button>
                  </div>
                ))}
                {salarySlips.length === 0 && (
                  <div className="text-center py-8 text-slate-500">No payroll history found.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
