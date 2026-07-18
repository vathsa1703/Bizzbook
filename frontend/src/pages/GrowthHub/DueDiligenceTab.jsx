// ═══════════════════════════════════════════════════════════════════════════════
// TAB: DUE DILIGENCE — extracted verbatim from the original GrowthHub.jsx.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { api } from '../../api/client';
import { SectionCard, Badge } from './shared';

export default function DueDiligenceTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openCat, setOpenCat] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.growth.getDueDiligence().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const markStatus = async (id, status) => {
    const fd = new FormData();
    fd.append('status', status);
    await api.growth.updateDueDiligenceItem(id, fd);
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500 dark:text-indigo-400" /></div>;
  if (!data) return null;

  const STATUS_COLOR = { Missing: 'red', Uploaded: 'amber', Verified: 'green', Expired: 'orange', 'Not Applicable': 'gray' };
  const categories = Object.keys(data.grouped || {});

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-inkA dark:text-inkA-dark">Due Diligence Center</h2>
        <p className="text-xs text-inkB dark:text-inkB-dark">{data.uploaded}/{data.required} required documents uploaded · {data.missing} missing</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SectionCard className="text-center">
          <p className="text-2xl font-black text-red-600 dark:text-red-400">{data.missing}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold uppercase mt-0.5">Missing</p>
        </SectionCard>
        <SectionCard className="text-center">
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{data.uploaded}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold uppercase mt-0.5">Uploaded</p>
        </SectionCard>
        <SectionCard className="text-center">
          <p className="text-2xl font-black text-green-600 dark:text-green-400">{data.total - data.missing}</p>
          <p className="text-[10px] text-gray-400 dark:text-slate-500 font-semibold uppercase mt-0.5">Ready</p>
        </SectionCard>
      </div>

      <div className="space-y-2">
        {categories.map(cat => {
          const catItems = data.grouped[cat] || [];
          const missing = catItems.filter(i => i.is_required && i.status === 'Missing').length;
          const isOpen = openCat === cat;
          return (
            <div key={cat} className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark shadow-sm overflow-hidden">
              <button onClick={() => setOpenCat(isOpen ? null : cat)} className="w-full p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${missing > 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-green-50 dark:bg-green-500/10'}`}>
                    {missing > 0 ? <AlertTriangle size={15} className="text-red-500 dark:text-red-400" /> : <CheckCircle2 size={15} className="text-green-500 dark:text-green-400" />}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-inkA dark:text-inkA-dark">{cat}</p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500">{catItems.length} items{missing > 0 ? ` · ${missing} missing` : ''}</p>
                  </div>
                </div>
                <ChevronDown size={14} className={`text-gray-400 dark:text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="border-t border-edge dark:border-edge-dark px-4 pb-3 space-y-2">
                  {catItems.map(item => (
                    <div key={item.id} className="flex items-start gap-3 py-2">
                      <div className="flex-1">
                        <p className="text-xs font-medium text-inkB dark:text-inkB-dark">{item.title}</p>
                        {item.is_required && item.status === 'Missing' && <p className="text-[9px] text-red-500 dark:text-red-400 font-bold uppercase">Required · Missing</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge color={STATUS_COLOR[item.status]||'gray'}>{item.status}</Badge>
                        {item.status === 'Missing' && (
                          <button onClick={() => markStatus(item.id, 'Uploaded')} className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline ml-1">Mark Uploaded</button>
                        )}
                        {item.status === 'Uploaded' && (
                          <button onClick={() => markStatus(item.id, 'Verified')} className="text-[10px] text-green-600 dark:text-green-400 font-bold hover:underline ml-1">Verify</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
