const { getDb } = require('../config/db');

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

async function callGemini(prompt, systemInstruction) {
  if (!GEMINI_KEY || GEMINI_KEY.includes('your-') || GEMINI_KEY === 'sk-xxx') {
    return null; // No AI key configured
  }
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', systemInstruction });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('[hrAIService] Gemini error:', err.message);
    return null;
  }
}

async function analyzeLeaveRequest({ employee, start_date, end_date, total_days, reason, on_leave_count, dept_size }, companyId) {
  const prompt = `
You are an HR AI assistant. Analyze this leave request and return a JSON response.

Employee: ${employee?.name || 'Unknown'} (${employee?.job_title || 'Staff'})
Department: ${employee?.dept_name || 'General'}
Department Size: ${dept_size} employees
Employees Already On Leave This Period: ${on_leave_count}
Leave Period: ${start_date} to ${end_date} (${total_days} working days)
Reason: ${reason || 'Not provided'}

Return ONLY valid JSON:
{
  "risk_score": <0-100 number>,
  "risk_level": "<low|medium|high>",
  "reason": "<2-3 sentence explanation>",
  "recommendation": "<Approve|Approve with conditions|Defer to specific date>",
  "suggested_replacement_id": null
}
`;
  const raw = await callGemini(prompt, 'You are an HR AI assistant. Always respond with valid JSON only, no markdown.');
  if (!raw) {
    // Fallback rule-based
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
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return null;
  }
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

  const systemInstruction = `You are an expert HR Copilot for BizBook AI, an ERP platform for Indian SMEs. 
You have access to real-time HR data from the company database. Use this context to give precise, actionable answers.
Be professional, concise, and data-driven. Use Indian currency (₹) and date formats.
Context: ${context}`;

  const lastMsg = messages[messages.length - 1]?.content || '';
  const raw = await callGemini(lastMsg, systemInstruction);
  if (!raw) {
    return `I'm analyzing your query: "${lastMsg}". ${context ? `Here's what I can see: ${context}` : 'AI service is currently unavailable. Please check your API key configuration.'}`;
  }
  return raw;
}

async function generateLetter(type, employeeData, context) {
  const templates = {
    warning: `Generate a formal warning letter for employee ${employeeData?.name} regarding: ${context}. Use professional Indian corporate HR tone. Include: Date, Employee details, Warning details, Expected improvement, Consequences. Format as a formal letter.`,
    appreciation: `Generate an appreciation letter for employee ${employeeData?.name} for: ${context}. Use warm, motivating tone. Include: Date, Achievement details, Company gratitude, Future encouragement.`,
    termination: `Generate a termination letter for employee ${employeeData?.name}. Reason: ${context}. Use professional, legally compliant tone for Indian labor laws.`
  };
  const prompt = templates[type] || templates.warning;
  const raw = await callGemini(prompt, 'You are an HR letter generator. Generate formal, professional HR letters.');
  return raw || `[AI service unavailable. Please configure GEMINI_API_KEY to generate ${type} letters.]`;
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
