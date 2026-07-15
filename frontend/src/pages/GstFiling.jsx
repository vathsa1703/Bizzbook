import React, { useEffect, useState, useCallback } from 'react';
import {
  FileSpreadsheet, FileArchive, FileJson, ChevronLeft, RefreshCw,
  CheckCircle2, AlertCircle, XCircle, AlertTriangle, Download,
  Building2, ShieldCheck, Info, Loader2, TrendingUp, Receipt,
  Users, BarChart3, Settings
} from 'lucide-react';
import { api } from '../api/client';

// ─── Month/Year helpers ──────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function currentFY() {
  const now  = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  // Indian FY: April (4) to March (3)
  return month >= 4 ? year : year - 1;
}

function fyMonths(fy) {
  // Returns [{month, year, label}, …] for Apr-YYYY to Mar-YYYY+1
  const months = [];
  for (let m = 4; m <= 12; m++) months.push({ month: m, year: fy,     label: `${MONTHS[m-1]} ${fy}`     });
  for (let m = 1; m <= 3;  m++) months.push({ month: m, year: fy + 1, label: `${MONTHS[m-1]} ${fy + 1}` });
  return months;
}

// ─── Small atoms ─────────────────────────────────────────────────────────────

function Pill({ color, label, count }) {
  const cls = {
    blue:   'bg-blue-50   text-blue-700   border-blue-100',
    violet: 'bg-violet-50 text-violet-700 border-violet-100',
    teal:   'bg-teal-50   text-teal-700   border-teal-100',
    amber:  'bg-amber-50  text-amber-700  border-amber-100',
    red:    'bg-red-50    text-red-700    border-red-100',
    gray:   'bg-gray-50   text-gray-600   border-gray-100',
  }[color] || 'bg-gray-50 text-gray-600 border-gray-100';

  return (
    <div className={`flex flex-col items-center rounded-2xl border px-3 py-2.5 min-w-[72px] ${cls}`}>
      <span className="text-lg font-bold leading-none">{count ?? '—'}</span>
      <span className="text-[10px] font-semibold mt-0.5 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function SeverityIcon({ type }) {
  const map = {
    invalid_gstin:  <XCircle     size={13} className="text-red-500    shrink-0 mt-0.5" />,
    tax_mismatch:   <XCircle     size={13} className="text-red-500    shrink-0 mt-0.5" />,
    duplicate:      <XCircle     size={13} className="text-red-500    shrink-0 mt-0.5" />,
    missing_hsn:    <AlertCircle size={13} className="text-amber-500  shrink-0 mt-0.5" />,
    invalid_pos:    <AlertCircle size={13} className="text-amber-500  shrink-0 mt-0.5" />,
  };
  return map[type] || <Info size={13} className="text-blue-400 shrink-0 mt-0.5" />;
}

function DownloadBtn({ icon: Icon, label, sublabel, color, onClick, disabled, loading }) {
  const colors = {
    green:  'from-emerald-500 to-emerald-600 shadow-emerald-400/30',
    blue:   'from-blue-500   to-blue-600    shadow-blue-400/30',
    indigo: 'from-indigo-500 to-indigo-600  shadow-indigo-400/30',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`relative flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl bg-gradient-to-r text-white font-semibold
        text-sm shadow-lg active:scale-[0.97] transition-all duration-150 ${colors[color]}
        disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100`}
    >
      {loading
        ? <Loader2 size={18} className="animate-spin shrink-0" />
        : <Icon size={18} className="shrink-0" />
      }
      <div className="text-left">
        <div className="font-bold">{label}</div>
        <div className="text-[10px] opacity-80">{sublabel}</div>
      </div>
      {!disabled && !loading && (
        <Download size={14} className="ml-auto opacity-70" />
      )}
    </button>
  );
}

// ─── Section summary row ─────────────────────────────────────────────────────

