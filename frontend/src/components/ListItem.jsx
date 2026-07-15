import React from 'react';
import { ChevronRight } from 'lucide-react';

const ICON_STYLES = {
  blue:   { bg: 'bg-brand-blueSoft',   text: 'text-brand-blue' },
  green:  { bg: 'bg-brand-greenSoft',  text: 'text-brand-green' },
  amber:  { bg: 'bg-brand-amberSoft',  text: 'text-brand-amber' },
  red:    { bg: 'bg-brand-redSoft',    text: 'text-brand-red' },
  purple: { bg: 'bg-brand-purpleSoft', text: 'text-brand-purple' },
  pink:   { bg: 'bg-brand-pinkSoft',   text: 'text-brand-pink' },
  yellow: { bg: 'bg-brand-yellowSoft', text: 'text-brand-yellow' },
  gray:   { bg: 'bg-gray-100',         text: 'text-gray-500' },
};

export default function ListItem({
  icon: Icon,
  title,
  subtitle,
  color = 'blue',
  right,
  onClick,
  showChevron = true,
  initials,
}) {
  const s = ICON_STYLES[color] || ICON_STYLES.blue;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left py-3 px-0 border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors"
    >
      <div className={`${s.bg} ${s.text} rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 font-semibold text-sm`}>
        {initials ? initials : Icon ? <Icon size={18} strokeWidth={2} /> : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="flex-shrink-0 text-right">{right}</div>}
      {showChevron && !right && (
        <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
      )}
    </button>
  );
}
