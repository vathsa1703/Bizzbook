import React, { useEffect, useRef, useState } from 'react';
import {
  Loader2, Upload, Download, Trash2, CheckCircle2, ShieldCheck, ExternalLink,
  FileText, AlertTriangle, Building2, Clock, IndianRupee, RefreshCw
} from 'lucide-react';
import Modal from '../Modal';
import { api } from '../../api/client';

function blobDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.setAttribute('download', filename);
  document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
  window.URL.revokeObjectURL(url);
}
function daysTo(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(String(dateStr).slice(0, 10)) - new Date(new Date().toISOString().slice(0, 10))) / 86400000);
}

export default function RequirementDrawer({ requirementId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileInputs = useRef({});

  const load = () => {
    setLoading(true);
    api.trade.getRequirementDetail(requirementId)
      .then(setDetail).catch(() => setDetail({ error: true }))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [requirementId]);

  const item = detail?.item;

  const upload = async (slotName, file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('doc_name', slotName);
      fd.append('files', file);
      await api.trade.uploadDocuments(requirementId, fd);
      load(); onChanged && onChanged();
    } catch (e) { alert('Upload failed: ' + e.message); }
    finally { setBusy(false); }
  };
  const download = async (doc) => {
    try { const b = await api.trade.downloadDocument(doc.id); blobDownload(b, doc.original_name || doc.doc_name); }
    catch (e) { alert('Download failed'); }
  };
  const remove = async (doc) => {
    if (!confirm(`Delete "${doc.original_name || doc.doc_name}"?`)) return;
    setBusy(true);
    try { await api.trade.deleteDocument(doc.id); load(); onChanged && onChanged(); }
    finally { setBusy(false); }
  };
  const verify = async (doc) => {
    setBusy(true);
    try { await api.trade.verifyDocument(doc.id, { verified: doc.verified ? 0 : 1 }); load(); }
    finally { setBusy(false); }
  };
  const setStatus = async (status) => {
    setBusy(true);
    try { await api.trade.updateRequirement(requirementId, { status }); load(); onChanged && onChanged(); }
    finally { setBusy(false); }
  };

  return (
    <Modal isOpen title={item?.title || 'Trade Requirement'} onClose={onClose} size="lg">
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" size={24} /></div>
      ) : detail?.error ? (
        <p className="text-sm text-gray-400 text-center py-8">Could not load this item.</p>
      ) : (
        <div className="space-y-4">
          {/* Status + due */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${item.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : item.status === 'overdue' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{item.status}</span>
            {item.mandatory ? <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">Mandatory</span> : <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">Optional</span>}
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 capitalize">{item.category}</span>
            {item.next_due_date && <span className="text-[11px] text-gray-500">Due {item.next_due_date}{item.daysRemaining != null ? ` (${item.daysRemaining}d)` : ''}</span>}
          </div>

          {/* AI explanation */}
          {item.ai_explanation && (
            <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-xs text-violet-900 leading-relaxed">{item.ai_explanation}</div>
          )}

          {/* Government Resource Center */}
          <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Building2 size={12} /> Where & how to file</p>
            <div className="space-y-1.5 text-xs text-gray-700">
              {item.department && <p className="flex items-center gap-2"><Building2 size={13} className="text-gray-400" /> {item.department}</p>}
              {item.fees && <p className="flex items-center gap-2"><IndianRupee size={13} className="text-gray-400" /> {item.fees}</p>}
              {item.processing_time && <p className="flex items-center gap-2"><Clock size={13} className="text-gray-400" /> {item.processing_time}</p>}
              {item.renewal_requirement && <p className="flex items-center gap-2"><RefreshCw size={13} className="text-gray-400" /> {item.renewal_requirement}</p>}
              {item.penalty_info && <p className="flex items-start gap-2 text-red-600"><AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {item.penalty_info}</p>}
              {item.official_website && <a href={item.official_website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">Official Website <ExternalLink size={11} /></a>}
            </div>
          </div>

          {/* Document Vault */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1"><FileText size={12} /> Document Vault</p>
            <div className="space-y-2">
              {detail.docSlots.length === 0 && <p className="text-xs text-gray-400">No documents required for this item.</p>}
              {detail.docSlots.map((slot) => {
                const doc = slot.document;
                const exp = doc && daysTo(doc.expiry_date);
                const expired = exp != null && exp < 0;
                return (
                  <div key={slot.doc_name} className="border border-gray-100 rounded-xl p-3 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                          {doc ? <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" /> : <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 flex-shrink-0" />}
                          {slot.doc_name}
                        </p>
                        {doc && <p className="text-[10px] text-gray-400 truncate mt-0.5">{doc.original_name} · v{doc.version}{doc.expiry_date ? ` · exp ${doc.expiry_date}` : ''}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {doc && <button onClick={() => download(doc)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Download"><Download size={15} /></button>}
                        {doc && <button onClick={() => verify(doc)} className={`p-1.5 rounded-lg hover:bg-gray-100 ${doc.verified ? 'text-emerald-600' : 'text-gray-400'}`} title="Verify"><ShieldCheck size={15} /></button>}
                        {doc && <button onClick={() => remove(doc)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="Delete"><Trash2 size={15} /></button>}
                        <button onClick={() => fileInputs.current[slot.doc_name]?.click()} disabled={busy} className="p-1.5 rounded-lg bg-gray-900 text-white" title={doc ? 'Replace' : 'Upload'}><Upload size={15} /></button>
                        <input ref={el => (fileInputs.current[slot.doc_name] = el)} type="file" className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx"
                          onChange={e => { upload(slot.doc_name, e.target.files[0]); e.target.value = ''; }} />
                      </div>
                    </div>
                    {expired && <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1"><AlertTriangle size={11} /> Document expired</p>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Status actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            {item.status !== 'completed'
              ? <button onClick={() => setStatus('completed')} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"><CheckCircle2 size={15} /> Mark Complete</button>
              : <button onClick={() => setStatus('pending')} disabled={busy} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold">Reopen</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
