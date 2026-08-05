import React, { useState, useEffect } from 'react';
import { BASE } from '../../../api/client';
import { Loader2, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function LoyaltyAnalytics({ dateFilter }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [dateFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `${BASE}/reports/loyalty?range=${dateFilter.range}`;
      if (dateFilter.start) url += `&start=${dateFilter.start}`;
      if (dateFilter.end) url += `&end=${dateFilter.end}`;
      
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300 dark:text-slate-600" size={32}/></div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Active Wallets</p>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-black text-inkA dark:text-inkA-dark">{data.activeWallets}</p>
            <Wallet className="text-emerald-500 dark:text-emerald-400 mb-1" size={20} />
          </div>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Credits Issued</p>
          <p className="text-3xl font-black text-blue-600 dark:text-blue-400">${data.creditsIssued.toLocaleString()}</p>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Credits Redeemed</p>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">${data.creditsRedeemed.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-panel dark:bg-panel-dark p-6 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
        <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark mb-6">Wallet Activity Trend</h3>
        <div className="h-72">
          {data.walletTrend && data.walletTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.walletTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="issued" name="Issued" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="redeemed" name="Redeemed" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-slate-500">No activity data</div>
          )}
        </div>
      </div>
    </div>
  );
}
