import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ type = 'info', message, onClose }) {
  const styles = {
    success: {
      stripe: 'border-l-green-500',
      iconColor: 'text-green-600 dark:text-green-400',
      icon: CheckCircle2,
    },
    error: {
      stripe: 'border-l-red-500',
      iconColor: 'text-red-600 dark:text-red-400',
      icon: AlertCircle,
    },
    warning: {
      stripe: 'border-l-amber-500',
      iconColor: 'text-amber-600 dark:text-amber-400',
      icon: AlertTriangle,
    },
    info: {
      stripe: 'border-l-accent',
      iconColor: 'text-accent',
      icon: Info,
    },
  };

  const currentStyle = styles[type] || styles.info;
  const Icon = currentStyle.icon;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark border-l-4 shadow-card dark:shadow-none max-w-sm w-full animate-slideUp pointer-events-auto ${currentStyle.stripe}`}
      role="alert"
    >
      <Icon size={18} className={`flex-shrink-0 ${currentStyle.iconColor}`} />
      <p className="text-[13px] font-semibold text-inkA dark:text-inkA-dark flex-1 leading-relaxed">{message}</p>
      <button
        onClick={onClose}
        className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors p-0.5 rounded-lg"
      >
        <X size={14} />
      </button>
    </div>
  );
}
