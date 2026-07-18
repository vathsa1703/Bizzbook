import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Loader2, TrendingUp, TrendingDown, Target, Zap, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';

export default function SpendIntelligence() {
  const [healthData, setHealthData] = useState(null);
  const [channelData, setChannelData] = useState(null);
  const [budgetData, setBudgetData] = useState(null);
  const [segmentPriority, setSegmentPriority] = useState(null);
  const [breakEvenData, setBreakEvenData] = useState(null);
  const [timeframe, setTimeframe] = useState('30');
  
  const [budgetInput, setBudgetInput] = useState('');
  const [calculatingBudget, setCalculatingBudget] = useState(false);

  const [simCustomers, setSimCustomers] = useState(100);
  const [simCac, setSimCac] = useState(300);

  const [weeklyRec, setWeeklyRec] = useState(null);
  const [reportCards, setReportCards] = useState([]);
  const [flags, setFlags] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadHealthScore();
  }, [timeframe]);

  const loadHealthScore = async () => {
    try {
      setLoading(true);
      const [health, channels, budget, segments, breakEven, rec, reports, activeFlags] = await Promise.all([
        api.marketing.getHealthScore(),
        api.marketing.getChannelROI(),
        api.marketing.getBudgetSplit(),
        api.marketing.getSegmentPriority(timeframe),
        api.marketing.getBreakEven('1year'),
        api.marketing.getWeeklyRecommendation(),
        api.marketing.getReportCards(),
        api.marketing.getFlags()
      ]);
      setHealthData(health);
      setChannelData(channels);
      setBudgetData(budget);
      setBudgetInput(budget.recommendedBudget);
      setSegmentPriority(segments);
      setBreakEvenData(breakEven);
      if (breakEven) {
        setSimCac(breakEven.immediateCAC);
      }
      setWeeklyRec(rec);
      setReportCards(reports);
      setFlags(activeFlags);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBudgetRecalculate = async () => {
    try {
      setCalculatingBudget(true);
      const data = await api.marketing.getBudgetSplit(budgetInput);
      setBudgetData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setCalculatingBudget(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-400 dark:text-slate-500">
        <Loader2 className="animate-spin w-8 h-8 mr-3" />
        <span className="font-medium">Calculating Store Health Score...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl m-6 border border-red-200 dark:border-red-500/25 flex items-center gap-3">
        <AlertTriangle />
        <div>
          <h4 className="font-bold">Failed to load Spend Intelligence</h4>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!healthData) return null;

  const { overall_score, grade, score_change, components, top_strength, biggest_weakness, recommended_actions } = healthData;

  const gradeColors = {
    'A': 'text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25',
    'B': 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/25',
    'C': 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/25',
    'D': 'text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/25',
    'F': 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25'
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'bg-emerald-400';
    if (score >= 60) return 'bg-yellow-400';
    return 'bg-red-400';
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 bg-panel2 dark:bg-panel2-dark min-h-screen">

      {/* ─── Weekly Recommendation Banner ─── */}
      {weeklyRec && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl flex flex-col md:flex-row items-center justify-between border-4 border-indigo-200 dark:border-indigo-500/25/20">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm shadow-inner">
              <Zap size={28} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-xs font-black text-blue-200 uppercase tracking-widest mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                AI Co-Pilot Recommendation
              </p>
              <p className="text-xl font-bold">{weeklyRec.recommendation}</p>
            </div>
          </div>
          <button className="w-full md:w-auto px-8 py-3 bg-panel dark:bg-panel-dark text-indigo-700 dark:text-indigo-400 font-black rounded-xl shadow-lg hover:bg-indigo-50 hover:scale-105 transition-all">
            Execute Now
          </button>
        </div>
      )}

      {/* ─── Do Not Spend Flags ─── */}
      {flags && flags.length > 0 && (
        <div className="space-y-3">
          {flags.map((flag, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border-l-4 border-red-500 shadow-sm flex items-start gap-4">
              <AlertTriangle className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" size={24} />
              <div>
                <p className="font-black text-red-900 uppercase text-xs tracking-wider mb-0.5">Do Not Spend: {flag.target}</p>
                <p className="text-sm font-bold text-red-700 dark:text-red-400">{flag.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl p-8 text-white flex flex-col md:flex-row items-center justify-between shadow-xl">
        <div className="flex-1 mb-6 md:mb-0">
          <div className="flex items-center gap-2 mb-2 opacity-80">
            <ShieldCheck size={20} />
            <span className="font-bold tracking-widest uppercase text-xs">Phase 2: Spend Intelligence</span>
          </div>
          <h2 className="text-3xl font-black mb-2">Store Health Score</h2>
          <p className="text-gray-300 dark:text-slate-600 text-sm max-w-md leading-relaxed">
            A single, normalized score summarizing your marketing efficiency, retention, engagement, and customer sentiment based on real transactional data.
          </p>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="text-center">
            <div className={`text-6xl font-black mb-1 ${gradeColors[grade].split(' ')[0]}`}>
              {overall_score}
            </div>
            <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Out of 100</div>
          </div>
          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-black border-4 ${gradeColors[grade]}`}>
            {grade}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Diagnostics */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Trend & Verdict */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm flex items-start gap-4">
              <div className={`p-3 rounded-xl ${score_change >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                {score_change >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Score Trend</p>
                <div className="text-xl font-black text-inkA dark:text-inkA-dark">
                  {score_change > 0 ? '+' : ''}{score_change} pts
                </div>
                <p className="text-xs text-inkB dark:text-inkB-dark mt-1">since last snapshot</p>
              </div>
            </div>

            <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Verdict</p>
                <Target size={16} className="text-gray-400 dark:text-slate-500" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-inkB dark:text-inkB-dark">Top Strength: <strong className="text-inkA dark:text-inkA-dark">{top_strength}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-inkB dark:text-inkB-dark">Weakness: <strong className="text-inkA dark:text-inkA-dark">{biggest_weakness}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Component Breakdown */}
          <div className="bg-panel dark:bg-panel-dark rounded-3xl border border-edge dark:border-edge-dark shadow-sm p-6">
            <h3 className="font-bold text-inkA dark:text-inkA-dark mb-6 flex items-center gap-2">
              <Zap size={18} className="text-yellow-500 dark:text-yellow-400" />
              Component Breakdown
            </h3>
            <div className="space-y-6">
              {Object.entries(components).map(([name, score]) => (
                <div key={name}>
                  <div className="flex justify-between text-sm font-bold text-inkA dark:text-inkA-dark mb-2">
                    <span>{name}</span>
                    <span>{score}/100</span>
                  </div>
                  <div className="h-3 bg-panel2 dark:bg-panel2-dark rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${getScoreColor(score)}`}
                      style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Top Actions */}
        <div className="bg-panel dark:bg-panel-dark rounded-3xl border border-edge dark:border-edge-dark shadow-sm p-6 flex flex-col h-full">
          <h3 className="font-bold text-inkA dark:text-inkA-dark mb-2 flex items-center gap-2">
            Top 3 Recommended Actions
          </h3>
          <p className="text-xs text-inkB dark:text-inkB-dark mb-6 leading-relaxed">
            Generated directly from the Marketing Signal Engine based on current confidence scores.
          </p>
          
          <div className="space-y-4 flex-1">
            {recommended_actions && recommended_actions.length > 0 ? (
              recommended_actions.map((action, i) => (
                <div key={i} className="p-4 rounded-xl bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark relative overflow-hidden group hover:border-gray-200 transition-colors">
                  <div className="absolute top-0 left-0 w-1 h-full bg-violet-500"></div>
                  <h4 className="font-bold text-sm text-inkA dark:text-inkA-dark mb-2 pr-8">{action.signal_name}</h4>
                  
                  {action.metadata && (
                    <div className="text-xs text-inkB dark:text-inkB-dark mb-3 bg-panel dark:bg-panel-dark p-2 rounded-lg border border-edge dark:border-edge-dark">
                      {JSON.parse(action.metadata).subtext || 'Opportunity detected in knowledge graph.'}
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider mt-auto">
                    <span className="text-violet-600 dark:text-violet-400">Confidence: {Math.round(action.confidence_score)}%</span>
                    <span className="text-orange-500 dark:text-orange-400">Urgency: {Math.round(action.urgency_score)}/100</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-400 dark:text-slate-500 py-10 flex flex-col items-center">
                <ShieldCheck size={40} className="mb-3 opacity-20" />
                <p className="text-sm font-medium text-inkB dark:text-inkB-dark">No urgent actions needed.</p>
                <p className="text-xs mt-1">Your store is running perfectly.</p>
              </div>
            )}
          </div>
          
          <button className="w-full mt-6 py-3 rounded-xl bg-gray-900 text-white text-xs font-bold uppercase tracking-widest hover:bg-gray-800 transition-colors">
            Execute Top Action
          </button>
        </div>

      </div>

      {/* ─── Channel Performance Ranking ─── */}
      {channelData && channelData.channels && (
        <div className="bg-panel dark:bg-panel-dark rounded-3xl border border-edge dark:border-edge-dark shadow-sm overflow-hidden mt-8">
          {/* ─── Header ─── */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-inkA dark:text-inkA-dark flex items-center gap-2">
            <Zap className="text-yellow-500 dark:text-yellow-400" />
            Spend Intelligence
          </h2>
          <p className="text-inkB dark:text-inkB-dark text-sm mt-1">Optimize your marketing budget to maximize ROI.</p>
        </div>
      </div>

      {/* ─── Weekly Recommendation Banner ─── */}
      {weeklyRec && (
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Zap size={24} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-200 uppercase tracking-widest mb-1">Weekly Recommendation</p>
              <p className="text-lg font-black">{weeklyRec.recommendation}</p>
            </div>
          </div>
          <button className="px-6 py-3 bg-panel dark:bg-panel-dark text-indigo-700 dark:text-indigo-400 font-bold rounded-xl shadow hover:bg-panel2 dark:hover:bg-panel2-dark transition-colors">
            Execute
          </button>
        </div>
      )}

      {/* ─── Do Not Spend Flags ─── */}
      {flags && flags.length > 0 && (
        <div className="mb-8 space-y-3">
          {flags.map((flag, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 flex items-start gap-3">
              <AlertTriangle className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-bold text-red-900 capitalize text-sm">Do Not Spend: {flag.target}</p>
                <p className="text-xs text-red-700 dark:text-red-400 mt-1">{flag.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}
          <div className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-panel dark:bg-panel-dark border-b border-edge dark:border-edge-dark text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                    <th className="p-4 pl-6">Channel</th>
                    <th className="p-4">Rupee-per-Rupee</th>
                    <th className="p-4">Total ROI</th>
                    <th className="p-4 text-right">Revenue</th>
                    <th className="p-4 text-right">Spend</th>
                    <th className="p-4 text-right">Conv. Rate</th>
                    <th className="p-4 pr-6 text-center">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge dark:divide-edge-dark">
                  {channelData.channels.map((ch, i) => {
                    const isPositive = ch.roi > 0;
                    return (
                      <tr key={ch.channel} className="hover:bg-panel2 dark:hover:bg-panel2-dark transition-colors group">
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark flex items-center justify-center font-bold text-xs uppercase">
                              #{i + 1}
                            </div>
                            <span className="font-bold text-inkA dark:text-inkA-dark capitalize">{ch.channel}</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm font-medium text-inkB dark:text-inkB-dark">
                          For every <strong className="text-inkA dark:text-inkA-dark">₹1</strong> spent, you made <strong className={isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>₹{(ch.roi + 1).toFixed(2)}</strong>
                        </td>
                        <td className="p-4">
                          <div className={`inline-flex items-center px-2 py-1 rounded border text-xs font-bold ${isPositive ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/25'}`}>
                            {isPositive ? '+' : ''}{(ch.roi * 100).toFixed(0)}%
                          </div>
                        </td>
                        <td className="p-4 text-right font-black text-inkA dark:text-inkA-dark">₹{ch.revenue.toLocaleString()}</td>
                        <td className="p-4 text-right text-inkB dark:text-inkB-dark font-medium">₹{ch.cost.toLocaleString()}</td>
                        <td className="p-4 text-right text-inkB dark:text-inkB-dark text-sm">{ch.conversionRate}%</td>
                        <td className="p-4 pr-6 text-center">
                          <div className="inline-flex justify-center items-center">
                            {ch.trend === 'up' && <TrendingUp size={16} className="text-emerald-500 dark:text-emerald-400" />}
                            {ch.trend === 'down' && <TrendingDown size={16} className="text-red-500 dark:text-red-400" />}
                            {ch.trend === 'same' && <span className="text-gray-300 dark:text-slate-600 font-bold text-lg leading-none">-</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {channelData.channels.length === 0 && (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-gray-400 dark:text-slate-500 text-sm">
                        No channel performance data available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Suggested Budget Split ─── */}
      {budgetData && (
        <div className="bg-panel dark:bg-panel-dark rounded-3xl border border-edge dark:border-edge-dark shadow-sm overflow-hidden mt-8">
          <div className="p-6 border-b border-edge dark:border-edge-dark bg-panel2 dark:bg-panel2-dark flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-black text-inkA dark:text-inkA-dark text-lg flex items-center gap-2">
                <Zap size={20} className="text-yellow-500 dark:text-yellow-400" />
                AI Suggested Budget Split
              </h3>
              <p className="text-xs text-inkB dark:text-inkB-dark mt-1">Smart allocation based on ROI, Conversion, and Signal Engine Confidence.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-inkB dark:text-inkB-dark">Budget:</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 font-bold">₹</span>
                <input 
                  type="number" 
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="pl-7 pr-3 py-2 w-32 rounded-xl border border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark font-black focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <button 
                onClick={handleBudgetRecalculate}
                disabled={calculatingBudget}
                className="bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-gray-800 disabled:opacity-50"
              >
                {calculatingBudget ? '...' : 'Optimize'}
              </button>
            </div>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left: Projected Returns */}
              <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-2xl p-6 border border-violet-200 dark:border-violet-500/25 flex flex-col justify-center text-center">
                <div className="mb-6">
                  <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-widest mb-2">Expected Revenue Range</p>
                  <h4 className="text-3xl font-black text-violet-900">
                    ₹{budgetData.expectedRevenueRange.min.toLocaleString()} <span className="text-violet-400 mx-1">–</span> ₹{budgetData.expectedRevenueRange.max.toLocaleString()}
                  </h4>
                </div>
                
                <div className="grid grid-cols-2 gap-4 border-t border-violet-200 dark:border-violet-500/25 pt-6">
                  <div>
                    <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider mb-1">Expected Return / ₹1</p>
                    <p className="text-xl font-black text-violet-900">₹{(budgetData.expectedROI + 1).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider mb-1">Confidence</p>
                    <p className="text-xl font-black text-violet-900">{budgetData.confidence}%</p>
                  </div>
                </div>
              </div>

              {/* Middle: Allocations */}
              <div className="lg:col-span-2 space-y-6">
                <div>
                  <h4 className="font-bold text-sm text-inkA dark:text-inkA-dark mb-4">Recommended Allocation</h4>
                  <div className="flex w-full h-8 rounded-xl overflow-hidden shadow-sm bg-panel2 dark:bg-panel2-dark">
                    {budgetData.allocation.map((alloc, i) => {
                      const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-orange-500', 'bg-yellow-500'];
                      return (
                        <div 
                          key={alloc.channel}
                          style={{ width: `${alloc.percentage}%` }}
                          className={`${colors[i % colors.length]} h-full transition-all duration-500 border-r border-white/20 last:border-0`}
                          title={`${alloc.channel}: ${alloc.percentage}%`}
                        />
                      );
                    })}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    {budgetData.allocation.map((alloc, i) => {
                      const textColors = ['text-emerald-500 dark:text-emerald-400', 'text-blue-500 dark:text-blue-400', 'text-orange-500 dark:text-orange-400', 'text-yellow-500 dark:text-yellow-400'];
                      return (
                        <div key={alloc.channel} className="bg-panel2 dark:bg-panel2-dark rounded-xl p-3 border border-edge dark:border-edge-dark">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className={`w-2.5 h-2.5 rounded-full ${textColors[i % textColors.length].replace('text-', 'bg-')}`}></div>
                            <span className="text-[10px] font-bold text-inkB dark:text-inkB-dark uppercase tracking-wider capitalize">{alloc.channel}</span>
                          </div>
                          <div className="font-black text-inkA dark:text-inkA-dark">₹{alloc.amount.toLocaleString()}</div>
                          <div className="text-xs text-gray-400 dark:text-slate-500 font-medium">{alloc.percentage}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-panel2 dark:bg-panel2-dark rounded-2xl p-5 border border-edge dark:border-edge-dark">
                  <h4 className="font-bold text-xs text-inkA dark:text-inkA-dark mb-3 flex items-center gap-2">
                    <Zap size={14} className="text-violet-500 dark:text-violet-400" /> AI Reasoning
                  </h4>
                  <ul className="space-y-2">
                    {budgetData.reasoning.map((reason, i) => (
                      <li key={i} className="text-sm text-inkB dark:text-inkB-dark flex items-start gap-2 leading-relaxed">
                        <span className="text-violet-400 mt-1">•</span> {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ─── Segment Spend Priority ─── */}
      <div className="bg-panel dark:bg-panel-dark rounded-3xl border border-edge dark:border-edge-dark shadow-sm overflow-hidden mt-8">
        <div className="p-6 border-b border-edge dark:border-edge-dark bg-panel2 dark:bg-panel2-dark flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-inkA dark:text-inkA-dark text-lg flex items-center gap-2">
              <Target size={20} className="text-rose-500 dark:text-rose-400" />
              Audience ROI Ranking
            </h3>
            <p className="text-xs text-inkB dark:text-inkB-dark mt-1">Discover your most profitable segments to target with paid campaigns.</p>
          </div>
          
          <div className="flex bg-gray-200/50 p-1 rounded-xl">
            {['30', '90', '365', 'all'].map(t => (
              <button 
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${timeframe === t ? 'bg-panel dark:bg-panel-dark shadow-sm text-inkA dark:text-inkA-dark' : 'text-inkB dark:text-inkB-dark hover:text-gray-700'}`}
              >
                {t === '30' ? '30 Days' : t === '90' ? '90 Days' : t === '365' ? '1 Year' : 'All Time'}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {!segmentPriority || segmentPriority.segments.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-slate-500">
              <ShieldCheck size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium text-inkB dark:text-inkB-dark">No segment data found for this period.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {segmentPriority.segments.map((seg, i) => {
                const isHighPriority = seg.priorityScore >= 80;
                const isMedium = seg.priorityScore >= 50 && seg.priorityScore < 80;
                
                let badgeStyle = 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark border-edge dark:border-edge-dark';
                if (seg.status.includes('Scale') || seg.status.includes('Increase')) badgeStyle = 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/25';
                else if (seg.status.includes('Maintain')) badgeStyle = 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/25';
                else if (seg.status.includes('Test')) badgeStyle = 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/25';

                return (
                  <div key={seg.id} className="p-5 rounded-2xl border border-edge dark:border-edge-dark hover:border-gray-200 transition-colors bg-panel dark:bg-panel-dark flex flex-col md:flex-row gap-6 md:items-center">
                    
                    {/* Header & Status */}
                    <div className="md:w-1/3">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`text-xl ${isHighPriority ? 'text-rose-500 dark:text-rose-400' : isMedium ? 'text-amber-500 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'}`}>
                          {seg.status.split(' ')[0]}
                        </div>
                        <h4 className="font-bold text-inkA dark:text-inkA-dark text-lg capitalize">{seg.name.replace(/_/g, ' ')}</h4>
                      </div>
                      <div className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${badgeStyle}`}>
                        {seg.status.substring(2)}
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Priority</p>
                        <div className="flex items-end gap-1">
                          <span className="text-2xl font-black text-inkA dark:text-inkA-dark leading-none">{seg.priorityScore}</span>
                          <span className="text-xs font-bold text-gray-400 dark:text-slate-500 mb-0.5">/100</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Return / ₹1</p>
                        <span className="text-xl font-black text-inkA dark:text-inkA-dark leading-none">₹{(seg.roi + 1).toFixed(2)}</span>
                      </div>
                      {seg.suggestedSpend > 0 ? (
                        <>
                          <div>
                            <p className="text-[10px] font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wider mb-1">Suggested Spend</p>
                            <span className="text-xl font-black text-rose-600 dark:text-rose-400 leading-none">₹{seg.suggestedSpend.toLocaleString()}</span>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider mb-1">Expected Gain</p>
                            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-none">₹{seg.expectedGain.toLocaleString()}</span>
                          </div>
                        </>
                      ) : (
                        <div className="col-span-2">
                          <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Recommendation</p>
                          <span className="text-sm font-medium text-inkB dark:text-inkB-dark leading-none">Limit paid marketing. Rely on organic channels.</span>
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Break-Even Economics ─── */}
      {breakEvenData && (
        <div className="bg-panel dark:bg-panel-dark rounded-3xl border border-edge dark:border-edge-dark shadow-sm overflow-hidden mt-8">
          <div className="p-6 border-b border-edge dark:border-edge-dark bg-panel2 dark:bg-panel2-dark flex items-center gap-4">
            <h3 className="font-black text-inkA dark:text-inkA-dark text-lg flex items-center gap-2">
              <ShieldCheck size={20} className="text-emerald-500 dark:text-emerald-400" />
              Break-Even Economics
            </h3>
            <p className="text-xs text-inkB dark:text-inkB-dark mt-0.5 hidden sm:block">Determine your maximum allowable acquisition cost.</p>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left: Core Metrics & Zones */}
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-panel2 dark:bg-panel2-dark p-4 rounded-2xl border border-edge dark:border-edge-dark text-center">
                  <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Average Order</p>
                  <p className="text-xl font-black text-inkA dark:text-inkA-dark">₹{breakEvenData.aov.toLocaleString()}</p>
                </div>
                <div className="bg-panel2 dark:bg-panel2-dark p-4 rounded-2xl border border-edge dark:border-edge-dark text-center">
                  <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Gross Margin</p>
                  <p className="text-xl font-black text-inkA dark:text-inkA-dark">{breakEvenData.grossMargin}%</p>
                </div>
                <div className="bg-panel2 dark:bg-panel2-dark p-4 rounded-2xl border border-edge dark:border-edge-dark text-center">
                  <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">1-Year LTV</p>
                  <p className="text-xl font-black text-inkA dark:text-inkA-dark">₹{breakEvenData.ltv.toLocaleString()}</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-sm text-inkA dark:text-inkA-dark mb-3 border-b border-edge dark:border-edge-dark pb-2">Maximum Allowable CAC</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 dark:border-amber-500/25 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-amber-700 dark:text-amber-400 text-sm">Immediate</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400/70">Break-even on first purchase</p>
                    </div>
                    <p className="text-2xl font-black text-amber-700 dark:text-amber-400">₹{breakEvenData.immediateCAC}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 dark:border-blue-500/25 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-blue-700 dark:text-blue-400 text-sm">Lifetime</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400/70">Break-even over 1 Year</p>
                    </div>
                    <p className="text-2xl font-black text-blue-700 dark:text-blue-400">₹{breakEvenData.ltvCAC}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-sm text-inkA dark:text-inkA-dark mb-3 border-b border-edge dark:border-edge-dark pb-2">Profitability Zones</h4>
                <div className="space-y-2">
                  {breakEvenData.profitZones.map((zone, i) => (
                    <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark">
                      <span className="font-bold text-sm text-inkB dark:text-inkB-dark">{zone.label}</span>
                      <span className="text-sm font-bold text-inkB dark:text-inkB-dark">
                        {zone.max ? `₹${zone.min} - ₹${zone.max}` : `₹${zone.min}+`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Simulator */}
            <div className="bg-gray-900 rounded-3xl p-6 text-white shadow-lg flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 transform translate-x-1/2 -translate-y-1/2"></div>
              
              <h4 className="font-black text-lg mb-6 flex items-center gap-2">
                <Zap className="text-yellow-400" size={18} />
                Campaign Simulator
              </h4>

              <div className="grid grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Target Customers</label>
                  <input 
                    type="number" 
                    value={simCustomers}
                    onChange={e => setSimCustomers(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-xl font-black focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Expected CAC (₹)</label>
                  <input 
                    type="number" 
                    value={simCac}
                    onChange={e => setSimCac(Number(e.target.value))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-xl font-black focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              <div className="mt-auto pt-6 border-t border-gray-800">
                {(() => {
                  const rev = simCustomers * breakEvenData.ltv;
                  const cost = simCustomers * simCac;
                  const profit = (rev * (breakEvenData.grossMargin / 100)) - cost;
                  const roi = cost > 0 ? (profit / cost) : 0;
                  const isProfitable = profit >= 0;

                  return (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Expected Revenue</p>
                        <p className="text-2xl font-black">₹{rev.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Net Profit</p>
                        <p className={`text-2xl font-black ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isProfitable ? '+' : '-'}₹{Math.abs(profit).toLocaleString()}
                        </p>
                      </div>
                      <div className="mt-2">
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Return / ₹1</p>
                        <p className={`text-lg font-bold ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                          ₹{(roi + 1).toFixed(2)}
                        </p>
                      </div>
                      <div className="mt-2">
                        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">AI Confidence</p>
                        <p className="text-lg font-bold text-emerald-400">{breakEvenData.confidence}%</p>
                      </div>
                    </div>
                  );
                })()}
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ─── Post-Spend Report Cards ─── */}
      {reportCards && reportCards.length > 0 && (
        <div className="bg-panel dark:bg-panel-dark rounded-3xl border border-edge dark:border-edge-dark shadow-sm overflow-hidden mt-8">
          <div className="p-6 border-b border-edge dark:border-edge-dark bg-panel2 dark:bg-panel2-dark flex items-center gap-4">
            <h3 className="font-black text-inkA dark:text-inkA-dark text-lg flex items-center gap-2">
              <ShieldCheck size={20} className="text-indigo-500 dark:text-indigo-400" />
              Post-Spend Report Cards
            </h3>
            <p className="text-xs text-inkB dark:text-inkB-dark mt-0.5 hidden sm:block">Grades for your recently completed campaigns.</p>
          </div>
          <div className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-panel2/50 dark:bg-panel2-dark/50 border-b border-edge dark:border-edge-dark">
                    <th className="p-4 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest pl-6">Campaign</th>
                    <th className="p-4 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Spend</th>
                    <th className="p-4 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Revenue</th>
                    <th className="p-4 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest">Return / ₹1</th>
                    <th className="p-4 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest pr-6">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge dark:divide-edge-dark">
                  {reportCards.map((report) => (
                    <tr key={report.id} className="hover:bg-panel2/60 dark:hover:bg-panel2-dark/60 transition-colors">
                      <td className="p-4 pl-6 font-bold text-inkA dark:text-inkA-dark">{report.name}</td>
                      <td className="p-4 text-inkB dark:text-inkB-dark font-medium">₹{report.spend.toLocaleString()}</td>
                      <td className="p-4 text-inkA dark:text-inkA-dark font-bold">₹{report.revenue.toLocaleString()}</td>
                      <td className="p-4 text-inkA dark:text-inkA-dark font-black">₹{(report.roi + 1).toFixed(2)}</td>
                      <td className="p-4 pr-6">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-black text-sm
                          ${report.grade === 'A' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' :
                            report.grade === 'B' ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400' :
                            report.grade === 'C' ? 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' :
                            report.grade === 'D' ? 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400' :
                            'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400'
                          }
                        `}>
                          {report.grade}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
