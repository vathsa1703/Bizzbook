import React from 'react';

export default function ChatBubble({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
          <span className="text-inkA dark:text-inkA-dark text-xs font-bold">AI</span>
        </div>
      )}
      <div
        className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-accent text-white rounded-br-sm'
            : 'bg-panel dark:bg-panel-dark text-inkA dark:text-inkA-dark shadow-card rounded-bl-sm'
        }`}
      >
        {content}
      </div>
    </div>
  );
}
