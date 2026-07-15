import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const BAR_HEIGHT_PX = 64;

export default function RevenueWeekCard({ label, value, percentChange, data = [], highlightIndex }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const isPositive = percentChange >= 0;

  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        </div>
        <span
          className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
            isPositive
              ? 'bg-brand-greenSoft text-brand-green'
              : 'bg-brand-redSoft text-brand-red'
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
                    isHighlight ? 'bg-brand-blue' : 'bg-blue-100'
                  }`}
                  style={{ height: `${h}px` }}
                />
                {d.day && (
                  <span className={`text-[9px] font-medium ${isHighlight ? 'text-brand-blue' : 'text-gray-400'}`}>
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
