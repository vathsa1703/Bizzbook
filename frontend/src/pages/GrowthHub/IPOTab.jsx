// ═══════════════════════════════════════════════════════════════════════════════
// TAB: IPO READINESS — extracted from the original GrowthHub.jsx, plus a new
// per-item Documents panel (upload/replace/delete/download) wired to the
// existing ipo_documents upload endpoint + the list/download/delete endpoints
// added alongside it. Checklist behavior itself is unchanged.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, CheckCircle2, Clock, ChevronDown, Check, Paperclip, Upload,
  Download, Trash2, X,
} from 'lucide-react';
import { api } from '../../api/client';
import { SectionCard, ScoreRing, ProgressBar } from './shared';

function ItemDocuments({ itemId }) {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const load = useCallback(() => {
    api.growth.getIpoDocuments(itemId).then(r => setDocs(r.documents || [])).catch(() => setDocs([]));
  }, [itemId]);

  const toggle = (e) => {
    e.stopPropagation();
    const next = !open;
    setOpen(next);
    if (next && docs === null) load();
  };

  const upload = async (e) => {
    e.stopPropagation();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('files', file);
      await api.growth.uploadIpoDocument(itemId, fd);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) { alert(err.message); }
    finally { setUploading(false); }
  };

  const remove = async (e, docId) => {
    e.stopPropagation();
    if (!confirm('Delete this document?')) return;
    try { await api.growth.deleteIpoDocument(docId); load(); } catch (err) { alert(err.message); }
  };

  const download = async (e, doc) => {
    e.stopPropagation();
    try {
      const blob = await api.growth.downloadIpoDocument(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = doc.original_name || doc.filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="mt-1.5" onClick={e => e.stopPropagation()}>
      <button onClick={toggle} className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700">
        <Paperclip size={10} />
        {open ? 'Hide documents' : `Documents${docs ? ` (${docs.length})` : ''}`}
      </button>
      {open && (
        <div className="mt-1.5 bg-panel2 dark:bg-panel2-dark rounded-xl p-2.5 space-y-1.5">
          {docs === null ? (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-slate-500"><Loader2 size={11} className="animate-spin" />Loading…</div>
          ) : docs.length === 0 ? (
            <p className="text-[10px] text-gray-400 dark:text-slate-500">No documents uploaded yet.</p>
          ) : docs.map(d => (
            <div key={d.id} className="flex items-center gap-2 bg-panel dark:bg-panel-dark rounded-lg px-2 py-1.5 border border-edge dark:border-edge-dark">
              <Paperclip size={10} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-inkB dark:text-inkB-dark truncate">{d.original_name || d.filename}</p>
                <p className="text-[9px] text-gray-400 dark:text-slate-500">{(d.created_at || '').slice(0, 10)}</p>
              </div>
              <button onClick={e => download(e, d)} className="p-1 rounded hover:bg-panel2 dark:hover:bg-panel2-dark"><Download size={11} className="text-gray-400 dark:text-slate-500" /></button>
              <button onClick={e => remove(e, d.id)} className="p-1 rounded hover:bg-red-50"><Trash2 size={11} className="text-red-400" /></button>
            </div>
          ))}
          <label className="flex items-center gap-1.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 cursor-pointer pt-0.5">
            {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
            {uploading ? 'Uploading…' : (docs?.length ? 'Upload / Replace' : 'Upload')}
            <input ref={fileRef} type="file" className="hidden" onChange={upload} disabled={uploading} />
          </label>
        </div>
      )}
    </div>
  );
}

export default function IPOTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openCat, setOpenCat] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.growth.getIpoChecklist().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (item) => {
    const newStatus = item.status === 'Complete' ? 'Pending' : 'Complete';
    await api.growth.updateIpoItem(item.id, { status: newStatus });
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-indigo-500 dark:text-indigo-400" /></div>;
  if (!data) return null;

  const categories = Object.keys(data.grouped || {});

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-inkA dark:text-inkA-dark">IPO Readiness</h2>
        <p className="text-xs text-inkB dark:text-inkB-dark">{data.mandatoryComplete}/{data.mandatory} mandatory items complete</p>
      </div>

      <SectionCard>
        <div className="flex items-center gap-4">
          <ScoreRing score={data.score} label="IPO Ready" color="#f59e0b" size={88} />
          <div className="flex-1">
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-inkB dark:text-inkB-dark">Mandatory items</span>
                  <span className="font-bold">{data.mandatoryComplete}/{data.mandatory}</span>
                </div>
                <ProgressBar value={(data.mandatoryComplete / Math.max(data.mandatory, 1)) * 100} color="#f59e0b" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-inkB dark:text-inkB-dark">All items</span>
                  <span className="font-bold">{data.complete}/{data.total}</span>
                </div>
                <ProgressBar value={(data.complete / Math.max(data.total, 1)) * 100} color="#6366f1" />
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="space-y-2">
        {categories.map(cat => {
          const items = data.grouped[cat] || [];
          const done = items.filter(i => i.status === 'Complete').length;
          const isOpen = openCat === cat;
          return (
            <div key={cat} className="bg-panel dark:bg-panel-dark rounded-2xl border border-edge dark:border-edge-dark shadow-sm overflow-hidden">
              <button onClick={() => setOpenCat(isOpen ? null : cat)} className="w-full p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${done===items.length ? 'bg-green-100 dark:bg-green-500/15' : 'bg-panel2 dark:bg-panel2-dark'}`}>
                    {done === items.length ? <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" /> : <Clock size={16} className="text-gray-400 dark:text-slate-500" />}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-inkA dark:text-inkA-dark">{cat}</p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500">{done}/{items.length} complete</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ProgressBar value={(done/Math.max(items.length,1))*100} color="#6366f1" height={4} />
                  <ChevronDown size={14} className={`text-gray-400 dark:text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-edge dark:border-edge-dark px-4 pb-3 space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-start gap-3 py-2 hover:bg-panel2 dark:hover:bg-panel2-dark rounded-xl px-2 transition-colors">
                      <button onClick={() => toggle(item)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${item.status==='Complete' ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                        {item.status === 'Complete' && <Check size={11} className="text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <button onClick={() => toggle(item)} className="text-left w-full">
                          <p className={`text-xs font-medium ${item.status==='Complete' ? 'text-gray-400 dark:text-slate-500 line-through' : 'text-inkB dark:text-inkB-dark'}`}>{item.title}</p>
                          {item.is_mandatory ? <span className="text-[9px] text-red-500 dark:text-red-400 font-bold">MANDATORY</span> : <span className="text-[9px] text-gray-400 dark:text-slate-500">Optional</span>}
                        </button>
                        <ItemDocuments itemId={item.id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
