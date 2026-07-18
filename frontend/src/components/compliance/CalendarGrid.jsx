import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const CAT_COLOR = { tax: '#2563EB', filings: '#7C3AED', licenses: '#16A34A', renewals: '#D97706', employee: '#DB2777', meetings: '#0891B2', operational: '#64748B', documents: '#CA8A04' };
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CalendarGrid({ items = [], onOpen }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [mode, setMode] = useState('month');
  const [selected, setSelected] = useState(fmt(new Date()));
  const todayStr = fmt(new Date());

  // Map YYYY-MM-DD -> items due that day.
  const byDate = useMemo(() => {
    const m = {};
    items.filter(it => it.next_due_date && it.status !== 'completed').forEach(it => {
      const k = it.next_due_date.slice(0, 10);
      (m[k] = m[k] || []).push(it);
    });
    return m;
  }, [items]);

  const monthLabel = cursor.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const step = (n) => setCursor(c => mode === 'month' ? new Date(c.getFullYear(), c.getMonth() + n, 1) : new Date(c.getFullYear(), c.getMonth(), c.getDate() + n * 7));

  // Build the visible day cells.
  const cells = [];
  if (mode === 'month') {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysIn = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    for (let d = 1; d <= daysIn; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  } else {
    const base = new Date(cursor);
    const sunday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay());
    for (let i = 0; i < 7; i++) cells.push(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i));
  }

  const selItems = byDate[selected] || [];

  return (
    <div className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark shadow-sm p-3">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => step(-1)} className="p-1.5 rounded-lg hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark"><ChevronLeft size={18} /></button>
        <p className="text-sm font-bold text-inkA dark:text-inkA-dark">{mode === 'month' ? monthLabel : `Week of ${cursor.toLocaleDateString('en-IN')}`}</p>
        <button onClick={() => step(1)} className="p-1.5 rounded-lg hover:bg-panel2 dark:hover:bg-panel2-dark text-inkB dark:text-inkB-dark"><ChevronRight size={18} /></button>
      </div>
      <div className="flex justify-center gap-1 mb-3">
        {['month', 'week'].map(m => <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize ${mode === m ? 'bg-gray-900 text-inkA dark:text-inkA-dark' : 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark'}`}>{m}</button>)}
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">{WEEKDAYS.map(w => <div key={w} className="text-center text-[10px] font-bold text-gray-400 dark:text-slate-500">{w}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = fmt(d);
          const dayItems = byDate[key] || [];
          const isToday = key === todayStr;
          const isSel = key === selected;
          const overdue = dayItems.some(it => it.daysRemaining < 0);
          return (
            <button key={i} onClick={() => setSelected(key)} className={`aspect-square rounded-lg flex flex-col items-center justify-center relative ${isSel ? 'bg-gray-900 text-white' : isToday ? 'bg-accent/10 dark:bg-accent/15' : 'hover:bg-panel2 dark:hover:bg-panel2-dark'}`}>
              <span className={`text-[11px] font-semibold ${isSel ? 'text-inkA dark:text-inkA-dark' : overdue ? 'text-red-600 dark:text-red-400' : 'text-inkB dark:text-inkB-dark'}`}>{d.getDate()}</span>
              {dayItems.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {dayItems.slice(0, 3).map((it, j) => <span key={j} className="w-1.5 h-1.5 rounded-full" style={{ background: isSel ? '#fff' : (CAT_COLOR[it.category_key] || '#94a3b8') }} />)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected-day agenda */}
      <div className="mt-3 pt-3 border-t border-edge dark:border-edge-dark">
        <p className="text-[11px] font-bold text-inkB dark:text-inkB-dark mb-2">{new Date(selected).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        {selItems.length === 0 ? <p className="text-xs text-gray-400 dark:text-slate-500">Nothing due this day.</p> : selItems.map(it => (
          <button key={it.id} onClick={() => onOpen(it.id)} className="w-full text-left flex items-center gap-2 py-2 border-b border-edge dark:border-edge-dark last:border-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CAT_COLOR[it.category_key] || '#94a3b8' }} />
            <span className="text-xs font-semibold text-inkA dark:text-inkA-dark flex-1 truncate">{it.title}</span>
            <span className={`text-[10px] font-bold ${it.daysRemaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-slate-500'}`}>{it.daysRemaining < 0 ? `${Math.abs(it.daysRemaining)}d late` : `${it.daysRemaining}d`}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
