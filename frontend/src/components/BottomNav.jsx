import React from 'react';
import { Home as HomeIcon, ShoppingCart, Package, Users, MoreHorizontal, Bot } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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
  
  const visibleTabs = tabs.filter(tab => !tab.adminOnly || (user && ['admin', 'OWNER', 'MANAGER'].includes(user.role)));

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 flex items-center safe-bottom z-50">
      {visibleTabs.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors"
          >
            <Icon
              size={20}
              strokeWidth={isActive ? 2.2 : 1.8}
              className={isActive ? 'text-brand-blue' : 'text-gray-400'}
            />
            <span className={`text-[9px] font-medium ${isActive ? 'text-brand-blue' : 'text-gray-400'}`}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

