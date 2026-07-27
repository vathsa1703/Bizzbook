import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, Calendar, Zap, Beaker, Users, ArrowRight, Loader2, Target, CheckCircle, Clock } from 'lucide-react';
import { api } from '../../api/client';

function fmt(n) { return Math.round(n || 0).toLocaleString('en-IN'); }

export default function CopilotDashboardView() {
  // feed is { headlineOpportunity, recentRecommendations } (see
  // marketingCopilotService.js's getDashboardFeed) -- not an array. It was
  // previously treated as one (`feed.length > 0 ? feed[0] : null`), which is
  // always false for a plain object, so the "AI is analyzing..." empty state
  // rendered permanently regardless of whether real data had loaded.
  const [feed, setFeed] = useState(null);
  const [insights, setInsights] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [opportunities, setOpportunities] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [generatedCampaign, setGeneratedCampaign] = useState(null);
  const [generatedCampaignId, setGeneratedCampaignId] = useState(null);
  const [approvedCampaign, setApprovedCampaign] = useState(null);

  useEffect(() => {
    Promise.all([
      api.marketing.getCopilotDashboard().catch(() => ({ feed: null })),
      api.marketing.getInsights().catch(() => ({ insights: {} })),
      api.marketing.getCalendar().catch(() => ({ events: [] })),
      api.marketing.getNewOpportunities().catch(() => ({ opportunities: [] }))
    ]).then(([f, i, c, o]) => {
      setFeed(f.feed || null);
      setInsights(i.insights || {});
      setCalendar(c.events || []);
      setOpportunities(o.opportunities || []);
      setLoading(false);
    });
  }, []);

  const handleLaunch = async (intent) => {
    if (generating) return; // one generation in flight at a time -- launch buttons aren't individually disabled, so this stops overlapping clicks from racing each other for the single result panel below
    setGenerating(true);
    setApprovedCampaign(null);
    try {
      const res = await api.marketing.generateCopilotCampaign({ intent });
      setGeneratedCampaign(res.draft);
      setGeneratedCampaignId(res.campaignId);
    } catch (err) {
      alert('Generation failed: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!generatedCampaignId || approving) return;
    setApproving(true);
    try {
      const res = await api.marketing.approveCopilotCampaign(generatedCampaignId);
      setApprovedCampaign(res.campaign);
    } catch (err) {
      alert('Approval failed: ' + err.message);
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center py-20"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={32} /></div>;
  }

  // Real shape from getDashboardFeed(): { title, reasons: [...], recommendedCampaign, expectedRoi, confidence }
  const topOpp = feed?.headlineOpportunity || null;

  return (
    <div className="space-y-6">
      {/* Top Banner: Intelligence instead of Stats */}
      {topOpp ? (
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Sparkles size={120} />
          </div>
          <div className="relative z-10 max-w-2xl">
            <h2 className="text-3xl font-black mb-2">Good Morning!</h2>
            <p className="text-lg text-gray-300 dark:text-slate-600 font-medium mb-6">
              {topOpp.title}
            </p>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 mb-6 border border-white/10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-violet-300 mb-3">Why?</h3>
              <ul className="space-y-2">
                {(topOpp.reasons || []).map((reason, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" /> {reason}</li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-6">
              <button
                onClick={() => handleLaunch(topOpp.recommendedCampaign)}
                disabled={generating}
                className="bg-panel dark:bg-panel-dark text-inkA dark:text-inkA-dark px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50"
              >
                {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-violet-600 dark:text-violet-400" />}
                One-Click Launch
              </button>
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-widest">Expected ROI</p>
                  <p className="text-xl font-black text-white">{topOpp.expectedRoi}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 font-bold uppercase tracking-widest">Confidence</p>
                  <p className="text-xl font-black text-emerald-400">{topOpp.confidence}%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-panel dark:bg-panel-dark rounded-3xl p-8 border border-edge dark:border-edge-dark shadow-sm text-center">
          <h2 className="text-xl font-bold text-inkA dark:text-inkA-dark">AI is analyzing your business...</h2>
          <p className="text-inkB dark:text-inkB-dark mt-2 text-sm">Check back later for personalized growth opportunities.</p>
        </div>
      )}

      {/* Generated Campaign Modal-like Area */}
      {generatedCampaign && (
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 rounded-3xl p-6 relative">
          <button onClick={() => { setGeneratedCampaign(null); setGeneratedCampaignId(null); setApprovedCampaign(null); }} className="absolute top-4 right-4 text-gray-400 dark:text-slate-500 hover:text-gray-600">×</button>
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-emerald-500 w-10 h-10 rounded-xl flex items-center justify-center">
              <CheckCircle size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-black text-inkA dark:text-inkA-dark text-lg">Campaign Generated Successfully</h3>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{generatedCampaign.campaignName}</p>
            </div>
          </div>
          <div className="bg-panel dark:bg-panel-dark rounded-2xl p-4 border border-emerald-200 dark:border-emerald-500/25 shadow-sm mb-4 space-y-2">
            <p className="text-xs text-inkB dark:text-inkB-dark">{generatedCampaign.description}</p>
            <p className="text-xs font-bold text-inkA dark:text-inkA-dark">Offer: {generatedCampaign.offer}</p>
            <h4 className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 mt-3">Message Draft (WhatsApp)</h4>
            <p className="text-sm font-medium text-inkA dark:text-inkA-dark">"{generatedCampaign.copy?.whatsapp || 'Drafted message...'}"</p>
          </div>
          {approvedCampaign ? (
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-bold justify-end">
              <CheckCircle size={16} /> Campaign is live — visible in Marketing → Campaigns
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                onClick={handleApprove}
                disabled={approving}
                className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-800 disabled:opacity-50"
              >
                {approving ? <Loader2 size={14} className="animate-spin" /> : null}
                Review & Approve <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Grid of Intelligence Modules */}
      <div className="grid grid-cols-2 gap-4">
        
        {/* Customer Insights */}
        <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-blue-500 dark:text-blue-400" />
            <h3 className="font-bold text-inkA dark:text-inkA-dark">Customer Insights</h3>
          </div>
          {insights.vip && (
            <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-200 dark:border-blue-500/25">
              <p className="text-xs font-bold text-blue-900 mb-1">VIP Customers ({insights.vip.count})</p>
              <p className="text-[10px] text-blue-700 dark:text-blue-400 mb-2">Avg Spend: ₹{fmt(insights.vip.avgSpend)}</p>
              <button
                onClick={() => handleLaunch(insights.vip.recommendation)}
                disabled={generating}
                className="text-[10px] font-bold bg-panel dark:bg-panel-dark text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-lg shadow-sm w-full text-left flex justify-between items-center disabled:opacity-50"
              >
                {insights.vip.recommendation} <ArrowRight size={12} />
              </button>
            </div>
          )}
          {insights.atRisk && (
            <div className="p-3 bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-200 dark:border-red-500/25">
              <p className="text-xs font-bold text-red-900 mb-1">At-Risk Customers ({insights.atRisk.count})</p>
              <p className="text-[10px] text-red-700 dark:text-red-400 mb-2">{insights.atRisk.reason}</p>
              <button
                onClick={() => handleLaunch(insights.atRisk.recommendation)}
                disabled={generating}
                className="text-[10px] font-bold bg-panel dark:bg-panel-dark text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg shadow-sm w-full text-left flex justify-between items-center disabled:opacity-50"
              >
                {insights.atRisk.recommendation} <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Product Opportunities */}
        <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-orange-500 dark:text-orange-400" />
            <h3 className="font-bold text-inkA dark:text-inkA-dark">Product Opportunities</h3>
          </div>
          {opportunities.map((opp, i) => (
            <div key={i} className="mb-3 last:mb-0 p-3 bg-orange-50 dark:bg-orange-500/10 rounded-xl border border-orange-200 dark:border-orange-500/25 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <p className="text-xs font-bold text-inkA dark:text-inkA-dark">{opp.product}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${opp.demand.startsWith('+') ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400'}`}>{opp.demand}</span>
              </div>
              <button
                onClick={() => handleLaunch(opp.recommendation)}
                disabled={generating}
                className="text-[10px] font-bold bg-panel dark:bg-panel-dark text-orange-700 dark:text-orange-400 px-3 py-1.5 rounded-lg shadow-sm w-full text-left flex justify-between items-center disabled:opacity-50"
              >
                {opp.recommendation} <ArrowRight size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Marketing Calendar */}
        <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={16} className="text-violet-500 dark:text-violet-400" />
            <h3 className="font-bold text-inkA dark:text-inkA-dark">Upcoming Events</h3>
          </div>
          {calendar.map((ev, i) => (
            <div key={i} className="mb-3 last:mb-0 p-3 bg-violet-50 dark:bg-violet-500/10 rounded-xl border border-violet-200 dark:border-violet-500/25">
              <div className="flex justify-between mb-1">
                <p className="text-xs font-bold text-inkA dark:text-inkA-dark">{ev.name}</p>
                <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400">{ev.date}</p>
              </div>
              <button
                onClick={() => handleLaunch(`Create a campaign for ${ev.name}`)}
                disabled={generating}
                className="text-[10px] font-bold bg-panel dark:bg-panel-dark text-violet-700 dark:text-violet-400 px-3 py-1.5 rounded-lg shadow-sm w-full text-left mt-2 flex justify-between items-center disabled:opacity-50"
              >
                Launch {ev.suggestedCampaign} <ArrowRight size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Experiment Engine */}
        <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Beaker size={16} className="text-emerald-500 dark:text-emerald-400" />
            <h3 className="font-bold text-inkA dark:text-inkA-dark">Active Experiments</h3>
          </div>
          <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl border border-emerald-200 dark:border-emerald-500/25 text-center">
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Winning Variant Detected</p>
            <p className="text-lg font-black text-inkA dark:text-inkA-dark mb-1">Offer B (15% Off)</p>
            <p className="text-xs font-medium text-inkB dark:text-inkB-dark mb-3">+12% Higher Conversion Rate</p>
            <button className="text-xs font-bold bg-emerald-600 text-white px-4 py-2 rounded-xl shadow hover:bg-emerald-700 w-full">
              Deploy to 100% Audience
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
