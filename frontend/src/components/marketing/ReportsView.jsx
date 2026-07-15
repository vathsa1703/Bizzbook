import React, { useState } from 'react';
import { 
  BarChart, PieChart, Users, Tag, 
  Wallet, Gift, MessageSquare, Download, Activity 
} from 'lucide-react';
import DateFilter from './reports/DateFilter';
import ExecutiveDashboard from './reports/ExecutiveDashboard';
import CampaignAnalytics from './reports/CampaignAnalytics';
import CustomerAnalytics from './reports/CustomerAnalytics';
import CouponAnalytics from './reports/CouponAnalytics';
import LoyaltyAnalytics from './reports/LoyaltyAnalytics';
import ReferralAnalytics from './reports/ReferralAnalytics';
import SurveyAnalytics from './reports/SurveyAnalytics';
import CommunicationAnalytics from './reports/CommunicationAnalytics';

export default function ReportsView() {
  const [activeTab, setActiveTab] = useState('executive');
  const [dateFilter, setDateFilter] = useState({ range: '30days', start: null, end: null });

  const tabs = [
    { id: 'executive', icon: Activity, label: 'Executive' },
    { id: 'campaigns', icon: BarChart, label: 'Campaigns' },
    { id: 'customers', icon: Users, label: 'Customers' },
    { id: 'coupons', icon: Tag, label: 'Coupons' },
    { id: 'loyalty', icon: Wallet, label: 'Loyalty' },
    { id: 'referrals', icon: Gift, label: 'Referrals' },
    { id: 'surveys', icon: PieChart, label: 'Surveys' },
    { id: 'communications', icon: MessageSquare, label: 'Communications' },
  ];

  const handleExport = (format) => {
    let url = `/api/reports/export/${activeTab}?format=${format}&range=${dateFilter.range}`;
    if (dateFilter.start) url += `&start=${dateFilter.start}`;
    if (dateFilter.end) url += `&end=${dateFilter.end}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto mt-4 pb-20">
      
      {/* Header & Controls */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
            <BarChart size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Reports & Analytics</h2>
            <p className="text-xs text-gray-500 font-medium">Data-driven insights for your business</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <DateFilter value={dateFilter} onChange={setDateFilter} />
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleExport('csv')}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm font-bold transition-colors"
            >
              <Download size={16} /> CSV
            </button>
            <button 
              onClick={() => handleExport('excel')}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-sm font-bold transition-colors"
            >
              <Download size={16} /> Excel
            </button>
          </div>
        </div>
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
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                  : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-emerald-600' : 'text-gray-400'} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        {activeTab === 'executive' && <ExecutiveDashboard dateFilter={dateFilter} />}
        {activeTab === 'campaigns' && <CampaignAnalytics dateFilter={dateFilter} />}
        {activeTab === 'customers' && <CustomerAnalytics dateFilter={dateFilter} />}
        {activeTab === 'coupons' && <CouponAnalytics dateFilter={dateFilter} />}
        {activeTab === 'loyalty' && <LoyaltyAnalytics dateFilter={dateFilter} />}
        {activeTab === 'referrals' && <ReferralAnalytics dateFilter={dateFilter} />}
        {activeTab === 'surveys' && <SurveyAnalytics dateFilter={dateFilter} />}
        {activeTab === 'communications' && <CommunicationAnalytics dateFilter={dateFilter} />}
      </div>
    </div>
  );
}
