// ============================================================================
// Board Meeting Manager (Phase 2b).
// Manages statutory meetings (board / AGM / EGM): agenda, attendance, resolutions,
// minutes, and history. Minutes are auto-composed DETERMINISTICALLY from the data
// the user actually entered (never fabricated) — an LLM polish pass can be added
// later behind the same entry point. Marking a meeting "held" completes the linked
// compliance obligation via complianceService (single source of truth for due-date
// advancement), so meetings and the compliance score stay in sync.
//
// Phase 2 dual-engine: exported functions are async and go through
// config/dbEngine.js's dbAll/withExecutor/withTxExecutor.
// ============================================================================

const { dbAll, withExecutor, withTxExecutor } = require('../config/dbEngine');
const complianceSvc = require('./complianceService');

// Static resolution templates (data, not logic — extend freely).
const RESOLUTION_TEMPLATES = [
  { id: 'adopt_accounts', title: 'Adoption of Financial Statements', type: 'ordinary', text: 'RESOLVED THAT the audited financial statements of the Company for the financial year ended __, together with the reports of the Board and Auditors thereon, be and are hereby adopted.' },
  { id: 'appoint_auditor', title: 'Appointment / Ratification of Auditor', type: 'ordinary', text: 'RESOLVED THAT M/s __, Chartered Accountants, be and are hereby appointed as the Statutory Auditors of the Company to hold office until the conclusion of the next Annual General Meeting.' },
  { id: 'declare_dividend', title: 'Declaration of Dividend', type: 'ordinary', text: 'RESOLVED THAT a dividend of ₹__ per equity share be and is hereby declared for the financial year ended __.' },
  { id: 'open_bank_account', title: 'Opening of Bank Account', type: 'ordinary', text: 'RESOLVED THAT a current account be opened with __ Bank and that the following persons be authorised to operate the said account.' },
  { id: 'alter_moa', title: 'Alteration of Memorandum (Special)', type: 'special', text: 'RESOLVED AS A SPECIAL RESOLUTION THAT the Memorandum of Association of the Company be altered in the manner set out below.' },
];

function meetingTypeLabel(t) { return t === 'agm' ? 'Annual General Meeting' : t === 'egm' ? 'Extraordinary General Meeting' : 'Board Meeting'; }

// datetime('now') is SQLite-only; Postgres equivalent is now() (same pattern as
// credits.js's inline `today` local var).
function sqlNow(x) { return x.engine === 'postgres' ? 'now()' : "datetime('now')"; }

async function _children(x, meetingId) {
  return {
    agenda: await x.all('SELECT id, sort_order, item_text FROM compliance_meeting_agenda WHERE meeting_id = ? ORDER BY sort_order, id', [meetingId]),
    attendees: await x.all('SELECT id, name, role, present FROM compliance_meeting_attendees WHERE meeting_id = ?', [meetingId]),
    resolutions: await x.all('SELECT id, sort_order, resolution_text, resolution_type, passed FROM compliance_meeting_resolutions WHERE meeting_id = ? ORDER BY sort_order, id', [meetingId]),
    minutes: await x.get('SELECT id, content, ai_generated, finalized_at, created_at FROM compliance_meeting_minutes WHERE meeting_id = ? ORDER BY id DESC LIMIT 1', [meetingId]),
  };
}

async function listMeetings(companyId) {
  return dbAll(`
    SELECT m.*,
      (SELECT COUNT(*) FROM compliance_meeting_attendees a WHERE a.meeting_id = m.id AND a.present = TRUE) AS present_count,
      (SELECT COUNT(*) FROM compliance_meeting_resolutions r WHERE r.meeting_id = m.id) AS resolution_count
    FROM compliance_meetings m WHERE m.company_id = ? ORDER BY m.scheduled_at DESC, m.id DESC
  `, [companyId]);
}

