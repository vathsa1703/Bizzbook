// ============================================================================
// Growth Hub — shared design tokens & UI primitives, used across multiple tabs.
// Extracted verbatim from the original monolithic GrowthHub.jsx (no behavior
// or visual changes) as part of the maintainability split into per-tab files.
// ============================================================================
import React from 'react';
import {
  TrendingUp, DollarSign, Landmark, Users, PieChart as PieIcon, BarChart2,
  Globe, Handshake, Presentation, FolderCheck, Map, Bot, Star, Layers,
  Plus, StickyNote, Ship, Building2,
} from 'lucide-react';

// ── Design tokens ─────────────────────────────────────────────────────────────
export const COLORS = ['#6366f1','#22d3ee','#f59e0b','#10b981','#ef4444','#a855f7','#f97316','#14b8a6','#ec4899','#84cc16'];
export const SIDEBAR_TABS = [
  { key: 'overview',    label: 'Overview',           icon: BarChart2    },
  { key: 'funding',     label: 'Funding',            icon: DollarSign   },
  { key: 'schemes',     label: 'Gov. Schemes',       icon: Landmark     },
  { key: 'investor-directory', label: 'Investor Directory', icon: Building2 },
  { key: 'investors',   label: 'Investors',          icon: Users        },
  { key: 'equity',      label: 'Equity',             icon: PieIcon      },
  { key: 'cap-table',   label: 'Cap Table',          icon: Layers       },
  { key: 'valuation',   label: 'Valuation',          icon: TrendingUp   },
  { key: 'ipo',         label: 'IPO Readiness',      icon: Globe        },
  { key: 'trade',       label: 'Import/Export',      icon: Ship         },
  { key: 'partnerships',label: 'Partnerships',       icon: Handshake    },
  { key: 'sponsorships',label: 'Sponsorships',       icon: Star         },
  { key: 'pitch-deck',  label: 'Pitch Deck',         icon: Presentation },
  { key: 'due-diligence',label:'Due Diligence',      icon: FolderCheck  },
  { key: 'roadmap',     label: 'Growth Roadmap',     icon: Map          },
  { key: 'advisor',     label: 'AI Advisor',         icon: Bot          },
  { key: 'notes',       label: 'Notes',              icon: StickyNote   },
];

export const STAGE_COLORS = {
  'Idea': 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400', 'Registered': 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400',
  'Revenue': 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400', 'Funded': 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400',
  'Scaling': 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400', 'Profitable': 'bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-400',
  'Pre-IPO': 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400', 'Public': 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400',
};

export const STATUS_DOT = {
  'Prospect':'bg-gray-400','Contacted':'bg-blue-400','Meeting Scheduled':'bg-purple-400',
  'Pitched':'bg-amber-400','Due Diligence':'bg-orange-400','Term Sheet':'bg-cyan-400',
  'Closed Won':'bg-green-400','Closed Lost':'bg-red-400',
  'Active':'bg-green-400','Paused':'bg-amber-400','Ended':'bg-gray-400','Negotiating':'bg-blue-400',
};

export const INV_STAGES = ['Prospect','Contacted','Meeting Scheduled','Pitched','Due Diligence','Term Sheet','Closed Won','Closed Lost'];

export function fmt(n, sym='₹') { return `${sym}${(Number(n)||0).toLocaleString('en-IN')}`; }
export function pct(n) { return `${(Number(n)||0).toFixed(1)}%`; }

// ── Shared Components ─────────────────────────────────────────────────────────

export function ScoreRing({ score, label, color = '#6366f1', size = 100 }) {
  const R = size * 0.42, circ = 2 * Math.PI * R;
  const strokeW = size * 0.09;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={R} fill="none" stroke="#E5E7EB" strokeWidth={strokeW} />
        <circle cx={size/2} cy={size/2} r={R} fill="none" stroke={color} strokeWidth={strokeW}
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={circ - (Math.min(score,100) / 100) * circ}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black" style={{ color }}>{score}%</span>
        {label && <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider text-center leading-tight px-1">{label}</span>}
      </div>
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, sub, color = 'indigo', onClick }) {
  const colorMap = { indigo:'from-indigo-500 to-violet-500', cyan:'from-cyan-500 to-teal-500', amber:'from-amber-500 to-orange-500', green:'from-green-500 to-emerald-500', rose:'from-rose-500 to-pink-500', purple:'from-purple-500 to-indigo-500' };
  return (
    <div onClick={onClick} className={`bg-panel dark:bg-panel-dark rounded-2xl p-4 shadow-sm border border-edge dark:border-edge-dark ${onClick?'cursor-pointer hover:shadow-md transition-shadow':''}`}>
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${colorMap[color]||colorMap.indigo} flex items-center justify-center mb-3`}>
        <Icon size={16} className="text-white" />
      </div>
      <div className="text-2xl font-black text-inkA dark:text-inkA-dark">{value}</div>
      <div className="text-xs font-semibold text-inkB dark:text-inkB-dark mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function SectionCard({ children, className = '' }) {
  return <div className={`bg-panel dark:bg-panel-dark rounded-2xl shadow-sm border border-edge dark:border-edge-dark p-4 ${className}`}>{children}</div>;
}

export function Badge({ children, color = 'gray' }) {
  const colors = { gray:'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark', blue:'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400', green:'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400', amber:'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400', red:'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400', purple:'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400', indigo:'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${colors[color]||colors.gray}`}>{children}</span>;
}

export function ProgressBar({ value, color = '#6366f1', height = 6 }) {
  return (
    <div className="w-full rounded-full bg-panel2 dark:bg-panel2-dark" style={{ height }}>
      <div className="rounded-full transition-all duration-700" style={{ width: `${Math.min(value,100)}%`, height, background: color }} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, sub, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mb-4">
        <Icon size={28} className="text-indigo-400" />
      </div>
      <div className="font-bold text-inkB dark:text-inkB-dark text-base">{title}</div>
      <div className="text-sm text-gray-400 dark:text-slate-500 mt-1 max-w-xs">{sub}</div>
      {action && <button onClick={onAction} className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-1"><Plus size={14}/>{action}</button>}
    </div>
  );
}
