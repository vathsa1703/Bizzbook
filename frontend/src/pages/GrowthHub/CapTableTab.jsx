// ═══════════════════════════════════════════════════════════════════════════════
// TAB: CAP TABLE — extracted verbatim from the original GrowthHub.jsx.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, X, PieChart as PieIcon } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { api } from '../../api/client';
import { SectionCard, EmptyState, COLORS, fmt, pct } from './shared';

export default function CapTableTab() {
  const [capTable, setCapTable] = useState({ shareholders: [], totalShares: 0, totalInvestment: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', type:'Founder', shares:'', ownership_pct:'', investment_amount:'' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.growth.getCapTable().then(setCapTable).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try { await api.growth.createShareholder(form); setShowForm(false); setForm({ name:'', type:'Founder', shares:'', ownership_pct:'', investment_amount:'' }); load(); }
    catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Remove shareholder?')) return;
    await api.growth.deleteShareholder(id); load();
  };

  const pieData = capTable.shareholders.map(s => ({ name: s.name, value: parseFloat((s.computed_pct||s.ownership_pct||0).toFixed(2)) }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-inkA dark:text-inkA-dark">Cap Table</h2>
          <p className="text-xs text-inkB dark:text-inkB-dark">{capTable.shareholders.length} shareholders · {fmt(capTable.totalInvestment)} raised</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus size={13} />Add
        </button>
      </div>

      {loading ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-indigo-500 dark:text-indigo-400" /></div> :
       capTable.shareholders.length === 0 ? <EmptyState icon={PieIcon} title="No shareholders yet" sub="Add founders, investors and ESOP pool to build your cap table" action="Add Shareholder" onAction={() => setShowForm(true)} /> : (
        <>
          <SectionCard>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-edge dark:border-edge-dark">
                    {['Name','Type','Shares','Ownership','Investment'].map(h => <th key={h} className="text-left py-2 px-1 text-gray-400 dark:text-slate-500 font-semibold">{h}</th>)}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {capTable.shareholders.map((s, i) => (
                    <tr key={s.id} className="border-b border-edge dark:border-edge-dark hover:bg-panel2 dark:hover:bg-panel2-dark">
                      <td className="py-2 px-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="font-semibold text-inkA dark:text-inkA-dark">{s.name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-1 text-inkB dark:text-inkB-dark">{s.type}</td>
                      <td className="py-2 px-1 text-inkB dark:text-inkB-dark">{Number(s.shares).toLocaleString()}</td>
                      <td className="py-2 px-1">
                        <span className="font-bold text-indigo-700 dark:text-indigo-400">{pct(s.computed_pct||s.ownership_pct)}</span>
                      </td>
                      <td className="py-2 px-1 text-inkB dark:text-inkB-dark">{fmt(s.investment_amount)}</td>
                      <td className="py-2 px-1">
                        <button onClick={() => remove(s.id)} className="p-1 rounded hover:bg-red-50"><Trash2 size={11} className="text-red-400" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
          <div className="bg-panel dark:bg-panel-dark rounded-3xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="p-5 border-b border-edge dark:border-edge-dark flex items-center justify-between">
              <h3 className="font-bold text-inkA dark:text-inkA-dark">Add Shareholder</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400 dark:text-slate-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Name *', key: 'name', placeholder: 'Shareholder name' },
                { label: 'Shares', key: 'shares', placeholder: '1000000', type: 'number' },
                { label: 'Ownership %', key: 'ownership_pct', placeholder: '60', type: 'number' },
                { label: 'Investment Amount (₹)', key: 'investment_amount', placeholder: '0', type: 'number' },
              ].map(({ label, key, placeholder, type='text' }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-inkB dark:text-inkB-dark mb-1 block">{label}</label>
                  <input type={type} value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} placeholder={placeholder}
                    className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-inkB dark:text-inkB-dark mb-1 block">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  {['Founder','Co-Founder','Employee','ESOP Pool','Angel','VC','PE','Advisor','Strategic','Other'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <button onClick={save} disabled={saving || !form.name} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Add Shareholder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
