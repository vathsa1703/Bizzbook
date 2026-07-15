import React from 'react';

export default function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-card p-4 ${className}`}>
      {children}
    </div>
  );
}
