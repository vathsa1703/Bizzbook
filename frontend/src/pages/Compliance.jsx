import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, Clock, RefreshCw, Sparkles,
  Landmark, FileText, BadgeCheck, Users, Gavel, Settings, FolderLock, Send, ChevronRight,
  Loader2, FileWarning, CalendarDays, Download, Activity
} from 'lucide-react';
import SectionCard from '../components/SectionCard';
import ItemDrawer from '../components/compliance/ItemDrawer';
import AdminRules from '../components/compliance/AdminRules';
import MeetingManager from '../components/compliance/MeetingManager';
import CalendarGrid from '../components/compliance/CalendarGrid';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const ENTITY_TYPES = ['Sole Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'OPC', 'Public Limited', 'NGO / Trust', 'Cooperative'];
const INDUSTRIES = ['Retail', 'Restaurant', 'Manufacturing', 'Pharmacy', 'Healthcare', 'Construction', 'IT Services', 'Ecommerce', 'Freelancer', 'Education', 'Logistics', 'Wholesale', 'Services'];
const TOGGLES = [
  { key: 'gst_registered', label: 'GST Registered' },
  { key: 'fssai_required', label: 'Handles Food (FSSAI)' },
  { key: 'drug_license', label: 'Sells Medicines' },
  { key: 'has_factory', label: 'Has a Factory' },
  { key: 'import_export', label: 'Import / Export' },
  { key: 'multiple_branches', label: 'Multiple Branches' },
  { key: 'msme', label: 'MSME' },
  { key: 'startup_registered', label: 'Startup Registered' },
];
const CAT_ICON = { tax: Landmark, filings: FileText, licenses: BadgeCheck, renewals: RefreshCw, employee: Users, meetings: Gavel, operational: Settings, documents: FolderLock };
const REPORTS = [
  { type: 'summary', label: 'Compliance Summary' },
  { type: 'licenses', label: 'License Report' },
  { type: 'documents', label: 'Document Report' },
  { type: 'renewals', label: 'Renewal Report' },
  { type: 'deadlines', label: 'Upcoming Deadlines' },
  { type: 'audit', label: 'Audit Report' },
];

function scoreColor(s) {
  if (s >= 85) return { text: 'text-green-600 dark:text-green-400 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-500/10 dark:bg-green-500/10', ring: '#16A34A' };
  if (s >= 60) return { text: 'text-amber-600 dark:text-amber-400 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10 dark:bg-amber-500/10', ring: '#D97706' };
  return { text: 'text-red-600 dark:text-red-400 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-500/10 dark:bg-red-500/10', ring: '#DC2626' };
}
const PRIORITY = { critical: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400', high: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400', medium: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400', low: 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark' };

function blobDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.setAttribute('download', filename);
  document.body.appendChild(a); a.click(); a.parentNode.removeChild(a); window.URL.revokeObjectURL(url);
}

