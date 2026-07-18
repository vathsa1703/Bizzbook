import React, { useState, useEffect } from 'react';
import { Plus, Zap, Play, CheckCircle, Activity, Power, PowerOff, Copy, Trash2, Edit, History } from 'lucide-react';
import { api } from '../../api/client';
import AutomationHistory from './AutomationHistory';

export default function AutomationList({ onNew, onEdit }) {
  const [automations, setAutomations] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, disabled: 0, executions: 0, successRate: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [historyId, setHistoryId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [autoRes, statRes] = await Promise.all([
        api.automations.getAll(),
        fetch('/api/automations/dashboard', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json())
      ]);
      setAutomations(autoRes.automations || []);
      if (statRes.success) setStats(statRes.stats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    try {
      await api.automations.updateStatus(id, currentStatus === 'active' ? 'inactive' : 'active');
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteAutomation = async (id) => {
    if (!window.confirm('Are you sure you want to delete this automation?')) return;
    try {
      await api.automations.delete(id);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-inkA dark:text-inkA-dark">Your Automations</h2>
          <p className="text-inkB dark:text-inkB-dark text-sm">Automatically perform tasks when something happens in your business.</p>
        </div>
        <button
          onClick={onNew}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition"
        >
          <Plus className="w-5 h-5" />
          <span>Create Automation</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-panel dark:bg-panel-dark p-4 rounded-xl border border-edge dark:border-edge-dark shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-green-100 dark:bg-green-500/15 text-green-600 dark:text-green-400 rounded-lg"><Play className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-inkB dark:text-inkB-dark">Active</p>
            <p className="text-2xl font-bold text-inkA dark:text-inkA-dark">{stats.active} <span className="text-sm font-normal text-gray-400 dark:text-slate-500">/ {stats.total}</span></p>
          </div>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-4 rounded-xl border border-edge dark:border-edge-dark shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded-lg"><Activity className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-inkB dark:text-inkB-dark">Total Runs</p>
            <p className="text-2xl font-bold text-inkA dark:text-inkA-dark">{stats.executions}</p>
          </div>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-4 rounded-xl border border-edge dark:border-edge-dark shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 rounded-lg"><CheckCircle className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-inkB dark:text-inkB-dark">Success Rate</p>
            <p className="text-2xl font-bold text-inkA dark:text-inkA-dark">{stats.successRate}%</p>
          </div>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-4 rounded-xl border border-edge dark:border-edge-dark shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400 rounded-lg"><Zap className="w-6 h-6" /></div>
          <div>
            <p className="text-sm text-inkB dark:text-inkB-dark">Failed Runs</p>
            <p className="text-2xl font-bold text-inkA dark:text-inkA-dark">{stats.failed}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <p className="text-inkB dark:text-inkB-dark py-8 text-center">Loading automations...</p>
        ) : automations.length === 0 ? (
          <div className="bg-panel dark:bg-panel-dark p-8 rounded-xl border border-edge dark:border-edge-dark shadow-sm text-center">
            <Zap className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-inkA dark:text-inkA-dark">No Automations Yet</h3>
            <p className="text-inkB dark:text-inkB-dark mb-4">Start automating your business processes to save time and increase sales.</p>
            <button onClick={onNew} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">Create your first automation</button>
          </div>
        ) : (
          automations.map(auto => (
            <div key={auto.id} className="bg-panel dark:bg-panel-dark p-5 rounded-xl border border-edge dark:border-edge-dark shadow-sm hover:shadow-md transition">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center space-x-3 mb-1">
                    <h3 className="text-lg font-semibold text-inkA dark:text-inkA-dark">{auto.name}</h3>
                    {auto.status === 'active' ? (
                      <span className="px-2 py-0.5 bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 text-xs rounded-full font-medium flex items-center"><div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></div> Active</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark text-xs rounded-full font-medium">Paused</span>
                    )}
                  </div>
                  <p className="text-inkB dark:text-inkB-dark text-sm mt-2 font-medium">
                    When <span className="text-inkA dark:text-inkA-dark font-semibold">{auto.event_type}</span> happens, wait {auto.delay_minutes} mins, then {auto.action_type}.
                  </p>
                  <div className="flex space-x-6 mt-4 text-xs text-inkB dark:text-inkB-dark">
                    <span><strong>Executed:</strong> {auto.total_executions || 0} times</span>
                    {auto.last_run && <span><strong>Last Run:</strong> {new Date(auto.last_run).toLocaleString()}</span>}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button onClick={() => setHistoryId(auto.id)} className="p-2 text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 rounded-lg hover:bg-blue-100 transition" title="History">
                    <History className="w-5 h-5" />
                  </button>
                  <button onClick={() => toggleStatus(auto.id, auto.status)} className={`p-2 rounded-lg transition ${auto.status === 'active' ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 hover:bg-green-100' : 'text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark hover:bg-panel2 dark:hover:bg-panel2-dark'}`} title={auto.status === 'active' ? 'Pause' : 'Resume'}>
                    {auto.status === 'active' ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                  </button>
                  <button onClick={() => deleteAutomation(auto.id)} className="p-2 text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg hover:bg-red-100 transition" title="Delete">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {historyId && (
        <AutomationHistory 
          automationId={historyId} 
          onClose={() => setHistoryId(null)} 
        />
      )}
    </div>
  );
}
