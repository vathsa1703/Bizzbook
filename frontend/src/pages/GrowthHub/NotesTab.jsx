// ═══════════════════════════════════════════════════════════════════════════════
// TAB: NOTES — new tab wiring up the existing growth_notes backend (GET/POST were
// already implemented; PUT/DELETE were added alongside this UI since edit/delete
// weren't possible without them). Styled to match the other Growth Hub tabs
// (SectionCard, bottom-sheet modal, list + edit/delete icons).
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Edit2, Trash2, X, StickyNote } from 'lucide-react';
import { api } from '../../api/client';
import { EmptyState } from './shared';

export default function NotesTab() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.growth.getNotes().then(r => setNotes(r.notes||[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setBody(''); setShowForm(true); };
  const openEdit = (note) => { setEditing(note); setBody(note.body); setShowForm(true); };

  const save = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      if (editing) await api.growth.updateNote(editing.id, { body });
      else await api.growth.createNote({ entity_type: 'general', body });
      setShowForm(false); setEditing(null); setBody('');
      load();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this note?')) return;
    await api.growth.deleteNote(id); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-gray-900">Notes</h2>
          <p className="text-xs text-gray-500">{notes.length} notes saved</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors">
          <Plus size={13} />Add Note
        </button>
      </div>

      {loading ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-indigo-500" /></div> :
        notes.length === 0 ? <EmptyState icon={StickyNote} title="No notes yet" sub="Jot down fundraising context, investor conversations, or reminders" action="Add Note" onAction={openCreate} /> :
        <div className="space-y-3">
          {notes.map(n => (
            <div key={n.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-gray-700 whitespace-pre-wrap flex-1">{n.body}</p>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(n)} className="p-1.5 rounded-lg hover:bg-gray-50"><Edit2 size={13} className="text-gray-400" /></button>
                  <button onClick={() => remove(n.id)} className="p-1.5 rounded-lg hover:bg-red-50"><Trash2 size={13} className="text-red-400" /></button>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">{(n.created_at || '').slice(0, 16).replace('T', ' ')}</p>
            </div>
          ))}
        </div>
      }

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[75vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{editing ? 'Edit Note' : 'Add Note'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Note</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="Write a note..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
              </div>
              <button onClick={save} disabled={saving || !body.trim()} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