function ScoreRing({ score }) {
  const c = scoreColor(score);
  const R = 52, circ = 2 * Math.PI * R;
  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#F1F5F9" strokeWidth="10" />
        <circle cx="60" cy="60" r={R} fill="none" stroke={c.ring} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (score / 100) * circ} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-black ${c.text}`}>{score}%</span>
        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider">Compliant</span>
      </div>
    </div>
  );
}

function ProfileForm({ initial, onSaved }) {
  const [form, setForm] = useState({ state: '', entity_type: 'Private Limited', industry: 'Retail', annual_turnover: 0, employee_count: 0, ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    setSaving(true);
    try { await api.compliance.saveProfile(form); onSaved(); }
    catch (e) { alert('Failed to save: ' + e.message); }
    finally { setSaving(false); }
  };
  return (
    <SectionCard>
      <div className="flex items-center gap-2 mb-4"><Sparkles size={18} className="text-violet-600 dark:text-violet-400" /><h3 className="font-bold text-inkA dark:text-inkA-dark">Tell us about your business</h3></div>
      <p className="text-xs text-inkB dark:text-inkB-dark mb-4 leading-relaxed">We'll work out every licence, filing and renewal that applies to you — automatically.</p>
      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">Business Type</label>
      <select value={form.entity_type} onChange={e => set('entity_type', e.target.value)} className="w-full border rounded-xl px-3 py-2.5 text-sm mb-3 bg-panel2 dark:bg-panel2-dark">{ENTITY_TYPES.map(t => <option key={t}>{t}</option>)}</select>
      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">Industry</label>
      <select value={form.industry} onChange={e => set('industry', e.target.value)} className="w-full border rounded-xl px-3 py-2.5 text-sm mb-3 bg-panel2 dark:bg-panel2-dark">{INDUSTRIES.map(t => <option key={t}>{t}</option>)}</select>
      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">State</label>
      <input value={form.state || ''} onChange={e => set('state', e.target.value)} placeholder="e.g. Karnataka" className="w-full border rounded-xl px-3 py-2.5 text-sm mb-3 bg-panel2 dark:bg-panel2-dark" />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">Annual Turnover (₹)</label><input type="number" value={form.annual_turnover} onChange={e => set('annual_turnover', Number(e.target.value))} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-panel2 dark:bg-panel2-dark" /></div>
        <div><label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1"># Employees</label><input type="number" value={form.employee_count} onChange={e => set('employee_count', Number(e.target.value))} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-panel2 dark:bg-panel2-dark" /></div>
      </div>
      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">Applicable to you</label>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {TOGGLES.map(({ key, label }) => {
          const on = !!form[key];
          return (
            <button key={key} onClick={() => set(key, on ? 0 : 1)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold text-left transition-colors ${on ? 'bg-accent/10 dark:bg-accent/15 border-accent text-accent' : 'bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkB dark:text-inkB-dark'}`}>
              <span className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 ${on ? 'bg-accent' : 'bg-gray-300'}`}>{on && <CheckCircle2 size={12} className="text-white" />}</span>{label}
            </button>
          );
        })}
      </div>
      <button onClick={submit} disabled={saving} className="w-full py-3.5 rounded-xl bg-gray-900 text-white font-bold text-sm flex justify-center items-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform">
        {saving ? <><Loader2 size={18} className="animate-spin" /> Analysing…</> : <><ShieldCheck size={18} /> Generate My Compliance Plan</>}
      </button>
    </SectionCard>
  );
}

function DeadlineRow({ d, onOpen, onDone }) {
  const overdue = d.daysRemaining < 0;
  const soon = d.daysRemaining >= 0 && d.daysRemaining <= 7;
  const badge = overdue ? 'bg-red-50 dark:bg-red-500/10 dark:bg-red-500/10 text-red-600 dark:text-red-400 dark:text-red-400' : soon ? 'bg-amber-50 dark:bg-amber-500/10 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:text-amber-400' : 'bg-green-50 dark:bg-green-500/10 dark:bg-green-500/10 text-green-600 dark:text-green-400 dark:text-green-400';
  const label = overdue ? `${Math.abs(d.daysRemaining)}d overdue` : d.daysRemaining === 0 ? 'Due today' : `${d.daysRemaining}d left`;
  return (
    <div className="flex items-center gap-3 py-3 border-b border-edge dark:border-edge-dark last:border-0">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${overdue ? 'bg-brand-red' : soon ? 'bg-brand-amber' : 'bg-brand-green'}`} />
      <button onClick={() => onOpen(d.id)} className="min-w-0 flex-1 text-left">
        <p className="text-sm font-semibold text-inkA dark:text-inkA-dark leading-tight truncate">{d.title}</p>
        <p className="text-[11px] text-gray-400 dark:text-slate-500 capitalize">{d.frequency} · {d.next_due_date}</p>
      </button>
      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${badge}`}>{label}</span>
      {onDone && <button onClick={() => onDone(d.id)} title="Mark done" className="text-gray-300 dark:text-slate-600 hover:text-brand-green"><CheckCircle2 size={20} /></button>}
    </div>
  );
}

function Copilot() {
  const [q, setQ] = useState(''); const [log, setLog] = useState([]); const [busy, setBusy] = useState(false);
  const suggestions = ['What should I do this month?', 'What documents are missing?', 'What expires next?', 'How do I renew my FSSAI?', 'What happens if I miss GST?', 'Which laws apply to me?'];
  const ask = async (question) => {
    if (!question.trim() || busy) return;
    setLog(l => [...l, { role: 'user', text: question }]); setQ(''); setBusy(true);
    try { const res = await api.compliance.copilot(question); setLog(l => [...l, { role: 'ai', text: res.answer }]); }
    catch { setLog(l => [...l, { role: 'ai', text: 'Sorry, I could not answer that right now.' }]); }
    finally { setBusy(false); }
  };
  return (
    <SectionCard>
      <div className="flex items-center gap-2 mb-3"><div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center"><span className="text-white text-[10px] font-bold">AI</span></div><p className="text-sm font-bold text-inkA dark:text-inkA-dark">Compliance Copilot</p></div>
      <div className="space-y-2 mb-3 max-h-80 overflow-y-auto">
        {log.length === 0 && <div className="flex flex-wrap gap-2">{suggestions.map(s => <button key={s} onClick={() => ask(s)} className="text-[11px] font-semibold text-accent bg-accent/10 dark:bg-accent/15 px-3 py-1.5 rounded-full active:scale-95">{s}</button>)}</div>}
        {log.map((m, i) => <div key={i} className={`text-sm leading-relaxed p-3 rounded-xl ${m.role === 'user' ? 'bg-gray-900 text-white ml-8' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark mr-4'}`}>{m.text}</div>)}
        {busy && <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 text-xs"><Loader2 size={14} className="animate-spin" /> thinking…</div>}
      </div>
      <div className="flex items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask(q)} placeholder="Ask about your compliance…" className="flex-1 border rounded-xl px-3 py-2.5 text-sm bg-panel2 dark:bg-panel2-dark" />
        <button onClick={() => ask(q)} disabled={busy} className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center disabled:opacity-60"><Send size={16} /></button>
      </div>
    </SectionCard>
  );
}

