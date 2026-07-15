import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, Calendar, Zap, Beaker, Users, ArrowRight, Loader2, Target, CheckCircle, Clock } from 'lucide-react';
import { api } from '../../api/client';

function fmt(n) { return Math.round(n || 0).toLocaleString('en-IN'); }

export default function CopilotDashboardView() {
  const [feed, setFeed] = useState(null);
  const [insights, setInsights] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [opportunities, setOpportunities] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedCampaign, setGeneratedCampaign] = useState(null);

  useEffect(() => {
    Promise.all([
      api.marketing.getCopilotDashboard().catch(() => ({ feed: [] })),
      api.marketing.getInsights().catch(() => ({ insights: {} })),
      api.marketing.getCalendar().catch(() => ({ events: [] })),
      api.marketing.getNewOpportunities().catch(() => ({ opportunities: [] }))
    ]).then(([f, i, c, o]) => {
      setFeed(f.feed || []);
      setInsights(i.insights || {});
      setCalendar(c.events || []);
      setOpportunities(o.opportunities || []);
      setLoading(false);
    });
  }, []);

  const handleLaunch = async (intent) => {
    setGenerating(true);
    try {
      const res = await api.marketing.generateCopilotCampaign({ intent });
      setGeneratedCampaign(res.campaign);
    } catch (err) {
      alert('Generation failed: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center py-20"><Loader2 className="animate-spin text-gray-300" size={32} /></div>;
  }

  // Find the top opportunity from feed
  const topOpp = feed.length > 0 ? feed[0] : null;

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
            <p className="text-lg text-gray-300 font-medium mb-6">
              This week you have an opportunity to increase revenue by <span className="text-emerald-400 font-bold">₹{fmt(topOpp.metadata?.estimatedRevenue || 24000)}</span>.
            </p>
            
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 mb-6 border border-white/10">
              <h3 className="text-xs font-bold uppercase tracking-widest text-violet-300 mb-3">Why?</h3>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {topOpp.content}</li>
                <li className="flex items-center gap-2 text-sm"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Recent trends show increased engagement in this segment.</li>
              </ul>
            </div>

            <div className="flex items-center gap-6">
              <button 
                onClick={() => handleLaunch(topOpp.intentString)}
                disabled={generating}
                className="bg-white text-gray-900 px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg"
              >
                {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-violet-600" />}
                One-Click Launch
              </button>
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Expected ROI</p>
                  <p className="text-xl font-black text-white">3.8x</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Confidence</p>
                  <p className="text-xl font-black text-emerald-400">91%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm text-center">
          <h2 className="text-xl font-bold text-gray-900">AI is analyzing your business...</h2>
          <p className="text-gray-500 mt-2 text-sm">Check back later for personalized growth opportunities.</p>
        </div>
      )}

      {/* Generated Campaign Modal-like Area */}
      {generatedCampaign && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 relative">
          <button onClick={() => setGeneratedCampaign(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">×</button>
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-emerald-500 w-10 h-10 rounded-xl flex items-center justify-center">
              <CheckCircle size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-black text-gray-900 text-lg">Campaign Generated Successfully</h3>
              <p className="text-xs font-bold text-emerald-700">{generatedCampaign.name}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm mb-4">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Message Draft (WhatsApp)</h4>
            <p className="text-sm font-medium text-gray-800">"{generatedCampaign.ai_content?.whatsappMessage || generatedCampaign.ai_content?.whatsapp || 'Drafted message...'}"</p>
          </div>
          <div className="flex justify-end">
            <button className="bg-gray-900 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-800">
              Review & Approve <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Grid of Intelligence Modules */}
      <div className="grid grid-cols-2 gap-4">
        
        {/* Customer Insights */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} className="text-blue-500" />
            <h3 className="font-bold text-gray-900">Customer Insights</h3>
          </div>
          {insights.vip && (
            <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-xs font-bold text-blue-900 mb-1">VIP Customers ({insights.vip.count})</p>
              <p className="text-[10px] text-blue-700 mb-2">Avg Spend: ₹{fmt(insights.vip.avgSpend)}</p>
              <button 
                onClick={() => handleLaunch(insights.vip.recommendation)}
                className="text-[10px] font-bold bg-white text-blue-700 px-3 py-1.5 rounded-lg shadow-sm w-full text-left flex justify-between items-center"
              >
                {insights.vip.recommendation} <ArrowRight size={12} />
              </button>
            </div>
          )}
          {insights.atRisk && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <p className="text-xs font-bold text-red-900 mb-1">At-Risk Customers ({insights.atRisk.count})</p>
              <p className="text-[10px] text-red-700 mb-2">{insights.atRisk.reason}</p>
              <button 
                onClick={() => handleLaunch(insights.atRisk.recommendation)}
                className="text-[10px] font-bold bg-white text-red-700 px-3 py-1.5 rounded-lg shadow-sm w-full text-left flex justify-between items-center"
              >
                {insights.atRisk.recommendation} <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Product Opportunities */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-orange-500" />
            <h3 className="font-bold text-gray-900">Product Opportunities</h3>
          </div>
          {opportunities.map((opp, i) => (
            <div key={i} className="mb-3 last:mb-0 p-3 bg-orange-50 rounded-xl border border-orange-100 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <p className="text-xs font-bold text-gray-900">{opp.product}</p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${opp.demand.startsWith('+') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{opp.demand}</span>
              </div>
              <button 
                onClick={() => handleLaunch(opp.recommendation)}
                className="text-[10px] font-bold bg-white text-orange-700 px-3 py-1.5 rounded-lg shadow-sm w-full text-left flex justify-between items-center"
              >
                {opp.recommendation} <ArrowRight size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Marketing Calendar */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={16} className="text-violet-500" />
            <h3 className="font-bold text-gray-900">Upcoming Events</h3>
          </div>
          {calendar.map((ev, i) => (
            <div key={i} className="mb-3 last:mb-0 p-3 bg-violet-50 rounded-xl border border-violet-100">
              <div className="flex justify-between mb-1">
                <p className="text-xs font-bold text-gray-900">{ev.name}</p>
                <p className="text-[10px] font-bold text-violet-600">{ev.date}</p>
              </div>
              <button 
                onClick={() => handleLaunch(`Create a campaign for ${ev.name}`)}
                className="text-[10px] font-bold bg-white text-violet-700 px-3 py-1.5 rounded-lg shadow-sm w-full text-left mt-2 flex justify-between items-center"
              >
                Launch {ev.suggestedCampaign} <ArrowRight size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Experiment Engine */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Beaker size={16} className="text-emerald-500" />
            <h3 className="font-bold text-gray-900">Active Experiments</h3>
          </div>
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Winning Variant Detected</p>
            <p className="text-lg font-black text-gray-900 mb-1">Offer B (15% Off)</p>
            <p className="text-xs font-medium text-gray-600 mb-3">+12% Higher Conversion Rate</p>
            <button className="text-xs font-bold bg-emerald-600 text-white px-4 py-2 rounded-xl shadow hover:bg-emerald-700 w-full">
              Deploy to 100% Audience
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
