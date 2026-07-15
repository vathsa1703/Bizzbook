import React, { useEffect, useState } from 'react';
import { TrendingUp, CreditCard, Users, AlertTriangle, Plus, Package, UserCheck, Gauge, TicketPercent, Megaphone } from 'lucide-react';
import StatCard from '../components/StatCard';
import SectionCard from '../components/SectionCard';
import OpportunityHeroCard from '../components/home/OpportunityHeroCard';
import AutomationFailureBanner from '../components/home/AutomationFailureBanner';
import NotificationBell from '../components/home/NotificationBell';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const GRADE_COLOR = { A: 'green', B: 'green', C: 'amber', D: 'amber', F: 'red' };

const now = new Date();
const hour = now.getHours();
const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
const greetingEmoji = hour < 12 ? '☀️' : hour < 17 ? '🔥' : '🌙';

const QUICK_ACTIONS = [
  { label: 'New Sale', icon: Plus, color: 'bg-brand-blue', nav: 'sales' },
  { label: 'Add Stock', icon: Package, color: 'bg-brand-green', nav: 'stock' },
  { label: 'Credit', icon: UserCheck, color: 'bg-brand-amber', nav: 'credit' },
  { label: 'Employees', icon: Users, color: 'bg-brand-purple', nav: 'employees', adminOnly: true },
  { label: 'Marketing', icon: Megaphone, color: 'bg-pink-500', nav: 'marketing' },
];