async function getMeeting(companyId, id) {
  return withExecutor(async (x) => {
    const m = await x.get('SELECT * FROM compliance_meetings WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!m) return { error: 'not_found' };
    return { meeting: m, ...(await _children(x, id)) };
  });
}

async function createMeeting(companyId, data = {}) {
  if (!data.title) return { error: 'title is required' };
  return withTxExecutor(async (x) => {
    const id = await x.insert(`
      INSERT INTO compliance_meetings (company_id, item_id, meeting_type, title, scheduled_at, venue, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)
    `, [companyId, data.item_id || null, data.meeting_type || 'board', data.title, data.scheduled_at || null, data.venue || null, data.notes || null]);

    const agenda = data.agenda || [];
    for (let i = 0; i < agenda.length; i++) {
      const t = agenda[i];
      await x.run('INSERT INTO compliance_meeting_agenda (meeting_id, sort_order, item_text) VALUES (?, ?, ?)',
        [id, i, typeof t === 'string' ? t : t.item_text]);
    }
    for (const a of (data.attendees || [])) {
      await x.run('INSERT INTO compliance_meeting_attendees (meeting_id, name, role, present) VALUES (?, ?, ?, ?)',
        [id, a.name, a.role || null, a.present === 0 ? 0 : 1]);
    }
    const resolutions = data.resolutions || [];
    for (let i = 0; i < resolutions.length; i++) {
      const r = resolutions[i];
      await x.run('INSERT INTO compliance_meeting_resolutions (meeting_id, sort_order, resolution_text, resolution_type, passed) VALUES (?, ?, ?, ?, ?)',
        [id, i, typeof r === 'string' ? r : r.resolution_text, (typeof r === 'object' && r.resolution_type) || 'ordinary', (typeof r === 'object' && r.passed === 0) ? 0 : 1]);
    }
    return { meeting: await x.get('SELECT * FROM compliance_meetings WHERE id = ?', [id]), ...(await _children(x, id)) };
  });
}

async function updateMeeting(companyId, id, data = {}) {
  return withTxExecutor(async (x) => {
    const m = await x.get('SELECT id FROM compliance_meetings WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!m) return { error: 'not_found' };
    const cols = ['meeting_type', 'title', 'scheduled_at', 'venue', 'status', 'notes', 'quorum_met', 'item_id'].filter(c => data[c] !== undefined);
    if (cols.length) {
      await x.run(`UPDATE compliance_meetings SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = ${sqlNow(x)} WHERE id = ?`,
        [...cols.map(c => data[c]), id]);
    }
    // Optional full-replace of children when arrays are provided.
    const replace = async (table, rows, insert) => {
      await x.run(`DELETE FROM ${table} WHERE meeting_id = ?`, [id]);
      const list = rows || [];
      for (let i = 0; i < list.length; i++) await insert(list[i], i);
    };
    if (Array.isArray(data.agenda)) {
      await replace('compliance_meeting_agenda', data.agenda, (t, i) =>
        x.run('INSERT INTO compliance_meeting_agenda (meeting_id, sort_order, item_text) VALUES (?, ?, ?)', [id, i, typeof t === 'string' ? t : t.item_text]));
    }
    if (Array.isArray(data.attendees)) {
      await replace('compliance_meeting_attendees', data.attendees, (a) =>
        x.run('INSERT INTO compliance_meeting_attendees (meeting_id, name, role, present) VALUES (?, ?, ?, ?)', [id, a.name, a.role || null, a.present === 0 ? 0 : 1]));
    }
    if (Array.isArray(data.resolutions)) {
      await replace('compliance_meeting_resolutions', data.resolutions, (r, i) =>
        x.run('INSERT INTO compliance_meeting_resolutions (meeting_id, sort_order, resolution_text, resolution_type, passed) VALUES (?, ?, ?, ?, ?)',
          [id, i, typeof r === 'string' ? r : r.resolution_text, (typeof r === 'object' && r.resolution_type) || 'ordinary', (typeof r === 'object' && r.passed === 0) ? 0 : 1]));
    }
    return { meeting: await x.get('SELECT * FROM compliance_meetings WHERE id = ?', [id]), ...(await _children(x, id)) };
  });
}

async function deleteMeeting(companyId, id) {
  return withTxExecutor(async (x) => {
    const m = await x.get('SELECT id FROM compliance_meetings WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!m) return { error: 'not_found' };
    for (const t of ['compliance_meeting_agenda', 'compliance_meeting_attendees', 'compliance_meeting_resolutions', 'compliance_meeting_minutes']) {
      await x.run(`DELETE FROM ${t} WHERE meeting_id = ?`, [id]);
    }
    await x.run('DELETE FROM compliance_meetings WHERE id = ?', [id]);
    return { deleted: true };
  });
}

// Deterministic minutes composed from the actual meeting record.
async function generateMinutes(companyId, id) {
  return withExecutor(async (x) => {
    const m = await x.get('SELECT * FROM compliance_meetings WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!m) return { error: 'not_found' };
    const { agenda, attendees, resolutions } = await _children(x, id);
    const company = (await x.get('SELECT name, legal_business_name FROM companies WHERE id = ?', [companyId])) || {};
    const present = attendees.filter(a => a.present);
    const absent = attendees.filter(a => !a.present);
    const when = m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' }) : '__';

    const lines = [];
    lines.push(`MINUTES OF THE ${meetingTypeLabel(m.meeting_type).toUpperCase()}`);
    lines.push(`OF ${(company.legal_business_name || company.name || 'THE COMPANY').toUpperCase()}`);
    lines.push('');
    lines.push(`Held on ${when}${m.venue ? ` at ${m.venue}` : ''}.`);
    lines.push('');
    lines.push('PRESENT:');
    lines.push(present.length ? present.map(a => `  • ${a.name}${a.role ? ` (${a.role})` : ''}`).join('\n') : '  • (none recorded)');
    if (absent.length) { lines.push(''); lines.push('LEAVE OF ABSENCE:'); lines.push(absent.map(a => `  • ${a.name}${a.role ? ` (${a.role})` : ''}`).join('\n')); }
    lines.push('');
    lines.push(`QUORUM: ${m.quorum_met ? 'The requisite quorum being present, the meeting was called to order.' : 'To be confirmed.'}`);
    lines.push('');
    if (agenda.length) { lines.push('AGENDA:'); agenda.forEach((a, i) => lines.push(`  ${i + 1}. ${a.item_text}`)); lines.push(''); }
    if (resolutions.length) {
      lines.push('RESOLUTIONS:');
      resolutions.forEach((r, i) => lines.push(`  ${i + 1}. [${r.resolution_type === 'special' ? 'SPECIAL' : 'ORDINARY'} — ${r.passed ? 'PASSED' : 'NOT PASSED'}] ${r.resolution_text}`));
      lines.push('');
    }
    lines.push('There being no other business, the meeting concluded with a vote of thanks to the Chair.');
    lines.push('');
    lines.push('_______________________');
    lines.push('Chairperson');
    const content = lines.join('\n');

    await x.run('INSERT INTO compliance_meeting_minutes (meeting_id, content, ai_generated) VALUES (?, ?, TRUE)', [id, content]);
    return { content, ai_generated: 1 };
  });
}

async function markHeld(companyId, id, { quorum_met } = {}) {
  let itemId = null;
  const preErr = await withExecutor(async (x) => {
    const m = await x.get('SELECT * FROM compliance_meetings WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!m) return { error: 'not_found' };
    await x.run(`UPDATE compliance_meetings SET status = 'held', quorum_met = ?, updated_at = ${sqlNow(x)} WHERE id = ?`,
      [quorum_met ? 1 : 0, id]);
    itemId = m.item_id;
    return null;
  });
  if (preErr && preErr.error) return preErr;
  // Complete the linked compliance obligation via the canonical service (advances
  // the recurring meeting's next due date). Runs on its own connection/executor.
  if (itemId) { try { await complianceSvc.updateItem(companyId, itemId, { status: 'completed' }); } catch (_) { /* non-fatal */ } }
  return getMeeting(companyId, id);
}

function resolutionTemplates() { return RESOLUTION_TEMPLATES; }

module.exports = { listMeetings, getMeeting, createMeeting, updateMeeting, deleteMeeting, generateMinutes, markHeld, resolutionTemplates };
