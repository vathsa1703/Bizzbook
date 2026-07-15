// Shared Task UI: constants, create modal, and the detail drawer (comments,
// checklist, attachments, activity timeline). Used by TasksPage & KanbanPage.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Plus, Paperclip, Send, CheckSquare, Square, Trash2, Download, Clock,
  MessageSquare, Activity as ActivityIcon, Users2, Calendar, Flag,
} from 'lucide-react';
import { api } from '../../../api/client';
import { useToast } from '../../../components/ToastContext';
import Modal from '../../../components/Modal';
import FormField from '../../../components/FormField';
import { Avatar, MemberPicker, useEmployees } from './_shared';

export const STATUS_ORDER = ['todo', 'in_progress', 'review', 'blocked', 'completed', 'cancelled'];
export const STATUS_META = {
  todo: { label: 'To Do', dot: 'bg-slate-400', col: 'border-slate-600' },
  in_progress: { label: 'In Progress', dot: 'bg-blue-400', col: 'border-blue-500' },
  review: { label: 'Review', dot: 'bg-violet-400', col: 'border-violet-500' },
  blocked: { label: 'Blocked', dot: 'bg-red-400', col: 'border-red-500' },
  completed: { label: 'Completed', dot: 'bg-emerald-400', col: 'border-emerald-500' },
  cancelled: { label: 'Cancelled', dot: 'bg-slate-500', col: 'border-slate-700' },
};
export const PRIORITY_META = {
  low: { label: 'Low', cls: 'text-slate-400 bg-slate-500/15' },
  medium: { label: 'Medium', cls: 'text-blue-400 bg-blue-500/15' },
  high: { label: 'High', cls: 'text-amber-400 bg-amber-500/15' },
  urgent: { label: 'Urgent', cls: 'text-red-400 bg-red-500/15' },
};

export function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.medium;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${m.cls}`}><Flag className="w-2.5 h-2.5" />{m.label}</span>;
}

export function TaskCard({ task, onClick }) {
  const overdue = task.due_date && task.status !== 'completed' && task.status !== 'cancelled' && task.due_date < new Date().toISOString().slice(0, 10);
  return (
    <button onClick={() => onClick(task)} className="w-full text-left rounded-xl border border-slate-800 bg-slate-900 hover:border-slate-700 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-sm font-semibold text-white leading-snug flex-1">{task.title}</span>
        <PriorityBadge priority={task.priority} />
      </div>
      {task.category && <span className="inline-block text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">{task.category}</span>}
      {task.checklist_total > 0 && (
        <div className="flex items-center gap-1.5"><div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${task.progress || 0}%` }} /></div>
          <span className="text-[10px] text-slate-500">{task.checklist_done}/{task.checklist_total}</span></div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex -space-x-1.5">{(task.assignees || []).slice(0, 4).map((a, i) => <Avatar key={i} name={a.name} src={a.avatar} size="sm" />)}</div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          {task.comment_count > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare className="w-3 h-3" />{task.comment_count}</span>}
          {task.attachment_count > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip className="w-3 h-3" />{task.attachment_count}</span>}
          {task.due_date && <span className={`inline-flex items-center gap-0.5 ${overdue ? 'text-red-400' : ''}`}><Calendar className="w-3 h-3" />{task.due_date.slice(5)}</span>}
        </div>
      </div>
    </button>
  );
}

