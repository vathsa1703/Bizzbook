import React from 'react';
import { Home as HomeIcon, ShoppingCart, Package, Users, MoreHorizontal, Bot, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const tabs = [
  { key: 'home',      label: 'Home',      icon: HomeIcon      },
  { key: 'assistant', label: 'AI',        icon: Bot           },
  { key: 'sales',     label: 'Sales',     icon: ShoppingCart  },
  { key: 'stock',     label: 'Stock',     icon: Package       },
  { key: 'employees', label: 'Employees', icon: Users, adminOnly: true },
  { key: 'more',      label: 'More',      icon: MoreHorizontal},
];

export default function BottomNav({ active, onChange }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const visibleTabs = tabs.filter(tab => !tab.adminOnly || (user && ['admin', 'OWNER', 'MANAGER'].includes(user.role)));

  return (
    <>
      {/* Mobile: bottom tab bar */}
      <nav className="fixed bottom-0 left-0 w-full bg-panel dark:bg-panel-dark border-t border-edge dark:border-edge-dark flex items-center safe-bottom z-50 md:hidden">
        {visibleTabs.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className="flex-1 flex flex-col items-center justify-center min-h-[48px] py-1.5 gap-0.5 transition-colors"
            >
              <Icon
                size={20}
                strokeWidth={isActive ? 2.2 : 1.8}
                className={isActive ? 'text-accent' : 'text-inkB dark:text-inkB-dark'}
              />
              <span className={`text-[11px] ${isActive ? 'font-semibold text-accent' : 'font-medium text-inkB dark:text-inkB-dark'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Desktop: same nav items revealed as a left sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-56 flex-col bg-panel dark:bg-panel-dark border-r border-edge dark:border-edge-dark z-50">
        <div className="px-5 pt-6 pb-4 border-b border-edge dark:border-edge-dark">
          <p className="text-lg font-bold text-inkA dark:text-inkA-dark">ORUDINA</p>
          <p className="text-[11px] text-inkB dark:text-inkB-dark">Business Assistant</p>
        </div>
        <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {visibleTabs.map(({ key, label, icon: Icon }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                onClick={() => onChange(key)}
                className={`w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[13px] transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent font-semibold dark:bg-accent/15 dark:shadow-glow'
                    : 'text-inkB dark:text-inkB-dark font-medium hover:bg-panel2 dark:hover:bg-panel2-dark'
                }`}
              >
                <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                {label}
              </button>
            );
          })}
        </div>
        <div className="p-3 border-t border-edge dark:border-edge-dark">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[13px] font-medium text-inkB dark:text-inkB-dark hover:bg-panel2 dark:hover:bg-panel2-dark transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </aside>
    </>
  );
}
