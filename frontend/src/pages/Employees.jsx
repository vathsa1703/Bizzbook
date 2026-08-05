import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Building2, GitBranch, Shield, Mail, Calendar, Clock,
  DollarSign, FileText, Activity, Bell, Bot, BarChart3,
  ChevronLeft, Menu, X, Users2, Boxes, ClipboardList, LayoutGrid
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

// Sub-page imports (lazy-loaded style for clarity)
import EmployeeDirectory from './employees/EmployeeDirectory';
import LeavesPage from './employees/LeavesPage';
import AttendancePage from './employees/AttendancePage';
import PayrollPage from './employees/PayrollPage';
import BranchesPage from './employees/BranchesPage';
import RolesPermissionsPage from './employees/RolesPermissionsPage';
import InvitationsPage from './employees/InvitationsPage';
import HRCopilot from './employees/HRCopilot';
import HRAnalytics from './employees/HRAnalytics';
// Workforce & Organization Management tabs
import OrgChartPage from './employees/workforce/OrgChartPage';
import DepartmentsPage from './employees/workforce/DepartmentsPage';
import TeamsPage from './employees/workforce/TeamsPage';
import GroupsPage from './employees/workforce/GroupsPage';
import TasksPage from './employees/workforce/TasksPage';
import KanbanPage from './employees/workforce/KanbanPage';
import WorkforceAnalytics from './employees/workforce/WorkforceAnalytics';

const NAV_ITEMS = [
  { id: 'directory',    label: 'Employees',    icon: Users,        permission: null },
  { id: 'org-chart',    label: 'Org Chart',    icon: GitBranch,    permission: null },
  { id: 'departments',  label: 'Departments',  icon: Building2,    permission: null },
  { id: 'teams',        label: 'Teams',        icon: Users2,       permission: null },
  { id: 'groups',       label: 'Groups',       icon: Boxes,        permission: null },
  { id: 'tasks',        label: 'Tasks',        icon: ClipboardList, permission: null },
  { id: 'kanban',       label: 'Kanban',       icon: LayoutGrid,   permission: null },
  { id: 'workforce-analytics', label: 'Insights', icon: BarChart3, permission: null },
  { id: 'leaves',       label: 'Leaves',       icon: Calendar,     permission: 'leaves.view' },
  { id: 'attendance',   label: 'Attendance',   icon: Clock,        permission: 'attendance.view' },
  { id: 'payroll',      label: 'Payroll',      icon: DollarSign,   permission: 'payroll.view' },
  { id: 'branches',     label: 'Branches',     icon: Building2,     permission: 'branches.view' },
  { id: 'roles',        label: 'Roles',        icon: Shield,       permission: 'settings.view' },
  { id: 'invitations',  label: 'Invite',       icon: Mail,         permission: null },
  { id: 'hr-copilot',   label: 'HR AI',        icon: Bot,          permission: null },
  { id: 'analytics',    label: 'HR Analytics', icon: Activity,     permission: null },
];

const PAGE_MAP = {
  directory: EmployeeDirectory,
  'org-chart': OrgChartPage,
  departments: DepartmentsPage,
  teams: TeamsPage,
  groups: GroupsPage,
  tasks: TasksPage,
  kanban: KanbanPage,
  'workforce-analytics': WorkforceAnalytics,
  leaves: LeavesPage,
  attendance: AttendancePage,
  payroll: PayrollPage,
  branches: BranchesPage,
  roles: RolesPermissionsPage,
  invitations: InvitationsPage,
  'hr-copilot': HRCopilot,
  analytics: HRAnalytics,
};

export default function Employees({ onNavigate }) {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('directory');
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const permissions = user?.permissions || [];
  const hasPermission = (perm) => !perm || permissions.includes(perm) || user?.role === 'OWNER' || user?.role === 'admin';

  useEffect(() => {
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const data = await api.getUnreadCount();
        if (!cancelled) setUnreadCount(data?.count || 0);
      } catch { /* non-fatal */ }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const ActivePage = PAGE_MAP[activeView] || EmployeeDirectory;
  const activeItem = NAV_ITEMS.find(i => i.id === activeView);

  return (
    <div className="flex h-screen bg-canvas dark:bg-canvas-dark overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-60 bg-panel dark:bg-panel-dark border-r border-edge dark:border-edge-dark flex flex-col
        transform transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:flex
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-edge dark:border-edge-dark">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-inkA dark:text-inkA-dark">HR Hub</div>
            <div className="text-xs text-inkB dark:text-inkB-dark">ORUDINA AI</div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden text-inkB dark:text-inkB-dark">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.filter(item => hasPermission(item.permission)).map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveView(item.id); setSidebarOpen(false); }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                    : 'text-inkB dark:text-inkB-dark hover:text-inkA dark:hover:text-white hover:bg-panel2 dark:hover:bg-panel2-dark'
                  }
                `}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{item.label}</span>
                {item.id === 'hr-copilot' && (
                  <span className="ml-auto text-[10px] bg-gradient-to-r from-violet-500 to-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold">AI</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User info at bottom */}
        <div className="p-3 border-t border-edge dark:border-edge-dark">
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-panel2 dark:bg-panel2-dark">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-inkA dark:text-inkA-dark truncate">{user?.name}</div>
              <div className="text-[10px] text-inkB dark:text-inkB-dark truncate">{user?.role}</div>
            </div>
            {unreadCount > 0 && (
              <span className="flex-shrink-0 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Sidebar Overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Top Bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-panel dark:bg-panel-dark border-b border-edge dark:border-edge-dark">
          <button onClick={() => setSidebarOpen(true)} className="text-inkB dark:text-inkB-dark hover:text-inkA dark:hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            {activeItem && <activeItem.icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
            <span className="text-sm font-semibold text-inkA dark:text-inkA-dark">{activeItem?.label}</span>
          </div>
          {unreadCount > 0 && (
            <div className="ml-auto flex items-center gap-1">
              <Bell className="w-4 h-4 text-inkB dark:text-inkB-dark" />
              <span className="text-xs bg-red-500 text-white px-1.5 rounded-full font-bold">{unreadCount}</span>
            </div>
          )}
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto">
          <ActivePage
            onNavigate={onNavigate}
            onViewChange={setActiveView}
            unreadCount={unreadCount}
          />
        </div>
      </div>
    </div>
  );
}
