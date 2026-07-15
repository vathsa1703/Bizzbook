import React from 'react';
import { automationSchema } from '../../config/automationSchema';
import * as Icons from 'lucide-react';

export default function AutomationTemplates({ onSelectTemplate }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Quick Start Templates</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {automationSchema.templates.map(template => {
          const IconComponent = Icons[template.icon] || Icons.Zap;
          return (
            <button
              key={template.id}
              onClick={() => onSelectTemplate(template)}
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-blue-500 hover:shadow-md transition text-left flex flex-col items-start group"
            >
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg mb-3 group-hover:bg-blue-100 transition">
                <IconComponent className="w-5 h-5" />
              </div>
              <h4 className="font-semibold text-gray-800 mb-1">{template.name}</h4>
              <p className="text-xs text-gray-500 line-clamp-2">{template.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