function SectionRow({ icon: Icon, label, count, taxable, color }) {
  const fmt = n => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const colors = {
    blue:   'bg-blue-100   text-blue-700',
    violet: 'bg-violet-100 text-violet-700',
    teal:   'bg-teal-100   text-teal-700',
  };
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-400">{count} {count === 1 ? 'entry' : 'entries'} · {fmt(taxable)} taxable</p>
      </div>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors[color]}`}>
        {count}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GstFiling({ onNavigate }) {
  const fy = currentFY();
  const months = fyMonths(fy);

  // Default to previous month
  const now     = new Date();
  const prevM   = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-indexed
  const prevY   = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const initKey = `${prevM}_${prevY}`;
  const initOpt = months.find(m => m.month === prevM && m.year === prevY) || months[months.length - 1];

  const [selected, setSelected] = useState(initOpt);
  const [preview,  setPreview]  = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [dlLoading, setDlLoading] = useState({ excel: false, csv: false, json: false });
  const [error,    setError]    = useState('');

  const fetchPreview = useCallback(async (opt) => {
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const data = await api.gstFiling.preview(opt.month, opt.year);
      setPreview(data);
    } catch (e) {
      setError(e.message || 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreview(selected);
  }, [selected]);

  function handleMonthChange(e) {
    const [m, y] = e.target.value.split('_').map(Number);
    const opt = months.find(mo => mo.month === m && mo.year === y) || months[0];
    setSelected(opt);
  }

  async function handleDownload(type) {
    setDlLoading(p => ({ ...p, [type]: true }));
    try {
      const { month, year } = selected;
      const urlMap = {
        excel: api.gstFiling.downloadExcel(month, year),
        csv:   api.gstFiling.downloadCsv(month, year),
        json:  api.gstFiling.downloadJson(month, year),
      };
      const token = localStorage.getItem('token');
      const res   = await fetch(urlMap[type], {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      const blob     = await res.blob();
      const cd       = res.headers.get('Content-Disposition') || '';
      const match    = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `GSTR1_${month}_${year}.${type}`;
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Download failed: ${e.message}`);
    } finally {
      setDlLoading(p => ({ ...p, [type]: false }));
    }
  }

  const health     = preview?.health;
  const summary    = preview?.summary;
  const company    = preview?.company;
  const canExport  = preview?.can_export;
  const compReady  = company?.ready;

  const criticalWarnings = (health?.warnings || []).filter(w =>
    ['invalid_gstin', 'tax_mismatch', 'duplicate'].includes(w.type)
  );
  const otherWarnings = (health?.warnings || []).filter(w =>
    !['invalid_gstin', 'tax_mismatch', 'duplicate'].includes(w.type)
  );

  return (
    <div className="pb-28 min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('more')}
            className="p-1.5 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">GST Filing Export</h1>
            <p className="text-xs text-gray-400">GSTR-1 Offline Utility · Official formats</p>
          </div>
          <button
            onClick={() => fetchPreview(selected)}
            disabled={loading}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Period selector */}
        <div className="mt-3">
          <select
            value={`${selected.month}_${selected.year}`}
            onChange={handleMonthChange}
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
          >
            {months.map(m => (
              <option key={`${m.month}_${m.year}`} value={`${m.month}_${m.year}`}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={32} className="animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">Analysing invoices…</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex gap-2.5 bg-red-50 border border-red-200 rounded-2xl p-3.5">
            <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Preview loaded */}
        {!loading && preview && (
          <>
            {/* Company readiness banner */}
            {!compReady && (
              <button
                onClick={() => onNavigate('gst-settings')}
                className="w-full flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-left active:scale-[0.99] transition-transform"
              >
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-800">GST Registration Incomplete</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Missing: {company?.missing_fields?.join(', ')}. Tap to complete →
                  </p>
                </div>
                <Settings size={14} className="text-amber-500 shrink-0 mt-0.5" />
              </button>
            )}

            {/* Company card */}
            {compReady && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <ShieldCheck size={14} className="text-emerald-600" />
                  </div>
                  <span className="font-semibold text-gray-800 text-sm">Company — Ready to File</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <span className="text-xs text-gray-400 w-20 shrink-0">GSTIN</span>
                    <span className="text-xs font-mono font-semibold text-gray-800">{company.gstin || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-gray-400 w-20 shrink-0">Legal Name</span>
                    <span className="text-xs font-semibold text-gray-800">{company.legal_name || '—'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs text-gray-400 w-20 shrink-0">State</span>
                    <span className="text-xs text-gray-700">{company.state_code} — {company.state_name || company.state || ''}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Health scorecard */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    canExport ? 'bg-emerald-100' : 'bg-red-100'
                  }`}>
                    {canExport
                      ? <CheckCircle2 size={14} className="text-emerald-600" />
                      : <XCircle      size={14} className="text-red-500" />
                    }
                  </div>
                  <span className="font-semibold text-gray-800 text-sm">Filing Health</span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  canExport ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }`}>
                  {canExport ? 'Ready' : 'Issues Found'}
                </span>
              </div>

              {/* Stats row */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                <Pill color="blue"  label="Total"   count={health?.total}          />
                <Pill color="teal"  label="Valid"   count={health?.valid}          />
                <Pill color="amber" label="HSN"     count={health?.missing_hsn}    />
                <Pill color="amber" label="POS"     count={health?.invalid_pos}    />
                <Pill color="red"   label="Tax Err" count={health?.tax_mismatch}   />
                <Pill color="red"   label="Dupes"   count={health?.duplicate_numbers} />
              </div>
            </div>

            {/* Critical warnings */}
            {criticalWarnings.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-sm font-bold text-red-800 mb-2 flex items-center gap-1.5">
                  <XCircle size={14} /> Critical Errors — Export Blocked
                </p>
                <div className="space-y-2">
                  {criticalWarnings.slice(0, 10).map((w, i) => (
                    <div key={i} className="flex gap-2 text-xs text-red-700">
                      <SeverityIcon type={w.type} />
                      <span><span className="font-semibold">{w.invoice}</span> — {w.message}</span>
                    </div>
                  ))}
                  {criticalWarnings.length > 10 && (
                    <p className="text-xs text-red-500">…and {criticalWarnings.length - 10} more</p>
                  )}
                </div>
              </div>
            )}

            {/* Non-critical warnings */}
            {otherWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-1.5">
                  <AlertCircle size={14} /> Warnings ({otherWarnings.length})
                </p>
                <div className="space-y-2">
                  {otherWarnings.slice(0, 8).map((w, i) => (
                    <div key={i} className="flex gap-2 text-xs text-amber-700">
                      <SeverityIcon type={w.type} />
                      <span><span className="font-semibold">{w.invoice}</span> — {w.message}</span>
                    </div>
                  ))}
                  {otherWarnings.length > 8 && (
                    <p className="text-xs text-amber-500">…and {otherWarnings.length - 8} more</p>
                  )}
                </div>
              </div>
            )}

            {/* Section summary */}
            {health?.total > 0 && summary && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                    <BarChart3 size={14} className="text-blue-700" />
                  </div>
                  <span className="font-semibold text-gray-800 text-sm">Section Breakdown</span>
                </div>
                <SectionRow icon={Users}       label="B2B — Registered Buyers" color="blue"   count={summary.b2b_invoices}  taxable={summary.b2b_taxable}  />
                <SectionRow icon={TrendingUp}  label="B2CL — Large Unregistered" color="violet" count={summary.b2cl_invoices} taxable={summary.b2cl_taxable} />
                <SectionRow icon={Receipt}     label="B2CS — Small Unregistered" color="teal"   count={summary.b2cs_entries}  taxable={summary.b2cs_taxable} />
              </div>
            )}

            {/* No invoices */}
            {health?.total === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
                <Receipt size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-600">No invoices for this period</p>
                <p className="text-xs text-gray-400 mt-1">Select a different month or add invoices first.</p>
              </div>
            )}

            {/* Download buttons */}
            <div className="space-y-2.5">
              <p className="text-xs font-bold text-gray-400 tracking-widest uppercase px-1">Download</p>

              {!canExport && (
                <div className="flex gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-3 mb-1">
                  <Info size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-500">
                    Resolve critical errors above to enable downloads.
                  </p>
                </div>
              )}

              <DownloadBtn
                icon={FileSpreadsheet}
                label="Official Excel Workbook"
                sublabel="GSTR-1 Offline Utility .xlsx"
                color="green"
                disabled={!canExport}
                loading={dlLoading.excel}
                onClick={() => handleDownload('excel')}
              />
              <DownloadBtn
                icon={FileArchive}
                label="CSV Package (ZIP)"
                sublabel="One CSV per section, zipped"
                color="blue"
                disabled={!canExport}
                loading={dlLoading.csv}
                onClick={() => handleDownload('csv')}
              />
              <DownloadBtn
                icon={FileJson}
                label="GST Upload JSON"
                sublabel="Portal upload format · max 5 MB"
                color="indigo"
                disabled={!canExport}
                loading={dlLoading.json}
                onClick={() => handleDownload('json')}
              />
            </div>

            {/* GST Settings link */}
            <button
              onClick={() => onNavigate('gst-settings')}
              className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3 text-left active:scale-[0.99] transition-transform shadow-sm"
            >
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <Building2 size={15} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">GST Registration Settings</p>
                <p className="text-xs text-gray-400">Edit GSTIN, legal name, state code</p>
              </div>
              <Settings size={14} className="text-gray-300" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
