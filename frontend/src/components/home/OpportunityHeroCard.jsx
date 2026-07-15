import React from 'react';
import { TrendingUp, Users, Package, Target, Sparkles, ArrowRight } from 'lucide-react';

// Visual mapping mirrors the Marketing page's TYPE_META so the same opportunity
// looks consistent wherever it appears. Unknown/future types fall back safely.
const TYPE_META = {
  revenue_recovery:       { Icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  customer_retention:     { Icon: Users,      color: 'text-blue-600',    bg: 'bg-blue-50'    },
  dead_stock_liquidation: { Icon: Package,    color: 'text-orange-600',  bg: 'bg-orange-50'  },
  cross_sell:             { Icon: Target,     color: 'text-violet-600',  bg: 'bg-violet-50'  },
};

const PRIORITY_STYLES = {
  High:   'bg-red-50 text-red-600 border-red-200',
  Medium: 'bg-amber-50 text-amber-600 border-amber-200',
  Low:    'bg-green-50 text-green-600 border-green-200',
};

function fmt(n) { return Math.round(n || 0).toLocaleString('en-IN'); }

export default function OpportunityHeroCard({ opportunity, onOpen }) {
  if (!opportunity) return null;

  const meta = TYPE_META[opportunity.type] || TYPE_META.revenue_recovery;
  const { Icon, color, bg } = meta;
  const priorityStyle = PRIORITY_STYLES[opportunity.priority] || PRIORITY_STYLES.Medium;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card-md overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-violet-600 uppercase tracking-widest">
            <Sparkles size={12} className="text-amber-500" /> Today's Biggest Opportunity
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityStyle}`}>
            {opportunity.priority} Priority
          </span>
        </div>

        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
            <Icon size={22} className={color} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900 text-sm leading-tight">{opportunity.name}</p>
            <p className="text-[11px] text-gray-500 leading-relaxed mt-1 line-clamp-2">
              {opportunity.detectedBecause}
            </p>
          </div>
        </div>

        <div className="flex items-end justify-between mt-4">
          <div>
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Potential Revenue</p>
            <p className="text-2xl font-black text-emerald-700 leading-tight">₹{fmt(opportunity.expectedImpact)}</p>
          </div>
          <button
            onClick={() => onOpen(opportunity.deepLinkTab || 'opportunities')}
            className="flex items-center gap-1.5 bg-gray-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl active:bg-gray-800 active:scale-[0.98] transition-all shadow-sm"
          >
            Open Marketing <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
