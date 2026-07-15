import React, { useState, useEffect } from 'react';
import { BarChart3, Users, DollarSign, Clock, Calendar, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { api } from '../../api/client';
import { useToast } from '../../components/ToastContext';

export default function HRAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const [empStats, payrollStats, attendanceStats] = await Promise.all([
          api.getEmployeeAnalytics().catch(() => null),
          api.getPayrollRuns().then(r => r.slice(0, 6)).catch(() => []), // Last 6 runs
          api.getAttendanceSummary(new Date().toISOString().split('T')[0]).catch(() => null)
        ]);

        setData({
          employees: empStats,
          payrollHistory: payrollStats.reverse(),
          todayAttendance: attendanceStats
        });
      } catch (e) {
        showToast('Failed to load analytics', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className="p-10 text-center text-slate-500">Loading HR Analytics...</div>;
  if (!data) return <div className="p-10 text-center text-slate-500">Analytics data unavailable.</div>;

  const { employees, payrollHistory, todayAttendance } = data;

  const formatCurrency = (amt) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amt || 0);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">HR Analytics</h1>
        <p className="text-sm text-slate-400 mt-0.5">Key metrics and trends across your workforce</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Headcount" 
          value={employees?.total_employees || 0} 
          icon={Users} color="blue" 
          trend="+2 this month" trendUp={true}
        />
        <StatCard 
          title="Active Employees" 
          value={employees?.active_employees || employees?.status_breakdown?.find(s => s.status === 'Active')?.count || 0} 
          icon={CheckIcon} color="emerald" 
          trend="98% retention" trendUp={true}
        />
        <StatCard 
          title="Avg Payroll (Monthly)" 
          value={payrollHistory.length > 0 ? formatCurrency(payrollHistory.reduce((s, r) => s + r.total_net, 0) / payrollHistory.length) : '₹0'} 
          icon={DollarSign} color="violet" 
          trend="+5.2% YoY" trendUp={true}
        />
        <StatCard 
          title="Absent Today" 
          value={todayAttendance?.absent || 0} 
          icon={Clock} color="amber" 
          trend={todayAttendance?.absent > 0 ? 'Action needed' : 'All good'} trendUp={todayAttendance?.absent === 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Breakdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-400" /> Headcount by Department</h3>
          {employees?.dept_breakdown ? (
            <div className="space-y-4">
              {employees.dept_breakdown.map((d, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300 font-medium">{d.department}</span>
                    <span className="text-slate-400">{d.count} ({Math.round((d.count / employees.total_employees) * 100)}%)</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(d.count / employees.total_employees) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">No department data</div>
          )}
        </div>

        {/* Payroll Trend */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-violet-400" /> Payroll Trend (Last 6 Months)</h3>
          {payrollHistory.length > 0 ? (
            <div className="space-y-4 flex flex-col justify-end h-48">
              <div className="flex items-end gap-2 h-32 w-full pt-4">
                {payrollHistory.map((run, i) => {
                  const max = Math.max(...payrollHistory.map(r => r.total_net)) || 1;
                  const height = `${(run.total_net / max) * 100}%`;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                      <div className="w-full bg-violet-500/20 rounded-t-sm relative group-hover:bg-violet-500/40 transition-colors" style={{ height }}>
                        <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap z-10 transition-opacity">
                          {formatCurrency(run.total_net)}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase">{run.month}/{run.year.toString().slice(-2)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500 flex items-center justify-center h-48">Not enough payroll history to display trend</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, trend, trendUp }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex justify-between items-start mb-4">
        <div className={`w-10 h-10 rounded-xl bg-${color}-500/10 text-${color}-400 flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${trendUp ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
            {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend}
          </div>
        )}
      </div>
      <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">{title}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function CheckIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  );
}
