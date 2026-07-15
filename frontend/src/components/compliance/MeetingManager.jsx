import React, { useEffect, useState } from 'react';
import {
  Loader2, Plus, Gavel, X, CheckCircle2, Trash2, FileText, Users, ClipboardList, Calendar
} from 'lucide-react';
import Modal from '../Modal';
import { api } from '../../api/client';

const TYPE_LABEL = { board: 'Board Meeting', agm: 'Annual General Meeting', egm: 'Extraordinary GM' };
const STATUS_STYLE = { scheduled: 'bg-brand-blueSoft text-brand-blue', held: 'bg-brand-greenSoft text-brand-green', cancelled: 'bg-gray-100 text-gray-400' };

function MeetingForm({ linkableItems, templates, onCancel, onSaved }) {
  const [f, setF] = useState({ meeting_type: 'board', title: '', scheduled_at: '', venue: '', item_id: '', agenda: [''], attendees: [{ name: '', role: '', present: 1 }], resolutions: [] });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const inp = 'w-full border rounded-lg px-2.5 py-2 text-sm bg-gray-50';

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
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Type</label><select className={inp} value={f.meeting_type} onChange={e => set('meeting_type', e.target.value)}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Date & Time</label><input type="datetime-local" className={inp} value={f.scheduled_at} onChange={e => set('scheduled_at', e.target.value)} /></div>
        </div>
        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Title</label><input className={inp} value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Q2 Board Meeting" /></div>
        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Venue</label><input className={inp} value={f.venue} onChange={e => set('venue', e.target.value)} /></div>
        {linkableItems.length > 0 && (
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Fulfils Obligation (optional)</label>
            <select className={inp} value={f.item_id} onChange={e => set('item_id', e.target.value)}>
              <option value="">— None —</option>
              {linkableItems.map(it => <option key={it.id} value={it.id}>{it.title}</option>)}
            </select>
          </div>
        )}

        {/* Agenda */}
        <div>
          <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Agenda</label><button onClick={() => set('agenda', [...f.agenda, ''])} className="text-[11px] font-bold text-brand-blue">+ Item</button></div>
          {f.agenda.map((a, i) => (
            <div key={i} className="flex items-center gap-1 mb-1"><input className="border rounded-lg px-2 py-1.5 text-xs bg-gray-50 flex-1" value={a} onChange={e => set('agenda', f.agenda.map((x, j) => j === i ? e.target.value : x))} placeholder={`Agenda item ${i + 1}`} /><button onClick={() => set('agenda', f.agenda.filter((_, j) => j !== i))} className="text-gray-400"><X size={14} /></button></div>
          ))}
        </div>

        {/* Attendees */}
        <div>
          <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Attendees</label><button onClick={() => set('attendees', [...f.attendees, { name: '', role: '', present: 1 }])} className="text-[11px] font-bold text-brand-blue">+ Person</button></div>
          {f.attendees.map((a, i) => (
            <div key={i} className="flex items-center gap-1 mb-1">
              <input className="border rounded-lg px-2 py-1.5 text-xs bg-gray-50 flex-1" value={a.name} onChange={e => set('attendees', f.attendees.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" />
              <input className="border rounded-lg px-2 py-1.5 text-xs bg-gray-50 w-24" value={a.role} onChange={e => set('attendees', f.attendees.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Role" />
              <button onClick={() => set('attendees', f.attendees.map((x, j) => j === i ? { ...x, present: x.present ? 0 : 1 } : x))} className={`text-[10px] font-bold px-2 py-1.5 rounded-lg ${a.present ? 'bg-brand-greenSoft text-brand-green' : 'bg-gray-100 text-gray-400'}`}>{a.present ? 'Present' : 'Absent'}</button>
              <button onClick={() => set('attendees', f.attendees.filter((_, j) => j !== i))} className="text-gray-400"><X size={14} /></button>
            </div>
          ))}
        </div>

        {/* Resolutions with template shortcuts */}
        <div>
          <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Resolutions</label><button onClick={() => set('resolutions', [...f.resolutions, { resolution_text: '', resolution_type: 'ordinary', passed: 1 }])} className="text-[11px] font-bold text-brand-blue">+ Resolution</button></div>
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">{templates.map(t => <button key={t.id} onClick={() => set('resolutions', [...f.resolutions, { resolution_text: t.text, resolution_type: t.type, passed: 1 }])} className="text-[10px] font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-full">+ {t.title}</button>)}</div>
          )}
          {f.resolutions.map((r, i) => (
            <div key={i} className="flex items-start gap-1 mb-1">
              <textarea className="border rounded-lg px-2 py-1.5 text-xs bg-gray-50 flex-1" rows={2} value={r.resolution_text} onChange={e => set('resolutions', f.resolutions.map((x, j) => j === i ? { ...x, resolution_text: e.target.value } : x))} />
              <select className="border rounded-lg px-1 py-1.5 text-xs bg-gray-50" value={r.resolution_type} onChange={e => set('resolutions', f.resolutions.map((x, j) => j === i ? { ...x, resolution_type: e.target.value } : x))}><option value="ordinary">Ordinary</option><option value="special">Special</option></select>
              <button onClick={() => set('resolutions', f.resolutions.filter((_, j) => j !== i))} className="text-gray-400 mt-1"><X size={14} /></button>
            </div>
          ))}
        </div>

        <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold text-sm flex justify-center items-center gap-2 disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create Meeting</button>
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
      {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" size={22} /></div> : !m ? <p className="text-sm text-gray-400 text-center py-8">Not found.</p> : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${STATUS_STYLE[m.status]}`}>{m.status}</span>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-50 text-violet-600">{TYPE_LABEL[m.meeting_type]}</span>
            {m.scheduled_at && <span className="text-[11px] text-gray-500 flex items-center gap-1"><Calendar size={12} /> {new Date(m.scheduled_at).toLocaleString('en-IN')}</span>}
          </div>

          <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1"><ClipboardList size={12} /> Agenda</p>
            <ol className="list-decimal pl-5 space-y-0.5 text-xs text-gray-700">{data.agenda.map(a => <li key={a.id}>{a.item_text}</li>)}{data.agenda.length === 0 && <p className="text-xs text-gray-400 list-none -ml-5">No agenda items.</p>}</ol></div>

          <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Users size={12} /> Attendance</p>
            <div className="flex flex-wrap gap-1.5">{data.attendees.map(a => <span key={a.id} className={`text-[11px] px-2 py-1 rounded-lg ${a.present ? 'bg-brand-greenSoft text-brand-green' : 'bg-gray-100 text-gray-400 line-through'}`}>{a.name}{a.role ? ` · ${a.role}` : ''}</span>)}{data.attendees.length === 0 && <p className="text-xs text-gray-400">None recorded.</p>}</div></div>

          {data.resolutions.length > 0 && (
            <div><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1"><Gavel size={12} className="inline" /> Resolutions</p>
              <div className="space-y-1.5">{data.resolutions.map(r => <div key={r.id} className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2 border border-gray-100"><span className={`text-[9px] font-bold uppercase mr-1 ${r.resolution_type === 'special' ? 'text-violet-600' : 'text-gray-400'}`}>{r.resolution_type}</span>{r.resolution_text}</div>)}</div></div>
          )}

          {/* Minutes */}
          <div>
            <div className="flex items-center justify-between mb-1"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1"><FileText size={12} /> Minutes</p>
              <button onClick={genMinutes} disabled={busy} className="text-[11px] font-bold text-brand-blue">{data.minutes ? 'Regenerate' : 'Auto-generate'}</button></div>
            {data.minutes ? <pre className="text-[11px] text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">{data.minutes.content}</pre> : <p className="text-xs text-gray-400">No minutes yet — auto-generate from the agenda, attendance and resolutions.</p>}
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            {m.status !== 'held' && <button onClick={hold} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-brand-green text-white text-xs font-bold flex items-center justify-center gap-1.5"><CheckCircle2 size={15} /> Mark Held</button>}
            <button onClick={del} className="py-2.5 px-4 rounded-xl bg-brand-redSoft text-brand-red text-xs font-bold flex items-center gap-1.5"><Trash2 size={14} /> Delete</button>
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

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" size={22} /></div>;

  return (
    <div>
      <button onClick={() => setShowForm(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-900 text-white text-sm font-bold mb-3"><Plus size={16} /> Schedule Meeting</button>
      {meetings.length === 0 ? (
        <div className="text-center py-10"><Gavel size={28} className="text-gray-200 mx-auto mb-2" /><p className="text-sm text-gray-400">No meetings yet. Schedule a board meeting or AGM.</p></div>
      ) : (
        <div className="space-y-2">
          {meetings.map(m => (
            <button key={m.id} onClick={() => setOpenId(m.id)} className="w-full text-left bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{m.title}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{TYPE_LABEL[m.meeting_type]}{m.scheduled_at ? ` · ${new Date(m.scheduled_at).toLocaleDateString('en-IN')}` : ''} · {m.present_count} present · {m.resolution_count} resolutions</p>
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