export function TaskCreateModal({ onClose, onCreated }) {
  const { showToast } = useToast();
  const employees = useEmployees();
  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', category: '', due_date: '', recurrence: 'none' });
  const [assignMode, setAssignMode] = useState('employee');
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getDepartments().then(d => setDepartments(d || [])).catch(() => {});
    api.getTeams().then(r => setTeams(r.teams || [])).catch(() => {});
  }, []);

  const submit = async () => {
    if (!form.title.trim()) return showToast('Task title is required', 'error');
    setSubmitting(true);
    try {
      const payload = { ...form, due_date: form.due_date || null };
      if (assignMode === 'employee') payload.assignee_ids = assigneeIds;
      else if (assignMode === 'team') payload.team_id = teamId || null;
      else if (assignMode === 'department') payload.department_id = departmentId || null;
      const r = await api.createTask(payload);
      if (r?.error) throw new Error(r.error);
      showToast('Task created', 'success'); onCreated?.();
    } catch (e) { showToast(e.message, 'error'); } finally { setSubmitting(false); }
  };

  return (
    <Modal isOpen title="New Task" onClose={onClose} size="lg">
      <div className="p-5 space-y-3">
        <FormField label="Title" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Inventory Audit" />
        <FormField label="Description" type="textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Priority" type="select" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
            options={Object.keys(PRIORITY_META).map(k => ({ value: k, label: PRIORITY_META[k].label }))} />
          <FormField label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Ops" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Due date" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          <FormField label="Recurring" type="select" value={form.recurrence} onChange={e => setForm({ ...form, recurrence: e.target.value })}
            options={[{ value: 'none', label: 'One-off' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Assign to</label>
          <div className="flex gap-1.5 mb-2">
            {['employee', 'team', 'department'].map(m => (
              <button key={m} onClick={() => setAssignMode(m)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${assignMode === m ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-600'}`}>{m}{m !== 'employee' ? '' : 's'}</button>
            ))}
          </div>
          {assignMode === 'employee' && <MemberPicker employees={employees} value={assigneeIds} onChange={setAssigneeIds} height="max-h-40" />}
          {assignMode === 'team' && <FormField type="select" value={teamId} onChange={e => setTeamId(e.target.value)} options={[{ value: '', label: '— Select team —' }, ...teams.map(t => ({ value: t.id, label: t.name }))]} />}
          {assignMode === 'department' && <FormField type="select" value={departmentId} onChange={e => setDepartmentId(e.target.value)} options={[{ value: '', label: '— Select department —' }, ...departments.map(d => ({ value: d.id, label: d.name }))]} />}
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100">Cancel</button>
          <button onClick={submit} disabled={submitting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 disabled:opacity-50">{submitting ? 'Creating…' : 'Create Task'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function TaskDetailDrawer({ taskId, onClose, onChanged }) {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [newItem, setNewItem] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try { const r = await api.getTask(taskId); if (r?.error) throw new Error(r.error); setData(r); }
    catch (e) { showToast(e.message || 'Failed to load task', 'error'); onClose(); } finally { setLoading(false); }
  }, [taskId, showToast, onClose]);
  useEffect(() => { load(); }, [load]);

  const refresh = () => { load(); onChanged?.(); };
  const t = data?.task;

  const setStatus = async (status) => { try { await api.updateTask(taskId, { status }); refresh(); } catch (e) { showToast(e.message, 'error'); } };
  const addComment = async () => { if (!comment.trim()) return; try { await api.addTaskComment(taskId, comment, []); setComment(''); refresh(); } catch (e) { showToast(e.message, 'error'); } };
  const addItem = async () => { if (!newItem.trim()) return; try { await api.addTaskChecklist(taskId, newItem); setNewItem(''); refresh(); } catch (e) { showToast(e.message, 'error'); } };
  const toggleItem = async (it) => { try { await api.toggleTaskChecklist(taskId, it.id, !it.is_done); refresh(); } catch (e) { showToast(e.message, 'error'); } };
  const delItem = async (it) => { try { await api.deleteTaskChecklist(taskId, it.id); refresh(); } catch (e) { showToast(e.message, 'error'); } };
  const upload = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await api.uploadTaskAttachment(taskId, f); showToast('Uploaded', 'success'); refresh(); } catch (err) { showToast(err.message, 'error'); } finally { if (fileRef.current) fileRef.current.value = ''; } };
  const download = async (att) => { try { const blob = await api.downloadTaskAttachment(att.id); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = att.original_name || 'file'; a.click(); URL.revokeObjectURL(url); } catch (e) { showToast(e.message, 'error'); } };
  const delAtt = async (att) => { try { await api.deleteTaskAttachment(att.id); refresh(); } catch (e) { showToast(e.message, 'error'); } };
  const del = async () => { try { await api.deleteTask(taskId); showToast('Task deleted', 'success'); onChanged?.(); onClose(); } catch (e) { showToast(e.message, 'error'); } };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-950 border-l border-slate-800 h-full overflow-y-auto">
        {loading || !t ? <div className="p-6 text-slate-500 text-sm">Loading…</div> : (
          <div className="p-5 space-y-5">
            <div className="flex items-start gap-2">
              <h2 className="flex-1 text-base font-bold text-white">{t.title}</h2>
              <button onClick={del} className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            {t.description && <p className="text-sm text-slate-400">{t.description}</p>}

            {/* Status pills */}
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map(s => (
                <button key={s} onClick={() => setStatus(s)} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${t.status === s ? `${STATUS_META[s].col} text-white bg-slate-800` : 'border-slate-800 text-slate-400 hover:text-white'}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${STATUS_META[s].dot}`} />{STATUS_META[s].label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
              <PriorityBadge priority={t.priority} />
              {t.due_date && <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{t.due_date}</span>}
              {t.recurrence && t.recurrence !== 'none' && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{t.recurrence}</span>}
              <span>Progress {t.progress || 0}%</span>
            </div>

            {/* Assignees */}
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1.5 flex items-center gap-1"><Users2 className="w-3.5 h-3.5" />Assignees</div>
              <div className="flex flex-wrap gap-1.5">
                {(data.assignees || []).length === 0 && <span className="text-xs text-slate-600">Unassigned</span>}
                {(data.assignees || []).map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-full pl-1 pr-2.5 py-0.5">
                    <Avatar name={a.name} src={a.avatar} size="sm" /><span className="text-[11px] text-slate-300">{a.name}</span>
                    <span className="text-[9px] text-slate-500 uppercase">{a.assignee_type !== 'employee' ? a.assignee_type : ''}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Checklist */}
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1.5 flex items-center gap-1"><CheckSquare className="w-3.5 h-3.5" />Checklist</div>
              <div className="space-y-1">
                {(data.checklist || []).map(it => (
                  <div key={it.id} className="flex items-center gap-2 group">
                    <button onClick={() => toggleItem(it)} className="text-slate-400 hover:text-blue-400">{it.is_done ? <CheckSquare className="w-4 h-4 text-emerald-400" /> : <Square className="w-4 h-4" />}</button>
                    <span className={`flex-1 text-sm ${it.is_done ? 'line-through text-slate-600' : 'text-slate-300'}`}>{it.title}</span>
                    <button onClick={() => delItem(it)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 mt-2">
                <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} placeholder="Add item…" className="flex-1 px-2.5 py-1.5 text-sm bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-600 outline-none focus:border-blue-500" />
                <button onClick={addItem} className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"><Plus className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Attachments */}
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1.5 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />Attachments</div>
              <div className="space-y-1">
                {(data.attachments || []).map(att => (
                  <div key={att.id} className="flex items-center gap-2 text-sm">
                    <Paperclip className="w-3.5 h-3.5 text-slate-500" /><span className="flex-1 text-slate-300 truncate">{att.original_name}</span>
                    <button onClick={() => download(att)} className="text-slate-500 hover:text-blue-400"><Download className="w-3.5 h-3.5" /></button>
                    <button onClick={() => delAtt(att)} className="text-slate-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              <input ref={fileRef} type="file" onChange={upload} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"><Plus className="w-3.5 h-3.5" />Upload file</button>
            </div>

            {/* Comments */}
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1.5 flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" />Comments</div>
              <div className="space-y-2 mb-2">
                {(data.comments || []).map(c => (
                  <div key={c.id} className="bg-slate-900 rounded-lg p-2.5">
                    <div className="flex items-center gap-1.5 mb-0.5"><span className="text-xs font-semibold text-slate-300">{c.author_name || 'User'}</span><span className="text-[10px] text-slate-600">{(c.created_at || '').slice(0, 16).replace('T', ' ')}</span></div>
                    <p className="text-sm text-slate-400">{c.body}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()} placeholder="Write a comment…" className="flex-1 px-2.5 py-1.5 text-sm bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-600 outline-none focus:border-blue-500" />
                <button onClick={addComment} className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500"><Send className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Activity */}
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1.5 flex items-center gap-1"><ActivityIcon className="w-3.5 h-3.5" />Activity</div>
              <div className="space-y-1.5">
                {(data.activity || []).slice(0, 20).map(a => (
                  <div key={a.id} className="flex items-start gap-2 text-[11px] text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-700 mt-1.5" />
                    <span><span className="text-slate-400 font-medium">{a.actor_name || 'System'}</span> {a.action.replace(/_/g, ' ')}{a.detail ? ` · ${a.detail}` : ''} <span className="text-slate-600">{(a.created_at || '').slice(5, 16).replace('T', ' ')}</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
