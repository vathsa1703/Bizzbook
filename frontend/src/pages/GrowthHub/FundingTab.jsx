// ═══════════════════════════════════════════════════════════════════════════════
// TAB: FUNDING CENTER — extracted verbatim from the original GrowthHub.jsx.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react';
import { Loader2, ChevronRight, Search, ExternalLink } from 'lucide-react';
import { api } from '../../api/client';
import { SectionCard, Badge } from './shared';

export default function FundingTab() {
  const [types, setTypes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('');
  const [category, setCategory] = useState('All');
  const [profile, setProfile] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.growth.getProfile(),
      api.growth.getFundingTypes(),
    ]).then(([p, t]) => {
      setProfile(p.profile || {});
      setTypes(t.fundingTypes || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const categories = ['All', ...new Set(types.map(t => t.category))];
  const filtered = types.filter(t =>
    (category === 'All' || t.category === category) &&
    (!filter || t.name.toLowerCase().includes(filter.toLowerCase()))
  );

  const DILUTION_COLOR = { None: 'green', Low: 'blue', Medium: 'amber', High: 'red' };
  const RISK_COLOR = { Low: 'green', Medium: 'amber', High: 'red' };

  function parseJson(s) { try { return JSON.parse(s||'[]'); } catch { return []; } }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;

  if (selected) {
    const t = selected;
    const advantages = parseJson(t.advantages);
    const disadvantages = parseJson(t.disadvantages);
    const docs = parseJson(t.required_documents);
    const resources = parseJson(t.official_resources);
    const sym = profile.currency_symbol || '₹';
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-indigo-600 font-semibold">
          <ChevronRight size={14} className="rotate-180" /> Back to Funding Options
        </button>
        <SectionCard>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-lg font-black text-gray-900">{t.name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge color="indigo">{t.category}</Badge>
                {t.dilution_level && <Badge color={DILUTION_COLOR[t.dilution_level]||'gray'}>Dilution: {t.dilution_level}</Badge>}
                {t.risk_level && <Badge color={RISK_COLOR[t.risk_level]||'gray'}>Risk: {t.risk_level}</Badge>}
                {t.country_code && <Badge color="gray">{t.country_code}</Badge>}
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{t.description}</p>
        </SectionCard>

        <div className="grid grid-cols-2 gap-3">
          <SectionCard>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Typical Amount</p>
            <p className="text-sm font-bold text-gray-800">{t.typical_amount_min!=null ? `${sym}${Number(t.typical_amount_min).toLocaleString('en-IN')}` : '—'} {t.typical_amount_max!=null ? `— ${sym}${Number(t.typical_amount_max).toLocaleString('en-IN')}` : ''}</p>
          </SectionCard>
          <SectionCard>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Timeline</p>
            <p className="text-sm font-bold text-gray-800">{t.timeline_days_min!=null ? `${t.timeline_days_min}–${t.timeline_days_max} days` : '—'}</p>
          </SectionCard>
        </div>

        {[
          { title: 'Eligibility', items: parseJson(t.eligibility) },
          { title: '✅ Advantages', items: advantages },
          { title: '⚠️ Disadvantages', items: disadvantages },
          { title: '📄 Required Documents', items: docs },
        ].map(({ title, items }) => items.length > 0 && (
          <SectionCard key={title}>
            <p className="text-xs font-bold text-gray-700 mb-2">{title}</p>
            <ul className="space-y-1">
              {items.map((item, i) => <li key={i} className="text-xs text-gray-600 flex items-start gap-2"><span className="text-indigo-400 mt-0.5">•</span>{item}</li>)}
            </ul>
          </SectionCard>
        ))}

        {t.how_to_apply && (
          <SectionCard>
            <p className="text-xs font-bold text-gray-700 mb-2">How to Apply</p>
            <p className="text-xs text-gray-600">{t.how_to_apply}</p>
          </SectionCard>
        )}

        {resources.length > 0 && (
          <SectionCard>
            <p className="text-xs font-bold text-gray-700 mb-2">Official Resources</p>
            <div className="space-y-2">
              {resources.map((r, i) => (
                <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-indigo-600 font-medium hover:underline">
                  <ExternalLink size={12} />{r.label}
                </a>
              ))}
            </div>
          </SectionCard>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-gray-900">Funding Center</h2>
        <p className="text-xs text-gray-500 mt-0.5">Explore all funding options available for your business</p>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search funding types..." className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map(c => (
          <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${category===c ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{c}</button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.map(t => (
          <button key={t.id} onClick={() => setSelected(t)} className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md hover:border-indigo-200 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900 text-sm">{t.name}</span>
                  <Badge color="indigo">{t.category}</Badge>
                  {t.dilution_level && <Badge color={DILUTION_COLOR[t.dilution_level]||'gray'}>Dilution: {t.dilution_level}</Badge>}
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.description}</p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                  {t.risk_level && <span>Risk: <strong className="text-gray-600">{t.risk_level}</strong></span>}
                  {t.timeline_days_min != null && <span>Timeline: <strong className="text-gray-600">{t.timeline_days_min}–{t.timeline_days_max}d</strong></span>}
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0 mt-1" />
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No funding types found</p>}
      </div>
    </div>
  );
}
