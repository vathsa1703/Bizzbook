// ═══════════════════════════════════════════════════════════════════════════════
// TAB: PARTNERSHIPS & SPONSORSHIPS (shared component, type filtered) — extracted
// verbatim from the original GrowthHub.jsx. Used for both the Partnerships and
// Sponsorships sidebar tabs via the typeFilter prop.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, X, Handshake } from 'lucide-react';
import { api } from '../../api/client';
import { SectionCard, Badge, EmptyState, fmt } from './shared';

export default function PartnershipsTab({ typeFilter }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ partner_name:'', type: typeFilter||'Partnership', contact_name:'', contact_email:'', status:'Prospect', description:'', value_amount:'' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.growth.getPartnerships(typeFilter ? { type: typeFilter } : {}).then(r => setItems(r.partnerships||[])).catch(console.error).finally(() => setLoading(false));
  }, [typeFilter]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try { await api.growth.createPartnership(form); setShowForm(false); load(); }
    catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const TYPES = typeFilter ? [typeFilter] : ['Partnership','Sponsorship','Distribution','Technology','Strategic','Co-Marketing','JV'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-gray-900">{typeFilter === 'Sponsorship' ? 'Sponsorships' : 'Partnerships'}</h2>
          <p className="text-xs text-gray-500">{items.length} tracked</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus size={13} />Add
        </button>
      </div>

      {loading ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-indigo-500" /></div> :
       items.length === 0 ? <EmptyState icon={Handshake} title={`No ${typeFilter||'partnerships'} yet`} sub="Track potential sponsors, brand partners and strategic alliances" action="Add" onAction={() => setShowForm(true)} /> :
        <div className="space-y-3">
          {items.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 text-sm">{p.partner_name}</span>
                    <Badge color={p.status==='Active'?'green':p.status==='Prospect'?'gray':'amber'}>{p.status}</Badge>
                  </div>
                  {p.contact_name && <p className="text-xs text-gray-500 mt-0.5">{p.contact_name} {p.contact_email && `· ${p.contact_email}`}</p>}
                  {p.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{p.description}</p>}
                  {p.value_amount && <p className="text-xs font-semibold text-green-600 mt-1">{fmt(p.value_amount)}</p>}
                </div>
                <button onClick={async () => { if (confirm('Remove?')) { await api.growth.deletePartnership(p.id); load(); }}} className="p-1.5 rounded-lg hover:bg-red-50">
                  <Trash2 size={13} className="text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      }

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Add {typeFilter||'Partnership'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Partner Name *', key: 'partner_name', placeholder: 'Company or person name' },
                { label: 'Contact Name', key: 'contact_name', placeholder: 'Key contact' },
                { label: 'Contact Email', key: 'contact_email', placeholder: 'email@company.com', type: 'email' },
                { label: 'Value Amount (₹)', key: 'value_amount', placeholder: '0', type: 'number' },
                { label: 'Description', key: 'description', placeholder: 'What is this partnership about?', multiline: true },
              ].map(({ label, key, placeholder, type='text', multiline }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">{label}</label>
                  {multiline
                    ? <textarea value={form[key]||''} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} placeholder={placeholder} rows={2} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                    : <input type={type} value={form[key]||''} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} placeholder={placeholder} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  }
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  {['Prospect','Contacted','Negotiating','Active','Paused','Ended'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={save} disabled={saving || !form.partner_name} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
