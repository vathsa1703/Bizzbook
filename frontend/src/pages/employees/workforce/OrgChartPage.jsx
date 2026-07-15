// Organization Chart — visual reporting hierarchy (GET /api/org/chart) with
// inline management: add reports, edit/delete employees, reassign reporting,
// create a team led by a person, and add people to teams — all from the tree.
// react-organizational-chart renders the recursive tree; a transform wrapper
// adds pan/zoom, and a flat index powers search + reporting-chain highlight.
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Tree, TreeNode } from 'react-organizational-chart';
import {
  GitBranch, Search, ZoomIn, ZoomOut, Maximize2, Users2, X, Building2,
  UserPlus, Edit2, Trash2, ArrowUpDown, Plus, Crown,
} from 'lucide-react';
import { api } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../components/ToastContext';
import Modal from '../../../components/Modal';
import FormField from '../../../components/FormField';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Avatar, StatusBadge, Loading, EmptyState, PageHeader, COLOR_SWATCHES, MemberPicker, btnPrimary } from './_shared';

const EMP_TYPES = ['Full Time', 'Part Time', 'Contract', 'Intern'];
const EMP_STATUSES = ['Active', 'Inactive', 'On Leave', 'Probation', 'Terminated'];

// Flatten the tree into id->node and id->parentId maps for search & chain highlight.
function indexTree(roots) {
  const nodes = new Map(), parent = new Map();
  const walk = (n, p) => { nodes.set(n.id, n); parent.set(n.id, p); (n.children || []).forEach(c => walk(c, n.id)); };
  roots.forEach(r => walk(r, null));
  return { nodes, parent };
}