export default function Home({ onNavigate }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [creditSummary, setCreditSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [topGroups, setTopGroups] = useState([]);
  const [marketing, setMarketing] = useState(null);
  const [loading, setLoading] = useState(true);

  const visibleActions = QUICK_ACTIONS.filter(act => !act.adminOnly || (user && user.role === 'admin'));

  // Deep-link into a specific Marketing tab. Marketing.jsx reads `tab=` from the
  // URL hash on mount, so setting the hash before navigating opens the right tab.
  const navHash = (tab, hash) => {
    if (hash) window.location.hash = hash;
    onNavigate(tab);
  };

  useEffect(() => {
    Promise.all([
      api.salesSummary(now.getMonth() + 1, now.getFullYear()).catch(() => null),
      api.getCreditsSummary().catch(() => null),
      api.getCustomersList().catch(() => []),
      api.lowStock().catch(() => []),
      api.recommendations().catch(() => []),
      api.topGroups(3).catch(() => []),
      api.homeMarketingSummary().catch(() => null),
    ]).then(([s, credSum, cust, ls, recs, tg, mkt]) => {
      setSummary(s);
      setCreditSummary(credSum);
      setCustomers(Array.isArray(cust) ? cust : []);
      setLowStock(Array.isArray(ls) ? ls : []);
      setRecommendations(Array.isArray(recs) ? recs : []);
      setTopGroups(Array.isArray(tg.data ? tg.data : tg) ? (tg.data || tg) : []);
      setMarketing(mkt);
      setLoading(false);
    });
  }, []);

  const todaySales = summary?.total_revenue ?? 0;
  const totalCust = customers.length;
  const totalCredit = creditSummary?.outstanding_amount ?? 0;
  const aiInsight = recommendations[0] || null;

  // Compose one business-advisor summary from the pieces we already own, without
  // inventing numbers: the existing AI insight, a churn nudge, and the marketing
  // weekly recommendation.
  const advisorLines = [];
  if (aiInsight) advisorLines.push(aiInsight);
  if (marketing?.customersAtRisk > 0) {
    advisorLines.push(`${marketing.customersAtRisk} customer${marketing.customersAtRisk > 1 ? 's are' : ' is'} becoming inactive — re-engage them before they churn.`);
  }
  if (marketing?.weeklyRecommendation?.recommendation) {
    advisorLines.push(marketing.weeklyRecommendation.recommendation);
  }

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-5 flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{greeting}, {user?.name || 'User'} {greetingEmoji}</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-0.5">{user?.companyName || 'Business Dashboard'}</h1>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <NotificationBell
            signals={{
              automations: marketing?.automations,
              rewardCost: marketing?.rewardCost,
              customersAtRisk: marketing?.customersAtRisk || 0,
              opportunity: marketing?.opportunity,
              lowStockCount: lowStock.length,
              creditSummary,
            }}
            onNavigate={onNavigate}
          />
          <div className="w-9 h-9 rounded-full bg-brand-blue flex items-center justify-center">
            <span className="text-white text-sm font-bold">{userInitial}</span>
          </div>
        </div>
      </div>


      <div className="px-4 space-y-4">
        {/* Quick Insights strip */}
        {!loading && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            <div className="flex-shrink-0 bg-brand-blueSoft rounded-xl px-3 py-2">
              <p className="text-xs text-brand-blue font-semibold">{summary?.transaction_count || 0} txns</p>
              <p className="text-[10px] text-gray-500">This month</p>
            </div>
            <div className={`flex-shrink-0 rounded-xl px-3 py-2 ${(summary?.percent_change_vs_previous_month ?? 0) >= 0 ? 'bg-brand-greenSoft' : 'bg-brand-redSoft'}`}>
              <p className={`text-xs font-semibold ${(summary?.percent_change_vs_previous_month ?? 0) >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                {(summary?.percent_change_vs_previous_month ?? 0) >= 0 ? '↑' : '↓'} {Math.abs(summary?.percent_change_vs_previous_month ?? 0)}%
              </p>
              <p className="text-[10px] text-gray-500">vs last month</p>
            </div>
            <div className="flex-shrink-0 bg-brand-amberSoft rounded-xl px-3 py-2">
              <p className="text-xs text-brand-amber font-semibold">{creditSummary?.overdue_count || 0} overdue</p>
              <p className="text-[10px] text-gray-500">Invoices</p>
            </div>
            <div className="flex-shrink-0 bg-brand-redSoft rounded-xl px-3 py-2">
              <p className="text-xs text-brand-red font-semibold">{lowStock.length} items</p>
              <p className="text-[10px] text-gray-500">Low stock</p>
            </div>
          </div>
        )}

        {/* Stat grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            value={loading ? '—' : todaySales > 0 ? `₹${todaySales.toLocaleString('en-IN')}` : '₹0'}
            label="Month Revenue"
            sub={summary?.percent_change_vs_previous_month != null ? `${summary.percent_change_vs_previous_month > 0 ? '+' : ''}${summary.percent_change_vs_previous_month}% vs last month` : 'No prior data'}
            color="blue"
            icon={TrendingUp}
          />
          <StatCard
            value={loading ? '—' : `₹${totalCredit.toLocaleString('en-IN')}`}
            label="Outstanding Credit"
            sub={`From ${creditSummary?.overdue_count || 0} overdue list`}
            color="amber"
            icon={CreditCard}
          />
          <StatCard
            value={loading ? '—' : totalCust.toString()}
            label="Total Customers"
            sub="In database"
            color="green"
            icon={Users}
          />
          <StatCard
            value={loading ? '—' : `${lowStock.length} items`}
            label="Low Stock"
            sub="Needs attention"
            color="red"
            icon={AlertTriangle}
          />
        </div>

        {/* Quick Actions */}
        <div>
          <p className="text-xs font-bold text-gray-500 tracking-widest uppercase mb-3">Quick Actions</p>
          <div className="grid grid-cols-4 gap-2">
            {visibleActions.map(({ label, icon: Icon, color, nav }) => (
              <button
                key={label}
                className="flex flex-col items-center gap-2"
                onClick={() => nav && onNavigate(nav)}
              >
                <div className={`${color} w-14 h-14 rounded-2xl flex items-center justify-center shadow-card-md`}>
                  <Icon size={24} className="text-white" strokeWidth={2} />
                </div>
                <span className="text-xs text-gray-600 font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Today's Biggest Opportunity (Hero) */}
        {!loading && marketing?.opportunity && (
          <OpportunityHeroCard
            opportunity={marketing.opportunity}
            onOpen={(tab) => navHash('marketing', `tab=${tab}`)}
          />
        )}

        {/* Automation Failure Banner (conditional — renders only when failed > 0) */}
        {!loading && (
          <AutomationFailureBanner
            automations={marketing?.automations}
            onView={() => navHash('marketing', 'tab=automations')}
          />
        )}

        {/* Store Health + Reward Cost */}
        {!loading && (marketing?.health || marketing?.rewardCost) && (
          <div className="grid grid-cols-2 gap-3">
            {marketing?.health && (
              <button onClick={() => navHash('marketing', 'tab=spend-intel')} className="text-left w-full">
                <StatCard
                  value={`Grade ${marketing.health.grade}`}
                  label="Store Health"
                  sub={`Score ${marketing.health.score}/100${marketing.health.trend ? (marketing.health.trend > 0 ? ` ↑${marketing.health.trend}` : ` ↓${Math.abs(marketing.health.trend)}`) : ''}`}
                  color={GRADE_COLOR[marketing.health.grade] || 'blue'}
                  icon={Gauge}
                />
              </button>
            )}
            {marketing?.rewardCost && (
              <button onClick={() => navHash('marketing', 'tab=coupons')} className="text-left w-full">
                <StatCard
                  value={`₹${(marketing.rewardCost.total || 0).toLocaleString('en-IN')}`}
                  label="Reward Cost"
                  sub={marketing.rewardCost.overspend ? 'Overspend flagged' : `${marketing.rewardCost.redemptions || 0} redeemed`}
                  color={marketing.rewardCost.overspend ? 'red' : 'green'}
                  icon={TicketPercent}
                />
              </button>
            )}
          </div>
        )}

        {/* AI Business Advisor — merges the existing AI insight with weekly + churn signals */}
        {!loading && advisorLines.length > 0 && (
          <SectionCard>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-blue flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">AI</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-brand-blue mb-1">AI Business Advisor</p>
                <div className="space-y-1.5">
                  {advisorLines.map((line, i) => (
                    <p key={i} className="text-sm text-gray-700 leading-relaxed">{line}</p>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {/* Top Groups */}
        {!loading && topGroups.length > 0 && (
          <SectionCard>
            <p className="text-sm font-bold text-gray-900 mb-3">Top Selling Categories</p>
            {topGroups.map((g, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-brand-greenSoft text-brand-green text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div>
                    <span className="text-xs text-gray-800 font-semibold block">{g.group_name}</span>
                    <span className="text-[10px] text-gray-500">{g.units_sold} units sold</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-950">₹{(g.revenue || 0).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </SectionCard>
        )}
      </div>
    </div>
  );
}
