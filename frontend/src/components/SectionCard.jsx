import React from 'react';

export default function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-panel dark:bg-panel-dark rounded-xl border border-edge dark:border-edge-dark shadow-card dark:shadow-none p-4 ${className}`}>
      {children}
    </div>
  );
}
