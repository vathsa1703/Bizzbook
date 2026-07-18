// ============================================================================
// Trade Tab — Import & Export Intelligence, lives inside Growth Hub.
// Mirrors pages/Compliance.jsx's structure (same backend pattern: profile →
// materialized requirements → document vault → copilot → admin rule mgmt),
// using GrowthHub's shared design primitives since this tab lives here.
// ============================================================================
import React, { useCallback, useEffect, useState } from 'react';
import {
  Ship, Loader2, Sparkles, CheckCircle2, Send, RefreshCw, FileWarning,
  BadgeCheck, Globe, FileText, Activity, ExternalLink, ChevronDown,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { StatCard, SectionCard, Badge, EmptyState } from './shared';
import RequirementDrawer from '../../components/trade/RequirementDrawer';
import AdminGuidelines from '../../components/trade/AdminGuidelines';

const ADMIN_ROLES = ['admin', 'OWNER', 'MANAGER'];
const ENTITY_TYPES = ['Sole Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'OPC', 'Public Limited', 'NGO / Trust', 'Cooperative'];
const INDUSTRIES = ['Retail', 'Restaurant', 'Manufacturing', 'Pharmacy', 'Healthcare', 'Construction', 'IT Services', 'Ecommerce', 'Freelancer', 'Education', 'Logistics', 'Wholesale', 'Services'];
const TRADE_TOGGLES = [
  { key: 'import_enabled', label: 'I Import Goods' },
  { key: 'export_enabled', label: 'I Export Goods' },
  { key: 'is_manufacturer', label: 'Manufacturer' },
  { key: 'is_trader', label: 'Trader / Reseller' },
  { key: 'is_service_provider', label: 'Service Provider' },
];

function TradeProfileForm({ initial, onSaved }) {
  const [form, setForm] = useState({ entity_type: 'Private Limited', industry: 'Retail', state: '', annual_turnover: 0, employee_count: 0, import_enabled: 0, export_enabled: 0, is_manufacturer: 0, is_trader: 0, is_service_provider: 0, iec_number: '', ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    setSaving(true);
    try { await api.trade.saveProfile(form); onSaved(); }
    catch (e) { alert('Failed to save: ' + e.message); }
    finally { setSaving(false); }
  };
  return (
    <SectionCard>
      <div className="flex items-center gap-2 mb-4"><Sparkles size={18} className="text-violet-600 dark:text-violet-400" /><h3 className="font-bold text-inkA dark:text-inkA-dark">Tell us about your import/export business</h3></div>
      <p className="text-xs text-inkB dark:text-inkB-dark mb-4 leading-relaxed">We'll work out every registration, licence and filing that applies to your cross-border trade — automatically.</p>
      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">Business Type</label>
      <select value={form.entity_type} onChange={e => set('entity_type', e.target.value)} className="w-full border rounded-xl px-3 py-2.5 text-sm mb-3 bg-panel2 dark:bg-panel2-dark">{ENTITY_TYPES.map(t => <option key={t}>{t}</option>)}</select>
      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">Industry</label>
      <select value={form.industry} onChange={e => set('industry', e.target.value)} className="w-full border rounded-xl px-3 py-2.5 text-sm mb-3 bg-panel2 dark:bg-panel2-dark">{INDUSTRIES.map(t => <option key={t}>{t}</option>)}</select>
      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">State</label>
      <input value={form.state || ''} onChange={e => set('state', e.target.value)} placeholder="e.g. Karnataka" className="w-full border rounded-xl px-3 py-2.5 text-sm mb-3 bg-panel2 dark:bg-panel2-dark" />
      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">Trade Profile</label>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {TRADE_TOGGLES.map(({ key, label }) => {
          const on = !!form[key];
          return (
            <button key={key} onClick={() => set(key, on ? 0 : 1)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold text-left transition-colors ${on ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-400 text-indigo-700 dark:text-indigo-400' : 'bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark text-inkB dark:text-inkB-dark'}`}>
              <span className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 ${on ? 'bg-indigo-600' : 'bg-gray-300'}`}>{on && <CheckCircle2 size={12} className="text-white" />}</span>{label}
            </button>
          );
        })}
      </div>
      <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">IEC Number (if already registered)</label>
      <input value={form.iec_number || ''} onChange={e => set('iec_number', e.target.value)} placeholder="10-digit Import Export Code" className="w-full border rounded-xl px-3 py-2.5 text-sm mb-5 bg-panel2 dark:bg-panel2-dark" />
      <button onClick={submit} disabled={saving} className="w-full py-3.5 rounded-xl bg-gray-900 text-white font-bold text-sm flex justify-center items-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform">
        {saving ? <><Loader2 size={18} className="animate-spin" /> Analysing…</> : <><Ship size={18} /> Generate My Trade Plan</>}
      </button>
    </SectionCard>
  );
}

function GuidelineList({ category }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    setLoading(true);
    api.trade.getGuidelines({ category }).then(r => setRows(r.guidelines || [])).finally(() => setLoading(false));
  }, [category]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={22} /></div>;
  if (!rows.length) return <EmptyState icon={category === 'import' ? FileWarning : Globe} title="No guidelines yet" sub={`No ${category} guidelines are published for your country yet.`} />;

  return (
    <div className="space-y-2">
      {rows.map(g => {
        const open = openId === g.id;
        return (
          <SectionCard key={g.id} className="!p-0 overflow-hidden">
            <button onClick={() => setOpenId(open ? null : g.id)} className="w-full text-left p-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-inkA dark:text-inkA-dark leading-tight">{g.title}</p>
                <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{g.department}{g.frequency ? ` · ${g.frequency}` : ''}</p>
              </div>
              <ChevronDown size={16} className={`text-gray-400 dark:text-slate-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <div className="px-3 pb-3 text-xs text-inkB dark:text-inkB-dark space-y-2 border-t border-edge dark:border-edge-dark pt-2">
                {g.description && <p>{g.description}</p>}
                {g.ai_explanation && <p className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/25 rounded-lg p-2 text-violet-900">{g.ai_explanation}</p>}
                <div className="flex flex-wrap gap-3 text-[11px] text-inkB dark:text-inkB-dark">
                  {g.fees && <span>Fees: {g.fees}</span>}
                  {g.processing_time && <span>Time: {g.processing_time}</span>}
                </div>
                {g.penalty_info && <p className="text-red-600 dark:text-red-400">{g.penalty_info}</p>}
                {g.faq && g.faq.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {g.faq.map((f, i) => <div key={i}><p className="font-semibold text-inkB dark:text-inkB-dark">{f.q}</p><p className="text-inkB dark:text-inkB-dark">{f.a}</p></div>)}
                  </div>
                )}
                {g.official_website && <a href={g.official_website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-full">Official Website <ExternalLink size={11} /></a>}
              </div>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

function RequirementsList({ onOpen, reloadKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState('');
  useEffect(() => {
    setLoading(true);
    api.trade.getRequirements(catFilter ? { category: catFilter } : {}).then(r => setRows(r.requirements || [])).finally(() => setLoading(false));
  }, [catFilter, reloadKey]);

  const CATS = ['registration', 'import', 'export', 'licensing'];
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-3">
        <button onClick={() => setCatFilter('')} className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${!catFilter ? 'bg-gray-900 text-white' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark'}`}>All</button>
        {CATS.map(c => <button key={c} onClick={() => setCatFilter(c)} className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap capitalize ${catFilter === c ? 'bg-gray-900 text-white' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark'}`}>{c}</button>)}
      </div>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={22} /></div>
        : !rows.length ? <EmptyState icon={Ship} title="No requirements" sub="No trade obligations apply yet — complete your trade profile above." />
        : (
          <SectionCard>
            {rows.map(it => {
              const dr = it.daysRemaining;
              const dot = it.status === 'completed' ? 'bg-emerald-500' : dr == null ? 'bg-gray-300' : dr < 0 ? 'bg-red-500' : dr <= 30 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <button key={it.id} onClick={() => onOpen(it.id)} className="w-full text-left py-3 border-b border-edge dark:border-edge-dark last:border-0">
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
                      <Badge color={it.status === 'completed' ? 'green' : it.status === 'overdue' ? 'red' : 'amber'}>{it.status}</Badge>
                      {dr != null && it.status !== 'completed' && <span className={`text-[10px] font-bold ${dr < 0 ? 'text-red-600 dark:text-red-400' : dr <= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'}`}>{dr < 0 ? `${Math.abs(dr)}d overdue` : `${dr}d`}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </SectionCard>
        )}
    </div>
  );
}

function DocumentsList({ onOpen, reloadKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.trade.getRequirements({}).then(r => setRows((r.requirements || []).filter(it => (it.required_docs || 0) > 0))).finally(() => setLoading(false));
  }, [reloadKey]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={22} /></div>;
  if (!rows.length) return <EmptyState icon={FileText} title="No documents required" sub="None of your applicable trade items need supporting documents." />;

  return (
    <SectionCard>
      <p className="text-sm font-bold text-inkA dark:text-inkA-dark mb-1">Document Checklist</p>
      {rows.map(it => {
        const missing = it.missingDocs || 0;
        return (
          <button key={it.id} onClick={() => onOpen(it.id)} className="w-full text-left flex items-center justify-between gap-2 py-3 border-b border-edge dark:border-edge-dark last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-inkA dark:text-inkA-dark leading-tight">{it.title}</p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{it.uploaded_docs || 0}/{it.required_docs} uploaded{it.expired_docs ? ` · ${it.expired_docs} expired` : ''}</p>
            </div>
            <Badge color={missing > 0 ? 'amber' : 'green'}>{missing > 0 ? `${missing} missing` : 'complete'}</Badge>
          </button>
        );
      })}
    </SectionCard>
  );
}

function Copilot() {
  const [q, setQ] = useState(''); const [log, setLog] = useState([]); const [busy, setBusy] = useState(false);
  const suggestions = ['What licenses do I need?', 'What documents are missing?', 'How do I renew my IEC?', 'What do I need to export to USA?', 'What happens if I miss LUT filing?', 'Which laws apply to me?'];
  const ask = async (question) => {
    if (!question.trim() || busy) return;
    setLog(l => [...l, { role: 'user', text: question }]); setQ(''); setBusy(true);
    try { const res = await api.trade.copilot(question); setLog(l => [...l, { role: 'ai', text: res.answer }]); }
    catch { setLog(l => [...l, { role: 'ai', text: 'Sorry, I could not answer that right now.' }]); }
    finally { setBusy(false); }
  };
  return (
    <SectionCard>
      <div className="flex items-center gap-2 mb-3"><div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center"><span className="text-white text-[10px] font-bold">AI</span></div><p className="text-sm font-bold text-inkA dark:text-inkA-dark">Trade Copilot</p></div>
      <div className="space-y-2 mb-3 max-h-80 overflow-y-auto">
        {log.length === 0 && <div className="flex flex-wrap gap-2">{suggestions.map(s => <button key={s} onClick={() => ask(s)} className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 rounded-full active:scale-95">{s}</button>)}</div>}
        {log.map((m, i) => <div key={i} className={`text-sm leading-relaxed p-3 rounded-xl ${m.role === 'user' ? 'bg-gray-900 text-white ml-8' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark mr-4'}`}>{m.text}</div>)}
        {busy && <div className="flex items-center gap-2 text-gray-400 dark:text-slate-500 text-xs"><Loader2 size={14} className="animate-spin" /> thinking…</div>}
      </div>
      <div className="flex items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask(q)} placeholder="Ask about import/export…" className="flex-1 border rounded-xl px-3 py-2.5 text-sm bg-panel2 dark:bg-panel2-dark" />
        <button onClick={() => ask(q)} disabled={busy} className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center disabled:opacity-60"><Send size={16} /></button>
      </div>
    </SectionCard>
  );
}

const ACTIVITY_LABEL = { recomputed: 'Plan recomputed', status_changed: 'Status updated', document_uploaded: 'Document uploaded', document_deleted: 'Document removed', document_verified: 'Document verified' };

export default function TradeTab() {
  const { user } = useAuth();
  const isAdmin = !user || ADMIN_ROLES.includes(user.role);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [profile, setProfile] = useState(null);
  const [openReq, setOpenReq] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.trade.getProfile().catch(() => ({ profile: null })),
      api.trade.getOverview().catch(() => null),
    ]).then(([p, ov]) => { setProfile(p?.profile || null); setOverview(ov); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const configured = overview?.profileConfigured;
  const bump = () => setReloadKey(k => k + 1);

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'import', label: 'Import Guidelines' },
    { id: 'export', label: 'Export Guidelines' },
    { id: 'requirements', label: 'Requirements' },
    { id: 'documents', label: 'Documents' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
    { id: 'copilot', label: 'AI Copilot' },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md"><Ship size={20} className="text-white" /></div>
        <div><h2 className="text-lg font-black text-inkA dark:text-inkA-dark leading-tight">Import & Export</h2><p className="text-xs text-inkB dark:text-inkB-dark font-medium mt-0.5">Trade readiness, guidelines & filings</p></div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={26} /></div>
      ) : !configured ? (
        <TradeProfileForm initial={profile} onSaved={load} />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-3 mb-1 -mx-1 px-1">
            {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} className={`whitespace-nowrap px-4 py-2 rounded-full text-[11px] font-bold transition-all ${tab === t.id ? 'bg-gray-900 text-white shadow-md' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark'}`}>{t.label}</button>)}
          </div>

          <div className="space-y-4">
            {/* ── OVERVIEW (Dashboard + Readiness) ── */}
            {tab === 'overview' && overview && (
              <>
                <SectionCard>
                  <div className="grid grid-cols-3 gap-3 text-center mb-4">
                    <div><div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{overview.importReady}%</div><p className="text-[10px] text-inkB dark:text-inkB-dark font-bold uppercase mt-0.5">Import Ready</p></div>
                    <div><div className="text-2xl font-black text-blue-600 dark:text-blue-400">{overview.exportReady}%</div><p className="text-[10px] text-inkB dark:text-inkB-dark font-bold uppercase mt-0.5">Export Ready</p></div>
                    <div><div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{overview.overallScore}%</div><p className="text-[10px] text-inkB dark:text-inkB-dark font-bold uppercase mt-0.5">Overall</p></div>
                  </div>
                  <div className="flex items-center justify-between bg-panel2 dark:bg-panel2-dark rounded-xl p-3">
                    <div className="flex items-center gap-2"><BadgeCheck size={16} className={overview.iec.registered ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'} /><span className="text-xs font-semibold text-inkB dark:text-inkB-dark">IEC {overview.iec.registered ? `Registered (${overview.iec.iec_number})` : overview.iec.applicable ? 'Required — not yet registered' : 'Not applicable'}</span></div>
                  </div>
                </SectionCard>

                <div className="grid grid-cols-3 gap-3">
                  <StatCard icon={FileWarning} label="Missing Regs" value={overview.missingRegistrations} color="amber" />
                  <StatCard icon={FileText} label="Missing Docs" value={overview.missingDocuments} color="rose" />
                  <StatCard icon={RefreshCw} label="Pending" value={overview.pendingApplications} color="indigo" />
                </div>

                <SectionCard>
                  <p className="text-sm font-bold text-inkA dark:text-inkA-dark mb-1">Upcoming Renewals</p>
                  {overview.upcomingRenewals.length === 0 ? <p className="text-sm text-gray-400 dark:text-slate-500 py-4 text-center">Nothing due in the next 60 days 🎉</p>
                    : overview.upcomingRenewals.slice(0, 6).map(d => (
                      <div key={d.id} className="flex items-center justify-between py-2.5 border-b border-edge dark:border-edge-dark last:border-0">
                        <button onClick={() => setOpenReq(d.id)} className="text-left min-w-0 flex-1"><p className="text-sm font-semibold text-inkA dark:text-inkA-dark truncate">{d.title}</p><p className="text-[11px] text-gray-400 dark:text-slate-500 capitalize">{d.category} · {d.next_due_date}</p></button>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${d.daysRemaining < 0 ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : d.daysRemaining <= 7 ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>{d.daysRemaining < 0 ? `${Math.abs(d.daysRemaining)}d overdue` : `${d.daysRemaining}d left`}</span>
                      </div>
                    ))}
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

                <button onClick={() => api.trade.recompute().then(load)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark text-xs font-bold border border-edge dark:border-edge-dark active:bg-panel2 dark:active:bg-panel2-dark">
                  <RefreshCw size={14} /> Re-check my trade plan
                </button>
              </>
            )}

            {/* ── IMPORT / EXPORT GUIDELINE CATALOG ── */}
            {tab === 'import' && <GuidelineList category="import" />}
            {tab === 'export' && <GuidelineList category="export" />}

            {/* ── REQUIREMENTS ── */}
            {tab === 'requirements' && <RequirementsList onOpen={setOpenReq} reloadKey={reloadKey} />}

            {/* ── DOCUMENTS ── */}
            {tab === 'documents' && <DocumentsList onOpen={setOpenReq} reloadKey={reloadKey} />}

            {/* ── ADMIN ── */}
            {tab === 'admin' && isAdmin && <AdminGuidelines />}

            {/* ── COPILOT ── */}
            {tab === 'copilot' && <Copilot />}
          </div>
        </>
      )}

      {openReq && <RequirementDrawer requirementId={openReq} onClose={() => setOpenReq(null)} onChanged={() => { bump(); load(); }} />}
    </div>
  );
}
