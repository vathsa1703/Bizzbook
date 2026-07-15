import React from 'react';
import { AlertTriangle, AlertCircle, Info, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function InsightCard({ insight, onDismiss }) {
  const isUrgent = insight.severity === 'urgent';
  const isWarning = insight.severity === 'warning';

  let colorClass = 'bg-blue-50 border-blue-200 text-blue-700';
  let badgeClass = 'bg-blue-100';
  let Icon = Info;

  if (isUrgent) {
    colorClass = 'bg-red-50 border-red-200 text-red-700';
    badgeClass = 'bg-red-100 hover:bg-red-200 text-red-800';
    Icon = AlertTriangle;
  } else if (isWarning) {
    colorClass = 'bg-amber-50 border-amber-200 text-amber-700';
    badgeClass = 'bg-amber-100 hover:bg-amber-200 text-amber-800';
    Icon = AlertCircle;
  }

  return (
    <div className={`flex-shrink-0 w-72 rounded-xl border p-4 shadow-sm relative ${colorClass}`}>
      {onDismiss && (
        <button 
          onClick={() => onDismiss(insight.id)}
          className="absolute top-2 right-2 text-current opacity-50 hover:opacity-100 p-1"
        >
          &times;
        </button>
      )}
      <div className="flex items-start gap-3 mb-2">
        <Icon size={20} className="mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-semibold text-gray-900 leading-tight pr-4 text-sm">{insight.headline}</h4>
          <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{insight.subtext}</p>
        </div>
      </div>
      
      {insight.action && (
        <div className="mt-4 flex justify-end">
          <Link 
            to={insight.action.route} 
            className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${badgeClass}`}
          >
            {insight.action.label}
            <ArrowRight size={12} />
          </Link>
        </div>
      )}
    </div>
  );
}
