// Tasks — filterable list view. Create + open detail drawer.
import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { api } from '../../../api/client';
import { useToast } from '../../../components/ToastContext';
import { Loading, EmptyState, PageHeader, btnPrimary } from './_shared';
import { TaskCard, TaskCreateModal, TaskDetailDrawer, STATUS_ORDER, STATUS_META, PRIORITY_META } from './TaskShared';

export default function TasksPage() {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      if (priority) params.priority = priority;
      if (q) params.q = q;
      const r = await api.getTasks(params);
      setTasks(r.tasks || []);
    } catch { showToast('Failed to load tasks', 'error'); } finally { setLoading(false); }
  }, [status, priority, q, showToast]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader icon={ClipboardList} title="Tasks" subtitle={`${tasks.length} task${tasks.length !== 1 ? 's' : ''}`}>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="pl-8 pr-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-500 w-36" />
        </div>
        <button onClick={() => setShowCreate(true)} className={btnPrimary}><Plus className="w-4 h-4" />New Task</button>
      </PageHeader>

      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none">
          <option value="">All statuses</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={priority} onChange={e => setPriority(e.target.value)} className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none">
          <option value="">All priorities</option>
          {Object.keys(PRIORITY_META).map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </select>
      </div>

      {loading ? <Loading /> : tasks.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No tasks" subtitle="Create a task and assign it to people, a team or a department." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map(t => <TaskCard key={t.id} task={t} onClick={() => setOpenId(t.id)} />)}
        </div>
      )}

      {showCreate && <TaskCreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      {openId && <TaskDetailDrawer taskId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
