import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { Wallet, Users, Tag, Gift, MessageSquare, Loader2, Plus, ArrowRight } from 'lucide-react';

export default function SegmentsView() {
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const load = useCallback(async () => {
    try {
      const res = await api.marketing.getSegments();
      setSegments(res.segments || []);
    } catch(e){}
    setLoading(false);
  }, []);
  
  useEffect(() => { load(); }, [load]);

  const [form, setForm] = useState({ name: '', desc: '', logic: 'AND' });
  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.marketing.createSegment({
        name: form.name, description: form.desc, logic_type: form.logic, rules: []
      });
      alert('Segment created');
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-inkA dark:text-inkA-dark">Custom Segments</h3>
      {loading ? <Loader2 className="animate-spin" /> : (
        <div className="space-y-2">
          {segments.map(s => (
            <div key={s.id} className="p-3 bg-panel2 dark:bg-panel2-dark border rounded-xl flex justify-between items-center">
              <div>
                <p className="font-bold text-sm text-inkA dark:text-inkA-dark">{s.name}</p>
                <p className="text-xs text-inkB dark:text-inkB-dark">{s.description || 'No description'}</p>
              </div>
              <span className="text-xs bg-panel dark:bg-panel-dark px-2 py-1 rounded shadow-sm border font-bold text-inkB dark:text-inkB-dark">ID: {s.id} | {s.logic_type}</span>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleCreate} className="pt-4 border-t space-y-3">
        <h4 className="font-bold text-sm text-inkA dark:text-inkA-dark">Create New Segment</h4>
        <input required type="text" placeholder="Name" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm" />
        <input type="text" placeholder="Description" value={form.desc} onChange={e=>setForm({...form, desc: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm" />
        <select value={form.logic} onChange={e=>setForm({...form, logic: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm">
          <option value="AND">AND (Match all rules)</option>
          <option value="OR">OR (Match any rule)</option>
        </select>
        <button type="submit" className="w-full bg-gray-900 text-white py-2 rounded font-bold text-sm hover:bg-black">Create</button>
      </form>
    </div>
  );
}

// ─── 3. Coupons UI ───────────────────────────────────────────────────────────