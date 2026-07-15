// Shared building blocks for the Workforce & Organization tabs. Dark-themed to
// match the HR Hub shell (Employees.jsx). Dialogs still reuse the app-wide light
// Modal/FormField (same convention as EmployeeDirectory).
import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, Users } from 'lucide-react';
import { api } from '../../../api/client';

export const AVATAR_GRADIENTS = [
  'from-blue-500 to-violet-600', 'from-emerald-500 to-teal-600', 'from-orange-500 to-red-600',
  'from-pink-500 to-rose-600', 'from-cyan-500 to-blue-600', 'from-amber-500 to-orange-600',
];

// Palette offered in color pickers (departments/teams/groups).
export const COLOR_SWATCHES = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#6366f1'];

export const STATUS_STYLES = {
  Active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Inactive: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  'On Leave': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  Terminated: 'bg-red-500/15 text-red-400 border-red-500/20',
  Probation: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  Archived: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
};

export function Avatar({ name, src, size = 'md', color }) {
  const s = size === 'lg' ? 'w-12 h-12 text-base' : size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  const grad = color || AVATAR_GRADIENTS[(name?.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length];
  if (src) return <img src={src} alt={name} className={`${s} rounded-xl object-cover flex-shrink-0`} />;
  return (
    <div className={`${s} rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[status] || STATUS_STYLES.Active}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />{status}
    </span>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <Loader2 className="w-6 h-6 animate-spin mb-2" /><span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon = Users, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mb-3"><Icon className="w-6 h-6 text-slate-500" /></div>
      <div className="text-sm font-semibold text-slate-300">{title}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1 max-w-xs">{subtitle}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="flex items-center gap-3 mb-5 flex-wrap">
      {Icon && <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center"><Icon className="w-5 h-5 text-blue-400" /></div>}
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-white leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}

// Loads the company's active employees once (for member pickers, assignees).
export function useEmployees() {
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    let alive = true;
    api.getEmployees({}).then(list => { if (alive) setEmployees(list || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return employees;
}

// Searchable multi-select list of employees. `value` is an array of ids.
export function MemberPicker({ employees, value, onChange, height = 'max-h-56' }) {
  const [q, setQ] = useState('');
  const sel = new Set(value);
  const toggle = (id) => onChange(sel.has(id) ? value.filter(v => v !== id) : [...value, id]);
  const filtered = employees.filter(e => !q || e.name?.toLowerCase().includes(q.toLowerCase()) || e.job_title?.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employees…"
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-brand-blue" />
      </div>
      <div className={`${height} overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50`}>
        {filtered.length === 0 && <div className="p-3 text-xs text-gray-400 text-center">No employees</div>}
        {filtered.map(e => (
          <label key={e.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggle(e.id)} className="rounded" />
            <Avatar name={e.name} src={e.avatar} size="sm" />
            <div className="min-w-0"><div className="text-sm text-gray-900 truncate">{e.name}</div>
              <div className="text-[11px] text-gray-400 truncate">{e.job_title || e.department || '—'}</div></div>
          </label>
        ))}
      </div>
      <div className="text-[11px] text-gray-400 mt-1">{value.length} selected</div>
    </div>
  );
}

export const btnPrimary = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors';
export const btnGhost = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors';
