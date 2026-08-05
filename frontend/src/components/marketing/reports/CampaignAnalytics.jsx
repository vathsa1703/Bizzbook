import React, { useState, useEffect } from 'react';
import { BASE } from '../../../api/client';
import { Loader2, Send, Activity, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function CampaignAnalytics({ dateFilter }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [dateFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `${BASE}/reports/campaigns?range=${dateFilter.range}`;
      if (dateFilter.start) url += `&start=${dateFilter.start}`;
      if (dateFilter.end) url += `&end=${dateFilter.end}`;
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={32}/></div>;
  if (!data) return null;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Total Campaigns</p>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-black text-inkA dark:text-inkA-dark">{data.totalCampaigns}</p>
            <p className="text-sm font-bold text-emerald-500 dark:text-emerald-400 mb-1">{data.activeCampaigns} Active</p>
          </div>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Avg Campaign ROI</p>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{data.avgROI}</p>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Top Performing</p>
          <p className="text-lg font-bold text-inkA dark:text-inkA-dark truncate">{data.topCampaigns[0]?.name || '-'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-panel dark:bg-panel-dark p-6 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark mb-6">Campaigns by Type</h3>
          <div className="h-64">
            {data.typeDistribution && data.typeDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.typeDistribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {data.typeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-slate-500">No campaigns launched</div>
            )}
          </div>
        </div>

        <div className="bg-panel dark:bg-panel-dark p-6 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark mb-4">Recent Campaigns</h3>
          <div className="space-y-3">
            {data.topCampaigns.length === 0 ? (
              <p className="text-xs text-center text-gray-400 dark:text-slate-500 py-10">No recent campaigns</p>
            ) : (
              data.topCampaigns.map(c => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-edge dark:border-edge-dark bg-panel2/50 dark:bg-panel2-dark/50">
                  <div>
                    <p className="text-sm font-bold text-inkA dark:text-inkA-dark">{c.name}</p>
                    <p className="text-[10px] text-inkB dark:text-inkB-dark uppercase tracking-wider">{c.type || 'Standard'} • {c.status}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
