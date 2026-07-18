// Workforce/Task Analytics — deterministic metrics from GET /api/tasks/analytics.
import React, { useState, useEffect } from 'react';
import { BarChart3, CheckCircle2, AlertTriangle, Clock, ListTodo } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../../../api/client';
import { Loading, EmptyState, PageHeader } from './_shared';
import { STATUS_META, PRIORITY_META } from './TaskShared';

const STATUS_COLORS = { todo: '#94a3b8', in_progress: '#60a5fa', review: '#a78bfa', blocked: '#f87171', completed: '#34d399', cancelled: '#64748b' };
const PRIORITY_COLORS = { low: '#94a3b8', medium: '#60a5fa', high: '#fbbf24', urgent: '#f87171' };

function Stat({ icon: Icon, value, label, color }) {
  return (
    <div className="rounded-2xl border border-edge dark:border-edge-dark bg-panel dark:bg-panel-dark p-4">
      <Icon className="w-5 h-5 mb-2" style={{ color }} />
      <div className="text-2xl font-bold text-inkA dark:text-inkA-dark leading-none">{value}</div>
      <div className="text-xs text-inkB dark:text-inkB-dark mt-1">{label}</div>
    </div>
  );
}

export default function WorkforceAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.getTaskAnalytics().then(d => { if (alive) { setData(d); setLoading(false); } }).catch(() => setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="p-6"><Loading /></div>;
  if (!data) return <div className="p-6"><EmptyState icon={BarChart3} title="No analytics" subtitle="Analytics will appear once tasks exist." /></div>;

  const statusData = (data.byStatus || []).map(s => ({ name: STATUS_META[s.status]?.label || s.status, value: s.c, key: s.status }));
  const priorityData = (data.byPriority || []).map(p => ({ name: PRIORITY_META[p.priority]?.label || p.priority, value: p.c, key: p.priority }));

  return (
    <div className="p-4 sm:p-6">
      <PageHeader icon={BarChart3} title="Workforce Analytics" subtitle="Task productivity across your team" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Stat icon={ListTodo} value={data.total} label="Total tasks" color="#60a5fa" />
        <Stat icon={CheckCircle2} value={data.completed} label="Completed" color="#34d399" />
        <Stat icon={BarChart3} value={`${data.completionRate}%`} label="Completion rate" color="#a78bfa" />
        <Stat icon={AlertTriangle} value={data.overdue} label="Overdue" color="#f87171" />
        <Stat icon={Clock} value={data.avgCompletionDays ?? '—'} label="Avg days to close" color="#fbbf24" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-edge dark:border-edge-dark bg-panel dark:bg-panel-dark p-4">
          <div className="text-sm font-semibold text-inkA dark:text-inkA-dark mb-4">Tasks by status</div>
          {statusData.length === 0 ? <div className="text-xs text-inkB dark:text-inkB-dark py-10 text-center">No data</div> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, color: '#fff' }} cursor={{ fill: '#1e293b55' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>{statusData.map(d => <Cell key={d.key} fill={STATUS_COLORS[d.key] || '#60a5fa'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-2xl border border-edge dark:border-edge-dark bg-panel dark:bg-panel-dark p-4">
          <div className="text-sm font-semibold text-inkA dark:text-inkA-dark mb-4">Tasks by priority</div>
          {priorityData.length === 0 ? <div className="text-xs text-inkB dark:text-inkB-dark py-10 text-center">No data</div> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={{ fill: '#cbd5e1', fontSize: 11 }}>
                  {priorityData.map(d => <Cell key={d.key} fill={PRIORITY_COLORS[d.key] || '#60a5fa'} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
