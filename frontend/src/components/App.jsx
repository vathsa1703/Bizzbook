import React, { useState } from 'react';
import BottomNav from './components/BottomNav';
import { ToastProvider } from './components/ToastContext';
import { useAuth } from './context/AuthContext';

import Home      from './pages/Home';
import Sales     from './pages/Sales';
import Stock     from './pages/Stock';
import Customers from './pages/Customers';
import More      from './pages/More';
import Assistant from './pages/Assistant';
import Employees from './pages/Employees';
import Credit    from './pages/Credit';
import Suppliers from './pages/Suppliers';
import Login     from './pages/Login';
import Register  from './pages/Register';
import { Sparkles } from 'lucide-react';

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
        <div className="text-white font-bold text-lg">BizBook</div>
        <div className="text-slate-400 text-xs mt-1">Restoring secure session...</div>
      </div>
    );
  } else if (!user) {
    if (tab === 'register') {
      content = <Register onNavigate={setTab} />;
    } else {
      content = <Login onNavigate={setTab} />;
    }
  } else {
    // If authenticated but the tab is not one of PAGES (e.g. leftover from register), reset to home
    const currentTab = PAGES[tab] ? tab : 'home';
    const Page = PAGES[currentTab];
    content = (
      <div className="relative min-h-screen bg-surface">
        <main className="h-screen overflow-y-auto scrollbar-none">
          <Page onNavigate={setTab} />
        </main>

        <BottomNav active={currentTab} onChange={setTab} />
      </div>
    );
  }

  return (
    <ToastProvider>
      {content}
    </ToastProvider>
  );
}