// ═══════════════════════════════════════════════════════════════════════════════
// TAB: EQUITY DILUTION SIMULATOR — extracted verbatim from the original GrowthHub.jsx.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { api } from '../../api/client';
import { SectionCard, ProgressBar, COLORS, fmt, pct } from './shared';

export default function EquityTab() {
  const [raiseAmount, setRaiseAmount] = useState('');
  const [investorPct, setInvestorPct] = useState('');
  const [roundName, setRoundName] = useState('New Round');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const simulate = async () => {
    if (!raiseAmount || !investorPct) return;
    setLoading(true);
    try {
      const r = await api.growth.simulateDilution({ newRaiseAmount: Number(raiseAmount), newInvestorPct: Number(investorPct), roundName });
      setResult(r);
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-inkA dark:text-inkA-dark">Equity Dilution Simulator</h2>
        <p className="text-xs text-inkB dark:text-inkB-dark mt-0.5">Model the impact of a new funding round on ownership</p>
      </div>

      <SectionCard>
        <p className="text-xs font-bold text-inkB dark:text-inkB-dark mb-3">Simulate a New Round</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-inkB dark:text-inkB-dark mb-1 block">Round Name</label>
            <input value={roundName} onChange={e => setRoundName(e.target.value)} placeholder="e.g. Seed Round" className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="text-xs font-semibold text-inkB dark:text-inkB-dark mb-1 block">Raise Amount (₹)</label>
            <input type="number" value={raiseAmount} onChange={e => setRaiseAmount(e.target.value)} placeholder="e.g. 20000000" className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="text-xs font-semibold text-inkB dark:text-inkB-dark mb-1 block">New Investor Gets (%)</label>
            <input type="number" min="1" max="99" value={investorPct} onChange={e => setInvestorPct(e.target.value)} placeholder="e.g. 15" className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <button onClick={simulate} disabled={loading || !raiseAmount || !investorPct} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}Simulate Dilution
          </button>
        </div>
      </SectionCard>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SectionCard>
              <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase mb-1">Pre-Money Valuation</p>
              <p className="text-base font-black text-inkA dark:text-inkA-dark">{fmt(result.preMoneyValuation)}</p>
            </SectionCard>
            <SectionCard>
              <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase mb-1">Post-Money Valuation</p>
              <p className="text-base font-black text-indigo-700 dark:text-indigo-400">{fmt(result.postMoneyValuation)}</p>
            </SectionCard>
          </div>

          <SectionCard>
            <p className="text-xs font-bold text-inkB dark:text-inkB-dark mb-3">Ownership After {result.roundName}</p>
            <div className="space-y-2">
              {result.postDilutionTable.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-24 text-xs font-medium text-inkB dark:text-inkB-dark truncate">{s.name}</div>
                  <div className="flex-1">
                    <ProgressBar value={s.post_pct} color={COLORS[i % COLORS.length]} />
                  </div>
                  <div className="w-16 text-right">
                    <span className="text-xs font-bold text-inkA dark:text-inkA-dark">{pct(s.post_pct)}</span>
                    {s.dilution_delta < 0 && <span className="text-[10px] text-red-500 dark:text-red-400 ml-1">({pct(Math.abs(s.dilution_delta))}↓)</span>}
                    {s.is_new && <span className="text-[10px] text-green-500 dark:text-green-400 ml-1">NEW</span>}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard>
            <p className="text-xs font-bold text-inkB dark:text-inkB-dark mb-3">Before vs After</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={result.postDilutionTable.map(s => ({ name: s.name.split(' ')[0], before: s.ownership_pct||0, after: s.post_pct }))} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
                <Bar dataKey="before" name="Before" fill="#E0E7FF" radius={[4,4,0,0]} />
                <Bar dataKey="after" name="After" fill="#6366f1" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>
        </>
      )}
    </div>
  );
}
