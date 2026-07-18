// ═══════════════════════════════════════════════════════════════════════════════
// TAB: INVESTORS (Kanban Pipeline) — extracted verbatim from the original GrowthHub.jsx.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Edit2, Trash2, Check, Users, X } from 'lucide-react';
import { api } from '../../api/client';
import { SectionCard, Badge, EmptyState, STATUS_DOT, INV_STAGES } from './shared';

export default function InvestorsTab() {
  const [investors, setInvestors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:'', type:'Angel', firm:'', email:'', status:'Prospect', notes:'' });
  const [saving, setSaving] = useState(false);
  const [activeStage, setActiveStage] = useState('All');

  const load = useCallback(() => {
    setLoading(true);
    api.growth.getInvestors().then(r => setInvestors(r.investors||[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      if (editing) await api.growth.updateInvestor(editing.id, form);
      else await api.growth.createInvestor(form);
      setShowForm(false); setEditing(null); setForm({ name:'', type:'Angel', firm:'', email:'', status:'Prospect', notes:'' });
      load();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Remove investor?')) return;
    await api.growth.deleteInvestor(id); load();
  };

  const openEdit = (inv) => { setEditing(inv); setForm({ name: inv.name, type: inv.type||'Angel', firm: inv.firm||'', email: inv.email||'', status: inv.status||'Prospect', notes: inv.notes||'' }); setShowForm(true); };

  const displayInvestors = activeStage === 'All' ? investors : investors.filter(i => i.status === activeStage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-inkA dark:text-inkA-dark">Investor Pipeline</h2>
          <p className="text-xs text-inkB dark:text-inkB-dark">{investors.length} investors tracked</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name:'', type:'Angel', firm:'', email:'', status:'Prospect', notes:'' }); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus size={13} />Add Investor
        </button>
      </div>

      {/* Stage filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {['All', ...INV_STAGES].map(s => (
          <button key={s} onClick={() => setActiveStage(s)} className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${activeStage===s ? 'bg-indigo-600 text-white' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark hover:bg-gray-200'}`}>
            {s !== 'All' && <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]||'bg-gray-400'}`} />}{s}
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-indigo-500 dark:text-indigo-400" /></div> :
        displayInvestors.length === 0 ? <EmptyState icon={Users} title="No investors yet" sub="Add potential investors to track your fundraising pipeline" action="Add Investor" onAction={() => setShowForm(true)} /> :
        <div className="space-y-3">
          {displayInvestors.map(inv => (
            <div key={inv.id} className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[inv.status]||'bg-gray-400'}`} />
                    <span className="font-bold text-inkA dark:text-inkA-dark text-sm">{inv.name}</span>
                    {inv.type && <Badge color="indigo">{inv.type}</Badge>}
                  </div>
                  {inv.firm && <p className="text-xs text-inkB dark:text-inkB-dark ml-4 mt-0.5">{inv.firm}</p>}
                  {inv.email && <p className="text-xs text-gray-400 dark:text-slate-500 ml-4">{inv.email}</p>}
                  <div className="ml-4 mt-2">
                    <Badge color={inv.status==='Closed Won'?'green':inv.status==='Closed Lost'?'red':'gray'}>{inv.status}</Badge>
                  </div>
                  {inv.notes && <p className="text-xs text-inkB dark:text-inkB-dark ml-4 mt-2 line-clamp-2">{inv.notes}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(inv)} className="p-2 rounded-xl hover:bg-panel2 dark:hover:bg-panel2-dark"><Edit2 size={13} className="text-gray-400 dark:text-slate-500" /></button>
                  <button onClick={() => remove(inv.id)} className="p-2 rounded-xl hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      }

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
          <div className="bg-panel dark:bg-panel-dark rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="p-5 border-b border-edge dark:border-edge-dark flex items-center justify-between">
              <h3 className="font-bold text-inkA dark:text-inkA-dark">{editing ? 'Edit Investor' : 'Add Investor'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400 dark:text-slate-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Name *', key: 'name', type: 'text', placeholder: 'Investor name' },
                { label: 'Firm / Fund', key: 'firm', type: 'text', placeholder: 'e.g. Sequoia Capital' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'investor@fund.com' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-inkB dark:text-inkB-dark mb-1 block">{label}</label>
                  <input type={type} value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} placeholder={placeholder}
                    className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-inkB dark:text-inkB-dark mb-1 block">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  {['Angel','VC','PE','Family Office','Corporate','Government','Crowdfund'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-inkB dark:text-inkB-dark mb-1 block">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  {INV_STAGES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-inkB dark:text-inkB-dark mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={3} placeholder="Introductions, conversation notes..."
                  className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
              </div>
              <button onClick={save} disabled={saving || !form.name} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{saving ? 'Saving...' : 'Save Investor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
