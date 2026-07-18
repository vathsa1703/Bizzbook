import React, { useState } from 'react';
import BottomNav from './components/BottomNav';
import { ToastProvider } from './components/ToastContext';
import { useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AIProvider } from './contexts/AIContext';
import ChatFAB from './components/ai/ChatFAB';

import Home      from './pages/Home';
import Sales     from './pages/Sales';
import Stock     from './pages/Stock';
import Customers from './pages/Customers';
import More      from './pages/More';
import Assistant from './pages/Assistant';
import Employees from './pages/Employees';
import Credit    from './pages/Credit';
import Suppliers from './pages/Suppliers';
import Purchases from './pages/Purchases';
import Marketing from './pages/Marketing';
import Compliance from './pages/Compliance';
import Reports      from './pages/Reports';
import InvoiceView  from './pages/InvoiceView';
import Login        from './pages/Login';
import Register     from './pages/Register';
import ProductGroups from './pages/ProductGroups';
import GstFiling    from './pages/GstFiling';
import GstSettings  from './pages/GstSettings';
import GstMaster    from './pages/GstMaster';
import BusinessSelection from './pages/BusinessSelection';
import SetupWizard  from './pages/SetupWizard';
import CompanyProfile from './pages/CompanyProfile';
import GrowthHub from './pages/GrowthHub';
import { Sparkles } from 'lucide-react';

import ErrorBoundary from './components/ErrorBoundary';

const PAGES = {
  home:      Home,
  assistant: Assistant,
  sales:     Sales,
  stock:     Stock,
  employees: Employees,
  customers: Customers,
  more:      More,
  credit:    Credit,
  suppliers: Suppliers,
  purchases: Purchases,
  marketing: Marketing,
  compliance: Compliance,
  reports:          Reports,
  'product-groups': ProductGroups,
  'gst-filing':     GstFiling,
  'gst-settings':   GstSettings,
  'gst-master':     GstMaster,
  'company-profile': CompanyProfile,
  'growth': GrowthHub,
};

export default function App() {
  const [tab, setTab] = useState('home');
  const { user, loading } = useAuth();

  let content;
  if (loading) {
    content = (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 font-sans">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20 ring-1 ring-white/20 animate-pulse mb-4">
          <Sparkles className="w-8 h-8 text-white animate-spin" />
        </div>
        <div className="text-white font-bold text-lg">BIZZ BOOK</div>
        <div className="text-slate-400 text-xs mt-1">Restoring secure session...</div>
      </div>
    );
  } else if (!user) {
    const hasBusinessType = localStorage.getItem('businessType');
    if (!hasBusinessType && tab !== 'login' && tab !== 'register') {
      content = <BusinessSelection onNavigate={setTab} />;
    } else if (tab === 'register') {
      content = <Register onNavigate={setTab} />;
    } else {
      content = <Login onNavigate={setTab} />;
    }
  } else if (tab === 'setup-wizard') {
    // Post-signup setup wizard — shown outside of normal app shell (no BottomNav)
    content = <SetupWizard onNavigate={setTab} />;
  } else {
    // If authenticated but the tab is not one of PAGES (e.g. leftover from register), reset to home
    const currentTab = PAGES[tab] ? tab : 'home';
    const Page = PAGES[currentTab];
    content = (
      <div className="relative min-h-screen bg-canvas dark:bg-canvas-dark">
        <main className="h-screen overflow-y-auto scrollbar-none md:pl-56">
          <Page onNavigate={setTab} />
        </main>

        <BottomNav active={currentTab} onChange={setTab} />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AIProvider>
            {content}
            {user && <ChatFAB />}
          </AIProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}