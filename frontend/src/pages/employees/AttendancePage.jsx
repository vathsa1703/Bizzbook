import React, { useState, useEffect } from 'react';
import { Clock, Download, Search, CheckCircle2, XCircle, FileWarning, RefreshCw, LogIn, LogOut } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ToastContext';
import Modal from '../../components/Modal';

export default function AttendancePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  
  const [myTodayRecord, setMyTodayRecord] = useState(null);
  const [clocking, setClocking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [recData, sumData, myData] = await Promise.allSettled([
        api.getAttendance({ date }),
        api.getAttendanceSummary(date),
        user?.employeeId ? api.getAttendance({ date, employee_id: user.employeeId }) : Promise.resolve([])
      ]);
      setRecords(recData.status === 'fulfilled' ? recData.value : []);
      setSummary(sumData.status === 'fulfilled' ? sumData.value : null);
      if (myData.status === 'fulfilled' && myData.value.length > 0) {
        setMyTodayRecord(myData.value[0]);
      } else {
        setMyTodayRecord(null);
      }
    } catch (e) {
      showToast('Failed to load attendance', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [date]);

  const filtered = records.filter(r => 
    r.employee_name?.toLowerCase().includes(search.toLowerCase()) || 
    r.employee_code?.toLowerCase().includes(search.toLowerCase())
  );

  const handleClockIn = async () => {
    setClocking(true);
    try {
      await api.clockIn({ employee_id: user.employeeId, notes: 'Self clock-in via portal' });
      showToast('Clocked in successfully', 'success');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setClocking(false);
    }
  };

  const handleClockOut = async () => {
    setClocking(true);
    try {
      await api.clockOut({ employee_id: user.employeeId });
      showToast('Clocked out successfully', 'success');
      load();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setClocking(false);
    }
  };

  const isAdmin = user?.role === 'OWNER' || user?.role === 'admin' || user?.role === 'MANAGER';

  const getStatusBadge = (status) => {
    const config = {
      present: { color: 'text-emerald-600 dark:text-emerald-400 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25 dark:border-emerald-500/20', icon: CheckCircle2, label: 'Present' },
      remote: { color: 'text-blue-600 dark:text-blue-400 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/25 dark:border-blue-500/20', icon: CheckCircle2, label: 'Remote' },
      wfh: { color: 'text-blue-600 dark:text-blue-400 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/25 dark:border-blue-500/20', icon: CheckCircle2, label: 'WFH' },
      on_site: { color: 'text-purple-600 dark:text-purple-400 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/25 dark:border-purple-500/20', icon: CheckCircle2, label: 'On-Site' },
      absent: { color: 'text-red-600 dark:text-red-400 dark:text-red-400 bg-red-50 dark:bg-red-500/10 dark:bg-red-500/10 border-red-200 dark:border-red-500/25 dark:border-red-500/20', icon: XCircle, label: 'Absent' },
      late: { color: 'text-amber-600 dark:text-amber-400 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25 dark:border-amber-500/20', icon: FileWarning, label: 'Late' },
      half_day: { color: 'text-orange-600 dark:text-orange-400 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/25 dark:border-orange-500/20', icon: Clock, label: 'Half Day' },
      on_leave: { color: 'text-inkB dark:text-inkB-dark bg-slate-500/10 border-slate-500/20', icon: FileWarning, label: 'On Leave' },
    };
    const c = config[status] || config.absent;
    const Icon = c.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${c.color}`}>
        <Icon className="w-3.5 h-3.5" />
        {c.label}
      </span>
    );
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-inkA dark:text-inkA-dark">Attendance</h1>
          <p className="text-sm text-inkB dark:text-inkB-dark mt-0.5">Track daily check-ins and working hours</p>
        </div>
        <div className="flex items-center gap-3">
          <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)}
            className="bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          {user?.employeeId && (
            <div className="flex gap-2">
              {!myTodayRecord || myTodayRecord.clock_out ? (
                <button onClick={handleClockIn} disabled={clocking || (myTodayRecord && myTodayRecord.clock_out)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
                  <LogIn className="w-4 h-4" /> Clock In
                </button>
              ) : (
                <button onClick={handleClockOut} disabled={clocking} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50">
                  <LogOut className="w-4 h-4" /> Clock Out
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {isAdmin && summary && (
        <div className="grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark rounded-2xl p-4">
            <div className="text-inkB dark:text-inkB-dark text-xs font-medium uppercase tracking-wider mb-1">Total Employees</div>
            <div className="text-2xl font-bold text-inkA dark:text-inkA-dark">{summary.total_employees}</div>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25 dark:border-emerald-500/20 rounded-2xl p-4">
            <div className="text-emerald-600 dark:text-emerald-400/80 text-xs font-medium uppercase tracking-wider mb-1">Present (Incl WFH)</div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.present}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25 dark:border-red-500/20 rounded-2xl p-4">
            <div className="text-red-600 dark:text-red-400/80 text-xs font-medium uppercase tracking-wider mb-1">Absent</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{summary.absent}</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25 dark:border-amber-500/20 rounded-2xl p-4">
            <div className="text-amber-600 dark:text-amber-400/80 text-xs font-medium uppercase tracking-wider mb-1">Late Arrivals</div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.late}</div>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-inkB dark:text-inkB-dark" />
          <input 
            value={search} onChange={e => setSearch(e.target.value)} 
            placeholder="Search employee name or code..."
            className="w-full bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark placeholder-gray-400 dark:placeholder-slate-500 rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:border-blue-500" 
          />
        </div>
        <button onClick={load} className="p-2 bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark rounded-xl text-inkB dark:text-inkB-dark hover:text-inkA dark:hover:text-white transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-inkB dark:text-inkB-dark">Loading attendance...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-inkB dark:text-inkB-dark bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark rounded-2xl">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-500 dark:text-blue-400" />
          <p className="font-medium text-inkA dark:text-inkA-dark">No attendance records for this date</p>
        </div>
      ) : (
        <div className="bg-panel dark:bg-panel-dark border-edge dark:border-edge-dark rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-edge dark:border-edge-dark text-xs font-semibold text-inkB dark:text-inkB-dark uppercase bg-panel2/50 dark:bg-panel2-dark/50">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">In/Out Time</th>
                  <th className="px-5 py-3">Total Hours</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-edge dark:divide-edge-dark">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-panel2/60 dark:hover:bg-panel2-dark/60 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-panel2 dark:bg-panel2-dark flex items-center justify-center font-bold text-inkA dark:text-inkA-dark text-xs">
                          {r.employee_name?.[0]}
                        </div>
                        <div>
                          <div className="font-bold text-inkA dark:text-inkA-dark">{r.employee_name}</div>
                          <div className="text-[10px] text-inkB dark:text-inkB-dark">{r.employee_code || r.job_title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-inkB dark:text-inkB-dark">{r.department_name || 'N/A'}</td>
                    <td className="px-5 py-3">
                      {getStatusBadge(r.status)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-inkB dark:text-inkB-dark">{r.clock_in ? r.clock_in.substring(0,5) : '--:--'} - {r.clock_out ? r.clock_out.substring(0,5) : '--:--'}</div>
                    </td>
                    <td className="px-5 py-3 font-medium text-inkA dark:text-inkA-dark">
                      {r.total_hours ? `${r.total_hours}h` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
