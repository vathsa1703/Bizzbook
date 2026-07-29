import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, LayoutDashboard, Send, FileText, 
  Users, CalendarClock, History, Plus, BarChart, 
  CheckCircle, XCircle, Clock, Loader2, ArrowRight,
  Save, X
} from 'lucide-react';
import { api } from '../../api/client';

export default function CommunicationCenterView() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (activeTab === 'templates') loadTemplates();
    if (activeTab === 'campaigns' || activeTab === 'schedule') loadCampaigns();
    if (activeTab === 'history') loadHistory();
  }, [activeTab]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await api.communication.getDashboard();
      setStats(data.stats);
      setCampaigns(data.recentCampaigns);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      setTemplates(await api.communication.getTemplates());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      setCampaigns(await api.communication.getCampaigns());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadHistory = async () => {
    setLoading(true);
    try {
      setLogs(await api.communication.getHistory(50));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const tabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'campaigns', icon: Send, label: 'Campaigns' },
    { id: 'templates', icon: FileText, label: 'Templates' },
    { id: 'audience', icon: Users, label: 'Audience' },
    { id: 'schedule', icon: CalendarClock, label: 'Schedule' },
    { id: 'history', icon: History, label: 'History' },
  ];

  return (
    <div className="space-y-4 max-w-4xl mx-auto mt-4 pb-20">
      
      {/* Header */}
      <div className="bg-panel dark:bg-panel-dark p-6 rounded-2xl border border-edge dark:border-edge-dark shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">
            <MessageSquare size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-inkA dark:text-inkA-dark">Communication Center</h2>
            <p className="text-xs text-inkB dark:text-inkB-dark font-medium">Unified messaging infrastructure for your campaigns</p>
          </div>
        </div>
        <button 
          onClick={() => setActiveTab('campaigns')}
          className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {/* Sub Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
                isActive 
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/25' 
                  : 'bg-panel dark:bg-panel-dark text-inkB dark:text-inkB-dark border border-edge dark:border-edge-dark hover:bg-panel2 dark:hover:bg-panel2-dark'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={32}/></div>
      ) : (
        <div className="min-h-[400px]">
          {activeTab === 'dashboard' && stats && (
            <DashboardTab stats={stats} campaigns={campaigns} />
          )}

          {activeTab === 'templates' && (
            <TemplatesTab templates={templates} onRefresh={loadTemplates} />
          )}

          {activeTab === 'campaigns' && (
            <CampaignsTab campaigns={campaigns} templates={templates} onRefresh={loadCampaigns} />
          )}

          {activeTab === 'history' && (
            <HistoryTab logs={logs} />
          )}

          {(activeTab === 'audience' || activeTab === 'schedule') && (
            <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark p-12 shadow-sm flex flex-col items-center justify-center text-center h-full">
              <div className="w-16 h-16 bg-panel2 dark:bg-panel2-dark text-gray-400 dark:text-slate-500 rounded-full flex items-center justify-center mb-4">
                {React.createElement(tabs.find(t => t.id === activeTab)?.icon || Clock, { size: 32 })}
              </div>
              <h2 className="text-xl font-bold text-inkA dark:text-inkA-dark mb-2">{tabs.find(t => t.id === activeTab)?.label}</h2>
              <p className="text-sm text-inkB dark:text-inkB-dark max-w-sm mb-6">
                This module is integrated directly into the Campaign Dispatcher workflow.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// DASHBOARD TAB
// ----------------------------------------------------------------------------
function DashboardTab({ stats, campaigns }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Send} title="Total Sent" value={stats.total_messages} color="text-blue-500 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-500/10" />
        <StatCard icon={CheckCircle} title="Delivered" value={stats.delivered} color="text-emerald-500 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-500/10" />
        <StatCard icon={XCircle} title="Failed" value={stats.failed} color="text-red-500 dark:text-red-400" bg="bg-red-50 dark:bg-red-500/10" />
        <StatCard icon={BarChart} title="Campaigns" value={stats.total_campaigns} color="text-violet-500 dark:text-violet-400" bg="bg-violet-50 dark:bg-violet-500/10" />
      </div>
      
      <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark p-5 shadow-sm">
        <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark mb-4">Recent Campaigns</h3>
        {campaigns.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-8">No campaigns found.</p>
        ) : (
          <div className="space-y-2">
            {campaigns.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-edge dark:border-edge-dark bg-panel2/50 dark:bg-panel2-dark/50">
                <div>
                  <p className="text-sm font-bold text-inkA dark:text-inkA-dark">{c.name}</p>
                  <p className="text-[10px] text-inkB dark:text-inkB-dark uppercase tracking-wider">{c.channel} • {c.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-inkA dark:text-inkA-dark">{c.successful_deliveries} / {c.total_recipients}</p>
                  <p className="text-[10px] text-inkB dark:text-inkB-dark">Delivered</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, color, bg }) {
  return (
    <div className="bg-panel dark:bg-panel-dark p-4 rounded-2xl border border-edge dark:border-edge-dark shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg} ${color}`}>
          <Icon size={16} />
        </div>
      </div>
      <div>
        <p className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">{title}</p>
        <p className="text-2xl font-black text-inkA dark:text-inkA-dark">{value}</p>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// TEMPLATES TAB
// ----------------------------------------------------------------------------
function TemplatesTab({ templates, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', channel: 'whatsapp', category: 'marketing', content: '' });

  const handleSave = async () => {
    try {
      await api.communication.createTemplate(form);
      setShowForm(false);
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-panel dark:bg-panel-dark p-4 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
        <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark">Message Templates</h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold">
          <Plus size={14} /> New Template
        </button>
      </div>

      {showForm && (
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold">Create Template</h4>
            <button onClick={() => setShowForm(false)} className="text-gray-400 dark:text-slate-500"><X size={16}/></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input 
              placeholder="Template Name" 
              className="px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm"
              value={form.name} onChange={e => setForm({...form, name: e.target.value})}
            />
            <select 
              className="px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm"
              value={form.channel} onChange={e => setForm({...form, channel: e.target.value})}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <textarea 
            placeholder="Hello {{name}}, welcome to our store!" 
            className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm h-24"
            value={form.content} onChange={e => setForm({...form, content: e.target.value})}
          />
          <div className="flex justify-end">
            <button onClick={handleSave} className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-bold">Save Template</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-panel dark:bg-panel-dark p-4 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="text-sm font-bold text-inkA dark:text-inkA-dark">{t.name}</h4>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider">{t.channel}</p>
              </div>
            </div>
            <p className="text-xs text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark p-2 rounded-lg line-clamp-2">{t.content.replace(/"/g, '')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CAMPAIGNS TAB
// ----------------------------------------------------------------------------
function CampaignsTab({ campaigns, templates, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', channel: 'whatsapp', audience_type: 'all', template_id: '' });

  const handleDispatch = async () => {
    try {
      await api.communication.dispatch(form);
      setShowForm(false);
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-panel dark:bg-panel-dark p-4 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
        <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark">Broadcast Campaigns</h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold">
          <Send size={14} /> Dispatch Broadcast
        </button>
      </div>

      {showForm && (
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold">New Broadcast</h4>
            <button onClick={() => setShowForm(false)} className="text-gray-400 dark:text-slate-500"><X size={16}/></button>
          </div>
          
          <div className="space-y-3">
            <input 
              placeholder="Campaign Name (e.g. Diwali Blast)" 
              className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm"
              value={form.name} onChange={e => setForm({...form, name: e.target.value})}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1 block">Channel</label>
                <select 
                  className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm"
                  value={form.channel} onChange={e => setForm({...form, channel: e.target.value})}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1 block">Audience</label>
                <select 
                  className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm"
                  value={form.audience_type} onChange={e => setForm({...form, audience_type: e.target.value})}
                >
                  <option value="all">All Customers</option>
                  <option value="segment">Specific Segment</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1 block">Template</label>
              <select 
                className="w-full px-3 py-2 bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm"
                value={form.template_id} onChange={e => setForm({...form, template_id: e.target.value})}
              >
                <option value="">Select a template...</option>
                {templates.filter(t => t.channel === form.channel).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={handleDispatch} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2">
              <Send size={14} /> Send Now
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {campaigns.map(c => (
          <div key={c.id} className="bg-panel dark:bg-panel-dark p-4 rounded-2xl border border-edge dark:border-edge-dark shadow-sm flex justify-between items-center">
            <div>
              <h4 className="text-sm font-bold text-inkA dark:text-inkA-dark">{c.name}</h4>
              <p className="text-[10px] text-inkB dark:text-inkB-dark uppercase tracking-wider">
                {c.channel} • {new Date(c.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-xs font-bold text-inkA dark:text-inkA-dark">{c.total_recipients}</p>
                <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-wider">Targeted</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{c.successful_deliveries}</p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400/70 uppercase tracking-wider">Delivered</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-red-600 dark:text-red-400">{c.failed_deliveries}</p>
                <p className="text-[10px] text-red-600 dark:text-red-400/70 uppercase tracking-wider">Failed</p>
              </div>
              <div>
                <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                  c.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                }`}>
                  {c.status.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// HISTORY TAB
// ----------------------------------------------------------------------------
function HistoryTab({ logs }) {
  return (
    <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark p-5 shadow-sm">
      <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark mb-4">Message Delivery Logs</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-edge dark:border-edge-dark">
              <th className="pb-3 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase">Customer</th>
              <th className="pb-3 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase">Channel</th>
              <th className="pb-3 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase">Campaign</th>
              <th className="pb-3 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase">Status</th>
              <th className="pb-3 text-xs font-bold text-gray-400 dark:text-slate-500 uppercase">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-b border-edge dark:border-edge-dark last:border-0">
                <td className="py-3 text-inkA dark:text-inkA-dark font-medium">{log.customer_name || `ID: ${log.customer_id}`}</td>
                <td className="py-3 text-inkB dark:text-inkB-dark text-xs uppercase">{log.channel}</td>
                <td className="py-3 text-inkB dark:text-inkB-dark text-xs">{log.campaign_name || '-'}</td>
                <td className="py-3">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                    log.status === 'sent' || log.status === 'delivered' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 
                    log.status === 'failed' ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  }`}>
                    {log.status.toUpperCase()}
                  </span>
                  {log.error_details && <p className="text-[10px] text-red-400 mt-1">{log.error_details}</p>}
                </td>
                <td className="py-3 text-gray-400 dark:text-slate-500 text-xs">{new Date(log.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan="5" className="text-center py-8 text-gray-400 dark:text-slate-500">No delivery logs found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
