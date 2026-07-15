import React, { useEffect, useState } from 'react';
import { X, User, Users, Briefcase, Mail, Phone, Calendar, Target, Shield, Clock, ShieldAlert, Key } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../ToastContext';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../ConfirmDialog';

function StatBlock({ label, value, icon: Icon, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    gray: 'bg-gray-100 text-gray-700',
  };
  return (
    <div className="flex flex-col border border-gray-100 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-4 h-4" strokeWidth={2.5} />
        </div>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

export default function EmployeeProfilePanel({ employeeId, onClose }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Overview');
  const [showConfirm, setShowConfirm] = useState(null); // 'disable' | 'reset'

  useEffect(() => {
    if (!employeeId) return;
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const data = await api.getEmployeeProfile(employeeId);
        setProfile(data);
      } catch (err) {
        showToast('Failed to load profile', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [employeeId, showToast]);

  if (!employeeId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/40 backdrop-blur-sm transition-opacity">
      <div 
        className="w-full max-w-4xl bg-gray-50 h-full shadow-2xl flex flex-col transform transition-transform animate-slide-in-right"
      >
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl font-bold uppercase shadow-sm">
              {profile?.employee?.avatar ? (
                <img src={profile.employee.avatar} alt="avatar" className="w-full h-full rounded-full object-cover" />
              ) : (
                profile?.employee?.name?.substring(0, 2)
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                {profile?.employee?.name || 'Loading...'}
                {profile?.employee?.status === 'Active' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    {profile?.employee?.status}
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500 font-medium">
                {profile?.employee?.employee_code || 'EMP-XXXX'} • {profile?.employee?.job_title || 'No Title'} • {profile?.employee?.department_name || 'No Dept'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.role === 'OWNER' && profile?.employee?.login_email && (
              <button 
                onClick={() => setShowConfirm('disable')}
                className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <ShieldAlert className="w-4 h-4" /> Disable Account
              </button>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : !profile ? (
            <div className="p-8 text-center text-gray-500">Profile not found.</div>
          ) : (
            <div className="p-6">
              {/* Tabs */}
              <div className="flex border-b border-gray-200 mb-6 sticky top-0 bg-gray-50 z-10 pt-2 -mt-2">
                {['Overview', 'Personal', 'Employment', 'Account', 'Activity', 'Organization'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                      tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="space-y-6">
                
                {tab === 'Overview' && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <StatBlock label="Sales Created" value={profile.stats.sales_created} icon={Target} color="blue" />
                      <StatBlock label="Products Sold" value={profile.stats.products_managed} icon={Briefcase} color="purple" />
                      <StatBlock label="Direct Reports" value={profile.directReports.length} icon={Users} color="amber" />
                      <StatBlock label="Attendance" value={`${profile.employee.attendance || 0}%`} icon={Calendar} color="green" />
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                      <h3 className="text-base font-bold text-gray-900 mb-4">Summary</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-8">
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Full Name</p>
                          <p className="text-sm text-gray-900 font-medium">{profile.employee.name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Employee Code</p>
                          <p className="text-sm text-gray-900 font-medium">{profile.employee.employee_code}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Department</p>
                          <p className="text-sm text-gray-900 font-medium">{profile.employee.department_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Job Title</p>
                          <p className="text-sm text-gray-900 font-medium">{profile.employee.job_title || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Employment Type</p>
                          <p className="text-sm text-gray-900 font-medium">{profile.employee.employment_type || 'Full Time'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Reports To</p>
                          <p className="text-sm text-blue-600 font-medium hover:underline cursor-pointer">{profile.employee.manager_name || 'Owner'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'Personal' && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-fade-in">
                     <h3 className="text-base font-bold text-gray-900 mb-6 flex items-center gap-2"><User className="w-5 h-5 text-gray-400" /> Personal Information</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Email Address</p>
                          <p className="text-sm text-gray-900 font-medium flex items-center gap-2">
                            <Mail className="w-4 h-4 text-gray-400" /> {profile.employee.email || '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Phone Number</p>
                          <p className="text-sm text-gray-900 font-medium flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-400" /> {profile.employee.phone || '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Emergency Contact</p>
                          <p className="text-sm text-gray-900 font-medium flex items-center gap-2">
                            <Shield className="w-4 h-4 text-red-400" /> {profile.employee.emergency_contact || '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Date of Birth</p>
                          <p className="text-sm text-gray-400 italic">Placeholder for future</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Address</p>
                          <p className="text-sm text-gray-400 italic">Placeholder for future</p>
                        </div>
                     </div>
                  </div>
                )}

                {tab === 'Employment' && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-fade-in">
                    <h3 className="text-base font-bold text-gray-900 mb-6 flex items-center gap-2"><Briefcase className="w-5 h-5 text-gray-400" /> Employment Details</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Join Date</p>
                          <p className="text-sm text-gray-900 font-medium">{profile.employee.joining_date}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">System Role</p>
                          <p className="text-sm text-gray-900 font-medium">{profile.employee.role || 'No Login Access'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Current Salary</p>
                          <p className="text-sm text-gray-900 font-medium">₹{profile.employee.salary?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Status</p>
                          <p className="text-sm text-gray-900 font-medium">{profile.employee.status}</p>
                        </div>
                     </div>
                  </div>
                )}

                {tab === 'Account' && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-fade-in">
                    <h3 className="text-base font-bold text-gray-900 mb-6 flex items-center gap-2"><Shield className="w-5 h-5 text-gray-400" /> Account Security</h3>
                    {profile.employee.login_email ? (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Login Email</p>
                            <p className="text-sm text-gray-900 font-medium">{profile.employee.login_email}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Account Status</p>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${profile.employee.account_status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {profile.employee.account_status}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Account Created</p>
                            <p className="text-sm text-gray-900 font-medium">{new Date(profile.employee.account_created).toLocaleDateString()}</p>
                          </div>
                        </div>
                        
                        {user?.role === 'OWNER' && (
                          <div className="pt-6 border-t border-gray-100 flex gap-3">
                            <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-colors">
                              <Key className="w-4 h-4 text-gray-500" /> Reset Password
                            </button>
                            {profile.employee.account_status === 'Inactive' && (
                              <button className="px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-sm font-medium text-green-700 hover:bg-green-100 flex items-center gap-2 shadow-sm transition-colors">
                                <Shield className="w-4 h-4" /> Enable Account
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <ShieldAlert className="w-8 h-8 text-gray-400" />
                        </div>
                        <h4 className="text-gray-900 font-medium mb-1">No Account Setup</h4>
                        <p className="text-sm text-gray-500 mb-6">This employee does not have system login access yet.</p>
                      </div>
                    )}
                  </div>
                )}

                {tab === 'Activity' && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-fade-in">
                    <h3 className="text-base font-bold text-gray-900 mb-6 flex items-center gap-2"><Clock className="w-5 h-5 text-gray-400" /> Recent Activity</h3>
                    {profile.activity && profile.activity.length > 0 ? (
                      <div className="relative border-l border-gray-200 ml-3 space-y-6">
                        {profile.activity.map((act, idx) => (
                          <div key={idx} className="relative pl-6">
                            <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white"></div>
                            <p className="text-sm font-medium text-gray-900">Recorded a sale of ₹{act.amount.toLocaleString()}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{act.detail} • {new Date(act.date).toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-8">No recent activity found.</p>
                    )}
                  </div>
                )}

                {tab === 'Organization' && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-fade-in">
                    <h3 className="text-base font-bold text-gray-900 mb-6 flex items-center gap-2"><Users className="w-5 h-5 text-gray-400" /> Organization Chart</h3>
                    
                    <div className="flex flex-col items-center space-y-4 py-8 bg-gray-50/50 rounded-xl border border-gray-100">
                      {/* Manager */}
                      {profile.employee.manager_name && (
                        <>
                          <div className="bg-white px-6 py-3 rounded-lg shadow-sm border border-gray-200 text-center min-w-[200px]">
                            <p className="text-xs text-gray-500 font-medium uppercase mb-1">Reports To</p>
                            <p className="text-sm font-bold text-gray-900">{profile.employee.manager_name}</p>
                          </div>
                          <div className="w-0.5 h-6 bg-gray-300"></div>
                        </>
                      )}
                      
                      {/* Self */}
                      <div className="bg-blue-600 px-6 py-3 rounded-lg shadow border border-blue-700 text-center min-w-[200px] text-white">
                        <p className="text-sm font-bold">{profile.employee.name}</p>
                        <p className="text-xs text-blue-100">{profile.employee.job_title || 'Employee'}</p>
                      </div>

                      {/* Direct Reports */}
                      {profile.directReports && profile.directReports.length > 0 && (
                        <>
                          <div className="w-0.5 h-6 bg-gray-300"></div>
                          <div className="w-full max-w-lg border-t-2 border-gray-300 relative">
                            <div className="flex justify-center flex-wrap gap-4 pt-4">
                              {profile.directReports.map(dr => (
                                <div key={dr.id} className="relative bg-white px-4 py-3 rounded-lg shadow-sm border border-gray-200 text-center min-w-[140px] before:content-[''] before:absolute before:-top-4 before:left-1/2 before:w-0.5 before:h-4 before:bg-gray-300">
                                  <p className="text-sm font-bold text-gray-900">{dr.name}</p>
                                  <p className="text-xs text-gray-500">{dr.job_title || 'Employee'}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </div>
      {showConfirm === 'disable' && (
        <ConfirmDialog
          title="Disable Account"
          message={`Are you sure you want to disable system access for ${profile?.employee?.name}? They will be logged out immediately.`}
          confirmText="Disable Account"
          cancelText="Cancel"
          danger={true}
          onConfirm={() => {
            // Future implementation
            showToast('Not implemented yet', 'info');
            setShowConfirm(null);
          }}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </div>
  );
}
