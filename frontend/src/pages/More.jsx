import React, { useEffect, useState } from 'react';
import { BarChart2, FileText, Bell, Shield, HelpCircle, LogOut, TrendingUp, Users, Sparkles, Receipt, Building2, ShieldCheck, Truck } from 'lucide-react';
import ListItem from '../components/ListItem';
import SectionCard from '../components/SectionCard';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function More({ onNavigate }) {
  const [recommendations, setRecommendations] = useState([]);
  const [isGstRegistered, setIsGstRegistered]  = useState(true); // default to true until loaded
  const { user, logout } = useAuth();

  useEffect(() => {
    api.recommendations().catch(() => []).then(r => setRecommendations(Array.isArray(r) ? r.slice(0, 3) : []));
    api.getCompanySettings().then(s => {
      // is_gst_registered: treat 0 as false, anything else (null, 1, undefined) as true
      setIsGstRegistered(s?.is_gst_registered !== 0);
    }).catch(() => {});
  }, []);

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';
  const roleText = user?.role === 'admin' ? 'Administrator' : (user?.role || 'Employee');
  const isAdmin = !user || ['admin', 'OWNER', 'MANAGER'].includes(user.role);

  return (
    <div className="pb-20">
      <div className="bg-white px-5 pt-12 pb-5 border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">More</h1>
        {/* Profile card */}
        <div className="mt-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-brand-blue flex items-center justify-center">
            <span className="text-white font-bold text-lg">{userInitial}</span>
          </div>
          <div>
            <p className="font-bold text-gray-900">{user?.name || 'User'}</p>
            <p className="text-xs text-gray-500">{roleText} · Rajesh Kirana</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* AI Recommendations */}
        {recommendations.length > 0 && (
          <SectionCard>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-brand-blue flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">AI</span>
              </div>
              <p className="text-sm font-bold text-gray-900">Recommendations</p>
            </div>
            {recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                <span className="text-brand-blue mt-0.5">•</span>
                <p className="text-sm text-gray-700 leading-snug">{typeof r === 'string' ? r : r.message || r.recommendation || JSON.stringify(r)}</p>
              </div>
            ))}
          </SectionCard>
        )}

        {/* Menu sections */}
        <div>
          <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-2 px-1">Business</p>
          <SectionCard className="py-0 px-0 overflow-hidden">
            {isAdmin && (
              <div className="px-4" onClick={() => onNavigate('marketing')}>
                <ListItem
                  icon={BarChart2}
                  title="Marketing Intelligence"
                  subtitle="AI-powered opportunities from ERP data"
                  color="purple"
                  showChevron
                />
              </div>
            )}
            {isAdmin && (
              <div className="px-4" onClick={() => onNavigate('growth')}>
                <ListItem
                  icon={TrendingUp}
                  title="Growth Hub"
                  subtitle="Funding, equity, IPO & investor tools"
                  color="indigo"
                  showChevron
                />
              </div>
            )}
            <div className="px-4" onClick={() => onNavigate('compliance')}>
              <ListItem
                icon={ShieldCheck}
                title="Compliance"
                subtitle="Licenses, filings, renewals & deadlines"
                color="green"
                showChevron
              />
            </div>
            {isGstRegistered && isAdmin && (
              <div className="px-4" onClick={() => onNavigate('gst-filing')}>
                <ListItem
                  icon={Receipt}
                  title="GST Filing Export"
                  subtitle="GSTR-1 · Excel, CSV & JSON for portal"
                  color="green"
                  showChevron
                />
              </div>
            )}
            <div className="px-4" onClick={() => onNavigate('credit')}>
              <ListItem
                icon={FileText}
                title="Credit Ledger & Invoices"
                subtitle="Manage customer balances"
                color="purple"
                showChevron
              />
            </div>
            {isAdmin && (
              <div className="px-4" onClick={() => onNavigate('suppliers')}>
                <ListItem
                  icon={Users}
                  title="Suppliers Directory"
                  subtitle="Stock sources & products"
                  color="blue"
                  showChevron
                />
              </div>
            )}
            {isAdmin && (
              <div className="px-4" onClick={() => onNavigate('purchases')}>
                <ListItem
                  icon={Truck}
                  title="Purchase Orders"
                  subtitle="Record stock received from suppliers"
                  color="blue"
                  showChevron
                />
              </div>
            )}
            <div className="px-4" onClick={() => onNavigate('customers')}>
              <ListItem
                icon={Users}
                title="Customers Directory"
                subtitle="Customer profiles & history"
                color="green"
                showChevron
              />
            </div>
            {isAdmin && (
              <div className="px-4" onClick={() => onNavigate('product-groups')}>
                <ListItem
                  icon={FileText}
                  title="Product Groups"
                  subtitle="Manage product categories"
                  color="blue"
                  showChevron
                />
              </div>
            )}
            {isAdmin && (
              <div className="px-4" onClick={() => onNavigate('gst-master')}>
                <ListItem
                  icon={FileText}
                  title="GST Master"
                  subtitle="HSN & UQC Configuration"
                  color="green"
                  showChevron
                />
              </div>
            )}
          </SectionCard>
        </div>

        <div>
          <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-2 px-1">Account</p>
          <SectionCard className="py-0 px-0 overflow-hidden">
            {isAdmin && (
              <div className="px-4" onClick={() => onNavigate('company-profile')}>
                <ListItem
                  icon={Building2}
                  title="Company Profile"
                  subtitle="Business details, licenses & branding"
                  color="blue"
                  showChevron
                />
              </div>
            )}
            <div className="px-4">
              <ListItem
                icon={Bell}
                title="Notifications"
                subtitle="Alerts & reminders"
                color="amber"
                showChevron
              />
            </div>
            <div className="px-4">
              <ListItem
                icon={Shield}
                title="Security"
                subtitle="PIN & permissions"
                color="red"
                showChevron
              />
            </div>
          </SectionCard>
        </div>

        {/* Log out */}
        <button 
          onClick={logout}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-brand-redSoft text-brand-red font-semibold text-sm active:scale-[0.98] transition-transform"
        >
          <LogOut size={16} />
          Log Out
        </button>

        <p className="text-center text-xs text-gray-400 pb-2">Version 1.0.0 · AI Business Assistant</p>
      </div>
    </div>
  );
}

