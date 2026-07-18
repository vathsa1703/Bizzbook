import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import {
  TrendingUp, Users, Package, ChevronRight, ArrowLeft,
  Target, AlertTriangle, CheckCircle, Clock, XCircle,
  Sparkles, BarChart2, Loader2, Play, Pause, Download, Crown, Gem, Repeat, Star, Moon, ArrowUpRight, RefreshCw
} from 'lucide-react';
import { api } from '../api/client';
import SpendIntelligence from './SpendIntelligence';
import AutomationList from '../components/automations/AutomationList';
import AutomationForm from '../components/automations/AutomationForm';

const WalletView = lazy(() => import('../components/marketing/WalletView'));
const SegmentsView = lazy(() => import('../components/marketing/SegmentsView'));
const CouponsView = lazy(() => import('../components/marketing/CouponsView'));
const ReferralsView = lazy(() => import('../components/marketing/ReferralsView'));
const SurveysView = lazy(() => import('../components/marketing/SurveysView'));
const CommunicationCenterView = lazy(() => import('../components/marketing/CommunicationCenterView'));
const ReportsView = lazy(() => import('../components/marketing/ReportsView'));
const CopilotDashboardView = lazy(() => import('../components/marketing/CopilotDashboardView'));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) { return Math.round(n || 0).toLocaleString('en-IN'); }

const PRIORITY_STYLES = {
  High:   'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/25',
  Medium: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/25',
  Low:    'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/25',
};

