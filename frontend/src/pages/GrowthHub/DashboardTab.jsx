// ═══════════════════════════════════════════════════════════════════════════════
// TAB: OVERVIEW — extracted verbatim from the original GrowthHub.jsx.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react';
import {
  Loader2, Activity, Users, PieChart as PieIcon, TrendingUp, Handshake,
  ChevronRight, Layers, Presentation, Landmark, Bot,
} from 'lucide-react';
import { api } from '../../api/client';
import { SectionCard, ScoreRing, StatCard, STAGE_COLORS, fmt } from './shared';

export default function DashboardTab({ onTabChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.growth.getDashboard().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>;
  if (!data) return null;

  const { profile = {}, readiness = {}, counts = {}, latestValuation } = data;
  const sym = profile.currency_symbol || '₹';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900">Growth Hub</h2>
          <p className="text-sm text-gray-500 mt-0.5">Your complete funding & growth dashboard</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${STAGE_COLORS[profile.stage] || 'bg-gray-100 text-gray-600'}`}>
          {profile.stage || 'Set Stage'}
        </span>
      </div>

      {/* Readiness Rings */}
      <SectionCard>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-indigo-600" />
          <h3 className="font-bold text-gray-900 text-sm">Growth Readiness Scores</h3>
        </div>
        <div className="grid grid-cols-4 gap-2 justify-items-center">
          <div className="flex flex-col items-center gap-1">
            <ScoreRing score={readiness.overall||0} label="Overall" color="#6366f1" size={76} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <ScoreRing score={readiness.funding||0} label="Funding" color="#22d3ee" size={76} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <ScoreRing score={readiness.ipo||0} label="IPO" color="#f59e0b" size={76} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <ScoreRing score={readiness.dueDiligence||0} label="Documents" color="#10b981" size={76} />
          </div>
        </div>
        {readiness.fundingItems?.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-gray-50 pt-3">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Next Steps to Improve Funding Readiness</p>
            {readiness.fundingItems.filter(i => !i.done).slice(0,3).map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                {item.label}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Users} label="Investors" value={counts.investors||0} sub="in pipeline" color="indigo" onClick={() => onTabChange('investors')} />
        <StatCard icon={PieIcon} label="Shareholders" value={counts.shareholders||0} sub="on cap table" color="purple" onClick={() => onTabChange('cap-table')} />
        <StatCard icon={TrendingUp} label="Valuation" value={latestValuation ? fmt(latestValuation.value_mid, sym) : '—'} sub={latestValuation?.method || 'Not estimated'} color="green" onClick={() => onTabChange('valuation')} />
        <StatCard icon={Handshake} label="Partners" value={counts.partnerships||0} sub="active relationships" color="amber" onClick={() => onTabChange('partnerships')} />
      </div>

      {/* Profile snapshot */}
      <SectionCard>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900 text-sm">Company Growth Profile</h3>
          <button onClick={() => onTabChange('funding')} className="text-xs text-indigo-600 font-semibold flex items-center gap-1">Explore Funding <ChevronRight size={12}/></button>
        </div>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
          {[
            ['Stage', profile.stage || 'Not set'],
            ['Revenue', fmt(profile.annual_revenue, sym)],
            ['EBITDA', fmt(profile.ebitda, sym)],
            ['Target Raise', fmt(profile.target_raise_amount, sym)],
            ['Industry', profile.industry_vertical || '—'],
            ['Country', profile.country_code || 'IN'],
          ].map(([k, v]) => (
            <div key={k}><span className="text-gray-400">{k}</span><br/><span className="font-semibold text-gray-800">{v}</span></div>
          ))}
        </div>
      </SectionCard>

      {/* Quick nav */}
      <SectionCard>
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="space-y-1">
          {[
            { label: 'Set up your Cap Table', tab: 'cap-table', icon: Layers },
            { label: 'Upload Pitch Deck', tab: 'pitch-deck', icon: Presentation },
            { label: 'Find Government Schemes', tab: 'schemes', icon: Landmark },
            { label: 'Ask AI Growth Advisor', tab: 'advisor', icon: Bot },
          ].map(({ label, tab, icon: Icon }) => (
            <button key={tab} onClick={() => onTabChange(tab)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors text-sm text-gray-700 font-medium">
              <div className="flex items-center gap-3"><Icon size={15} className="text-indigo-500" />{label}</div>
              <ChevronRight size={14} className="text-gray-300" />
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
