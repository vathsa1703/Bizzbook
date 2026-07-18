import React from 'react';
import { automationSchema } from '../../config/automationSchema';
import * as Icons from 'lucide-react';

export default function AutomationTemplates({ onSelectTemplate }) {
  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-inkB dark:text-inkB-dark uppercase tracking-wider mb-4">Quick Start Templates</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {automationSchema.templates.map(template => {
          const IconComponent = Icons[template.icon] || Icons.Zap;
          return (
            <button
              key={template.id}
              onClick={() => onSelectTemplate(template)}
              className="bg-panel dark:bg-panel-dark p-4 rounded-xl border border-edge dark:border-edge-dark shadow-sm hover:border-blue-500 hover:shadow-md transition text-left flex flex-col items-start group"
            >
              <div className="p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg mb-3 group-hover:bg-blue-100 transition">
                <IconComponent className="w-5 h-5" />
              </div>
              <h4 className="font-semibold text-inkA dark:text-inkA-dark mb-1">{template.name}</h4>
              <p className="text-xs text-inkB dark:text-inkB-dark line-clamp-2">{template.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
