import React from 'react';
import { Bot, User } from 'lucide-react';

export default function ChatMessage({ message }) {
  const isAssistant = message.role === 'assistant';
  
  return (
    <div className={`flex gap-3 mb-4 ${isAssistant ? '' : 'flex-row-reverse'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isAssistant ? 'bg-brand-purple text-white' : 'bg-accent text-white'}`}>
        {isAssistant ? <Bot size={18} /> : <User size={18} />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
        isAssistant 
          ? (message.isError ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/25' : 'bg-panel dark:bg-panel-dark border text-inkA dark:text-inkA-dark') 
          : 'bg-accent text-white'
      }`}>
        <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
      </div>
    </div>
  );
}
