import React, { useState } from 'react';
import { Calendar } from 'lucide-react';

export default function DateFilter({ value, onChange }) {
  const options = [
    { id: 'today', label: 'Today' },
    { id: '7days', label: 'Last 7 Days' },
    { id: '30days', label: 'Last 30 Days' },
    { id: '90days', label: 'Last 90 Days' },
    { id: 'month', label: 'This Month' },
    { id: 'custom', label: 'Custom Range' },
  ];

  const handleSelect = (e) => {
    onChange({ ...value, range: e.target.value });
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-xl shadow-sm text-sm">
        <Calendar size={16} className="text-gray-400" />
        <select 
          className="bg-transparent text-gray-700 font-bold outline-none"
          value={value.range} 
          onChange={handleSelect}
        >
          {options.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>
      
      {value.range === 'custom' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-xl shadow-sm text-sm">
          <input 
            type="date" 
            className="outline-none text-gray-700" 
            value={value.start || ''} 
            onChange={e => onChange({ ...value, start: e.target.value })} 
          />
          <span className="text-gray-400">to</span>
          <input 
            type="date" 
            className="outline-none text-gray-700" 
            value={value.end || ''} 
            onChange={e => onChange({ ...value, end: e.target.value })} 
          />
        </div>
      )}
    </div>
  );
}
