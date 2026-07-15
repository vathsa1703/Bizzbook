// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: GrowthHub Page — shell only. Each tab lives in its own file in this
// folder (split out of the original 1715-line monolith for maintainability;
// no behavior/visual/API changes to the existing 14 tabs).
//
// RBAC: Growth Hub is Owner/Admin/Manager only, matching the backend's router-
// wide gate (routes/growth.js) and the nav entry that links here
// (pages/More.jsx: `isAdmin && <Growth Hub link>`). This guard is
// defense-in-depth for the same role check — without it, a non-admin who
// somehow lands on this tab would see a page where every API call 403s.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect } from 'react';
import { ChevronRight, TrendingUp, ShieldAlert } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { SIDEBAR_TABS } from './shared';

import DashboardTab from './DashboardTab';
import FundingTab from './FundingTab';
import SchemesTab from './SchemesTab';
import InvestorsTab from './InvestorsTab';
import EquityTab from './EquityTab';
import CapTableTab from './CapTableTab';
import ValuationTab from './ValuationTab';
import IPOTab from './IPOTab';
import PartnershipsTab from './PartnershipsTab';
import PitchDeckTab from './PitchDeckTab';
import DueDiligenceTab from './DueDiligenceTab';
import RoadmapTab from './RoadmapTab';
import AdvisorTab from './AdvisorTab';
import NotesTab from './NotesTab';
import TradeTab from './TradeTab';

const ADMIN_ROLES = ['admin', 'OWNER', 'MANAGER'];

export default function GrowthHub({ onNavigate }) {
  const [activeTab, setActiveTab] = useState('overview');
  const { user } = useAuth();
  const isAdmin = !user || ADMIN_ROLES.includes(user.role);

  // Seed reference data on mount (idempotent)
  useEffect(() => {
    if (isAdmin) api.growth.getProfile().catch(() => {});
  }, [isAdmin]);

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':      return <DashboardTab onTabChange={setActiveTab} />;
      case 'funding':       return <FundingTab />;
      case 'schemes':       return <SchemesTab />;
      case 'investors':     return <InvestorsTab />;
      case 'equity':        return <EquityTab />;
      case 'cap-table':     return <CapTableTab />;
      case 'valuation':     return <ValuationTab />;
      case 'ipo':           return <IPOTab />;
      case 'trade':         return <TradeTab />;
      case 'partnerships':  return <PartnershipsTab typeFilter="Partnership" />;
      case 'sponsorships':  return <PartnershipsTab typeFilter="Sponsorship" />;
      case 'pitch-deck':    return <PitchDeckTab />;
      case 'due-diligence': return <DueDiligenceTab />;
      case 'roadmap':       return <RoadmapTab />;
      case 'advisor':       return <AdvisorTab />;
      case 'notes':         return <NotesTab />;
      default:              return <DashboardTab onTabChange={setActiveTab} />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-5 pt-12 pb-4 sticky top-0 z-40">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => onNavigate('more')} className="text-white/70 hover:text-white">
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <TrendingUp size={16} className="text-white" />
            </div>
            <span className="text-white font-black text-lg">Growth Hub</span>
          </div>
        </div>
        {/* Horizontal scroll tabs */}
        {isAdmin && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
            {SIDEBAR_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${
                  activeTab === key
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'bg-white/15 text-white/80 hover:bg-white/25'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-5">
        {isAdmin ? renderTab() : (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
              <ShieldAlert size={28} className="text-red-400" />
            </div>
            <div className="font-bold text-gray-700 text-base">Access Restricted</div>
            <div className="text-sm text-gray-400 mt-1 max-w-xs">
              Growth Hub — funding, cap table, and investor data — is available to owners and managers only.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
