import React from 'react';
import { ZapOff, ChevronRight } from 'lucide-react';

// Renders nothing unless there is at least one failed automation execution.
export default function AutomationFailureBanner({ automations, onView }) {
  const failed = automations?.failed || 0;
  if (failed <= 0) return null;

  return (
    <button
      onClick={onView}
      className="w-full flex items-center gap-3 bg-brand-redSoft border border-red-100 rounded-2xl px-4 py-3 text-left active:bg-red-100 transition-colors"
    >
      <div className="w-9 h-9 rounded-xl bg-brand-red/10 flex items-center justify-center flex-shrink-0">
        <ZapOff size={18} className="text-brand-red" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-brand-red leading-tight">
          {failed} automation{failed > 1 ? 's' : ''} failed
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Success rate {automations?.successRate ?? 0}% · tap to review
        </p>
      </div>
      <ChevronRight size={18} className="text-brand-red flex-shrink-0" />
    </button>
  );
}
