import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { Wallet, Users, Tag, Gift, MessageSquare, Loader2, Plus, ArrowRight } from 'lucide-react';

export default function WalletView() {
  const [customerId, setCustomerId] = useState('');
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ amount: '', type: 'earn', desc: '' });

  const fetchWallet = async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const res = await api.marketing.getWallet(customerId);
      setBalances(res.balances || []);
    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    try {
      await api.marketing.adjustWallet({
        customer_id: customerId,
        amount: adjustForm.type === 'earn' ? Number(adjustForm.amount) : -Number(adjustForm.amount),
        transaction_type: adjustForm.type,
        description: adjustForm.desc,
        balance_type: 'reward_points'
      });
      fetchWallet();
      setAdjustForm({ amount: '', type: 'earn', desc: '' });
      alert('Wallet adjusted successfully');
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-inkA dark:text-inkA-dark mb-2">Customer Wallet Lookup</h3>
      <div className="flex gap-2">
        <input type="number" placeholder="Customer ID (e.g. 1)" value={customerId} onChange={e=>setCustomerId(e.target.value)} className="border rounded px-3 py-1 text-sm flex-1" />
        <button onClick={fetchWallet} className="bg-gray-900 text-white px-3 py-1 rounded text-sm font-bold">Search</button>
      </div>

      {loading ? <Loader2 className="animate-spin" /> : (
        balances.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {balances.map(b => (
              <div key={b.balance_type} className="bg-panel2 dark:bg-panel2-dark p-3 rounded-xl border">
                <p className="text-[10px] text-inkB dark:text-inkB-dark uppercase">{b.balance_type}</p>
                <p className="font-bold text-lg text-inkA dark:text-inkA-dark">₹{b.balance}</p>
              </div>
            ))}
          </div>
        )
      )}

      {customerId && (
        <form onSubmit={handleAdjust} className="mt-4 pt-4 border-t space-y-3">
          <h4 className="font-bold text-sm text-inkA dark:text-inkA-dark">Manual Adjustment</h4>
          <div className="flex gap-2">
            <select value={adjustForm.type} onChange={e=>setAdjustForm({...adjustForm, type: e.target.value})} className="border rounded px-2 text-sm">
              <option value="earn">Earn (Credit)</option>
              <option value="burn">Burn (Debit)</option>
            </select>
            <input type="number" required placeholder="Amount" value={adjustForm.amount} onChange={e=>setAdjustForm({...adjustForm, amount: e.target.value})} className="border rounded px-2 py-1 text-sm flex-1" />
          </div>
          <input type="text" required placeholder="Description / Reason" value={adjustForm.desc} onChange={e=>setAdjustForm({...adjustForm, desc: e.target.value})} className="border rounded px-2 py-1 text-sm w-full" />
          <button type="submit" className="w-full bg-violet-600 text-white rounded py-2 text-sm font-bold hover:bg-violet-700">Submit Adjustment</button>
        </form>
      )}
    </div>
  );
}

// ─── 2. Segments UI ──────────────────────────────────────────────────────────