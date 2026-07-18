import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, Search, Loader2, Sparkles, AlertTriangle, FileText, Download } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ToastContext';

export default function HRCopilot() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am your AI HR Copilot. I can help you analyze leave trends, generate HR letters (warnings, appreciation, etc.), answer policy questions, and summarize employee performance.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const loadInsights = async () => {
      try {
        const data = await api.getHRInsights();
        setInsights(data || []);
      } catch (e) {
        console.error('Failed to load insights:', e);
      } finally {
        setInsightsLoading(false);
      }
    };
    loadInsights();
  }, []);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim()) return;

    const newMsgs = [...messages, { role: 'user', content: input }];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);

    try {
      const res = await api.hrAIChat(newMsgs);
      setMessages([...newMsgs, { role: 'assistant', content: res.reply }]);
    } catch (e) {
      setMessages([...newMsgs, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const getInsightIcon = (type, severity) => {
    if (type === 'burnout_risk') return <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />;
    if (severity === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
    return <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
  };

  const getInsightColor = (severity) => {
    if (severity === 'warning') return 'bg-amber-50 dark:bg-amber-500/10 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25 dark:border-amber-500/20';
    if (severity === 'info') return 'bg-blue-50 dark:bg-blue-500/10 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/25 dark:border-blue-500/20';
    if (severity === 'error') return 'bg-red-50 dark:bg-red-500/10 dark:bg-red-500/10 border-red-200 dark:border-red-500/25 dark:border-red-500/20';
    return 'bg-panel2 dark:bg-panel2-dark border-edge dark:border-edge-dark';
  };

  return (
    <div className="p-4 lg:p-6 h-full flex flex-col space-y-5">
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-inkA dark:text-inkA-dark">HR AI Copilot</h1>
          <p className="text-sm text-inkB dark:text-inkB-dark">Intelligent assistance for HR operations</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* Chat Interface */}
        <div className="flex-1 bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-2xl flex flex-col overflow-hidden shadow-xl shadow-slate-950">
          <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 scrollbar-thin">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-blue-600' : 'bg-gradient-to-br from-violet-500 to-fuchsia-600'}`}>
                  {m.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                </div>
                <div className={`max-w-[80%] rounded-2xl p-4 text-sm ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-panel2 dark:bg-panel2-dark text-inkA dark:text-inkA-dark border border-edge dark:border-edge-dark'}`}>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-2xl p-4 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-violet-600 dark:text-violet-400 animate-spin" />
                  <span className="text-sm text-inkB dark:text-inkB-dark">Analyzing data...</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          
          <div className="p-4 bg-panel dark:bg-panel-dark border-t border-edge dark:border-edge-dark">
            <form onSubmit={handleSend} className="relative flex items-center">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={loading}
                placeholder="Ask about employee leaves, generate a warning letter, or analyze attendance..."
                className="w-full bg-canvas dark:bg-canvas-dark border border-edge dark:border-edge-dark text-inkA dark:text-inkA-dark placeholder-gray-400 dark:placeholder-slate-500 rounded-xl pl-4 pr-12 py-3.5 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all shadow-inner disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="absolute right-2 p-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-violet-600"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Proactive Insights */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-inkB dark:text-inkB-dark uppercase tracking-wider px-1">Proactive Insights</h2>
          
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
            {insightsLoading ? (
              <div className="text-center py-10 text-inkB dark:text-inkB-dark text-sm">Scanning for insights...</div>
            ) : insights.length === 0 ? (
              <div className="text-center py-10 text-inkB dark:text-inkB-dark text-sm bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-2xl">
                All systems nominal.<br/>No proactive alerts today.
              </div>
            ) : (
              insights.map((insight, idx) => (
                <div key={idx} className={`p-4 rounded-2xl border ${getInsightColor(insight.severity)}`}>
                  <div className="flex gap-3 mb-2">
                    <div className="mt-0.5 shrink-0">{getInsightIcon(insight.type, insight.severity)}</div>
                    <div>
                      <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark">{insight.title}</h3>
                      {insight.subtitle && <p className="text-xs text-inkB dark:text-inkB-dark mt-0.5">{insight.subtitle}</p>}
                    </div>
                  </div>
                  {insight.data && Array.isArray(insight.data) && (
                    <div className="mt-3 pt-3 border-t border-edge dark:border-edge-dark space-y-1">
                      {insight.data.slice(0, 3).map((item, i) => (
                        <div key={i} className="text-xs text-inkB dark:text-inkB-dark truncate">
                          • {item.name || item.employee_name} {item.job_title ? `(${item.job_title})` : ''}
                        </div>
                      ))}
                      {insight.data.length > 3 && (
                        <div className="text-xs text-inkB dark:text-inkB-dark pt-1">+ {insight.data.length - 3} more</div>
                      )}
                    </div>
                  )}
                  {insight.type === 'burnout_risk' && (
                    <button 
                      onClick={() => {
                        setInput(`Can you draft a supportive email to employees who have taken >80% of their leaves, checking on their well-being?`);
                        document.querySelector('form input')?.focus();
                      }}
                      className="mt-3 w-full py-1.5 bg-panel2/50 dark:bg-panel2-dark/50 hover:bg-panel2 dark:hover:bg-panel2-dark text-xs font-semibold text-inkB dark:text-inkB-dark rounded-lg transition-colors border border-edge dark:border-edge-dark"
                    >
                      Draft Check-in Email
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// User icon stub for chat
function User({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
  );
}
