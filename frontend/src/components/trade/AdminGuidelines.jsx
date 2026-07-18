import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Search, Copy, Pencil, Trash2, Power, X } from 'lucide-react';
import Modal from '../Modal';
import { api } from '../../api/client';

const CATEGORIES = ['registration', 'import', 'export', 'licensing'];
const FREQUENCIES = ['one_time', 'annual', 'renewal'];
const ATTRS = [
  'country', 'state', 'business_type', 'industry', 'entity_type', 'import_enabled', 'export_enabled',
  'is_manufacturer', 'is_trader', 'is_service_provider', 'product_category', 'annual_turnover',
  'employee_count', 'gst_registered', 'msme', 'fssai_required', 'drug_license', 'has_factory', 'iec_registered',
];
const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is_true', 'is_false'];

const empty = () => ({ code: '', country: 'IN', category: 'registration', title: '', frequency: 'one_time', mandatory: 1, priority: 'medium', department: '', official_website: '', description: '', fees: '', processing_time: '', renewal_requirement: '', penalty_info: '', ai_explanation: '', renewal_interval_months: '', is_active: 1, conditions: [], documents: [] });

function GuidelineForm({ initial, onCancel, onSaved }) {
  const [f, setF] = useState({ ...empty(), ...initial, conditions: initial?.conditions || [], documents: (initial?.documents || []).map(d => d.doc_name || d) });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const editing = !!initial?.id;

  const save = async () => {
    if (!f.code || !f.title) { alert('Code and title are required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...f,
        mandatory: Number(f.mandatory) ? 1 : 0,
        is_active: Number(f.is_active) ? 1 : 0,
        renewal_interval_months: f.renewal_interval_months ? Number(f.renewal_interval_months) : null,
        documents: f.documents.filter(Boolean),
      };
      if (editing) await api.trade.updateGuideline(initial.id, payload);
      else await api.trade.createGuideline(payload);
      onSaved();
    } catch (e) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const inp = 'w-full border rounded-lg px-2.5 py-2 text-sm bg-panel2 dark:bg-panel2-dark';
  return (
    <Modal isOpen title={editing ? 'Edit Guideline' : 'New Trade Guideline'} onClose={onCancel} size="lg">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Code</label><input className={inp} value={f.code} disabled={editing} onChange={e => set('code', e.target.value)} placeholder="TRADE_NEW_RULE" /></div>
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Country</label><input className={inp} value={f.country} onChange={e => set('country', e.target.value)} /></div>
        </div>
        <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Title</label><input className={inp} value={f.title} onChange={e => set('title', e.target.value)} /></div>
        <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Description</label><textarea className={inp} rows={2} value={f.description || ''} onChange={e => set('description', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Category</label><select className={inp} value={f.category} onChange={e => set('category', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Frequency</label><select className={inp} value={f.frequency} onChange={e => set('frequency', e.target.value)}>{FREQUENCIES.map(c => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Priority</label><select className={inp} value={f.priority} onChange={e => set('priority', e.target.value)}>{['low', 'medium', 'high', 'critical'].map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Mandatory</label><select className={inp} value={f.mandatory} onChange={e => set('mandatory', Number(e.target.value))}><option value={1}>Yes</option><option value={0}>No</option></select></div>
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Active</label><select className={inp} value={f.is_active} onChange={e => set('is_active', Number(e.target.value))}><option value={1}>Yes</option><option value={0}>No</option></select></div>
        </div>
        <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Renewal Interval (months)</label><input type="number" className={inp} value={f.renewal_interval_months || ''} onChange={e => set('renewal_interval_months', e.target.value)} /></div>
        <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Department / Authority</label><input className={inp} value={f.department || ''} onChange={e => set('department', e.target.value)} /></div>
        <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Official Website</label><input className={inp} value={f.official_website || ''} onChange={e => set('official_website', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Fees</label><input className={inp} value={f.fees || ''} onChange={e => set('fees', e.target.value)} /></div>
          <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Processing Time</label><input className={inp} value={f.processing_time || ''} onChange={e => set('processing_time', e.target.value)} /></div>
        </div>
        <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Renewal Requirement</label><input className={inp} value={f.renewal_requirement || ''} onChange={e => set('renewal_requirement', e.target.value)} /></div>
        <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Penalty Info</label><input className={inp} value={f.penalty_info || ''} onChange={e => set('penalty_info', e.target.value)} /></div>
        <div><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">AI Explanation</label><textarea className={inp} rows={2} value={f.ai_explanation || ''} onChange={e => set('ai_explanation', e.target.value)} /></div>

        {/* Conditions (applicability) */}
        <div>
          <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Applies When (all true)</label>
            <button onClick={() => set('conditions', [...f.conditions, { attribute: 'export_enabled', operator: 'is_true', value: '' }])} className="text-[11px] font-bold text-blue-600 dark:text-blue-400">+ Condition</button></div>
          {f.conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-1 mb-1">
              <select className="border rounded-lg px-1.5 py-1.5 text-xs bg-panel2 dark:bg-panel2-dark flex-1" value={c.attribute} onChange={e => set('conditions', f.conditions.map((x, j) => j === i ? { ...x, attribute: e.target.value } : x))}>{ATTRS.map(a => <option key={a}>{a}</option>)}</select>
              <select className="border rounded-lg px-1.5 py-1.5 text-xs bg-panel2 dark:bg-panel2-dark" value={c.operator} onChange={e => set('conditions', f.conditions.map((x, j) => j === i ? { ...x, operator: e.target.value } : x))}>{OPS.map(o => <option key={o}>{o}</option>)}</select>
              <input className="border rounded-lg px-1.5 py-1.5 text-xs bg-panel2 dark:bg-panel2-dark w-20" value={c.value || ''} placeholder="val" onChange={e => set('conditions', f.conditions.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
              <button onClick={() => set('conditions', f.conditions.filter((_, j) => j !== i))} className="text-gray-400 dark:text-slate-500"><X size={14} /></button>
            </div>
          ))}
        </div>

        {/* Documents */}
        <div>
          <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Required Documents</label>
            <button onClick={() => set('documents', [...f.documents, ''])} className="text-[11px] font-bold text-blue-600 dark:text-blue-400">+ Document</button></div>
          {f.documents.map((d, i) => (
            <div key={i} className="flex items-center gap-1 mb-1">
              <input className="border rounded-lg px-2 py-1.5 text-xs bg-panel2 dark:bg-panel2-dark flex-1" value={d} onChange={e => set('documents', f.documents.map((x, j) => j === i ? e.target.value : x))} />
              <button onClick={() => set('documents', f.documents.filter((_, j) => j !== i))} className="text-gray-400 dark:text-slate-500"><X size={14} /></button>
            </div>
          ))}
        </div>

        <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl bg-gray-900 text-inkA dark:text-inkA-dark font-bold text-sm flex justify-center items-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 size={16} className="animate-spin" /> : null} {editing ? 'Save Changes' : 'Create Guideline'}
        </button>
      </div>
    </Modal>
  );
}

export default function AdminGuidelines() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [editing, setEditing] = useState(null); // guideline object or 'new'

  const load = () => {
    setLoading(true);
    api.trade.getGuidelinesAdmin('IN')
      .then(r => setRules(r.guidelines || []))
      .catch(e => { if (/admin/i.test(e.message)) setForbidden(true); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggle = async (rule) => { await api.trade.updateGuideline(rule.id, { is_active: rule.is_active ? 0 : 1 }); load(); };
  const del = async (rule) => { if (confirm(`Delete guideline "${rule.title}"?`)) { await api.trade.deleteGuideline(rule.id); load(); } };
  const clone = (rule) => setEditing({ ...rule, id: undefined, code: `${rule.code}_COPY`, title: `${rule.title} (Copy)` });

  const filtered = rules.filter(r =>
    (!catFilter || r.category === catFilter) &&
    (!search || r.title.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase())));

  if (forbidden) return <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-10">Admin access required to manage trade guidelines.</p>;
  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={22} /></div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-xl px-3 py-2">
          <Search size={15} className="text-gray-400 dark:text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guidelines…" className="flex-1 text-sm outline-none bg-transparent" />
        </div>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 bg-gray-900 text-inkA dark:text-inkA-dark text-xs font-bold px-3 py-2.5 rounded-xl"><Plus size={15} /> New</button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-3">
        <button onClick={() => setCatFilter('')} className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${!catFilter ? 'bg-gray-900 text-inkA dark:text-inkA-dark' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark'}`}>All</button>
        {CATEGORIES.map(c => <button key={c} onClick={() => setCatFilter(c)} className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap capitalize ${catFilter === c ? 'bg-gray-900 text-inkA dark:text-inkA-dark' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark'}`}>{c}</button>)}
      </div>

      <p className="text-[11px] text-gray-400 dark:text-slate-500 mb-2">{filtered.length} guidelines</p>
      <div className="space-y-2">
        {filtered.map(r => (
          <div key={r.id} className="bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-xl p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-inkA dark:text-inkA-dark leading-tight">{r.title}</p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{r.code} · {r.category} · {r.frequency} · {(r.conditions || []).length} conditions</p>
              </div>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${r.is_active ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-panel2 dark:bg-panel2-dark text-gray-400 dark:text-slate-500'}`}>{r.is_active ? 'Active' : 'Off'}</span>
            </div>
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-edge dark:border-edge-dark">
              <button onClick={() => toggle(r)} className="p-1.5 rounded-lg hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark" title="Toggle active"><Power size={15} /></button>
              <button onClick={() => setEditing(r)} className="p-1.5 rounded-lg hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark" title="Edit"><Pencil size={15} /></button>
              <button onClick={() => clone(r)} className="p-1.5 rounded-lg hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark" title="Clone"><Copy size={15} /></button>
              <button onClick={() => del(r)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 dark:text-slate-500 hover:text-red-600 ml-auto" title="Delete"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && <GuidelineForm initial={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
