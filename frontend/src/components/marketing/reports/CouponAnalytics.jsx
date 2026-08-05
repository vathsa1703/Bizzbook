import React, { useState, useEffect } from 'react';
import { BASE } from '../../../api/client';
import { Loader2, Tag } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function CouponAnalytics({ dateFilter }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [dateFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `${BASE}/reports/coupons?range=${dateFilter.range}`;
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 flex items-center justify-center">
            <Tag size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Issued</p>
            <p className="text-2xl font-black text-inkA dark:text-inkA-dark">{data.issued}</p>
          </div>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Redeemed</p>
          <p className="text-3xl font-black text-inkA dark:text-inkA-dark">{data.redeemed}</p>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Redemption Rate</p>
          <p className="text-3xl font-black text-blue-600 dark:text-blue-400">{data.redemptionRate}</p>
        </div>
        <div className="bg-panel dark:bg-panel-dark p-5 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Driven Revenue</p>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">${data.revenue.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-panel dark:bg-panel-dark p-6 rounded-2xl border border-edge dark:border-edge-dark shadow-sm">
        <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark mb-6">Most Used Coupons</h3>
        <div className="h-64">
          {data.topCoupons && data.topCoupons.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topCoupons} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis dataKey="label" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#374151', fontWeight: 'bold' }} width={80} />
                <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-slate-500">No redemptions in this period</div>
          )}
        </div>
      </div>
    </div>
  );
}
