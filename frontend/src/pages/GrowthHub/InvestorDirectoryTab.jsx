// ═══════════════════════════════════════════════════════════════════════════════
// TAB: INVESTOR DIRECTORY — browsable reference list of real investor firms/
// funds/accelerators (GET /growth/investor-directory). Modeled directly on
// SchemesTab.jsx's layout/filter conventions; this is NOT the per-company
// Investors CRM (InvestorsTab.jsx) — no add/edit/delete here for regular use.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react';
import { Loader2, ChevronRight, Search, ExternalLink, Landmark } from 'lucide-react';
import { api } from '../../api/client';
import { SectionCard, Badge, fmt } from './shared';

export default function InvestorDirectoryTab() {
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [orgType, setOrgType] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.growth.getInvestorDirectory()
      .then(r => setEntries(r.investorDirectory || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const TYPE_COLOR = { 'VC Firm': 'indigo', 'Angel Network': 'purple', 'Accelerator': 'amber', 'Government Fund': 'green' };
  const orgTypes = ['All', ...new Set(entries.map(e => e.org_type).filter(Boolean))];
  const filtered = entries.filter(e =>
    (orgType === 'All' || e.org_type === orgType) &&
    (!search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.focus_sectors || '').toLowerCase().includes(search.toLowerCase()))
  );
  function parseJson(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }
  function ticketRange(e) {
    if (!e.ticket_size_min && !e.ticket_size_max) return null;
    if (e.ticket_size_min && e.ticket_size_max) return `${fmt(e.ticket_size_min)} – ${fmt(e.ticket_size_max)}`;
    return fmt(e.ticket_size_min || e.ticket_size_max);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500 dark:text-indigo-400" /></div>;

  if (selected) {
    const e = selected;
    const sectors = parseJson(e.focus_sectors);
    const portfolio = parseJson(e.notable_portfolio);
    return (
      <div className="space-y-4">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 font-semibold">
          <ChevronRight size={14} className="rotate-180" /> Back to Investor Directory
        </button>
        <SectionCard>
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-lg font-black text-inkA dark:text-inkA-dark">{e.name}</h2>
              <div className="flex flex-wrap gap-1 mt-1">
                {e.org_type && <Badge color={TYPE_COLOR[e.org_type] || 'gray'}>{e.org_type}</Badge>}
                {e.investment_stage && <Badge color="blue">{e.investment_stage}</Badge>}
                {e.region && <Badge color="gray">{e.region}</Badge>}
              </div>
            </div>
          </div>
          {e.description && <p className="text-sm text-inkB dark:text-inkB-dark leading-relaxed mt-2">{e.description}</p>}
        </SectionCard>

        {ticketRange(e) && (
          <SectionCard>
            <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase mb-1">Typical Ticket Size</p>
            <p className="text-lg font-black text-green-600 dark:text-green-400">{ticketRange(e)}</p>
          </SectionCard>
        )}

        {sectors.length > 0 && (
          <SectionCard>
            <p className="text-xs font-bold text-inkB dark:text-inkB-dark mb-2">Focus Sectors</p>
            <div className="flex flex-wrap gap-1">
              {sectors.map((s, i) => <Badge key={i} color="indigo">{s}</Badge>)}
            </div>
          </SectionCard>
        )}

        {portfolio.length > 0 && (
          <SectionCard>
            <p className="text-xs font-bold text-inkB dark:text-inkB-dark mb-2">Notable Portfolio</p>
            <p className="text-xs text-inkB dark:text-inkB-dark">{portfolio.join(', ')}</p>
          </SectionCard>
        )}

        {(e.website_url || e.contact_info) && (
          <SectionCard>
            <p className="text-xs font-bold text-inkB dark:text-inkB-dark mb-2">Contact</p>
            {e.website_url && (
              <a href={e.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline mb-1">
                <ExternalLink size={11} />{e.website_url}
              </a>
            )}
            {e.contact_info && <p className="text-xs text-inkB dark:text-inkB-dark">{e.contact_info}</p>}
          </SectionCard>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-inkA dark:text-inkA-dark">Investor Directory</h2>
        <p className="text-xs text-inkB dark:text-inkB-dark mt-0.5">Browse real VC firms, angel networks, accelerators & government funds</p>
      </div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search investors, sectors..." className="w-full pl-8 pr-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {orgTypes.map(t => (
          <button key={t} onClick={() => setOrgType(t)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${orgType===t ? 'bg-indigo-600 text-white' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark hover:bg-gray-200'}`}>{t}</button>
        ))}
      </div>
      <div className="space-y-3">
        {filtered.map(e => (
          <button key={e.id} onClick={() => setSelected(e)} className="w-full bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark shadow-sm p-4 text-left hover:shadow-md hover:border-indigo-200 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-inkA dark:text-inkA-dark text-sm">{e.name}</span>
                  {e.org_type && <Badge color={TYPE_COLOR[e.org_type] || 'gray'}>{e.org_type}</Badge>}
                </div>
                {e.description && <p className="text-xs text-inkB dark:text-inkB-dark mt-1 line-clamp-2">{e.description}</p>}
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {e.investment_stage && <Badge color="blue">{e.investment_stage}</Badge>}
                  {ticketRange(e) && <span className="text-[10px] text-inkB dark:text-inkB-dark">{ticketRange(e)}</span>}
                  {e.region && <span className="text-[10px] text-gray-400 dark:text-slate-500">{e.region}</span>}
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 dark:text-slate-600 flex-shrink-0 mt-1" />
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8">
            <Landmark size={24} className="mx-auto text-gray-300 dark:text-slate-600 mb-2" />
            <p className="text-sm text-gray-400 dark:text-slate-500">No investors found</p>
          </div>
        )}
      </div>
    </div>
  );
}
