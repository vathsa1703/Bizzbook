// ═══════════════════════════════════════════════════════════════════════════════
// TAB: PITCH DECK MANAGER — extracted verbatim from the original GrowthHub.jsx.
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Upload, Presentation, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { SectionCard, Badge, EmptyState } from './shared';

export default function PitchDeckTab() {
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [deckType, setDeckType] = useState('Pitch Deck');
  const fileRef = useRef();

  const load = useCallback(() => {
    setLoading(true);
    api.growth.getPitchDecks().then(r => setDecks(r.pitchDecks||[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    if (!fileRef.current?.files?.[0] || !title) return alert('Please provide a title and select a file');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', fileRef.current.files[0]);
      fd.append('title', title);
      fd.append('deck_type', deckType);
      await api.growth.uploadPitchDeck(fd);
      setTitle(''); setDeckType('Pitch Deck');
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e) { alert(e.message); }
    finally { setUploading(false); }
  };

  const DECK_TYPES = ['Pitch Deck','Financial Model','Business Plan','Market Analysis','Competitor Analysis','Product Demo','Investment Ask','Other'];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-gray-900">Pitch Deck Manager</h2>
        <p className="text-xs text-gray-500">Upload and manage your investor documents</p>
      </div>

      <SectionCard>
        <p className="text-xs font-bold text-gray-700 mb-3">Upload Document</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Document title" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Type</label>
            <select value={deckType} onChange={e => setDeckType(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              {DECK_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">File (PDF, PPT, XLS, DOC)</label>
            <label className="w-full flex items-center gap-3 px-3 py-3 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-indigo-300 transition-colors">
              <Upload size={16} className="text-gray-400" />
              <span className="text-sm text-gray-500">{fileRef.current?.files?.[0]?.name || 'Click to browse'}</span>
              <input type="file" ref={fileRef} className="hidden" accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx" onChange={() => {}} />
            </label>
          </div>
          <button onClick={upload} disabled={uploading} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{uploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>
      </SectionCard>

      {loading ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-indigo-500" /></div> :
       decks.length === 0 ? <EmptyState icon={Presentation} title="No documents yet" sub="Upload your pitch deck, financial model, and business plan" /> :
        <div className="space-y-3">
          {decks.map(d => (
            <div key={d.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${d.is_current ? 'bg-indigo-100' : 'bg-gray-100'} flex items-center justify-center`}>
                  <Presentation size={18} className={d.is_current ? 'text-indigo-600' : 'text-gray-400'} />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{d.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge color={d.is_current ? 'indigo' : 'gray'}>{d.deck_type}</Badge>
                    {d.is_current && <Badge color="green">Current</Badge>}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">{d.original_name || 'No file'}</p>
                </div>
              </div>
              <button onClick={async () => { if (confirm('Delete?')) { await api.growth.deletePitchDeck(d.id); load(); }}} className="p-2 rounded-xl hover:bg-red-50">
                <Trash2 size={14} className="text-red-400" />
              </button>
            </div>
          ))}
        </div>
      }
    </div>
  );
}
