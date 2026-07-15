// ============================================================================
// Compliance Reports — downloadable CSV / JSON.
// Reuses complianceService (no duplicated calculations). PDF export is a Phase-2b
// add-on via the existing pdfService; CSV/JSON cover the current export needs.
// ============================================================================
const { getDb } = require('../config/db');
const svc = require('./complianceService');

const REPORT_TYPES = ['summary', 'licenses', 'documents', 'renewals', 'deadlines', 'audit'];

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n');
}

function buildRows(companyId, type) {
  if (type === 'summary') {
    const ov = svc.getOverview(companyId);
    const rows = ov.breakdown.map(b => ({ category: b.name, score_pct: b.score, items: b.total, overdue: b.overdue }));
    rows.unshift({ category: 'OVERALL', score_pct: ov.overallScore, items: ov.counts.total, overdue: ov.counts.overdue });
    return rows;
  }
  if (type === 'deadlines') {
    return svc.getOverview(companyId).deadlines.map(d => ({
      title: d.title, category: d.category_key, priority: d.priority,
      due_date: d.next_due_date, days_remaining: d.daysRemaining, status: d.status,
    }));
  }
  if (type === 'licenses' || type === 'renewals') {
    const items = svc.getItems(companyId, {}).filter(it =>
      type === 'renewals' ? it.frequency === 'renewal' : (it.category_key === 'licenses' || it.category_key === 'renewals'));
    return items.map(it => ({
      title: it.title, department: it.department, status: it.status,
      next_due_date: it.next_due_date, days_remaining: it.daysRemaining,
      issue_date: it.issue_date || '', expiry_date: it.expiry_date || '',
      documents_uploaded: it.uploaded_docs || 0, documents_required: it.required_docs || 0,
    }));
  }
  if (type === 'documents') {
    const db = getDb();
    try {
      return db.prepare(`
        SELECT r.title AS compliance_item, d.doc_name, d.original_name, d.status,
               d.expiry_date, d.verified, d.version, d.uploaded_at
        FROM compliance_item_documents d
        JOIN business_compliance_items i ON i.id = d.item_id
        JOIN compliance_rules r ON r.id = i.rule_id
        WHERE d.company_id = ? AND d.is_current = 1
        ORDER BY r.title, d.doc_name
      `).all(companyId);
    } finally { db.close(); }
  }
  if (type === 'audit') {
    const db = getDb();
    try {
      return db.prepare(`
        SELECT e.created_at, e.event_type, e.detail, r.title AS related_item
        FROM compliance_events e LEFT JOIN compliance_rules r ON r.id = e.rule_id
        WHERE e.company_id = ? ORDER BY e.created_at DESC LIMIT 500
      `).all(companyId);
    } finally { db.close(); }
  }
  return [];
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function toHtml(type, rows) {
  const title = `Compliance ${type.charAt(0).toUpperCase() + type.slice(1)} Report`;
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const body = rows.length
    ? `<table><thead><tr>${headers.map(h => `<th>${esc(h.replace(/_/g, ' '))}</th>`).join('')}</tr></thead>`
      + `<tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${esc(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p class="empty">No data for this report.</p>';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;padding:0;margin:0}
    h1{font-size:20px;margin:0 0 2px} .sub{color:#6b7280;font-size:12px;margin-bottom:16px}
    .brand{color:#0d9488;font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th{background:#f1f5f9;text-align:left;padding:8px 10px;text-transform:capitalize;color:#475569;border-bottom:2px solid #e2e8f0}
    td{padding:7px 10px;border-bottom:1px solid #f1f5f9}
    tr:nth-child(even) td{background:#fafafa} .empty{color:#9ca3af;font-size:13px}
  </style></head><body>
    <p class="brand">BizBook · Compliance</p>
    <h1>${esc(title)}</h1>
    <p class="sub">Generated ${new Date().toLocaleString('en-IN')} · ${rows.length} row(s)</p>
    ${body}
  </body></html>`;
}

async function generate(companyId, type, format = 'csv') {
  if (!REPORT_TYPES.includes(type)) return { error: `Unknown report type. Use one of: ${REPORT_TYPES.join(', ')}` };
  const rows = buildRows(companyId, type);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    return { filename: `compliance_${type}_${stamp}.json`, contentType: 'application/json', content: JSON.stringify({ type, generated_at: new Date().toISOString(), rows }, null, 2) };
  }
  if (format === 'pdf') {
    const { renderHtmlToPdf } = require('./pdfService');
    const buffer = await renderHtmlToPdf(toHtml(type, rows));
    return { filename: `compliance_${type}_${stamp}.pdf`, contentType: 'application/pdf', content: buffer };
  }
  return { filename: `compliance_${type}_${stamp}.csv`, contentType: 'text/csv', content: toCsv(rows) };
}

module.exports = { generate, REPORT_TYPES };
