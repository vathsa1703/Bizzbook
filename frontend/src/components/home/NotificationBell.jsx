import React, { useState } from 'react';
import {
  Bell, ZapOff, TicketPercent, Users, CreditCard, AlertTriangle, Sparkles, ChevronRight
} from 'lucide-react';

function fmt(n) { return Math.round(n || 0).toLocaleString('en-IN'); }

// Builds a prioritised, real-time alert feed from signals already loaded by Home.
// These are derived operational/marketing signals (not the per-user notifications
// table), so they are computed client-side from data the dashboard already has —
// no extra network calls.
function buildAlerts({ automations, rewardCost, customersAtRisk, opportunity, lowStockCount, creditSummary }, nav) {
  const alerts = [];

  if (automations?.failed > 0) {
    alerts.push({
      id: 'automations', Icon: ZapOff, tone: 'red',
      title: `${automations.failed} automation${automations.failed > 1 ? 's' : ''} failed`,
      subtitle: `Success rate ${automations.successRate ?? 0}%`,
      onClick: () => nav('marketing', 'tab=automations'),
    });
  }
  if (rewardCost?.overspend) {
    alerts.push({
      id: 'overspend', Icon: TicketPercent, tone: 'red',
      title: 'Reward spending needs review',
      subtitle: `₹${fmt(rewardCost.total)} in coupon discounts`,
      onClick: () => nav('marketing', 'tab=coupons'),
    });
  }
  if (customersAtRisk > 0) {
    alerts.push({
      id: 'at-risk', Icon: Users, tone: 'amber',
      title: `${customersAtRisk} customer${customersAtRisk > 1 ? 's' : ''} becoming inactive`,
      subtitle: 'Re-engage before they churn',
      onClick: () => nav('marketing', 'tab=segments'),
    });
  }
  if (creditSummary?.overdue_count > 0) {
    alerts.push({
      id: 'credit', Icon: CreditCard, tone: 'amber',
      title: `${creditSummary.overdue_count} overdue invoice${creditSummary.overdue_count > 1 ? 's' : ''}`,
      subtitle: `₹${fmt(creditSummary.outstanding_amount)} outstanding`,
      onClick: () => nav('credit'),
    });
  }
  if (lowStockCount > 0) {
    alerts.push({
      id: 'low-stock', Icon: AlertTriangle, tone: 'red',
      title: `${lowStockCount} item${lowStockCount > 1 ? 's' : ''} low on stock`,
      subtitle: 'Reorder to avoid stockouts',
      onClick: () => nav('stock'),
    });
  }
  if (opportunity) {
    alerts.push({
      id: 'opportunity', Icon: Sparkles, tone: 'violet',
      title: `Opportunity: ₹${fmt(opportunity.expectedImpact)}`,
      subtitle: opportunity.name,
      onClick: () => nav('marketing', `tab=${opportunity.deepLinkTab || 'opportunities'}`),
    });
  }

  return alerts;
}

const TONE = {
  red:    { bg: 'bg-brand-redSoft',    text: 'text-brand-red' },
  amber:  { bg: 'bg-brand-amberSoft',  text: 'text-brand-amber' },
  violet: { bg: 'bg-brand-purpleSoft', text: 'text-brand-purple' },
};

export default function NotificationBell({ signals, onNavigate }) {
  const [open, setOpen] = useState(false);

  const nav = (tab, hash) => {
    setOpen(false);
    if (hash) window.location.hash = hash;
    onNavigate(tab);
  };

  const alerts = buildAlerts(signals, nav);
  const count = alerts.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} className="text-gray-600" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-brand-red rounded-full flex items-center justify-center">
            <span className="text-[9px] text-white font-bold leading-none">{count}</span>
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-outside backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 max-w-[85vw] bg-white rounded-2xl shadow-card-md border border-gray-100 z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-bold text-gray-900">Notifications</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {count === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-400 font-medium">You're all caught up 🎉</p>
                </div>
              ) : (
                alerts.map(({ id, Icon, tone, title, subtitle, onClick }) => {
                  const t = TONE[tone] || TONE.amber;
                  return (
                    <button
                      key={id}
                      onClick={onClick}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-lg ${t.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon size={16} className={t.text} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-800 leading-tight truncate">{title}</p>
                        <p className="text-[11px] text-gray-500 truncate">{subtitle}</p>
                      </div>
                      <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
