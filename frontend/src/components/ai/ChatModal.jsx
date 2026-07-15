import React, { useState, useRef, useEffect } from 'react';
import { useAI } from '../../contexts/AIContext';
import { useAIChat } from '../../hooks/useAIChat';
import ChatMessage from './ChatMessage';
import { X, Send, Bot, Loader2 } from 'lucide-react';

export default function ChatModal() {
  const { isChatOpen, closeChat, chatInitialContext } = useAI();
  const { messages, loading, sendMessage } = useAIChat();
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (isChatOpen && chatInitialContext && messages.length === 0) {
      sendMessage(chatInitialContext);
    }
  }, [isChatOpen, chatInitialContext, messages.length]);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  if (!isChatOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col sm:p-4 bg-black/20 sm:justify-end sm:items-end">
      <div className="bg-white w-full h-full sm:w-[400px] sm:h-[600px] sm:rounded-2xl sm:shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10">
        
        {/* Header */}
        <div className="bg-brand-purple p-4 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bot size={24} />
            <div>
              <h2 className="font-bold text-lg leading-tight">AI Advisor</h2>
              <p className="text-white/70 text-xs">Business Context Loaded</p>
            </div>
          </div>
          <button onClick={closeChat} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 flex flex-col">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 my-auto text-sm px-4">
              <Bot size={48} className="mx-auto mb-4 text-brand-purple opacity-20" />
              <p className="mb-2 font-medium text-gray-700">I have analyzed your sales, inventory, and customers.</p>
              <p>Ask me anything about your business.</p>
              <div className="flex flex-wrap gap-2 justify-center mt-6">
                <button onClick={() => setInput("What are my best selling products?")} className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-700 hover:border-brand-purple hover:text-brand-purple transition-colors shadow-sm">Best selling products</button>
                <button onClick={() => setInput("Do I have any dead stock?")} className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-700 hover:border-brand-purple hover:text-brand-purple transition-colors shadow-sm">Check dead stock</button>
              </div>
            </div>
          )}
          
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          
          {loading && (
            <div className="flex gap-3 mb-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-brand-purple text-white">
                <Bot size={18} />
              </div>
              <div className="bg-white border rounded-2xl px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-brand-purple" /> Analyzing data...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 bg-white border-t flex-shrink-0 pb-safe">
          <form onSubmit={handleSubmit} className="flex gap-2 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your business..."
              className="flex-1 bg-gray-100 border border-transparent focus:bg-white focus:border-brand-purple rounded-full pl-4 pr-12 py-3 text-sm outline-none transition-colors"
              disabled={loading}
            />
            <button 
              type="submit" 
              disabled={!input.trim() || loading}
              className="absolute right-1 top-1 bottom-1 w-10 flex items-center justify-center bg-brand-purple text-white rounded-full disabled:opacity-50 disabled:bg-gray-300 transition-colors"
            >
              <Send size={16} className="ml-0.5" />
            </button>
          </form>
        </div>
        
      </div>
    </div>
  );
}
