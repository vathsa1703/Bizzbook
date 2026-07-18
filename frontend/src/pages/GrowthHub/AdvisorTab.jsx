// ═══════════════════════════════════════════════════════════════════════════════
// TAB: AI GROWTH ADVISOR — extracted verbatim from the original GrowthHub.jsx.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send } from 'lucide-react';
import { api } from '../../api/client';

export default function AdvisorTab() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hello! I'm your AI Growth Advisor. I have full context of your business profile, cap table, investor pipeline, and readiness scores. Ask me anything about funding, equity, IPOs, government schemes, or your growth strategy." }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId] = useState(`growth_${Date.now()}`);
  const bottomRef = useRef();

  const QUICK = [
    'How do I raise seed funding?',
    'Which government scheme suits my business?',
    'How much equity should I give investors?',
    'How do I value my company?',
    'Am I ready to raise a Series A?',
    'What documents do investors require?',
  ];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (msg = input) => {
    if (!msg.trim() || sending) return;
    const text = msg.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', content: text }]);
    setSending(true);
    try {
      const r = await api.growth.chat(text, sessionId);
      setMessages(m => [...m, { role: 'assistant', content: r.message }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 200px)' }}>
      <div className="mb-4">
        <h2 className="text-lg font-black text-inkA dark:text-inkA-dark">AI Growth Advisor</h2>
        <p className="text-xs text-inkB dark:text-inkB-dark">Ask anything about funding, equity, valuation, and growth</p>
      </div>

      {/* Quick questions */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {QUICK.map(q => (
            <button key={q} onClick={() => send(q)} className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 text-xs font-semibold rounded-xl hover:bg-indigo-100 transition-colors border border-indigo-200 dark:border-indigo-500/25">
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                <Bot size={13} className="text-white" />
              </div>
            )}
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-md'
                : 'bg-panel dark:bg-panel-dark shadow-sm border border-edge dark:border-edge-dark text-inkB dark:text-inkB-dark rounded-bl-md'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center flex-shrink-0 mr-2">
              <Bot size={13} className="text-white" />
            </div>
            <div className="bg-panel dark:bg-panel-dark shadow-sm border border-edge dark:border-edge-dark rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
              {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pb-4">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask about funding, equity, IPO..."
          className="flex-1 px-4 py-3 bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 shadow-sm"
        />
        <button onClick={() => send()} disabled={!input.trim() || sending} className="w-11 h-11 bg-indigo-600 rounded-2xl flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 transition-colors flex-shrink-0">
          <Send size={15} className="text-white" />
        </button>
      </div>
    </div>
  );
}
