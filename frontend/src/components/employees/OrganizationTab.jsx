import React, { useMemo } from 'react';
import { Network, Users, ChevronRight } from 'lucide-react';

// Recursive Org Node Component
function OrgNode({ employee, childrenMap, level = 0 }) {
  const directReports = childrenMap[employee.id] || [];

  return (
    <div className="flex flex-col relative pl-6 my-2">
      {/* Connector Line */}
      {level > 0 && (
        <div className="absolute left-0 top-6 w-6 h-px bg-gray-300"></div>
      )}
      {level > 0 && (
        <div className="absolute -left-px -top-4 w-px h-10 bg-gray-300"></div>
      )}

      {/* Node Card */}
      <div className="flex items-center gap-3 bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow relative z-10 w-fit pr-6">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 font-bold rounded-full flex items-center justify-center shrink-0 text-sm">
          {employee.avatar ? (
            <img src={employee.avatar} className="w-full h-full rounded-full object-cover" alt="" />
          ) : (
            employee.name.substring(0,2).toUpperCase()
          )}
        </div>
        <div>
          <h4 className="text-sm font-bold text-inkA dark:text-inkA-dark">{employee.name}</h4>
          <p className="text-xs text-inkB dark:text-inkB-dark">{employee.job_title || 'Employee'} • {employee.department_name || 'No Dept'}</p>
        </div>
        {directReports.length > 0 && (
          <div className="ml-4 flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-full">
            <Users className="w-3 h-3" /> {directReports.length}
          </div>
        )}
      </div>

      {/* Children */}
      {directReports.length > 0 && (
        <div className="ml-5 border-l border-gray-300 pl-4 mt-2 relative">
           {directReports.map(child => (
             <OrgNode key={child.id} employee={child} childrenMap={childrenMap} level={level + 1} />
           ))}
        </div>
      )}
    </div>
  );
}

export default function OrganizationTab({ employees }) {
  const { rootNodes, childrenMap } = useMemo(() => {
    const childrenMap = {};
    const rootNodes = [];

    // Filter out deleted/terminated? Keeping all active for now.
    const active = employees.filter(e => e.status !== 'Terminated' && e.status !== 'Inactive');

    active.forEach(emp => {
      if (emp.manager_id) {
        if (!childrenMap[emp.manager_id]) childrenMap[emp.manager_id] = [];
        childrenMap[emp.manager_id].push(emp);
      } else {
        rootNodes.push(emp);
      }
    });

    return { rootNodes, childrenMap };
  }, [employees]);

  if (employees.length === 0) {
    return <div className="p-8 text-center text-inkB dark:text-inkB-dark">No employees found in the organization.</div>;
  }

  return (
    <div className="bg-panel2/50 dark:bg-panel2-dark/50 rounded-xl border border-edge dark:border-edge-dark p-8 overflow-x-auto">
      <div className="flex items-center gap-2 mb-6 text-inkB dark:text-inkB-dark font-medium">
        <Network className="w-5 h-5 text-gray-400 dark:text-slate-500" />
        Organization Hierarchy
      </div>
      
      <div className="min-w-[800px]">
        {rootNodes.map(root => (
          <OrgNode key={root.id} employee={root} childrenMap={childrenMap} level={0} />
        ))}
        {rootNodes.length === 0 && (
          <div className="p-4 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg">
            Could not find any root employees (employees without a manager). Ensure at least one employee is at the top of the hierarchy.
          </div>
        )}
      </div>
    </div>
  );
}
