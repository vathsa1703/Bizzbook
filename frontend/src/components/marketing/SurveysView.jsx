import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { Wallet, Users, Tag, Gift, MessageSquare, Loader2, Plus, ArrowRight } from 'lucide-react';

export default function SurveysView() {
  const [form, setForm] = useState({ campaign_id: '', type: 'nps', text: '' });
  const [responseForm, setResponseForm] = useState({ survey_id: '', cust_id: '', rating: 5, text: '' });

  const handleSend = async (e) => {
    e.preventDefault();
    try {
      const res = await api.marketing.sendSurvey({
        campaign_id: form.campaign_id ? Number(form.campaign_id) : null,
        type: form.type,
        question_text: form.text
      });
      alert(`Survey \${res.surveyId} Sent!`);
    } catch(e) { alert(e.message); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.marketing.submitSurvey({
        survey_id: Number(responseForm.survey_id),
        customer_id: Number(responseForm.cust_id),
        rating: Number(responseForm.rating),
        feedback_text: responseForm.text
      });
      alert('Survey Response recorded! Knowledge Graph updated.');
    } catch(e) { alert(e.message); }
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <form onSubmit={handleSend} className="space-y-3">
        <h4 className="font-bold text-sm text-inkA dark:text-inkA-dark border-b pb-2">Trigger Survey</h4>
        <input type="number" placeholder="Campaign ID (Optional)" value={form.campaign_id} onChange={e=>setForm({...form, campaign_id: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm" />
        <select value={form.type} onChange={e=>setForm({...form, type: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm">
          <option value="nps">NPS (0-10)</option>
          <option value="post_purchase">Post Purchase (1-5)</option>
        </select>
        <input type="text" placeholder="Question Text" value={form.text} onChange={e=>setForm({...form, text: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm" />
        <button type="submit" className="w-full bg-gray-900 text-white py-2 rounded font-bold text-sm hover:bg-black">Send Survey</button>
      </form>
      <form onSubmit={handleSubmit} className="space-y-3 border-l pl-6">
        <h4 className="font-bold text-sm text-inkA dark:text-inkA-dark border-b pb-2">Mock Response</h4>
        <input required type="number" placeholder="Survey ID" value={responseForm.survey_id} onChange={e=>setResponseForm({...responseForm, survey_id: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm" />
        <input required type="number" placeholder="Customer ID" value={responseForm.cust_id} onChange={e=>setResponseForm({...responseForm, cust_id: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm" />
        <input required type="number" min="1" max="10" placeholder="Rating" value={responseForm.rating} onChange={e=>setResponseForm({...responseForm, rating: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm" />
        <input type="text" placeholder="Feedback Text (optional)" value={responseForm.text} onChange={e=>setResponseForm({...responseForm, text: e.target.value})} className="w-full border rounded px-3 py-1.5 text-sm" />
        <button type="submit" className="w-full bg-violet-600 text-white py-2 rounded font-bold text-sm hover:bg-violet-700">Submit Response</button>
      </form>
    </div>
  );
}
