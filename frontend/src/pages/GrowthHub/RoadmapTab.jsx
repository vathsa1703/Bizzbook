// ═══════════════════════════════════════════════════════════════════════════════
// TAB: GROWTH ROADMAP — extracted verbatim from the original GrowthHub.jsx.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, X, Check, Clock, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';
import { SectionCard, Badge, ProgressBar, STAGE_COLORS } from './shared';

export default function RoadmapTab() {
  const [data, setData] = useState({ tasks: [], stages: [] });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title:'', stage:'', category:'Milestone', priority:'Medium', description:'' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.growth.getRoadmap().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleStatus = async (task) => {
    const newStatus = task.status === 'Complete' ? 'Not Started' : task.status === 'In Progress' ? 'Complete' : 'In Progress';
    await api.growth.updateTask(task.id, { status: newStatus });
    load();
  };

  const save = async () => {
    setSaving(true);
    try { await api.growth.createTask(form); setShowForm(false); load(); }
    catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const PRIORITY_COLOR = { Critical:'red', High:'orange', Medium:'amber', Low:'gray' };
  const STATUS_ICON = { 'Not Started': Clock, 'In Progress': RefreshCw, 'Complete': CheckCircle2 };

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;

  // Group by stage
  const stageOrder = ['Idea','Registered','Revenue','Funded','Scaling','Profitable','Pre-IPO','Public'];
  const groupedStages = data.stages.sort((a, b) => stageOrder.indexOf(a) - stageOrder.indexOf(b));
  const tasksByStage = groupedStages.reduce((acc, s) => {
    acc[s] = data.tasks.filter(t => t.stage === s);
    return acc;
  }, {});
  const unstaged = data.tasks.filter(t => !t.stage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-gray-900">Growth Roadmap</h2>
          <p className="text-xs text-gray-500">{data.complete}/{data.total} milestones complete</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus size={13} />Add Task
        </button>
      </div>

      <SectionCard>
        <ProgressBar value={data.total > 0 ? (data.complete / data.total) * 100 : 0} color="#6366f1" height={8} />
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Progress: {data.total > 0 ? Math.round((data.complete / data.total) * 100) : 0}%</span>
          <span>{data.inProgress} in progress</span>
        </div>
      </SectionCard>

      {/* Timeline */}
      <div className="space-y-1">
        {[...groupedStages, ...(unstaged.length ? ['Other'] : [])].map((stage, si) => {
          const tasks = stage === 'Other' ? unstaged : (tasksByStage[stage] || []);
          const done = tasks.filter(t => t.status === 'Complete').length;
          const allDone = tasks.length > 0 && done === tasks.length;
          return (
            <div key={stage} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${allDone ? 'bg-green-500' : 'bg-indigo-100'}`}>
                  {allDone ? <Check size={14} className="text-white" /> : <span className="text-xs font-black text-indigo-600">{si+1}</span>}
                </div>
                {si < groupedStages.length - 1 && <div className="w-0.5 bg-gray-200 flex-1 my-1" style={{ minHeight: 24 }} />}
              </div>
              <div className="flex-1 pb-4">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold mb-2 ${STAGE_COLORS[stage] || 'bg-gray-100 text-gray-600'}`}>
                  {stage}
                </div>
                <div className="space-y-2">
                  {tasks.map(task => {
                    const StatusIcon = STATUS_ICON[task.status] || Clock;
                    return (
                      <button key={task.id} onClick={() => toggleStatus(task)} className="w-full bg-white rounded-xl border border-gray-100 shadow-sm p-3 text-left hover:shadow-md transition-all flex items-start gap-3">
                        <StatusIcon size={15} className={task.status==='Complete'?'text-green-500':task.status==='In Progress'?'text-amber-500':'text-gray-300'} />
                        <div className="flex-1">
                          <p className={`text-xs font-semibold ${task.status==='Complete' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{task.title}</p>
                          {task.description && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{task.description}</p>}
                          <div className="flex items-center gap-2 mt-1">
                            <Badge color={PRIORITY_COLOR[task.priority]||'gray'}>{task.priority}</Badge>
                            <Badge color="gray">{task.category}</Badge>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[75vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Add Milestone</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Title *', key: 'title', placeholder: 'Milestone title' },
                { label: 'Description', key: 'description', placeholder: 'What needs to be done?', multiline: true },
              ].map(({ label, key, placeholder, multiline }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">{label}</label>
                  {multiline
                    ? <textarea value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} rows={2} placeholder={placeholder} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                    : <input value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} placeholder={placeholder} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  }
                </div>
              ))}
              {[
                { label: 'Stage', key: 'stage', opts: ['Idea','Registered','Revenue','Funded','Scaling','Profitable','Pre-IPO','Public'] },
                { label: 'Category', key: 'category', opts: ['Milestone','Legal','Financial','Product','Team','Marketing','Regulatory','Custom'] },
                { label: 'Priority', key: 'priority', opts: ['Low','Medium','High','Critical'] },
              ].map(({ label, key, opts }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">{label}</label>
                  <select value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <button onClick={save} disabled={saving || !form.title} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Add Milestone'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
