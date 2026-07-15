import React, { useState } from 'react';
import { useAIInsights } from '../../hooks/useAIInsights';
import InsightCard from './InsightCard';
import { Sparkles } from 'lucide-react';

export default function InsightCardWidget() {
  const { insights, loading, error, note } = useAIInsights();
  const [dismissed, setDismissed] = useState(new Set());

  if (loading) {
    return (
      <div className="mb-6 h-32 flex items-center justify-center text-sm text-gray-400 border border-dashed rounded-xl border-gray-200 bg-gray-50/50">
        <span className="flex items-center gap-2 animate-pulse"><Sparkles size={16} /> Generating AI Insights...</span>
      </div>
    );
  }
  
  if (error) {
    return null; // Fails silently to not disrupt the dashboard
  }

  const activeInsights = insights.filter(i => !dismissed.has(i.id)).slice(0, 5); // Max 5 cards

  if (activeInsights.length === 0) {
    return null;
  }

  const handleDismiss = (id) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <Sparkles size={16} className="text-brand-purple" />
          AI Advisor
          {note && <span className="text-[10px] font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full ml-2">{note}</span>}
        </h3>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x hide-scrollbar -mx-4 px-4">
        {activeInsights.map(insight => (
          <div key={insight.id} className="snap-start">
            <InsightCard insight={insight} onDismiss={handleDismiss} />
          </div>
        ))}
      </div>
    </div>
  );
}