const ACTIVITY_LABEL = { recomputed: 'Plan recomputed', status_changed: 'Status updated', document_uploaded: 'Document uploaded', document_deleted: 'Document removed', document_verified: 'Document verified', reminder_sent: 'Reminder sent' };

export default function Compliance() {
  const { user } = useAuth();
  const isAdmin = !user || ['admin', 'OWNER', 'MANAGER'].includes(user.role);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [openItem, setOpenItem] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.compliance.getProfile().catch(() => ({ profile: null })),
      api.compliance.getOverview().catch(() => null),
      api.compliance.getItems().catch(() => ({ items: [] })),
    ]).then(([p, ov, it]) => {
      setProfile(p?.profile || null); setOverview(ov); setItems(it?.items || []); setLoading(false);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const markDone = async (id) => { try { await api.compliance.updateItem(id, { status: 'completed' }); load(); } catch { /* */ } };
  const dlReport = async (type, format) => {
    try { const b = await api.compliance.downloadReport(type, format); blobDownload(b, `compliance_${type}.${format}`); }
    catch { alert('Report generation failed'); }
  };

  const configured = overview?.profileConfigured;
  const licenses = items.filter(it => it.category_key === 'licenses' || it.category_key === 'renewals');
  const meetingItems = items.filter(it => it.category_key === 'meetings');

  const TABS = [
    { id: 'overview', label: 'Dashboard' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'licenses', label: 'Licenses' },
    ...(meetingItems.length > 0 ? [{ id: 'meetings', label: 'Meetings' }] : []),
    { id: 'reports', label: 'Reports' },
    ...(isAdmin ? [{ id: 'admin', label: 'Rules' }] : []),
    { id: 'copilot', label: 'AI Copilot' },
  ];

  return (
    <div className="pb-24">
      <div className="bg-panel dark:bg-panel-dark px-5 pt-12 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md"><ShieldCheck size={20} className="text-white" /></div>
          <div><h1 className="text-xl font-black text-inkA dark:text-inkA-dark leading-tight">Compliance</h1><p className="text-xs text-inkB dark:text-inkB-dark font-medium mt-0.5">Your legal auto-pilot</p></div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={26} /></div>
      ) : !configured ? (
        <div className="px-4 py-4"><ProfileForm initial={profile} onSaved={load} /></div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar px-4 py-3 bg-panel dark:bg-panel-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
            {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`whitespace-nowrap px-4 py-2 rounded-full text-[11px] font-bold transition-all ${tab === t.id ? 'bg-gray-900 text-white shadow-md' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark'}`}>{t.label}</button>)}
          </div>

          <div className="px-4 py-4 space-y-4">
            {/* ── DASHBOARD ── */}
            {tab === 'overview' && overview && (
              <>
                <SectionCard>
                  <div className="flex items-center gap-5">
                    <ScoreRing score={overview.overallScore} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-inkA dark:text-inkA-dark mb-2">Compliance Score</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-green-50 dark:bg-green-500/10 dark:bg-green-500/10 rounded-xl py-2"><p className="text-lg font-black text-green-600 dark:text-green-400 dark:text-green-400">{overview.counts.completed}</p><p className="text-[9px] text-inkB dark:text-inkB-dark font-bold uppercase">Done</p></div>
                        <div className="bg-amber-50 dark:bg-amber-500/10 dark:bg-amber-500/10 rounded-xl py-2"><p className="text-lg font-black text-amber-600 dark:text-amber-400 dark:text-amber-400">{overview.counts.dueSoon}</p><p className="text-[9px] text-inkB dark:text-inkB-dark font-bold uppercase">Due Soon</p></div>
                        <div className="bg-red-50 dark:bg-red-500/10 dark:bg-red-500/10 rounded-xl py-2"><p className="text-lg font-black text-red-600 dark:text-red-400 dark:text-red-400">{overview.counts.overdue}</p><p className="text-[9px] text-inkB dark:text-inkB-dark font-bold uppercase">Overdue</p></div>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                {/* Alert cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark shadow-sm p-3">
                    <div className="flex items-center gap-2 mb-1"><FileWarning size={16} className="text-amber-600 dark:text-amber-400 dark:text-amber-400" /><span className="text-lg font-black text-inkA dark:text-inkA-dark">{overview.counts.missingDocuments}</span></div>
                    <p className="text-xs font-bold text-inkB dark:text-inkB-dark">Missing Documents</p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500">items need proof uploaded</p>
                  </div>
                  <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark shadow-sm p-3">
                    <div className="flex items-center gap-2 mb-1"><BadgeCheck size={16} className="text-red-600 dark:text-red-400 dark:text-red-400" /><span className="text-lg font-black text-inkA dark:text-inkA-dark">{overview.licensesExpiringSoon.length}</span></div>
                    <p className="text-xs font-bold text-inkB dark:text-inkB-dark">Licenses Expiring</p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500">within 30 days</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-inkB dark:text-inkB-dark tracking-widest uppercase mb-3">Breakdown</p>
                  <div className="grid grid-cols-2 gap-3">
                    {overview.breakdown.map(b => {
                      const Icon = CAT_ICON[b.key] || FileText; const c = scoreColor(b.score);
                      return (
                        <div key={b.key} className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark shadow-sm p-3">
                          <div className="flex items-center justify-between mb-2"><div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}><Icon size={16} className={c.text} /></div><span className={`text-lg font-black ${c.text}`}>{b.score}%</span></div>
                          <p className="text-xs font-bold text-inkA dark:text-inkA-dark leading-tight">{b.name}</p>
                          <p className="text-[10px] text-gray-400 dark:text-slate-500">{b.total} item{b.total > 1 ? 's' : ''}{b.overdue ? ` · ${b.overdue} overdue` : ''}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <SectionCard>
                  <p className="text-sm font-bold text-inkA dark:text-inkA-dark mb-1">Upcoming Deadlines</p>
                  {overview.deadlines.length === 0 ? <p className="text-sm text-gray-400 dark:text-slate-500 py-4 text-center">Nothing due in the next 60 days 🎉</p>
                    : overview.deadlines.slice(0, 6).map(d => <DeadlineRow key={d.id} d={d} onOpen={setOpenItem} onDone={markDone} />)}
                </SectionCard>

                {overview.recentActivity?.length > 0 && (
                  <SectionCard>
                    <p className="text-sm font-bold text-inkA dark:text-inkA-dark mb-2 flex items-center gap-1.5"><Activity size={15} className="text-gray-400 dark:text-slate-500" /> Recent Activity</p>
                    {overview.recentActivity.map((a, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 text-xs border-b border-edge dark:border-edge-dark last:border-0">
                        <span className="text-inkB dark:text-inkB-dark">{ACTIVITY_LABEL[a.event_type] || a.event_type}{a.title ? ` · ${a.title}` : ''}</span>
                        <span className="text-[10px] text-gray-400 dark:text-slate-500">{(a.created_at || '').slice(0, 10)}</span>
                      </div>
                    ))}
                  </SectionCard>
                )}
              </>
            )}

            {/* ── CALENDAR (month / week grid) ── */}
            {tab === 'calendar' && <CalendarGrid items={items} onOpen={setOpenItem} />}

            {/* ── MEETINGS ── */}
            {tab === 'meetings' && <MeetingManager meetingItems={meetingItems} />}

            {/* ── LICENSE CENTER ── */}
            {tab === 'licenses' && (
              <SectionCard>
                <p className="text-sm font-bold text-inkA dark:text-inkA-dark mb-1">Licenses & Renewals</p>
                {licenses.length === 0 ? <p className="text-sm text-gray-400 dark:text-slate-500 py-6 text-center">No licences apply to your business.</p>
                  : licenses.map(it => {
                    const dr = it.daysRemaining;
                    const dot = dr == null ? 'bg-gray-300' : dr < 0 ? 'bg-brand-red' : dr <= 30 ? 'bg-brand-amber' : 'bg-brand-green';
                    return (
                      <button key={it.id} onClick={() => setOpenItem(it.id)} className="w-full text-left py-3 border-b border-edge dark:border-edge-dark last:border-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${dot}`} />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-inkA dark:text-inkA-dark leading-tight">{it.title}</p>
                              <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{it.department}</p>
                              <p className="text-[10px] text-inkB dark:text-inkB-dark mt-0.5">{it.uploaded_docs || 0}/{it.required_docs || 0} docs{it.next_due_date ? ` · next ${it.next_due_date}` : ''}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full capitalize ${PRIORITY[it.priority] || PRIORITY.medium}`}>{it.priority}</span>
                            {dr != null && <span className={`text-[10px] font-bold ${dr < 0 ? 'text-red-600 dark:text-red-400 dark:text-red-400' : dr <= 30 ? 'text-amber-600 dark:text-amber-400 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'}`}>{dr < 0 ? `${Math.abs(dr)}d overdue` : `${dr}d`}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </SectionCard>
            )}

            {/* ── REPORTS ── */}
            {tab === 'reports' && (
              <SectionCard>
                <p className="text-sm font-bold text-inkA dark:text-inkA-dark mb-1">Download Reports</p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">Export your compliance data as CSV or JSON.</p>
                {REPORTS.map(r => (
                  <div key={r.type} className="flex items-center justify-between py-2.5 border-b border-edge dark:border-edge-dark last:border-0">
                    <span className="text-sm font-semibold text-inkA dark:text-inkA-dark">{r.label}</span>
                    <div className="flex gap-2">
                      <button onClick={() => dlReport(r.type, 'pdf')} className="flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400 dark:text-red-400 bg-red-50 dark:bg-red-500/10 dark:bg-red-500/10 px-2.5 py-1.5 rounded-lg"><Download size={13} /> PDF</button>
                      <button onClick={() => dlReport(r.type, 'csv')} className="flex items-center gap-1 text-[11px] font-bold text-accent bg-accent/10 dark:bg-accent/15 px-2.5 py-1.5 rounded-lg"><Download size={13} /> CSV</button>
                      <button onClick={() => dlReport(r.type, 'json')} className="flex items-center gap-1 text-[11px] font-bold text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark px-2.5 py-1.5 rounded-lg"><Download size={13} /> JSON</button>
                    </div>
                  </div>
                ))}
              </SectionCard>
            )}

            {/* ── ADMIN RULES ── */}
            {tab === 'admin' && isAdmin && <AdminRules />}

            {/* ── COPILOT ── */}
            {tab === 'copilot' && <Copilot />}

            <button onClick={() => api.compliance.recompute().then(load)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark text-xs font-bold border border-edge dark:border-edge-dark active:bg-panel2 dark:active:bg-panel2-dark">
              <RefreshCw size={14} /> Re-check my compliance
            </button>
          </div>
        </>
      )}

      {openItem && <ItemDrawer itemId={openItem} onClose={() => setOpenItem(null)} onChanged={load} />}
    </div>
  );
}
