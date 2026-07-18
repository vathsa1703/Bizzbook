import React, { useEffect, useState } from 'react';
import {
  Loader2, Plus, Gavel, X, CheckCircle2, Trash2, FileText, Users, ClipboardList, Calendar
} from 'lucide-react';
import Modal from '../Modal';
import { api } from '../../api/client';

const TYPE_LABEL = { board: 'Board Meeting', agm: 'Annual General Meeting', egm: 'Extraordinary GM' };
const STATUS_STYLE = { scheduled: 'bg-accent/10 dark:bg-accent/15 text-accent', held: 'bg-green-50 dark:bg-green-500/10 dark:bg-green-500/10 text-green-600 dark:text-green-400 dark:text-green-400', cancelled: 'bg-panel2 dark:bg-panel2-dark text-gray-400 dark:text-slate-500' };

function MeetingForm({ linkableItems, templates, onCancel, onSaved }) {
  const [f, setF] = useState({ meeting_type: 'board', title: '', scheduled_at: '', venue: '', item_id: '', agenda: [''], attendees: [{ name: '', role: '', present: 1 }], resolutions: [] });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const inp = 'w-full border rounded-lg px-2.5 py-2 text-sm bg-panel2 dark:bg-panel2-dark';

  const save = async () => {
    if (!f.title) { alert('Title is required'); return; }
    setSaving(true);
    try {
      await api.compliance.createMeeting({
        ...f,
        item_id: f.item_id ? Number(f.item_id) : null,
        agenda: f.agenda.filter(Boolean),
        attendees: f.attendees.filter(a => a.name),
        resolutions: f.resolutions.filter(r => r.resolution_text),
      });
      onSaved();
    } catch (e) { alert('Failed: ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal isOpen title="New Meeting" onClose={onCancel} size="lg">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Type</label><select className={inp} value={f.meeting_type} onChange={e => set('meeting_type', e.target.value)}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Date & Time</label><input type="datetime-local" className={inp} value={f.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} /></div>
        </div>
        <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Title</label><input className={inp} value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Q2 Board Meeting" /></div>
        <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Venue</label><input className={inp} value={f.venue} onChange={e => set('venue', e.target.value)} /></div>
        {linkableItems.length > 0 && (
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Fulfils Obligation (optional)</label>
            <select className={inp} value={f.item_id} onChange={e => set('item_id', e.target.value)}>
              <option value="">— None —</option>
              {linkableItems.map(it => <option key={it.id} value={it.id}>{it.title}</option>)}
            </select>
          </div>
        )}

        {/* Agenda */}
        <div>
          <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Agenda</label><button onClick={() => set('agenda', [...f.agenda, ''])} className="text-[11px] font-bold text-accent">+ Item</button></div>
          {f.agenda.map((a, i) => (
            <div key={i} className="flex items-center gap-1 mb-1"><input className="border rounded-lg px-2 py-1.5 text-xs bg-panel2 dark:bg-panel2-dark flex-1" value={a} onChange={e => set('agenda', f.agenda.map((x, j) => j === i ? e.target.value : x))} placeholder={`Agenda item ${i + 1}`} /><button onClick={() => set('agenda', f.agenda.filter((_, j) => j !== i))} className="text-gray-400 dark:text-slate-500"><X size={14} /></button></div>
          ))}
        </div>

        {/* Attendees */}
        <div>
          <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Attendees</label><button onClick={() => set('attendees', [...f.attendees, { name: '', role: '', present: 1 }])} className="text-[11px] font-bold text-accent">+ Person</button></div>
          {f.attendees.map((a, i) => (
            <div key={i} className="flex items-center gap-1 mb-1">
              <input className="border rounded-lg px-2 py-1.5 text-xs bg-panel2 dark:bg-panel2-dark flex-1" value={a.name} onChange={e => set('attendees', f.attendees.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" />
              <input className="border rounded-lg px-2 py-1.5 text-xs bg-panel2 dark:bg-panel2-dark w-24" value={a.role} onChange={e => set('attendees', f.attendees.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Role" />
              <button onClick={() => set('attendees', f.attendees.map((x, j) => j === i ? { ...x, present: x.present ? 0 : 1 } : x))} className={`text-[10px] font-bold px-2 py-1.5 rounded-lg ${a.present ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-panel2 dark:bg-panel2-dark text-gray-400 dark:text-slate-500'}`}>{a.present ? 'Present' : 'Absent'}</button>
              <button onClick={() => set('attendees', f.attendees.filter((_, j) => j !== i))} className="text-gray-400 dark:text-slate-500"><X size={14} /></button>
            </div>
          ))}
        </div>

        {/* Resolutions with template shortcuts */}
        <div>
          <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Resolutions</label><button onClick={() => set('resolutions', [...f.resolutions, { resolution_text: '', resolution_type: 'ordinary', passed: 1 }])} className="text-[11px] font-bold text-accent">+ Resolution</button></div>
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">{templates.map(t => <button key={t.id} onClick={() => set('resolutions', [...f.resolutions, { resolution_text: t.text, resolution_type: t.type, passed: 1 }])} className="text-[10px] font-semibold text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark px-2 py-1 rounded-full">+ {t.title}</button>)}</div>
          )}
          {f.resolutions.map((r, i) => (
            <div key={i} className="flex items-start gap-1 mb-1">
              <textarea className="border rounded-lg px-2 py-1.5 text-xs bg-panel2 dark:bg-panel2-dark flex-1" rows={2} value={r.resolution_text} onChange={e => set('resolutions', f.resolutions.map((x, j) => j === i ? { ...x, resolution_text: e.target.value } : x))} />
              <select className="border rounded-lg px-1 py-1.5 text-xs bg-panel2 dark:bg-panel2-dark" value={r.resolution_type} onChange={e => set('resolutions', f.resolutions.map((x, j) => j === i ? { ...x, resolution_type: e.target.value } : x))}><option value="ordinary">Ordinary</option><option value="special">Special</option></select>
              <button onClick={() => set('resolutions', f.resolutions.filter((_, j) => j !== i))} className="text-gray-400 dark:text-slate-500 mt-1"><X size={14} /></button>
            </div>
          ))}
        </div>

        <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl bg-gray-900 text-inkA dark:text-inkA-dark font-bold text-sm flex justify-center items-center gap-2 disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create Meeting</button>
      </div>
    </Modal>
  );
}

function MeetingDetail({ id, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = () => { setLoading(true); api.compliance.getMeeting(id).then(setData).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [id]);

  const genMinutes = async () => { setBusy(true); try { await api.compliance.generateMinutes(id); load(); } finally { setBusy(false); } };
  const hold = async () => { setBusy(true); try { await api.compliance.holdMeeting(id, { quorum_met: 1 }); load(); onChanged && onChanged(); } finally { setBusy(false); } };
  const del = async () => { if (!confirm('Delete this meeting?')) return; await api.compliance.deleteMeeting(id); onChanged && onChanged(); onClose(); };

  const m = data?.meeting;
  return (
    <Modal isOpen title={m?.title || 'Meeting'} onClose={onClose} size="lg">
      {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={22} /></div> : !m ? <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-8">Not found.</p> : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[m.status]}`}>{m.status}</span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400">{TYPE_LABEL[m.meeting_type]}</span>
            {m.scheduled_at && <span className="text-[11px] text-inkB dark:text-inkB-dark flex items-center gap-1"><Calendar size={12} /> {new Date(m.scheduled_at).toLocaleString('en-IN')}</span>}
          </div>

          <div><p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1"><ClipboardList size={12} /> Agenda</p>
            <ol className="list-decimal pl-5 space-y-0.5 text-xs text-inkB dark:text-inkB-dark">{data.agenda.map(a => <li key={a.id}>{a.item_text}</li>)}{data.agenda.length === 0 && <p className="text-xs text-gray-400 dark:text-slate-500 list-none -ml-5">No agenda items.</p>}</ol></div>

          <div><p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1"><Users size={12} /> Attendance</p>
            <div className="flex flex-wrap gap-1.5">{data.attendees.map(a => <span key={a.id} className={`text-[11px] px-2 py-1 rounded-lg ${a.present ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-panel2 dark:bg-panel2-dark text-gray-400 dark:text-slate-500 line-through'}`}>{a.name}{a.role ? ` · ${a.role}` : ''}</span>)}{data.attendees.length === 0 && <p className="text-xs text-gray-400 dark:text-slate-500">None recorded.</p>}</div></div>

          {data.resolutions.length > 0 && (
            <div><p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1"><Gavel size={12} className="inline" /> Resolutions</p>
              <div className="space-y-1.5">{data.resolutions.map(r => <div key={r.id} className="text-xs text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark rounded-lg p-2 border border-edge dark:border-edge-dark"><span className={`text-[9px] font-bold uppercase mr-1 ${r.resolution_type === 'special' ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-slate-500'}`}>{r.resolution_type}</span>{r.resolution_text}</div>)}</div></div>
          )}

          {/* Minutes */}
          <div>
            <div className="flex items-center justify-between mb-1"><p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1"><FileText size={12} /> Minutes</p>
              <button onClick={genMinutes} disabled={busy} className="text-[11px] font-bold text-accent">{data.minutes ? 'Regenerate' : 'Auto-generate'}</button></div>
            {data.minutes ? <pre className="text-[11px] text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark rounded-lg p-3 border border-edge dark:border-edge-dark whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">{data.minutes.content}</pre> : <p className="text-xs text-gray-400 dark:text-slate-500">No minutes yet — auto-generate from the agenda, attendance and resolutions.</p>}
          </div>

          <div className="flex gap-2 pt-2 border-t border-edge dark:border-edge-dark">
            {m.status !== 'held' && <button onClick={hold} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-brand-green text-white text-xs font-bold flex items-center justify-center gap-1.5"><CheckCircle2 size={15} /> Mark Held</button>}
            <button onClick={del} className="py-2.5 px-4 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1.5"><Trash2 size={14} /> Delete</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function MeetingManager({ meetingItems = [] }) {
  const [meetings, setMeetings] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.compliance.getMeetings().catch(() => ({ meetings: [] })), api.compliance.getMeetingTemplates().catch(() => ({ templates: [] }))])
      .then(([m, t]) => { setMeetings(m.meetings || []); setTemplates(t.templates || []); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={22} /></div>;

  return (
    <div>
      <button onClick={() => setShowForm(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-900 text-inkA dark:text-inkA-dark text-sm font-bold mb-3"><Plus size={16} /> Schedule Meeting</button>
      {meetings.length === 0 ? (
        <div className="text-center py-10"><Gavel size={28} className="text-gray-200 mx-auto mb-2" /><p className="text-sm text-gray-400 dark:text-slate-500">No meetings yet. Schedule a board meeting or AGM.</p></div>
      ) : (
        <div className="space-y-2">
          {meetings.map(m => (
            <button key={m.id} onClick={() => setOpenId(m.id)} className="w-full text-left bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-xl p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-inkA dark:text-inkA-dark leading-tight">{m.title}</p>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{TYPE_LABEL[m.meeting_type]}{m.scheduled_at ? ` · ${new Date(m.scheduled_at).toLocaleDateString('en-IN')}` : ''} · {m.present_count} present · {m.resolution_count} resolutions</p>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${STATUS_STYLE[m.status]}`}>{m.status}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {showForm && <MeetingForm linkableItems={meetingItems} templates={templates} onCancel={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {openId && <MeetingDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
