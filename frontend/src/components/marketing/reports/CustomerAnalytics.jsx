import React, { useState, useEffect } from 'react';
import { Loader2, Users } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function CustomerAnalytics({ dateFilter }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [dateFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/api/reports/customers?range=${dateFilter.range}`;
      if (dateFilter.start) url += `&start=${dateFilter.start}`;
      if (dateFilter.end) url += `&end=${dateFilter.end}`;
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300" size={32}/></div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Audience</p>
            <p className="text-2xl font-black text-gray-900">{data.totalCustomers}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">New Acquired</p>
          <p className="text-3xl font-black text-emerald-600">+{data.newCustomers}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Retention Rate</p>
          <p className="text-3xl font-black text-blue-600">{data.retentionRate}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-6">Acquisition Trend</h3>
        <div className="h-72">
          {data.acquisitionTrend && data.acquisitionTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.acquisitionTrend}>
                <defs>
                  <linearGradient id="colorAcq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorAcq)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">No acquisition data for this period</div>
          )}
        </div>
      </div>
    </div>
  );
}
