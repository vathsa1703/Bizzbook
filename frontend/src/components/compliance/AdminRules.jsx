import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Search, Copy, Pencil, Trash2, Power, X } from 'lucide-react';
import Modal from '../Modal';
import { api } from '../../api/client';

const CATEGORIES = ['tax', 'filings', 'licenses', 'renewals', 'employee', 'meetings', 'operational', 'documents'];
const FREQUENCIES = ['monthly', 'quarterly', 'half_yearly', 'annual', 'one_time', 'renewal'];
const ATTRS = ['entity_type', 'industry', 'gst_registered', 'annual_turnover', 'employee_count', 'import_export', 'fssai_required', 'drug_license', 'has_factory', 'multiple_branches', 'msme', 'startup_registered'];
const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is_true', 'is_false'];

const empty = () => ({ code: '', title: '', category_key: 'tax', frequency: 'annual', country: 'IN', mandatory: 1, priority: 'medium', department: '', portal_url: '', description: '', penalty_info: '', ai_explanation: '', due_day: '', due_month: '', renewal_interval_months: '', is_active: 1, conditions: [], documents: [] });

function RuleForm({ initial, onCancel, onSaved }) {
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
        due_day: f.due_day ? Number(f.due_day) : null,
        due_month: f.due_month ? Number(f.due_month) : null,
        renewal_interval_months: f.renewal_interval_months ? Number(f.renewal_interval_months) : null,
        documents: f.documents.filter(Boolean),
      };
      if (editing) await api.compliance.updateRule(initial.id, payload);
      else await api.compliance.createRule(payload);
      onSaved();
    } catch (e) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const inp = 'w-full border rounded-lg px-2.5 py-2 text-sm bg-gray-50';
  return (
    <Modal isOpen title={editing ? 'Edit Rule' : 'New Compliance Rule'} onClose={onCancel} size="lg">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Code</label><input className={inp} value={f.code} disabled={editing} onChange={e => set('code', e.target.value)} placeholder="IN_NEW_RULE" /></div>
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Country</label><input className={inp} value={f.country} onChange={e => set('country', e.target.value)} /></div>
        </div>
        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Title</label><input className={inp} value={f.title} onChange={e => set('title', e.target.value)} /></div>
        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Description</label><textarea className={inp} rows={2} value={f.description || ''} onChange={e => set('description', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Category</label><select className={inp} value={f.category_key} onChange={e => set('category_key', e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Frequency</label><select className={inp} value={f.frequency} onChange={e => set('frequency', e.target.value)}>{FREQUENCIES.map(c => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Due Day</label><input type="number" className={inp} value={f.due_day || ''} onChange={e => set('due_day', e.target.value)} /></div>
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Due Month</label><input type="number" className={inp} value={f.due_month || ''} onChange={e => set('due_month', e.target.value)} /></div>
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Renew (mo)</label><input type="number" className={inp} value={f.renewal_interval_months || ''} onChange={e => set('renewal_interval_months', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Priority</label><select className={inp} value={f.priority} onChange={e => set('priority', e.target.value)}>{['low', 'medium', 'high', 'critical'].map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Mandatory</label><select className={inp} value={f.mandatory} onChange={e => set('mandatory', Number(e.target.value))}><option value={1}>Yes</option><option value={0}>No</option></select></div>
          <div><label className="text-[10px] font-bold text-gray-400 uppercase">Active</label><select className={inp} value={f.is_active} onChange={e => set('is_active', Number(e.target.value))}><option value={1}>Yes</option><option value={0}>No</option></select></div>
        </div>
        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Department</label><input className={inp} value={f.department || ''} onChange={e => set('department', e.target.value)} /></div>
        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Portal URL</label><input className={inp} value={f.portal_url || ''} onChange={e => set('portal_url', e.target.value)} /></div>
        <div><label className="text-[10px] font-bold text-gray-400 uppercase">Penalty Info</label><input className={inp} value={f.penalty_info || ''} onChange={e => set('penalty_info', e.target.value)} /></div>

        {/* Conditions (applicability) */}
        <div>
          <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Applies When (all true)</label>
            <button onClick={() => set('conditions', [...f.conditions, { attribute: 'gst_registered', operator: 'is_true', value: '' }])} className="text-[11px] font-bold text-brand-blue">+ Condition</button></div>
          {f.conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-1 mb-1">
              <select className="border rounded-lg px-1.5 py-1.5 text-xs bg-gray-50 flex-1" value={c.attribute} onChange={e => set('conditions', f.conditions.map((x, j) => j === i ? { ...x, attribute: e.target.value } : x))}>{ATTRS.map(a => <option key={a}>{a}</option>)}</select>
              <select className="border rounded-lg px-1.5 py-1.5 text-xs bg-gray-50" value={c.operator} onChange={e => set('conditions', f.conditions.map((x, j) => j === i ? { ...x, operator: e.target.value } : x))}>{OPS.map(o => <option key={o}>{o}</option>)}</select>
              <input className="border rounded-lg px-1.5 py-1.5 text-xs bg-gray-50 w-20" value={c.value || ''} placeholder="val" onChange={e => set('conditions', f.conditions.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
              <button onClick={() => set('conditions', f.conditions.filter((_, j) => j !== i))} className="text-gray-400"><X size={14} /></button>
            </div>
          ))}
        </div>

        {/* Documents */}
        <div>
          <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-gray-400 uppercase">Required Documents</label>
            <button onClick={() => set('documents', [...f.documents, ''])} className="text-[11px] font-bold text-brand-blue">+ Document</button></div>
          {f.documents.map((d, i) => (
            <div key={i} className="flex items-center gap-1 mb-1">
              <input className="border rounded-lg px-2 py-1.5 text-xs bg-gray-50 flex-1" value={d} onChange={e => set('documents', f.documents.map((x, j) => j === i ? e.target.value : x))} />
              <button onClick={() => set('documents', f.documents.filter((_, j) => j !== i))} className="text-gray-400"><X size={14} /></button>
            </div>
          ))}
        </div>

        <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl bg-gray-900 text-white font-bold text-sm flex justify-center items-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 size={16} className="animate-spin" /> : null} {editing ? 'Save Changes' : 'Create Rule'}
        </button>
      </div>
    </Modal>
  );
}

export default function AdminRules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [editing, setEditing] = useState(null); // rule object or 'new'

  const load = () => {
    setLoading(true);
    api.compliance.getRules('IN')
      .then(r => setRules(r.rules || []))
      .catch(e => { if (/admin/i.test(e.message)) setForbidden(true); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggle = async (rule) => { await api.compliance.updateRule(rule.id, { is_active: rule.is_active ? 0 : 1 }); load(); };
  const del = async (rule) => { if (confirm(`Delete rule "${rule.title}"?`)) { await api.compliance.deleteRule(rule.id); load(); } };
  const clone = (rule) => setEditing({ ...rule, id: undefined, code: `${rule.code}_COPY`, title: `${rule.title} (Copy)` });

  const filtered = rules.filter(r =>
    (!catFilter || r.category_key === catFilter) &&
    (!search || r.title.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase())));

  if (forbidden) return <p className="text-sm text-gray-400 text-center py-10">Admin access required to manage compliance rules.</p>;
  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" size={22} /></div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search rules…" className="flex-1 text-sm outline-none bg-transparent" />
        </div>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 bg-gray-900 text-white text-xs font-bold px-3 py-2.5 rounded-xl"><Plus size={15} /> New</button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-3">
        <button onClick={() => setCatFilter('')} className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${!catFilter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>All</button>
        {CATEGORIES.map(c => <button key={c} onClick={() => setCatFilter(c)} className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap capitalize ${catFilter === c ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>{c}</button>)}
      </div>

      <p className="text-[11px] text-gray-400 mb-2">{filtered.length} rules</p>
      <div className="space-y-2">
        {filtered.map(r => (
          <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 leading-tight">{r.title}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{r.code} · {r.category_key} · {r.frequency} · {(r.conditions || []).length} conditions</p>
              </div>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${r.is_active ? 'bg-brand-greenSoft text-brand-green' : 'bg-gray-100 text-gray-400'}`}>{r.is_active ? 'Active' : 'Off'}</span>
            </div>
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-50">
              <button onClick={() => toggle(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Toggle active"><Power size={15} /></button>
              <button onClick={() => setEditing(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Edit"><Pencil size={15} /></button>
              <button onClick={() => clone(r)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Clone"><Copy size={15} /></button>
              <button onClick={() => del(r)} className="p-1.5 rounded-lg hover:bg-brand-redSoft text-gray-400 hover:text-brand-red ml-auto" title="Delete"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && <RuleForm initial={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