function NodeCard({ node, selected, dimmed, canManage, onSelect, onAction }) {
  const act = (type) => (e) => { e.stopPropagation(); onAction(type, node); };
  return (
    <div role="button" tabIndex={0} onClick={() => onSelect(node)}
      className={`inline-block text-left align-top w-56 rounded-2xl border p-3 cursor-pointer transition-all outline-none
        ${selected ? 'border-blue-500 bg-blue-600/15 shadow-lg shadow-blue-900/40'
          : dimmed ? 'border-slate-800 bg-slate-900/60 opacity-40'
          : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}>
      <div className="flex items-center gap-2.5">
        <Avatar name={node.name} src={node.avatar} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{node.name}</div>
          <div className="text-[11px] text-slate-400 truncate">{node.job_title || '—'}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {node.department && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: node.department_color || '#64748b' }} />{node.department}
          </span>
        )}
        {node.status && <StatusBadge status={node.status} />}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
        {node.branch && <span className="inline-flex items-center gap-0.5 truncate"><Building2 className="w-3 h-3" />{node.branch}</span>}
        {node.team_count > 0 && <span className="inline-flex items-center gap-0.5"><Users2 className="w-3 h-3" />{node.team_count}</span>}
        {node.direct_reports > 0 && <span>{node.direct_reports} report{node.direct_reports > 1 ? 's' : ''}</span>}
      </div>

      {/* Inline action bar — appears on the selected node for managers/owners. */}
      {selected && canManage && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-700/60 flex items-center gap-1">
          <IconBtn title="Add report" onClick={act('add')}><UserPlus className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Edit" onClick={act('edit')}><Edit2 className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Change manager" onClick={act('manager')}><ArrowUpDown className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Create team" onClick={act('team')}><Users2 className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Add to team" onClick={act('addToTeam')}><Plus className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Delete" danger onClick={act('delete')}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
        </div>
      )}
    </div>
  );
}
function IconBtn({ title, onClick, danger, children }) {
  return (
    <button title={title} onClick={onClick}
      className={`p-1.5 rounded-lg transition-colors ${danger ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
      {children}
    </button>
  );
}

export default function OrgChartPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canManage = ['OWNER', 'admin', 'MANAGER'].includes(user?.role)
    || (user?.permissions || []).some(p => ['employees.create', 'employees.edit', 'employees.delete'].includes(p));

  const [roots, setRoots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [chainIds, setChainIds] = useState(new Set());
  const [detail, setDetail] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const [modal, setModal] = useState(null); // { type, node }

  const reload = useCallback(async () => {
    try {
      const [chart, emps, depts, tms] = await Promise.allSettled([
        api.getOrgChart(), api.getEmployees({}), api.getDepartments(), api.getTeams(),
      ]);
      if (chart.status === 'fulfilled') setRoots(chart.value.roots || []);
      if (emps.status === 'fulfilled') setEmployees(emps.value || []);
      if (depts.status === 'fulfilled') setDepartments(depts.value || []);
      if (tms.status === 'fulfilled') setTeams(tms.value.teams || []);
    } catch { showToast('Failed to load organization', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);
  useEffect(() => { reload(); }, [reload]);

  const { nodes, parent } = useMemo(() => indexTree(roots), [roots]);

  const selectNode = useCallback(async (node) => {
    setSelected(node.id);
    const chain = new Set([node.id]);
    let p = parent.get(node.id);
    while (p != null) { chain.add(p); p = parent.get(p); }
    setChainIds(chain);
    try { setDetail(await api.getOrgChain(node.id)); } catch { setDetail(null); }
  }, [parent]);

  useEffect(() => {
    if (!search.trim()) return;
    const hit = [...nodes.values()].find(n => n.name?.toLowerCase().includes(search.toLowerCase()));
    if (hit) selectNode(hit);
  }, [search, nodes, selectNode]);

  const clearSelection = () => { setSelected(null); setChainIds(new Set()); setDetail(null); };
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const onWheel = (e) => setZoom(z => Math.min(1.6, Math.max(0.4, z - e.deltaY * 0.001)));
  const onPointerDown = (e) => { drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; };
  const onPointerMove = (e) => { if (drag.current) setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); };
  const onPointerUp = () => { drag.current = null; };

  const onAction = (type, node) => setModal({ type, node });
  const afterMutation = async () => { setModal(null); await reload(); };

  const renderNode = (node) => (
    <TreeNode key={node.id} label={<NodeCard node={node} selected={selected === node.id} dimmed={selected && !chainIds.has(node.id)} canManage={canManage} onSelect={selectNode} onAction={onAction} />}>
      {(node.children || []).map(renderNode)}
    </TreeNode>
  );

  if (loading) return <div className="p-6"><Loading label="Building organization chart…" /></div>;
  const single = roots.length === 1 ? roots[0] : null;

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <PageHeader icon={GitBranch} title="Organization Chart" subtitle="Drag to pan · scroll to zoom · click a node to manage">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find employee…"
            className="pl-8 pr-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 outline-none focus:border-blue-500 w-40" />
        </div>
        {canManage && <button onClick={() => setModal({ type: 'add', node: null })} className={btnPrimary}><UserPlus className="w-4 h-4" />Add</button>}
        <button onClick={() => setZoom(z => Math.min(1.6, z + 0.15))} className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"><ZoomIn className="w-4 h-4" /></button>
        <button onClick={() => setZoom(z => Math.max(0.4, z - 0.15))} className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"><ZoomOut className="w-4 h-4" /></button>
        <button onClick={resetView} className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white" title="Reset view"><Maximize2 className="w-4 h-4" /></button>
      </PageHeader>

      {roots.length === 0 ? (
        <EmptyState icon={GitBranch} title="No employees yet" subtitle="Add employees and set their reporting managers to see the chart."
          action={canManage ? <button onClick={() => setModal({ type: 'add', node: null })} className={btnPrimary}><UserPlus className="w-4 h-4" />Add Employee</button> : null} />
      ) : (
        <div className="relative flex-1 min-h-[420px] rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden">
          <div className="absolute inset-0 cursor-grab active:cursor-grabbing overflow-auto"
            onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
            <div className="inline-block p-10 origin-top-left transition-transform duration-75" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
              {single ? (
                <Tree lineWidth="2px" lineColor="#334155" lineBorderRadius="8px"
                  label={<NodeCard node={single} selected={selected === single.id} dimmed={selected && !chainIds.has(single.id)} canManage={canManage} onSelect={selectNode} onAction={onAction} />}>
                  {(single.children || []).map(renderNode)}
                </Tree>
              ) : (
                <Tree lineWidth="2px" lineColor="#334155" lineBorderRadius="8px"
                  label={<div className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-white font-bold"><Building2 className="w-4 h-4 text-blue-400" />Company</div>}>
                  {roots.map(renderNode)}
                </Tree>
              )}
            </div>
          </div>

          {detail && (
            <div className="absolute top-3 right-3 w-64 rounded-2xl border border-slate-700 bg-slate-900/95 backdrop-blur p-4 shadow-xl">
              <button onClick={clearSelection} className="absolute top-2 right-2 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
              <div className="flex items-center gap-2.5">
                <Avatar name={detail.employee?.name} src={detail.employee?.avatar} size="lg" />
                <div className="min-w-0"><div className="text-sm font-bold text-white truncate">{detail.employee?.name}</div>
                  <div className="text-[11px] text-slate-400 truncate">{detail.employee?.job_title || '—'}</div></div>
              </div>
              {detail.managers?.length > 0 && (
                <div className="mt-3"><div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Reports to</div>
                  <div className="text-xs text-slate-300">{detail.managers.map(m => m.name).join(' › ')}</div></div>
              )}
              <div className="mt-3"><div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">Direct reports ({detail.subordinates?.length || 0})</div>
                <div className="flex flex-wrap gap-1">
                  {(detail.subordinates || []).slice(0, 8).map(s => <span key={s.id} className="text-[11px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded-full">{s.name}</span>)}
                  {(detail.subordinates?.length || 0) === 0 && <span className="text-[11px] text-slate-500">None</span>}
                </div></div>
            </div>
          )}
        </div>
      )}

      {/* Inline management modals */}
      {modal?.type === 'add' && <EmployeeFormModal mode="add" managerNode={modal.node} departments={departments} onClose={() => setModal(null)} onDone={afterMutation} />}
      {modal?.type === 'edit' && <EmployeeFormModal mode="edit" node={modal.node} departments={departments} onClose={() => setModal(null)} onDone={afterMutation} />}
      {modal?.type === 'delete' && (
        <ConfirmDialog isOpen title="Remove employee?" message={`"${modal.node.name}" will be removed from the organization. Their reports will move up to the next level.`}
          confirmText="Remove" onConfirm={async () => { try { await api.deleteEmployee(modal.node.id); showToast('Employee removed', 'success'); afterMutation(); } catch (e) { showToast(e.message, 'error'); setModal(null); } }} onCancel={() => setModal(null)} />
      )}
      {modal?.type === 'manager' && <ChangeManagerModal node={modal.node} employees={employees} onClose={() => setModal(null)} onDone={afterMutation} />}
      {modal?.type === 'team' && <CreateTeamModal leadNode={modal.node} departments={departments} employees={employees} onClose={() => setModal(null)} onDone={afterMutation} />}
      {modal?.type === 'addToTeam' && <AddToTeamModal node={modal.node} teams={teams} onClose={() => setModal(null)} onDone={afterMutation} />}
    </div>
  );
}

// ── Modals ───────────────────────────────────────────────────────────────────
function EmployeeFormModal({ mode, node, managerNode, departments, onClose, onDone }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    name: node?.name || '', job_title: node?.job_title || '', department_id: node?.department_id || '',
    salary: '', joining_date: new Date().toISOString().slice(0, 10), employment_type: 'Full Time',
    email: '', phone: '', status: node?.status || 'Active',
  });
  const [submitting, setSubmitting] = useState(false);
  const deptName = (id) => departments.find(d => String(d.id) === String(id))?.name || '';

  const submit = async () => {
    if (!form.name.trim()) return showToast('Name is required', 'error');
    setSubmitting(true);
    try {
      if (mode === 'add') {
        if (!form.department_id) { setSubmitting(false); return showToast('Department is required', 'error'); }
        if (form.salary === '' || isNaN(Number(form.salary))) { setSubmitting(false); return showToast('Valid salary is required', 'error'); }
        await api.createEmployee({
          name: form.name, job_title: form.job_title, department_id: Number(form.department_id), department: deptName(form.department_id),
          salary: Number(form.salary), joining_date: form.joining_date, employment_type: form.employment_type,
          email: form.email || null, phone: form.phone || null, status: form.status,
          manager_id: managerNode ? managerNode.id : null,
        });
        showToast(managerNode ? `Added report under ${managerNode.name}` : 'Employee added', 'success');
      } else {
        const payload = { name: form.name, job_title: form.job_title, status: form.status, employment_type: form.employment_type };
        if (form.department_id) { payload.department_id = Number(form.department_id); payload.department = deptName(form.department_id); }
        if (form.email) payload.email = form.email;
        if (form.phone) payload.phone = form.phone;
        if (form.salary !== '' && !isNaN(Number(form.salary))) payload.salary = Number(form.salary);
        if (form.joining_date) payload.joining_date = form.joining_date;
        await api.updateEmployee(node.id, payload);
        showToast('Employee updated', 'success');
      }
      onDone();
    } catch (e) { showToast(e.message, 'error'); } finally { setSubmitting(false); }
  };

  const deptOptions = [{ value: '', label: '— Select —' }, ...departments.map(d => ({ value: d.id, label: d.name }))];
  return (
    <Modal isOpen title={mode === 'add' ? (managerNode ? `Add report under ${managerNode.name}` : 'Add Employee') : `Edit ${node.name}`} onClose={onClose} size="lg">
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <FormField label="Designation" value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} placeholder="e.g. Sales Executive" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Department" type="select" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })} options={deptOptions} required={mode === 'add'} />
          <FormField label="Employment Type" type="select" value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })} options={EMP_TYPES.map(t => ({ value: t, label: t }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={mode === 'add' ? 'Salary (₹)' : 'Salary (₹) — optional'} type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} required={mode === 'add'} />
          <FormField label="Joining Date" type="date" value={form.joining_date} onChange={e => setForm({ ...form, joining_date: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <FormField label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        </div>
        <FormField label="Status" type="select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} options={EMP_STATUSES.map(s => ({ value: s, label: s }))} />
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100">Cancel</button>
          <button onClick={submit} disabled={submitting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 disabled:opacity-50">{submitting ? 'Saving…' : mode === 'add' ? 'Add' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  );
}

function ChangeManagerModal({ node, employees, onClose, onDone }) {
  const { showToast } = useToast();
  const [managerId, setManagerId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const options = [{ value: '', label: '— Select manager —' }, ...employees.filter(e => e.id !== node.id).map(e => ({ value: e.id, label: `${e.name}${e.job_title ? ` · ${e.job_title}` : ''}` }))];
  const submit = async () => {
    if (!managerId) return showToast('Pick a manager', 'error');
    setSubmitting(true);
    try { await api.updateEmployee(node.id, { manager_id: Number(managerId) }); showToast('Reporting updated', 'success'); onDone(); }
    catch (e) { showToast(e.message, 'error'); } finally { setSubmitting(false); }
  };
  return (
    <Modal isOpen title={`Change manager — ${node.name}`} onClose={onClose} size="md">
      <div className="p-5 space-y-3">
        <FormField label="Reports to" type="select" value={managerId} onChange={e => setManagerId(e.target.value)} options={options} />
        <p className="text-xs text-gray-400">Circular reporting is prevented automatically.</p>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100">Cancel</button>
          <button onClick={submit} disabled={submitting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 disabled:opacity-50">{submitting ? 'Saving…' : 'Update'}</button>
        </div>
      </div>
    </Modal>
  );
}

function CreateTeamModal({ leadNode, departments, employees, onClose, onDone }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: '', description: '', color: COLOR_SWATCHES[0], department_id: leadNode?.department_id || '', member_ids: [leadNode.id] });
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (!form.name.trim()) return showToast('Team name is required', 'error');
    setSubmitting(true);
    try {
      await api.createTeam({ ...form, department_id: form.department_id || null, lead_id: leadNode.id });
      showToast(`Team created — ${leadNode.name} is lead`, 'success'); onDone();
    } catch (e) { showToast(e.message, 'error'); } finally { setSubmitting(false); }
  };
  return (
    <Modal isOpen title={`New team led by ${leadNode.name}`} onClose={onClose} size="lg">
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-100">
          <Crown className="w-4 h-4 text-amber-500" /><span className="text-sm text-amber-700 font-medium">{leadNode.name} will be the team lead</span>
        </div>
        <FormField label="Team name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Field Sales Team" />
        <FormField label="Description" type="textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <FormField label="Department" type="select" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })} options={[{ value: '', label: '— None —' }, ...departments.map(d => ({ value: d.id, label: d.name }))]} />
        <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Colour</label>
          <div className="flex gap-2 flex-wrap">{COLOR_SWATCHES.map(c => (
            <button key={c} onClick={() => setForm({ ...form, color: c })} className={`w-7 h-7 rounded-lg border-2 ${form.color === c ? 'border-gray-900' : 'border-transparent'}`} style={{ background: c }} />
          ))}</div></div>
        <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Members</label>
          <MemberPicker employees={employees} value={form.member_ids} onChange={ids => setForm({ ...form, member_ids: ids })} height="max-h-40" /></div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100">Cancel</button>
          <button onClick={submit} disabled={submitting} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 disabled:opacity-50">{submitting ? 'Creating…' : 'Create Team'}</button>
        </div>
      </div>
    </Modal>
  );
}

function AddToTeamModal({ node, teams, onClose, onDone }) {
  const { showToast } = useToast();
  const [teamId, setTeamId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (!teamId) return showToast('Pick a team', 'error');
    setSubmitting(true);
    try { await api.addTeamMembers(Number(teamId), [node.id]); showToast(`${node.name} added to team`, 'success'); onDone(); }
    catch (e) { showToast(e.message, 'error'); } finally { setSubmitting(false); }
  };
  return (
    <Modal isOpen title={`Add ${node.name} to a team`} onClose={onClose} size="md">
      <div className="p-5 space-y-3">
        {teams.length === 0 ? <p className="text-sm text-gray-400">No teams yet — use “Create team” first.</p> : (
          <FormField label="Team" type="select" value={teamId} onChange={e => setTeamId(e.target.value)} options={[{ value: '', label: '— Select team —' }, ...teams.map(t => ({ value: t.id, label: t.name }))]} />
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100">Cancel</button>
          <button onClick={submit} disabled={submitting || !teams.length} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 disabled:opacity-50">{submitting ? 'Adding…' : 'Add'}</button>
        </div>
      </div>
    </Modal>
  );
}
