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
      <div className="bg-panel dark:bg-panel-dark p-6 rounded-2xl border border-edge dark:border-edge-dark shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center">
            <BarChart size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-inkA dark:text-inkA-dark">Reports & Analytics</h2>
            <p className="text-xs text-inkB dark:text-inkB-dark font-medium">Data-driven insights for your business</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <DateFilter value={dateFilter} onChange={setDateFilter} />
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleExport('csv')}
              className="flex items-center gap-1.5 px-3 py-2 bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark hover:bg-panel2 dark:hover:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-sm font-bold transition-colors"
            >
              <Download size={16} /> CSV
            </button>
            <button 
              onClick={() => handleExport('excel')}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-500/25 rounded-xl text-sm font-bold transition-colors"
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
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25' 
                  : 'bg-panel dark:bg-panel-dark text-inkB dark:text-inkB-dark border border-edge dark:border-edge-dark hover:bg-panel2 dark:hover:bg-panel2-dark'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'} />
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
