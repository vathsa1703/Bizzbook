const { getDb } = require('../config/db');

// HR AI is intentionally rule-based/deterministic in this build — there is no
// LLM call in this file. It previously attempted a Google Gemini call, but
// @google/generative-ai was never added to package.json, so that path always
// threw and every caller silently landed on the fallback logic below. Rather
// than ship a package we can't configure or verify against a real API key,
// the deterministic behavior below is now the real, intended implementation,
// not a fallback for a missing key. See CLAUDE.md's AI Subsystem section.

async function analyzeLeaveRequest({ employee, start_date, end_date, total_days, reason, on_leave_count, dept_size }, companyId) {
  // Risk scoring: weighted by what fraction of the department is already on
  // leave during the requested period, plus the length of this request itself.
  const ratio = dept_size > 0 ? on_leave_count / dept_size : 0;
  const risk_score = Math.round(Math.min(100, ratio * 100 + total_days * 5));
  return {
    risk_score,
    risk_level: risk_score > 65 ? 'high' : risk_score > 35 ? 'medium' : 'low',
    reason: `${on_leave_count} out of ${dept_size} department members are already on leave during this period.`,
    recommendation: risk_score > 65 ? 'Consider deferring or finding a replacement.' : 'Approve',
    suggested_replacement_id: null
  };
}

async function hrChat(messages, companyId) {
  const db = getDb();
  let context = '';
  try {
    const today = new Date().toISOString().split('T')[0];
    const totalEmps = db.prepare("SELECT count(*) as cnt FROM employees WHERE company_id = ? AND status = 'Active' AND deleted_at IS NULL").get(companyId);
    const todayPresent = db.prepare("SELECT count(*) as cnt FROM attendance_records WHERE company_id = ? AND date = ? AND status IN ('present','remote','wfh','on_site','late')").get(companyId, today);
    const pendingLeaves = db.prepare("SELECT count(*) as cnt FROM leave_requests WHERE company_id = ? AND status = 'pending'").get(companyId);
    const topDepts = db.prepare("SELECT department, count(*) as cnt FROM employees WHERE company_id = ? AND status='Active' GROUP BY department ORDER BY cnt DESC LIMIT 5").all(companyId);

    context = `
Company HR Context (Today: ${today}):
- Total Active Employees: ${totalEmps?.cnt || 0}
- Present Today: ${todayPresent?.cnt || 0}
- Pending Leave Requests: ${pendingLeaves?.cnt || 0}
- Top Departments: ${topDepts.map(d => `${d.department}(${d.cnt})`).join(', ')}
`;
  } catch (e) { /* non-fatal */ } finally { db.close(); }

  // No LLM call here (see file header) — this is a live-data context echo,
  // not an attempt at a generated answer.
  const lastMsg = messages[messages.length - 1]?.content || '';
  return `HR Copilot is running in data-summary mode (no LLM configured for HR). Your query: "${lastMsg}".\n${context}`;
}

async function generateLetter(type, employeeData, context) {
  // Freeform letter drafting has no deterministic equivalent — without an
  // LLM call this is honestly unavailable rather than faked.
  return `[HR letter generation is not available in this build — no LLM provider is configured for HR. Requested: ${type} letter for ${employeeData?.name || 'employee'}.]`;
}

async function generateInsights(companyId) {
  const db = getDb();
  let data = {};
  try {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.substring(0, 7);

    // Late employees today
    data.lateToday = db.prepare("SELECT e.name, e.job_title FROM attendance_records ar JOIN employees e ON ar.employee_id = e.id WHERE ar.company_id = ? AND ar.date = ? AND ar.status = 'late'").all(companyId, today);
    // Absent today
    data.absentToday = db.prepare("SELECT e.name FROM attendance_records ar JOIN employees e ON ar.employee_id = e.id WHERE ar.company_id = ? AND ar.date = ? AND ar.status = 'absent'").all(companyId, today);
    // Pending leaves
    data.pendingLeaves = db.prepare("SELECT count(*) as cnt FROM leave_requests WHERE company_id = ? AND status = 'pending'").get(companyId)?.cnt;
    // High leave usage employees (>80% used)
    data.highLeaveUsage = db.prepare("SELECT e.name, lb.used_days, lb.total_days FROM leave_balances lb JOIN employees e ON lb.employee_id = e.id WHERE lb.company_id = ? AND lb.year = strftime('%Y','now') AND lb.total_days > 0 AND CAST(lb.used_days AS REAL)/lb.total_days > 0.8").all(companyId);
  } catch (e) { /* non-fatal */ } finally { db.close(); }

  const insights = [];
  if (data.lateToday?.length > 0) {
    insights.push({ type: 'attendance', severity: 'warning', title: `${data.lateToday.length} employees late today`, data: data.lateToday });
  }
  if (data.absentToday?.length > 0) {
    insights.push({ type: 'attendance', severity: 'info', title: `${data.absentToday.length} employees absent today`, data: data.absentToday });
  }
  if (data.pendingLeaves > 0) {
    insights.push({ type: 'leaves', severity: 'warning', title: `${data.pendingLeaves} leave requests pending approval`, data: null });
  }
  if (data.highLeaveUsage?.length > 0) {
    insights.push({ type: 'burnout_risk', severity: 'warning', title: `${data.highLeaveUsage.length} employees have used >80% of their leave`, subtitle: 'Potential burnout risk', data: data.highLeaveUsage });
  }
  return insights;
}

module.exports = { analyzeLeaveRequest, hrChat, generateLetter, generateInsights };
