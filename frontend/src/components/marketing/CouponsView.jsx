import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { Wallet, Users, Tag, Gift, MessageSquare, Loader2, Plus, ArrowRight } from 'lucide-react';

export default function CouponsView() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const load = useCallback(async () => {
    try {
      const res = await api.marketing.getCoupons();
      setCoupons(res.coupons || []);
    } catch(e){}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const [form, setForm] = useState({ code: '', type: 'percentage', val: '', min: 0 });
  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.marketing.createCoupon({
        code: form.code, discount_type: form.type, discount_value: Number(form.val), min_order_value: Number(form.min)
      });
      alert('Coupon created');
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-xl">
        <p className="text-xs font-bold text-amber-800 dark:text-amber-400">Not yet active — coming soon</p>
        <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
          Coupons can be created and tracked here, but redeeming one does not
          yet reduce the total on a real sale or invoice. Don't rely on this
          for live discounting until that's wired up.
        </p>
      </div>
      <h3 className="font-bold text-inkA dark:text-inkA-dark">Active Coupons</h3>
      {loading ? <Loader2 className="animate-spin" /> : (
        <div className="grid gap-2">
          {coupons.map(c => (
            <div key={c.id} className="p-3 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/25 rounded-xl flex justify-between items-center">
              <div>
                <p className="font-bold text-sm text-violet-900 font-mono">{c.code}</p>
                <p className="text-xs text-violet-700 dark:text-violet-400">{c.discount_type === 'percentage' ? `\${c.discount_value}%` : `₹\${c.discount_value}`} Off (Min ₹{c.min_order_value || 0})</p>
              </div>
              <div className="text-right flex flex-col items-end">
                <span className="text-xs text-violet-600 dark:text-violet-400 font-bold bg-violet-100 dark:bg-violet-500/15 px-2 py-0.5 rounded">{c.times_used} Uses</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleCreate} className="pt-4 border-t space-y-3">
         <h4 className="font-bold text-sm text-inkA dark:text-inkA-dark">Create Coupon</h4>
         <div className="flex gap-2">
           <input required type="text" placeholder="CODE (e.g. SUMMER50)" value={form.code} onChange={e=>setForm({...form, code: e.target.value.toUpperCase()})} className="w-full border rounded px-3 py-1.5 text-sm uppercase" />
         </div>
         <div className="flex gap-2">
           <select value={form.type} onChange={e=>setForm({...form, type: e.target.value})} className="border rounded px-3 py-1.5 text-sm flex-1">
             <option value="percentage">Percentage (%)</option>
             <option value="flat">Flat Amount (₹)</option>
           </select>
           <input required type="number" placeholder="Value" value={form.val} onChange={e=>setForm({...form, val: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm flex-1" />
         </div>
         <input type="number" placeholder="Min Order Value (₹)" value={form.min} onChange={e=>setForm({...form, min: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm" />
         <button type="submit" className="w-full bg-gray-900 text-white py-2 rounded font-bold text-sm hover:bg-black">Create</button>
      </form>
    </div>
  );
}

// ─── 4. Referrals UI ─────────────────────────────────────────────────────────