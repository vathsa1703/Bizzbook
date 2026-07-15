import React from 'react';
import { Sparkles, ShoppingBag, Store, Activity, Monitor, Coffee, Utensils, Wrench, Smartphone, BookOpen, Layers } from 'lucide-react';

const BUSINESS_TYPES = [
  { id: 'grocery', label: 'Grocery / Kirana', icon: ShoppingBag, color: 'text-green-500' },
  { id: 'clothing', label: 'Clothing Store', icon: Store, color: 'text-pink-500' },
  { id: 'pharmacy', label: 'Pharmacy', icon: Activity, color: 'text-red-500' },
  { id: 'electronics', label: 'Electronics', icon: Monitor, color: 'text-blue-500' },
  { id: 'restaurant', label: 'Restaurant', icon: Utensils, color: 'text-orange-500' },
  { id: 'bakery', label: 'Bakery', icon: Coffee, color: 'text-amber-500' },
  { id: 'hardware', label: 'Hardware', icon: Wrench, color: 'text-slate-500' },
  { id: 'mobile', label: 'Mobile Shop', icon: Smartphone, color: 'text-cyan-500' },
  { id: 'stationery', label: 'Stationery', icon: BookOpen, color: 'text-purple-500' },
  { id: 'others', label: 'Others', icon: Layers, color: 'text-indigo-500' },
];

export default function BusinessSelection({ onNavigate }) {
  const handleSelect = (typeId) => {
    localStorage.setItem('businessType', typeId);
    onNavigate('register');
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 font-sans p-6 relative overflow-hidden">
      {/* Decorative Gradients */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-600/30 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-600/20 blur-3xl" />

      <div className="w-full max-w-2xl mx-auto z-10 space-y-8 mt-10">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20 ring-1 ring-white/20 animate-pulse">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              BIZZBOOK <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">Voice</span>
            </h1>
            <p className="text-sm text-slate-400 font-medium">Welcome! Let's personalize your experience.</p>
          </div>
        </div>

        {/* Card Body */}
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="space-y-1.5 text-center mb-6">
            <h2 className="text-xl font-bold text-white">What's your business type?</h2>
            <p className="text-xs text-slate-400">Select your industry to load a customized template and demo data.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {BUSINESS_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => handleSelect(type.id)}
                  className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-slate-900/50 border border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Icon className={`w-6 h-6 ${type.color}`} />
                  </div>
                  <span className="text-sm font-semibold text-slate-200 group-hover:text-white text-center">
                    {type.label}
                  </span>
                </button>
              );
            })}
          </div>
          
          <div className="pt-4 text-center">
            <button
              onClick={() => onNavigate('login')}
              className="text-xs text-slate-400 hover:text-blue-400 font-medium transition-colors underline decoration-transparent hover:decoration-blue-400/30 underline-offset-4"
            >
              Already have an account? Log in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
