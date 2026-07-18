// Kanban board — drag & drop across status columns (@hello-pangea/dnd).
// Dropping a card into a column PATCHes the task status.
import React, { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { LayoutGrid, Plus } from 'lucide-react';
import { api } from '../../../api/client';
import { useToast } from '../../../components/ToastContext';
import { Loading, PageHeader, btnPrimary } from './_shared';
import { TaskCard, TaskCreateModal, TaskDetailDrawer, STATUS_META, PRIORITY_META } from './TaskShared';

const COLUMNS = ['todo', 'in_progress', 'review', 'blocked', 'completed', 'cancelled'];

export default function KanbanPage() {
  const { showToast } = useToast();
  const [columns, setColumns] = useState({});
  const [loading, setLoading] = useState(true);
  const [priority, setPriority] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.getTaskBoard(priority ? { priority } : {}); setColumns(r.columns || {}); }
    catch { showToast('Failed to load board', 'error'); } finally { setLoading(false); }
  }, [priority, showToast]);
  useEffect(() => { load(); }, [load]);

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination || source.droppableId === destination.droppableId) return;
    const taskId = Number(draggableId);
    const from = source.droppableId, to = destination.droppableId;
    // Optimistic move
    setColumns(prev => {
      const next = { ...prev };
      const card = (next[from] || []).find(t => t.id === taskId);
      next[from] = (next[from] || []).filter(t => t.id !== taskId);
      next[to] = [{ ...card, status: to }, ...(next[to] || [])];
      return next;
    });
    try { await api.updateTask(taskId, { status: to }); }
    catch (e) { showToast(e.message || 'Update failed', 'error'); load(); }
  };

  if (loading) return <div className="p-6"><Loading label="Loading board…" /></div>;

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <PageHeader icon={LayoutGrid} title="Kanban Board" subtitle="Drag cards between columns to update status">
        <select value={priority} onChange={e => setPriority(e.target.value)} className="px-3 py-1.5 text-sm bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-xl text-inkA dark:text-inkA-dark outline-none">
          <option value="">All priorities</option>
          {Object.keys(PRIORITY_META).map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </select>
        <button onClick={() => setShowCreate(true)} className={btnPrimary}><Plus className="w-4 h-4" />New Task</button>
      </PageHeader>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 min-h-[400px] pb-3" style={{ minWidth: 'min-content' }}>
            {COLUMNS.map(col => {
              const items = columns[col] || [];
              return (
                <Droppable droppableId={col} key={col}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className={`w-72 flex-shrink-0 rounded-2xl border p-2.5 ${snapshot.isDraggingOver ? STATUS_META[col].col + ' bg-panel dark:bg-panel-dark' : 'border-edge dark:border-edge-dark bg-panel2/40 dark:bg-panel2-dark/40'}`}>
                      <div className="flex items-center gap-2 px-1 pb-2">
                        <span className={`w-2 h-2 rounded-full ${STATUS_META[col].dot}`} />
                        <span className="text-sm font-semibold text-inkA dark:text-inkA-dark">{STATUS_META[col].label}</span>
                        <span className="text-xs text-inkB dark:text-inkB-dark">{items.length}</span>
                      </div>
                      <div className="space-y-2 min-h-[40px]">
                        {items.map((task, idx) => (
                          <Draggable draggableId={String(task.id)} index={idx} key={task.id}>
                            {(prov, snap) => (
                              <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
                                className={snap.isDragging ? 'opacity-80' : ''}>
                                <TaskCard task={task} onClick={() => setOpenId(task.id)} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </div>
      </DragDropContext>

      {showCreate && <TaskCreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      {openId && <TaskDetailDrawer taskId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
