// ═══════════════════════════════════════════════════════════════════════════════
// TAB: VALUATION — extracted verbatim from the original GrowthHub.jsx.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, TrendingUp, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { SectionCard, fmt } from './shared';

export default function ValuationTab() {
  const [valuations, setValuations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState('Revenue Multiple');
  const [inputs, setInputs] = useState({});
  const [running, setRunning] = useState(false);
  const METHODS = ['Revenue Multiple','EBITDA Multiple','DCF','Asset Based','Comparable'];

  const load = useCallback(() => {
    setLoading(true);
    api.growth.getValuations().then(r => setValuations(r.valuations||[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setRunning(true);
    try { await api.growth.createValuation({ method, inputs }); load(); }
    catch (e) { alert(e.message); }
    finally { setRunning(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-gray-900">Business Valuation</h2>
        <p className="text-xs text-gray-500 mt-0.5">Estimate your company value using multiple methods</p>
      </div>

      <SectionCard>
        <p className="text-xs font-bold text-gray-700 mb-3">Run New Valuation</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              {METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <p className="text-[10px] text-gray-400">Uses your Growth Profile data (revenue, EBITDA, assets). Override below if needed.</p>
          {method === 'Revenue Multiple' && (
            <div className="grid grid-cols-3 gap-2">
              {[['Low Multiple','low_multiple','2'],['Mid Multiple','mid_multiple','3.5'],['High Multiple','high_multiple','5']].map(([lbl,key,ph]) => (
                <div key={key}>
                  <label className="text-[10px] font-semibold text-gray-500 mb-1 block">{lbl}</label>
                  <input type="number" step="0.5" placeholder={ph} onChange={e => setInputs(i => ({...i, [key]: Number(e.target.value)}))}
                    className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              ))}
            </div>
          )}
          <button onClick={run} disabled={running} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {running ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}{running ? 'Calculating...' : 'Calculate Valuation'}
          </button>
        </div>
      </SectionCard>

      {!loading && valuations.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Valuation History</p>
          {valuations.map(v => (
            <SectionCard key={v.id}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{v.method}</p>
                  <p className="text-[10px] text-gray-400">{v.valuation_date}</p>
                </div>
                <button onClick={async () => { await api.growth.deleteValuation(v.id); load(); }} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={12} className="text-red-400" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 rounded-xl p-2">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">Low</p>
                  <p className="text-sm font-black text-gray-700">{fmt(v.value_low)}</p>
                </div>
                <div className="bg-indigo-50 rounded-xl p-2 ring-1 ring-indigo-200">
                  <p className="text-[10px] text-indigo-500 font-bold uppercase">Mid</p>
                  <p className="text-sm font-black text-indigo-800">{fmt(v.value_mid)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-2">
                  <p className="text-[10px] text-gray-400 font-bold uppercase">High</p>
                  <p className="text-sm font-black text-gray-700">{fmt(v.value_high)}</p>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
