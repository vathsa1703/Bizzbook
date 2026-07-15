// ═══════════════════════════════════════════════════════════════════════════════
// TAB: GOVERNMENT SCHEMES — extracted verbatim from the original GrowthHub.jsx.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react';
import { Loader2, ChevronRight, Search, ExternalLink } from 'lucide-react';
import { api } from '../../api/client';
import { SectionCard, Badge } from './shared';

export default function SchemesTab() {
  const [schemes, setSchemes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.growth.getSchemes().then(r => setSchemes(r.schemes || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const BENEFIT_COLOR = { Loan: 'blue', Grant: 'green', Subsidy: 'amber', 'Tax Benefit': 'purple', Recognition: 'indigo' };
  const categories = ['All', ...new Set(schemes.map(s => s.category))];
  const filtered = schemes.filter(s =>
    (category === 'All' || s.category === category) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.description||'').toLowerCase().includes(search.toLowerCase()))
  );
  function parseJson(s) { try { return JSON.parse(s||'[]'); } catch { return []; } }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;

  if (selected) {
    const s = selected;
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-indigo-600 font-semibold">
          <ChevronRight size={14} className="rotate-180" /> Back to Schemes
        </button>
        <SectionCard>
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-lg font-black text-gray-900">{s.name}</h2>
              <div className="flex flex-wrap gap-1 mt-1">
                <Badge color={BENEFIT_COLOR[s.benefit_type]||'gray'}>{s.benefit_type}</Badge>
                <Badge color="blue">{s.category}</Badge>
                {s.region && <Badge color="gray">{s.region}</Badge>}
                <Badge color={s.deadline_type==='Rolling'?'green':s.deadline_type==='Closed'?'red':'amber'}>{s.deadline_type}</Badge>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 font-medium">{s.administering_body}</p>
          <p className="text-sm text-gray-600 leading-relaxed mt-2">{s.description}</p>
        </SectionCard>

        {s.max_benefit_amount && (
          <SectionCard>
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Maximum Benefit</p>
            <p className="text-lg font-black text-green-600">₹{Number(s.max_benefit_amount).toLocaleString('en-IN')}</p>
          </SectionCard>
        )}

        {[
          { title: 'Eligibility Criteria', data: parseJson(s.eligibility) },
          { title: 'Benefits', data: parseJson(s.benefits) },
          { title: 'Documents Required', data: parseJson(s.documents_required) },
        ].map(({ title, data }) => data.length > 0 && (
          <SectionCard key={title}>
            <p className="text-xs font-bold text-gray-700 mb-2">{title}</p>
            <ul className="space-y-1">
              {data.map((item, i) => <li key={i} className="text-xs text-gray-600 flex items-start gap-2"><span className="text-indigo-400">•</span>{item}</li>)}
            </ul>
          </SectionCard>
        ))}

        {parseJson(s.application_process).length > 0 && (
          <SectionCard>
            <p className="text-xs font-bold text-gray-700 mb-2">Application Process</p>
            <div className="space-y-2">
              {parseJson(s.application_process).map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</div>
                  <p className="text-xs text-gray-600">{step}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {parseJson(s.official_links).length > 0 && (
          <SectionCard>
            <p className="text-xs font-bold text-gray-700 mb-2">Official Links</p>
            {parseJson(s.official_links).map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-indigo-600 font-medium hover:underline mb-1">
                <ExternalLink size={11} />{l.label}
              </a>
            ))}
          </SectionCard>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-gray-900">Government Schemes</h2>
        <p className="text-xs text-gray-500 mt-0.5">Search grants, loans & programs for your business</p>
      </div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search schemes..." className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map(c => (
          <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${category===c ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{c}</button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.map(s => (
          <button key={s.id} onClick={() => setSelected(s)} className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md hover:border-indigo-200 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900 text-sm">{s.name}</span>
                  {s.benefit_type && <Badge color={BENEFIT_COLOR[s.benefit_type]||'gray'}>{s.benefit_type}</Badge>}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{s.administering_body}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>
                <div className="flex items-center gap-3 mt-2">
                  <Badge color={s.deadline_type==='Rolling'?'green':s.deadline_type==='Closed'?'red':'amber'}>{s.deadline_type||'—'}</Badge>
                  {s.max_benefit_amount && <span className="text-[10px] text-gray-500">Up to ₹{Number(s.max_benefit_amount).toLocaleString('en-IN')}</span>}
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0 mt-1" />
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No schemes found</p>}
      </div>
    </div>
  );
}