const TYPE_META = {
  revenue_recovery:      { Icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', label: 'Revenue Recovery'      },
  customer_retention:    { Icon: Users,      color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-500/10',    label: 'Customer Retention'    },
  dead_stock_liquidation:{ Icon: Package,    color: 'text-orange-600 dark:text-orange-400',  bg: 'bg-orange-50 dark:bg-orange-500/10',  label: 'Dead Stock Liquidation'},
  cross_sell:            { Icon: Target,     color: 'text-violet-600 dark:text-violet-400',  bg: 'bg-violet-50 dark:bg-violet-500/10',  label: 'Cross-Sell / Bundle'   },
};

const SEGMENT_ICONS = {
  crown: Crown, alert: AlertTriangle, gem: Gem, repeat: Repeat, star: Star, sleep: Moon
};

const CAMPAIGN_STATUS_META = {
  draft:     { label: 'Draft',     Icon: Clock,         color: 'text-inkB dark:text-inkB-dark',  bg: 'bg-panel2 dark:bg-panel2-dark'  },
  ready:     { label: 'Ready',     Icon: CheckCircle,   color: 'text-violet-600 dark:text-violet-400',bg: 'bg-violet-100 dark:bg-violet-500/15'},
  active:    { label: 'Active',    Icon: Play,          color: 'text-emerald-600 dark:text-emerald-400',bg: 'bg-emerald-100 dark:bg-emerald-500/15'},
  paused:    { label: 'Paused',    Icon: Pause,         color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/15' },
  completed: { label: 'Completed', Icon: CheckCircle,   color: 'text-blue-600 dark:text-blue-400',  bg: 'bg-blue-100 dark:bg-blue-500/15'  },
  cancelled: { label: 'Cancelled', Icon: XCircle,       color: 'text-red-500 dark:text-red-400',   bg: 'bg-red-100 dark:bg-red-500/15'   },
};

function ConfidenceBar({ score, label = "Score" }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-400 dark:text-slate-500 mb-1 uppercase tracking-wide font-medium">
        <span>{label}</span>
        <span>{score}/100</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-panel2 dark:bg-panel2-dark rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Opportunities Tab ────────────────────────────────────────────────────────

function OpportunityCard({ opp, onGenerate }) {
  const meta = TYPE_META[opp.type] || TYPE_META.revenue_recovery;
  const { Icon, color, bg } = meta;

  return (
    <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark shadow-sm overflow-hidden mb-4">
      <div className="p-4 border-b border-edge dark:border-edge-dark">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon size={20} className={color} />
            </div>
            <div>
              <p className="font-bold text-inkA dark:text-inkA-dark text-sm leading-tight">{opp.name}</p>
              <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[opp.priority] || PRIORITY_STYLES.Medium}`}>
                {opp.priority} Priority
              </span>
            </div>
          </div>
          <div className="text-right flex-shrink-0 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-500/25">
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Est. Revenue</p>
            <p className="text-lg font-black text-emerald-700 dark:text-emerald-400 leading-tight">₹{fmt(opp.expectedImpact)}</p>
          </div>
        </div>
        
        <div className="bg-panel2 dark:bg-panel2-dark rounded-xl p-3 mb-4 border border-edge dark:border-edge-dark">
          <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
            <Sparkles size={12} className="text-amber-500 dark:text-amber-400" /> Detected Because
          </p>
          <p className="text-xs text-inkB dark:text-inkB-dark font-medium leading-relaxed">{opp.detectedBecause}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-2">
          <ConfidenceBar score={opp.overall_score || 0} label="Opportunity Score" />
          <ConfidenceBar score={opp.confidenceScore || 0} label="AI Confidence" />
        </div>
      </div>
      
      <button
        onClick={() => onGenerate(opp)}
        className="w-full py-3 bg-gray-900 text-white text-xs font-bold active:bg-gray-800 transition-colors flex items-center justify-center gap-2"
      >
        <Sparkles size={14} className="text-violet-300" /> Generate AI Strategy & Campaign
      </button>
    </div>
  );
}

// ─── Generate Campaign Modal ──────────────────────────────────────────────────

function GenerateCampaignModal({ opportunity, onClose, onCreated }) {
  const [objective, setObjective] = useState(opportunity?.type === 'revenue_recovery' ? 'Recover pending payments' : 'Win Back Customers');
  const [segmentId, setSegmentId] = useState('');
  const [couponId, setCouponId] = useState('');
  const [channel, setChannel] = useState('sms');
  const [generating, setGenerating] = useState(false);

  const [segments, setSegments] = useState([]);
  const [coupons, setCoupons] = useState([]);

  useEffect(() => {
    api.marketing.getSegments().then(r => setSegments(r.segments || [])).catch(()=>null);
    api.marketing.getCoupons().then(r => setCoupons(r.coupons || [])).catch(()=>null);
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.marketing.generateCampaign({ 
        opportunityId: opportunity.id, 
        objective,
        segmentId: segmentId ? Number(segmentId) : undefined,
        coupon_id: couponId ? Number(couponId) : undefined,
        channel
      });
      onCreated();
    } catch (e) {
      alert('Failed: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const objectives = [
    { id: 'Win Back Customers', label: 'Win Back Customers' },
    { id: 'Recover pending payments', label: 'Recover Pending Payments' },
    { id: 'Upsell High Value Products', label: 'Upsell High Value Products' },
    { id: 'Clear Dead Stock', label: 'Clear Dead Stock' },
    { id: 'Request Reviews/Referrals', label: 'Request Reviews/Referrals' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-panel dark:bg-panel-dark w-full max-w-md rounded-t-3xl p-6 pb-8 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />
        <h3 className="font-black text-inkA dark:text-inkA-dark text-xl mb-1">Generate AI Strategy</h3>
        <p className="text-xs text-inkB dark:text-inkB-dark mb-4 leading-relaxed">
          Creating a full consultant report and marketing campaign for: <strong>{opportunity.name}</strong>
        </p>

        <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">Campaign Objective</label>
        <select value={objective} onChange={e=>setObjective(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm mb-4 bg-panel2 dark:bg-panel2-dark">
          {objectives.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>

        <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">Target Segment (Optional)</label>
        <select value={segmentId} onChange={e=>setSegmentId(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm mb-4 bg-panel2 dark:bg-panel2-dark">
          <option value="">-- Let AI Decide --</option>
          {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">Attach Coupon (Optional)</label>
        <select value={couponId} onChange={e=>setCouponId(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm mb-4 bg-panel2 dark:bg-panel2-dark">
          <option value="">-- No Coupon --</option>
          {coupons.map(c => <option key={c.id} value={c.id}>{c.code} ({c.discount_type})</option>)}
        </select>

        <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2">Delivery Channel</label>
        <select value={channel} onChange={e=>setChannel(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm mb-6 bg-panel2 dark:bg-panel2-dark">
          <option value="sms">SMS / Text</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
        </select>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-4 rounded-xl bg-gray-900 text-white font-bold text-sm flex justify-center items-center gap-2 disabled:opacity-70 shadow-lg active:scale-[0.98] transition-transform"
        >
          {generating ? <><Loader2 size={18} className="animate-spin" /> Analyzing Data & Generating...</> : <><Sparkles size={18} className="text-violet-300" /> Generate Consultant Report</>}
        </button>
      </div>
    </div>
  );
}

// ─── Campaigns Tab ────────────────────────────────────────────────────────────

function CampaignCard({ campaign, onStatusChange }) {
  const [expanded, setExpanded] = useState(false);
  const sm = CAMPAIGN_STATUS_META[campaign.status] || CAMPAIGN_STATUS_META.draft;
  const content = campaign.ai_content || {};
  const isLegacy = !content.whyThisMatters; // Legacy campaigns only have messages

  return (
    <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark shadow-sm mb-4 overflow-hidden">
      {/* Header (Always Visible) */}
      <div className="p-4 border-b border-edge dark:border-edge-dark">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-bold text-inkA dark:text-inkA-dark text-[15px] leading-tight mb-1">{campaign.name}</h3>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${sm.bg} ${sm.color}`}>
              <sm.Icon size={10} /> {sm.label}
            </span>
          </div>
          <select
            value={campaign.status}
            onChange={(e) => onStatusChange(campaign.id, e.target.value)}
            className="text-xs font-semibold text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-lg px-2 py-1.5 focus:outline-none"
          >
            {Object.entries(CAMPAIGN_STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>Mark as {v.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-panel2 dark:bg-panel2-dark rounded-xl p-2 border border-edge dark:border-edge-dark">
            <p className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Expected</p>
            <p className="font-black text-inkA dark:text-inkA-dark text-xs">₹{fmt(campaign.expected_impact)}</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-2 border border-emerald-200 dark:border-emerald-500/25">
            <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-0.5">Actual</p>
            <p className="font-black text-emerald-700 dark:text-emerald-400 text-xs">₹{fmt(campaign.actual_revenue)}</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-2 border border-blue-200 dark:border-blue-500/25">
            <p className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-0.5">ROI</p>
            <p className="font-black text-blue-700 dark:text-blue-400 text-xs">{campaign.roi !== null ? Math.round(campaign.roi * 100) + '%' : '-'}</p>
          </div>
        </div>

        {!expanded && (
          <button onClick={() => setExpanded(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark text-xs font-bold active:bg-panel2 dark:active:bg-panel2-dark transition-colors">
            {isLegacy ? 'View Message' : 'View Full Strategy Report'} <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 bg-panel2/50 dark:bg-panel2-dark/50">
          {!isLegacy && (
            <div className="space-y-5 mb-6">
              <div>
                <h4 className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">Opportunity Summary</h4>
                <p className="text-xs text-inkA dark:text-inkA-dark font-medium leading-relaxed">{content.opportunitySummary}</p>
              </div>

              <div className="bg-panel dark:bg-panel-dark p-3 rounded-xl border border-edge dark:border-edge-dark shadow-sm">
                <h4 className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Target size={12}/> Why This Matters</h4>
                <p className="text-xs text-inkB dark:text-inkB-dark leading-relaxed">{content.whyThisMatters}</p>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">Recommended Strategy</h4>
                <ul className="space-y-2">
                  {(content.recommendedStrategy || []).map((step, i) => (
                    <li key={i} className="flex gap-2 text-xs text-inkB dark:text-inkB-dark">
                      <span className="font-bold text-gray-400 dark:text-slate-500">{i+1}.</span> <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">Why This Works</h4>
                <p className="text-xs text-inkB dark:text-inkB-dark leading-relaxed italic border-l-2 border-edge dark:border-edge-dark pl-2">{content.whyThisWorks}</p>
              </div>

              <div className="bg-panel dark:bg-panel-dark p-3 rounded-xl border border-edge dark:border-edge-dark shadow-sm">
                <h4 className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-2">Impact Tiers</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs"><span className="text-inkB dark:text-inkB-dark">Conservative:</span> <span className="font-bold text-inkA dark:text-inkA-dark">{content.expectedImpact?.conservative}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-blue-600 dark:text-blue-400 font-bold">Expected:</span> <span className="font-bold text-blue-700 dark:text-blue-400">{content.expectedImpact?.expected}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-emerald-600 dark:text-emerald-400">Optimistic:</span> <span className="font-bold text-emerald-700 dark:text-emerald-400">{content.expectedImpact?.optimistic}</span></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-amber-50 dark:bg-amber-500/10 p-3 rounded-xl border border-amber-200 dark:border-amber-500/25">
                  <h4 className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><AlertTriangle size={10}/> Risks</h4>
                  <ul className="list-disc pl-3 text-[10px] text-amber-800 space-y-1">
                    {(content.risks || []).map((r, i) => <li key={i} className="leading-tight">{r}</li>)}
                  </ul>
                </div>
                <div className="bg-panel2 dark:bg-panel2-dark p-3 rounded-xl border border-edge dark:border-edge-dark">
                  <h4 className="text-[10px] font-bold text-inkB dark:text-inkB-dark uppercase tracking-widest mb-1.5">Metrics</h4>
                  <ul className="list-disc pl-3 text-[10px] text-inkB dark:text-inkB-dark space-y-1">
                    {(content.successMetrics || []).map((m, i) => <li key={i} className="leading-tight">{m}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Generated Message Section (Always present, at bottom) */}
          <div className="bg-gray-900 rounded-xl p-4 text-white shadow-lg">
            <h4 className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Sparkles size={12} className="text-violet-400"/> Generated Marketing Message
            </h4>
            <div className="space-y-3">
              <div>
                <p className="text-[9px] text-inkB dark:text-inkB-dark font-bold uppercase mb-1">WhatsApp</p>
                <p className="text-sm font-medium leading-relaxed">"{content.whatsapp || content.whatsappMessage || content.smsMessage || 'No message generated.'}"</p>
              </div>
              {content.sms && (
                <div>
                  <p className="text-[9px] text-inkB dark:text-inkB-dark font-bold uppercase mb-1">SMS</p>
                  <p className="text-xs text-gray-300 dark:text-slate-600">"{content.sms}"</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center mt-4">
            <button onClick={() => setExpanded(false)} className="text-xs font-bold text-inkB dark:text-inkB-dark px-2 py-1 active:bg-gray-200 rounded-lg">Hide Report</button>
            <a 
              href={api.marketing.exportCampaignCsv(campaign.id)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 rounded-xl active:bg-blue-100 border border-blue-200 dark:border-blue-500/25 shadow-sm transition-all active:scale-95"
            >
              <Download size={14} /> Export Targets CSV
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Marketing() {
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash;
    const match = hash.match(/tab=([^&]+)/);
    return match ? match[1] : 'copilot';
  });

  useEffect(() => {
    window.location.hash = `tab=${activeTab}`;
  }, [activeTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const match = window.location.hash.match(/tab=([^&]+)/);
      if (match && match[1] !== activeTab) {
        setActiveTab(match[1]);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);
  const [showAutomationForm, setShowAutomationForm] = useState(false);
  
  const [dashboard, setDashboard] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  // Drilldown states
  const [showGenerateModal, setShowGenerateModal] = useState(null);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.marketing.getDashboard().catch(() => null),
      api.marketing.getOpportunities().catch(() => ({ opportunities: [] })),
      api.marketing.getCampaigns().catch(() => ({ campaigns: [] }))
    ]).then(([dRes, oRes, cRes]) => {
      if (dRes) setDashboard(dRes);
      if (oRes) setOpportunities(oRes.opportunities);
      if (cRes) setCampaigns(cRes.campaigns);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStatusChange = async (id, status) => {
    await api.marketing.updateCampaign(id, { status });
    await api.marketing.getCampaignPerformance(id);
    loadData();
  };

  return (
    <div className="pb-24">
      {/* Header & Dashboard KPI */}
      <div className="bg-panel dark:bg-panel-dark px-5 pt-12 pb-4">
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-md">
              <BarChart2 size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-inkA dark:text-inkA-dark leading-tight tracking-tight">Marketing</h1>
              <p className="text-xs text-inkB dark:text-inkB-dark font-medium mt-0.5">AI Business Growth Consultant</p>
            </div>
          </div>
          <button
            onClick={async () => {
              setLoading(true);
              try {
                await api.marketing.refreshSignals();
                loadData();
              } catch (e) {
                console.error(e);
                setLoading(false);
              }
            }}
            className="flex items-center gap-1.5 bg-panel2 dark:bg-panel2-dark hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark text-[11px] font-bold px-3 py-1.5 rounded-lg border border-edge dark:border-edge-dark transition-colors"
          >
            <RefreshCw size={14} /> Refresh Signals
          </button>
        </div>

        {dashboard && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-panel2 dark:bg-panel2-dark rounded-2xl p-3 border border-edge dark:border-edge-dark shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 tracking-widest uppercase mb-1">Recovered Rev</p>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">₹{fmt(dashboard.totalRecoveredRevenue)}</p>
            </div>
            <div className="bg-panel2 dark:bg-panel2-dark rounded-2xl p-3 border border-edge dark:border-edge-dark shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 tracking-widest uppercase mb-1">Avg ROI</p>
              <p className="text-xl font-black text-inkA dark:text-inkA-dark">{dashboard.averageROI}%</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      {!showAutomationForm && (
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar px-4 py-3 bg-panel dark:bg-panel-dark border-b border-edge dark:border-edge-dark sticky top-0 z-10">
          {[
            { id: 'copilot', label: 'AI Copilot' },
            { id: 'opportunities', label: 'Legacy Overview' },
            { id: 'campaigns', label: 'Campaigns' },
            { id: 'segments', label: 'Customer Segments' },
            { id: 'coupons', label: 'Coupons & Promotions' },
            { id: 'wallet', label: 'Loyalty & Wallet' },
            { id: 'referrals', label: 'Referrals' },
            { id: 'surveys', label: 'Surveys & Feedback' },
            { id: 'spend-intel', label: 'Spend Intelligence' },
            { id: 'automations', label: 'Automations' },
            { id: 'communication', label: 'Communication Center' },
            { id: 'reports', label: 'Reports' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-[11px] font-bold transition-all ${
                activeTab === t.id ? 'bg-gray-900 text-white shadow-md' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark active:bg-panel2 dark:active:bg-panel2-dark'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="p-4">
        {loading && !showAutomationForm && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={24}/></div>}

        {/* Tab: Automations */}
        {activeTab === 'automations' && !loading && (
          showAutomationForm ? (
            <AutomationForm 
              onCancel={() => setShowAutomationForm(false)} 
              onSaved={() => setShowAutomationForm(false)} 
            />
          ) : (
            <AutomationList onNew={() => setShowAutomationForm(true)} />
          )
        )}

        {/* Tab: Opportunities */}
        {!loading && activeTab === 'opportunities' && !showAutomationForm && (
          <div className="space-y-4">
            <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/25 rounded-2xl p-4 mb-2 flex items-start gap-3 shadow-sm">
              <Sparkles className="text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5" size={18} />
              <div>
                <h3 className="text-sm font-bold text-violet-900 mb-1">AI Growth Consultant Active</h3>
                <p className="text-[10px] text-violet-700 dark:text-violet-400 leading-relaxed font-medium">I've analyzed your ERP data and found {opportunities.length} immediate opportunities to increase revenue. Select one to generate a strategy.</p>
              </div>
            </div>
            {opportunities.length === 0 ? (
              <p className="text-sm text-center text-gray-400 dark:text-slate-500 py-10 font-medium">No opportunities detected based on current data.</p>
            ) : (
              opportunities.map(o => <OpportunityCard key={o.id} opp={o} onGenerate={setShowGenerateModal} />)
            )}
          </div>
        )}

        {/* Tab: Campaigns */}
        {!loading && activeTab === 'campaigns' && !showAutomationForm && (
          <div>
            {campaigns.length === 0 ? (
              <p className="text-sm text-center text-gray-400 dark:text-slate-500 py-10 font-medium">No campaigns generated yet.</p>
            ) : (
              campaigns.map(c => <CampaignCard key={c.id} campaign={c} onStatusChange={handleStatusChange} />)
            )}
          </div>
        )}

        {/* New Extracted Tabs */}
        {!loading && !showAutomationForm && (
          <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={24}/></div>}>
            {activeTab === 'copilot' && <CopilotDashboardView />}
            {activeTab === 'wallet' && <WalletView />}
            {activeTab === 'segments' && <SegmentsView />}
            {activeTab === 'coupons' && <CouponsView />}
            {activeTab === 'referrals' && <ReferralsView />}
            {activeTab === 'surveys' && <SurveysView />}
            {activeTab === 'communication' && <CommunicationCenterView />}
            {activeTab === 'reports' && <ReportsView />}
          </Suspense>
        )}

        {/* Tab: Spend Intelligence */}
        {!loading && activeTab === 'spend-intel' && !showAutomationForm && <SpendIntelligence />}
      </div>

      {showGenerateModal && (
        <GenerateCampaignModal
          opportunity={showGenerateModal}
          onClose={() => setShowGenerateModal(null)}
          onCreated={() => {
            setShowGenerateModal(null);
            setActiveTab('campaigns');
            loadData();
          }}
        />
      )}
    </div>
  );
}
