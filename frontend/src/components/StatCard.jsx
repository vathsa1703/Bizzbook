import React from 'react';

const COLOR_MAP = {
  blue:   { bg: 'bg-brand-blueSoft',   text: 'text-brand-blue',   sub: 'text-brand-blue' },
  green:  { bg: 'bg-brand-greenSoft',  text: 'text-brand-green',  sub: 'text-brand-green' },
  amber:  { bg: 'bg-brand-amberSoft',  text: 'text-brand-amber',  sub: 'text-brand-amber' },
  red:    { bg: 'bg-brand-redSoft',    text: 'text-brand-red',    sub: 'text-brand-red' },
  purple: { bg: 'bg-brand-purpleSoft', text: 'text-brand-purple', sub: 'text-brand-purple' },
};

export default function StatCard({ value, label, sub, color = 'blue', icon: Icon }) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;
  return (
    <div className={`${c.bg} rounded-2xl p-4 flex flex-col gap-1`}>
      {Icon && (
        <Icon size={18} className={`${c.text} mb-0.5`} strokeWidth={2} />
      )}
      <span className={`text-xl font-bold ${c.text} leading-tight`}>{value}</span>
      <span className="text-sm text-gray-600 font-medium leading-tight">{label}</span>
      {sub && <span className={`text-xs font-semibold ${c.sub}`}>{sub}</span>}
    </div>
  );
}
