import React, { useState, useEffect } from 'react';
import { Loader2, PieChart as PieChartIcon } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function SurveyAnalytics({ dateFilter }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [dateFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let url = `/api/reports/surveys?range=${dateFilter.range}`;
      if (dateFilter.start) url += `&start=${dateFilter.start}`;
      if (dateFilter.end) url += `&end=${dateFilter.end}`;
      
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300" size={32}/></div>;
  if (!data) return null;

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center">
            <PieChartIcon size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Responses</p>
            <p className="text-2xl font-black text-gray-900">{data.totalResponses}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Average CSAT Rating</p>
          <p className="text-3xl font-black text-emerald-600">{data.averageRating} <span className="text-sm text-gray-400">/ 5.0</span></p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-6">Rating Distribution</h3>
        <div className="h-72">
          {data.ratingDistribution && data.ratingDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.ratingDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.ratingDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">No survey responses</div>
          )}
        </div>
      </div>
    </div>
  );
}
