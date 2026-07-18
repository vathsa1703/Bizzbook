import React from 'react';

const COLOR_MAP = {
  blue:   { icon: 'text-accent',                          sub: 'text-accent' },
  green:  { icon: 'text-green-600 dark:text-green-400',   sub: 'text-green-600 dark:text-green-400' },
  amber:  { icon: 'text-amber-600 dark:text-amber-400',   sub: 'text-amber-600 dark:text-amber-400' },
  red:    { icon: 'text-red-600 dark:text-red-400',       sub: 'text-red-600 dark:text-red-400' },
  purple: { icon: 'text-violet-600 dark:text-violet-400', sub: 'text-violet-600 dark:text-violet-400' },
};

export default function StatCard({ value, label, sub, color = 'blue', icon: Icon }) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  // Money values keep semantic color in both modes; count-only stats read near-ink
  const isMoney = typeof value === 'string' && value.includes('₹');
  return (
    <div className="bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-xl p-4 flex flex-col gap-1">
      {Icon && (
        <Icon size={18} className={`${c.icon} mb-0.5`} strokeWidth={2} />
      )}
      <span className={`text-xl font-bold leading-tight ${isMoney ? c.sub : 'text-inkA dark:text-inkA-dark'}`}>{value}</span>
      <span className="text-[13px] text-inkB dark:text-inkB-dark font-medium leading-tight">{label}</span>
      {sub && <span className={`text-xs font-semibold ${c.sub}`}>{sub}</span>}
    </div>
  );
}
