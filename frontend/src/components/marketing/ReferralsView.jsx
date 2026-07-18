import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { Wallet, Users, Tag, Gift, MessageSquare, Loader2, Plus, ArrowRight } from 'lucide-react';

export default function ReferralsView() {
  const [customerId, setCustomerId] = useState('');
  const [referral, setReferral] = useState(null);

  const fetchRef = async () => {
    if (!customerId) return;
    try {
      const res = await api.marketing.getReferral(customerId);
      setReferral(res.referral);
    } catch(e){ alert(e.message); }
  };

  const [redeemForm, setRedeemForm] = useState({ code: '', newId: '' });
  const handleRedeem = async (e) => {
    e.preventDefault();
    try {
      await api.marketing.redeemReferral({ code: redeemForm.code, new_customer_id: Number(redeemForm.newId) });
      alert('Referral Redeemed Successfully! Edge added to graph.');
      setRedeemForm({code: '', newId: ''});
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-bold text-inkA dark:text-inkA-dark">Find Referral Code</h3>
        <div className="flex gap-2">
          <input type="number" placeholder="Customer ID (e.g. 1)" value={customerId} onChange={e=>setCustomerId(e.target.value)} className="border rounded px-3 py-1 text-sm flex-1" />
          <button onClick={fetchRef} className="bg-gray-900 text-white px-3 py-1 rounded text-sm font-bold">Get Code</button>
        </div>
        {referral && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 rounded-xl text-center">
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">Customer {referral.customer_id}'s Code</p>
            <p className="text-2xl font-mono font-black text-emerald-900">{referral.code}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-bold">{referral.times_used} successful referrals</p>
          </div>
        )}
      </div>

      <div className="pt-4 border-t space-y-3">
        <h3 className="font-bold text-inkA dark:text-inkA-dark">Redeem a Code</h3>
        <form onSubmit={handleRedeem} className="space-y-3">
          <input required type="text" placeholder="Referral Code" value={redeemForm.code} onChange={e=>setRedeemForm({...redeemForm, code: e.target.value.toUpperCase()})} className="w-full border rounded px-3 py-1.5 text-sm uppercase font-mono" />
          <input required type="number" placeholder="New Customer ID (The person referred)" value={redeemForm.newId} onChange={e=>setRedeemForm({...redeemForm, newId: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm" />
          <button type="submit" className="w-full bg-violet-600 text-white py-2 rounded font-bold text-sm hover:bg-violet-700">Apply Referral & Give Reward</button>
        </form>
      </div>
    </div>
  );
}

// ─── 5. Surveys UI ───────────────────────────────────────────────────────────