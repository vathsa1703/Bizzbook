import React, { useState, useEffect } from 'react';
import { X, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { api, BASE } from '../../api/client';

export default function AutomationHistory({ automationId, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, [automationId]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${BASE}/automations/${automationId}/history`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-end z-50">
      <div className="w-full max-w-md bg-panel dark:bg-panel-dark h-full shadow-2xl flex flex-col animate-slide-left">
        <div className="p-6 border-b flex justify-between items-center bg-panel2 dark:bg-panel2-dark">
          <div>
            <h2 className="text-xl font-bold text-inkA dark:text-inkA-dark">Execution History</h2>
            <p className="text-sm text-inkB dark:text-inkB-dark">Recent runs for this automation</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 dark:text-slate-500 hover:text-gray-600 bg-panel dark:bg-panel-dark rounded-full shadow-sm">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 text-blue-500 dark:text-blue-400 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10">
              <Clock className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-inkB dark:text-inkB-dark">No execution history found yet.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-4 rounded-xl border border-edge dark:border-edge-dark shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    {log.status === 'success' && <CheckCircle className="w-5 h-5 text-green-500 dark:text-green-400" />}
                    {log.status === 'failed' && <XCircle className="w-5 h-5 text-red-500 dark:text-red-400" />}
                    {log.status === 'running' && <Loader2 className="w-5 h-5 text-blue-500 dark:text-blue-400 animate-spin" />}
                    {log.status === 'scheduled' && <Clock className="w-5 h-5 text-orange-500 dark:text-orange-400" />}
                    <span className="font-semibold text-inkA dark:text-inkA-dark capitalize">{log.status}</span>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-slate-500">{new Date(log.executed_at).toLocaleString()}</span>
                </div>
                {log.message && <p className="text-sm text-inkB dark:text-inkB-dark mt-2">{log.message}</p>}
                {log.duration_ms > 0 && <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">Duration: {log.duration_ms}ms</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
