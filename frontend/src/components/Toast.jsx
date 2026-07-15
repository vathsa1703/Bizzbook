import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ type = 'info', message, onClose }) {
  const styles = {
    success: {
      bg: 'bg-brand-greenSoft border-brand-green/20 text-brand-green',
      icon: CheckCircle2,
    },
    error: {
      bg: 'bg-brand-redSoft border-brand-red/20 text-brand-red',
      icon: AlertCircle,
    },
    warning: {
      bg: 'bg-brand-amberSoft border-brand-amber/20 text-brand-amber',
      icon: AlertTriangle,
    },
    info: {
      bg: 'bg-brand-blueSoft border-brand-blue/20 text-brand-blue',
      icon: Info,
    },
  };

  const currentStyle = styles[type] || styles.info;
  const Icon = currentStyle.icon;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border shadow-card max-w-sm w-full animate-slideUp pointer-events-auto ${currentStyle.bg}`}
      role="alert"
    >
      <Icon size={18} className="flex-shrink-0" />
      <p className="text-xs font-semibold flex-1 leading-relaxed">{message}</p>
      <button
        onClick={onClose}
        className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded-lg"
      >
        <X size={14} />
      </button>
    </div>
  );
}
