import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const BAR_HEIGHT_PX = 64;

export default function RevenueWeekCard({ label, value, percentChange, data = [], highlightIndex }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const isPositive = percentChange >= 0;

  return (
    <div className="bg-panel dark:bg-panel-dark rounded-2xl shadow-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-inkB dark:text-inkB-dark font-medium">{label}</p>
          <p className="text-2xl font-bold text-inkA dark:text-inkA-dark mt-0.5">{value}</p>
        </div>
        <span
          className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
            isPositive
              ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
          }`}
        >
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {isPositive ? '+' : ''}{percentChange}%
        </span>
      </div>
      {data.length > 0 && (
        <div className="flex items-end gap-1" style={{ height: `${BAR_HEIGHT_PX}px` }}>
          {data.map((d, i) => {
            const h = Math.max(4, Math.round((d.value / maxVal) * BAR_HEIGHT_PX));
            const isHighlight = i === highlightIndex;
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                <div
                  className={`w-full rounded-t-sm transition-all ${
                    isHighlight ? 'bg-accent' : 'bg-blue-100 dark:bg-blue-500/15'
                  }`}
                  style={{ height: `${h}px` }}
                />
                {d.day && (
                  <span className={`text-[9px] font-medium ${isHighlight ? 'text-accent' : 'text-gray-400 dark:text-slate-500'}`}>
                    {d.day}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
