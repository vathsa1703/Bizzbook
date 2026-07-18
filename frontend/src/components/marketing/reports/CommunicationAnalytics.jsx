import React, { useState, useEffect } from 'react';
import { Loader2, MessageSquare, Send, XCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function CommunicationAnalytics({ dateFilter }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [dateFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/api/reports/communications?range=${dateFilter.range}`;
      if (dateFilter.start) url += `&start=${dateFilter.start}`;
      if (dateFilter.end) url += `&end=${dateFilter.end}`;
      
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={32}/></div>;
  if (!data) return null;

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400 flex items-center justify-center">
            <MessageSquare size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Messages Sent</p>
            <p className="text-2xl font-black text-inkA dark:text-inkA-dark">{data.messagesSent}</p>
          </div>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Send size={12}/> Delivered</p>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{data.delivered}</p>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><XCircle size={12}/> Failed</p>
          <p className="text-3xl font-black text-red-600 dark:text-red-400">{data.failed}</p>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Delivery Rate</p>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{data.deliveryRate}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-panel dark:bg-panel-dark p-6 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark mb-6">Dispatch Trend</h3>
          <div className="h-64">
            {data.trend && data.trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend}>
                  <defs>
                    <linearGradient id="colorComm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorComm)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-slate-500">No dispatch data</div>
            )}
          </div>
        </div>

        <div className="bg-panel dark:bg-panel-dark p-6 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark mb-6">Channel Breakdown</h3>
          <div className="h-64">
            {data.channelStats && data.channelStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.channelStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {data.channelStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-slate-500">No channel data</div>
            )}
          </div>
          {data.channelStats && (
            <div className="flex justify-center gap-4 mt-2">
              {data.channelStats.map((c, i) => (
                <div key={c.label} className="flex items-center gap-1.5 text-xs font-bold text-inkB dark:text-inkB-dark uppercase">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                  {c.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
