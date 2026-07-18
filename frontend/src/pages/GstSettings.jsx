import React, { useEffect, useState } from 'react';
import {
  Building2, FileText, CreditCard, MapPin, Hash, CheckCircle2,
  AlertCircle, Save, ChevronLeft, Loader2, Info
} from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../components/ToastContext';

import { useGstStates } from '../hooks/useGstStates';

// Indian GST state codes reference


const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function isValidGSTIN(v) {
  return GSTIN_REGEX.test((v || '').trim().toUpperCase());
}

function StatusBadge({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
      ok ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
    }`}>
      {ok
        ? <CheckCircle2 size={11} />
        : <AlertCircle size={11} />
      }
      {label}
    </span>
  );
}

function FormField({ label, required, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-inkB dark:text-inkB-dark uppercase tracking-wide mb-1">
        {label} {required && <span className="text-red-500 dark:text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

export default function GstSettings({ onNavigate }) {
  const { showToast } = useToast();
  const { states: GST_STATES } = useGstStates();

  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [form,    setForm]      = useState({
    gstin:       '',
    legal_name:  '',
    trade_name:  '',
    pan:         '',
    state_code:  '',
    state:       '',
    address:     '',
    pincode:     '',
    company_name:'',
    phone:       '',
    email:       '',
    default_hsn_prefix: '',
    is_gst_registered: 1,
  });
  const [gstinError, setGstinError] = useState('');

  useEffect(() => {
    api.getCompanySettings()
      .then(data => {
        setForm(prev => ({
          ...prev,
          ...data,
          // null means the column existed before Migration V9 — default to registered (1)
          is_gst_registered: data.is_gst_registered != null ? data.is_gst_registered : 1,
        }));
      })
      .catch(() => showToast('Could not load company settings', 'error'))
      .finally(() => setLoading(false));
  }, []);

  function handleChange(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };

      // Auto-fill PAN from GSTIN (chars 3–12)
      if (field === 'gstin') {
        const v = value.trim().toUpperCase();
        if (isValidGSTIN(v)) {
          next.pan        = v.slice(2, 12);
          next.state_code = v.slice(0, 2);
          // Auto-select state name
          const stateObj = GST_STATES.find(s => s.code === v.slice(0, 2));
          if (stateObj) next.state = stateObj.name;
          setGstinError('');
        } else if (v.length === 15) {
          setGstinError('Invalid GSTIN format');
        } else {
          setGstinError('');
        }
        next.gstin = v;
      }

      // Auto-fill state_code when state selected from dropdown
      if (field === 'state_code') {
        const stateObj = GST_STATES.find(s => s.code === value);
        if (stateObj) next.state = stateObj.name;
      }

      return next;
    });
  }

  async function handleSave() {
    if (form.is_gst_registered) {
      if (!form.gstin) return showToast('GSTIN is required for GST-registered business', 'error');
      if (!isValidGSTIN(form.gstin)) return showToast('Invalid GSTIN format', 'error');
      if (!form.legal_name) return showToast('Legal name is required', 'error');
      if (!form.state_code) return showToast('State is required', 'error');
    }

    setSaving(true);
    try {
      await api.updateCompanySettings({
        ...form,
        is_gst_registered: form.is_gst_registered ? 1 : 0,
      });
      showToast(
        form.is_gst_registered ? 'GST Registration saved successfully' : 'Company settings saved',
        'success'
      );
    } catch (e) {
      showToast(e.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  const gstinValid    = isValidGSTIN(form.gstin);
  const isGstReg      = !!form.is_gst_registered;
  const allRequired   = !isGstReg || (gstinValid && form.legal_name && form.state_code && form.pan);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-blue-600 dark:text-blue-400" size={32} />
      </div>
    );
  }

  return (
    <div className="pb-28 min-h-screen bg-panel2 dark:bg-panel2-dark">
      {/* Header */}
      <div className="bg-panel dark:bg-panel-dark px-5 pt-12 pb-5 border-b border-edge dark:border-edge-dark sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => onNavigate('more')}
            className="p-1.5 rounded-xl text-inkB dark:text-inkB-dark hover:bg-panel2 dark:hover:bg-panel2-dark transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-inkA dark:text-inkA-dark">GST Registration</h1>
            <p className="text-xs text-inkB dark:text-inkB-dark">Required for GSTR-1 filing exports</p>
          </div>
        </div>

      {/* Header status badges — only shown when GST registered */}
        {isGstReg && (
          <div className="mt-3 flex items-center gap-2">
            <StatusBadge ok={gstinValid}          label="GSTIN" />
            <StatusBadge ok={!!form.legal_name}   label="Legal Name" />
            <StatusBadge ok={!!form.state_code}   label="State" />
            <StatusBadge ok={!!form.pan}           label="PAN" />
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* GST Registration Toggle */}
        <div className="bg-panel dark:bg-panel-dark rounded-2xl shadow-sm border border-edge dark:border-edge-dark p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-inkA dark:text-inkA-dark text-sm">GST Registered Business</p>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Enable GST calculations and GSTR-1 filing exports</p>
            </div>
            <button
              type="button"
              id="gst-registered-toggle"
              onClick={() => handleChange('is_gst_registered', isGstReg ? 0 : 1)}
              className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isGstReg ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-panel dark:bg-panel-dark shadow transition duration-200 ease-in-out ${
                  isGstReg ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {!isGstReg && (
            <div className="mt-3 flex gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-xl p-3">
              <Info size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                This business is not GST registered. GST calculations and filing are disabled.
                Sales will be recorded without any tax calculations.
              </p>
            </div>
          )}
        </div>

        {/* Info banner — only when GST registered and incomplete */}
        {isGstReg && !allRequired && (
          <div className="flex gap-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-2xl p-3.5">
            <Info size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Complete all required fields below before downloading GSTR-1 exports.
              These details appear on every filing document.
            </p>
          </div>
        )}

        {/* GSTIN & Tax IDs — only shown when GST registered */}
        {isGstReg && (
          <div className="bg-panel dark:bg-panel-dark rounded-2xl shadow-sm border border-edge dark:border-edge-dark p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center">
                <Hash size={14} className="text-blue-700 dark:text-blue-400" />
              </div>
              <span className="font-semibold text-inkA dark:text-inkA-dark text-sm">Tax Identifiers</span>
            </div>

            <FormField label="GSTIN" required hint="15-character GST Identification Number. PAN & state code auto-fill.">
              <input
                type="text"
                value={form.gstin}
                maxLength={15}
                onChange={e => handleChange('gstin', e.target.value)}
                placeholder="e.g. 29AABCU9603R1ZX"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-mono tracking-widest focus:outline-none focus:ring-2 transition-all ${
                  gstinError
                    ? 'border-red-300 focus:ring-red-200 bg-red-50 dark:bg-red-500/10'
                    : gstinValid
                    ? 'border-emerald-300 focus:ring-emerald-200 bg-emerald-50 dark:bg-emerald-500/10'
                    : 'border-edge dark:border-edge-dark focus:ring-blue-200'
                }`}
              />
              {gstinError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{gstinError}</p>}
            </FormField>

            <FormField label="PAN" hint="Auto-derived from GSTIN (chars 3–12). Edit only if different.">
              <input
                type="text"
                value={form.pan}
                maxLength={10}
                onChange={e => handleChange('pan', e.target.value.toUpperCase())}
                placeholder="AABCU9603R"
                className="w-full px-3.5 py-2.5 rounded-xl border border-edge dark:border-edge-dark text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </FormField>
          </div>
        )}

        {/* Business Names — always shown */}
        <div className="bg-panel dark:bg-panel-dark rounded-2xl shadow-sm border border-edge dark:border-edge-dark p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
              <Building2 size={14} className="text-violet-700 dark:text-violet-400" />
            </div>
            <span className="font-semibold text-inkA dark:text-inkA-dark text-sm">Business Names</span>
          </div>

          <FormField label="Legal Name" required hint="Registered name on GST certificate.">
            <input
              type="text"
              value={form.legal_name}
              onChange={e => handleChange('legal_name', e.target.value)}
              placeholder="XYZ ENTERPRISES PVT LTD"
              className="w-full px-3.5 py-2.5 rounded-xl border border-edge dark:border-edge-dark text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </FormField>

          <FormField label="Trade Name" hint="Name used in business (may differ from legal name).">
            <input
              type="text"
              value={form.trade_name}
              onChange={e => handleChange('trade_name', e.target.value)}
              placeholder="XYZ Store"
              className="w-full px-3.5 py-2.5 rounded-xl border border-edge dark:border-edge-dark text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </FormField>

          <FormField label="Display / Company Name" hint="Used throughout the app.">
            <input
              type="text"
              value={form.company_name}
              onChange={e => handleChange('company_name', e.target.value)}
              placeholder="My Shop"
              className="w-full px-3.5 py-2.5 rounded-xl border border-edge dark:border-edge-dark text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </FormField>
        </div>

        {/* Location — state is always relevant, but required label only for GST registered */}
        <div className="bg-panel dark:bg-panel-dark rounded-2xl shadow-sm border border-edge dark:border-edge-dark p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-500/15 flex items-center justify-center">
              <MapPin size={14} className="text-teal-700 dark:text-teal-400" />
            </div>
            <span className="font-semibold text-inkA dark:text-inkA-dark text-sm">Location</span>
          </div>

          <FormField label="State" required={isGstReg} hint={isGstReg ? 'Your GST registration state — determines IGST vs CGST/SGST.' : 'Your business state.'}>
            <select
              value={form.state_code}
              onChange={e => handleChange('state_code', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-edge dark:border-edge-dark text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-panel dark:bg-panel-dark transition-all"
            >
              <option value="">Select state…</option>
              {GST_STATES.map(s => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Business Address">
            <textarea
              value={form.address}
              onChange={e => handleChange('address', e.target.value)}
              rows={3}
              placeholder="Shop / building address"
              className="w-full px-3.5 py-2.5 rounded-xl border border-edge dark:border-edge-dark text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none transition-all"
            />
          </FormField>

          <FormField label="Pincode">
            <input
              type="text"
              value={form.pincode}
              maxLength={6}
              onChange={e => handleChange('pincode', e.target.value.replace(/\D/g,''))}
              placeholder="560001"
              className="w-full px-3.5 py-2.5 rounded-xl border border-edge dark:border-edge-dark text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </FormField>
        </div>

        {/* Contact */}
        <div className="bg-panel dark:bg-panel-dark rounded-2xl shadow-sm border border-edge dark:border-edge-dark p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-500/15 flex items-center justify-center">
              <FileText size={14} className="text-orange-700 dark:text-orange-400" />
            </div>
            <span className="font-semibold text-inkA dark:text-inkA-dark text-sm">Contact & Defaults</span>
          </div>

          <FormField label="Phone">
            <input
              type="tel"
              value={form.phone}
              onChange={e => handleChange('phone', e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full px-3.5 py-2.5 rounded-xl border border-edge dark:border-edge-dark text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </FormField>

          <FormField label="Email">
            <input
              type="email"
              value={form.email}
              onChange={e => handleChange('email', e.target.value)}
              placeholder="gst@myshop.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-edge dark:border-edge-dark text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </FormField>

          <FormField label="Default HSN Prefix" hint="Used to pre-fill HSN codes for new products.">
            <input
              type="text"
              value={form.default_hsn_prefix}
              onChange={e => handleChange('default_hsn_prefix', e.target.value)}
              placeholder="e.g. 0901"
              className="w-full px-3.5 py-2.5 rounded-xl border border-edge dark:border-edge-dark text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </FormField>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving…' : 'Save GST Registration'}
        </button>
      </div>
    </div>
  );
}
