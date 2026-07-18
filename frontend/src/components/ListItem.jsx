import React from 'react';
import { ChevronRight } from 'lucide-react';

const ICON_STYLES = {
  blue:   { bg: 'bg-accent/10 dark:bg-accent/15',           text: 'text-accent' },
  green:  { bg: 'bg-green-50 dark:bg-green-500/10',         text: 'text-green-700 dark:text-green-400' },
  amber:  { bg: 'bg-amber-50 dark:bg-amber-500/10',         text: 'text-amber-700 dark:text-amber-400' },
  red:    { bg: 'bg-red-50 dark:bg-red-500/10',             text: 'text-red-600 dark:text-red-400' },
  purple: { bg: 'bg-violet-50 dark:bg-violet-500/10',       text: 'text-violet-600 dark:text-violet-400' },
  pink:   { bg: 'bg-pink-50 dark:bg-pink-500/10',           text: 'text-pink-600 dark:text-pink-400' },
  yellow: { bg: 'bg-yellow-50 dark:bg-yellow-500/10',       text: 'text-yellow-600 dark:text-yellow-400' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-500/10',       text: 'text-indigo-600 dark:text-indigo-400' },
  gray:   { bg: 'bg-panel2 dark:bg-panel2-dark',            text: 'text-inkB dark:text-inkB-dark' },
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
      className="flex items-center gap-3 w-full text-left min-h-[56px] py-3 px-0 border-b border-edge dark:border-edge-dark last:border-0 active:bg-panel2 dark:active:bg-panel2-dark transition-colors"
    >
      <div className={`${s.bg} ${s.text} rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0 font-semibold text-sm`}>
        {initials ? initials : Icon ? <Icon size={18} strokeWidth={2} /> : null}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] md:text-sm font-semibold text-inkA dark:text-inkA-dark truncate">{title}</p>
        {subtitle && <p className="text-[13px] text-inkB dark:text-inkB-dark truncate mt-0.5">{subtitle}</p>}
      </div>
      {right && <div className="flex-shrink-0 text-right">{right}</div>}
      {showChevron && !right && (
        <ChevronRight size={16} className="text-gray-300 dark:text-slate-600 flex-shrink-0" />
      )}
    </button>
  );
}
