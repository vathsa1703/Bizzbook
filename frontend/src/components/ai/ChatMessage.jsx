import React from 'react';
import { Bot, User } from 'lucide-react';

export default function ChatMessage({ message }) {
  const isAssistant = message.role === 'assistant';
  
  return (
    <div className={`flex gap-3 mb-4 ${isAssistant ? '' : 'flex-row-reverse'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isAssistant ? 'bg-brand-purple text-white' : 'bg-brand-blue text-white'}`}>
        {isAssistant ? <Bot size={18} /> : <User size={18} />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
        isAssistant 
          ? (message.isError ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-white border text-gray-800') 
          : 'bg-brand-blue text-white'
      }`}>
        <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
      </div>
    </div>
  );
}
