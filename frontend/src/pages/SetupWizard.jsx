import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import {
  ChevronRight, ChevronLeft, Check, SkipForward, Sparkles,
  ShieldCheck, MapPin, Building, FileText, CreditCard, Palette,
  CheckCircle2, AlertCircle, Loader2, Info
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, title: 'Tax Identity', icon: ShieldCheck, required: true, desc: 'GSTIN & PAN for compliance' },
  { number: 2, title: 'Address', icon: MapPin, required: false, desc: 'Registered business address' },
  { number: 3, title: 'Industry', icon: Building, required: false, desc: 'Category & sector' },
  { number: 4, title: 'Licenses', icon: FileText, required: false, desc: 'Compliance documents' },
  { number: 5, title: 'Invoicing', icon: CreditCard, required: false, desc: 'Billing & bank account' },
  { number: 6, title: 'Branding', icon: Palette, required: false, desc: 'Logo & colors (optional)' },
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman & Nicobar Islands', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const INDUSTRIES = [
  { label: 'Retail', categories: ['General Retail', 'Electronics', 'Apparel & Fashion', 'Books & Stationery', 'Sports & Fitness'] },
  { label: 'Food & Beverage', categories: ['Food & Beverage', 'Restaurant', 'Bakery & Sweets', 'Cloud Kitchen', 'Catering'] },
  { label: 'Healthcare', categories: ['Pharmacy', 'Clinic', 'Diagnostics', 'Healthcare', 'Ayurveda & Wellness'] },
  { label: 'Manufacturing', categories: ['Manufacturing', 'Textiles', 'Chemicals', 'Food Processing', 'Electronics Manufacturing'] },
  { label: 'Services', categories: ['IT Services', 'Consulting', 'Education', 'Services', 'Logistics & Transport'] },
  { label: 'Wholesale & Trading', categories: ['Wholesale', 'Import-Export', 'Commodity Trading'] },
];

// ─── Shared UI ────────────────────────────────────────────────────────────────

function FieldGroup({ label, required, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function WizardInput({ className = '', ...props }) {
  return (
    <input
      className={`w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all ${className}`}
      {...props}
    />
  );
}

function WizardSelect({ className = '', children, ...props }) {
  return (
    <select
      className={`w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700 rounded-xl text-sm text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

// ─── Step 1: GSTIN / PAN ───────────────────────────────────────────────────────
function Step1({ onComplete }) {
  const { showToast } = useToast();
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [gstinState, setGstinState] = useState(null); // { stateCode, stateName }
  const [gstinError, setGstinError] = useState('');
  const [panError, setPanError] = useState('');
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGstinChange = async (val) => {
    const v = val.toUpperCase().replace(/\s/g, '');
    setGstin(v);
    setGstinError('');
    setGstinState(null);
    if (v.length === 15) {
      setValidating(true);
      try {
        const result = await api.validateGSTIN(v);
        if (!result.valid) {
          setGstinError(result.error);
        } else {
          setGstinState(result.stateInfo); // { stateCode, stateName }
          // Auto-fill PAN from GSTIN (chars 2-11)
          if (!pan) setPan(v.substring(2, 12));
        }
      } catch (_) {}
      setValidating(false);
    }
  };

  const handlePanChange = async (val) => {
    const v = val.toUpperCase().replace(/\s/g, '');
    setPan(v);
    setPanError('');
    if (v.length === 10) {
      setValidating(true);
      try {
        const result = await api.validatePAN(v);
        if (!result.valid) setPanError(result.error);
      } catch (_) {}
      setValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!gstin && !pan) {
      showToast('Enter at least GSTIN or PAN', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await api.setupGstin({ gstin: gstin || undefined, pan: pan || undefined });
      onComplete(result);
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <FieldGroup label="GSTIN" hint="15-character GST Identification Number (e.g. 29ABCDE1234F1Z5)">
        <div className="relative">
          <WizardInput
            value={gstin}
            onChange={e => handleGstinChange(e.target.value)}
            placeholder="29ABCDE1234F1Z5"
            maxLength={15}
          />
          {validating && <Loader2 className="absolute right-3 top-3 w-4 h-4 text-slate-400 animate-spin" />}
        </div>
        {gstinError && (
          <p className="flex items-center gap-1.5 text-rose-400 text-xs mt-1">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {gstinError}
          </p>
        )}
        {/* Resolution 4: inline state detection chip */}
        {gstinState && (
          <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            <span className="text-xs text-green-300">
              Registered in: <strong>{gstinState.stateName}</strong> (State Code: {gstinState.stateCode})
            </span>
          </div>
        )}
      </FieldGroup>

      <FieldGroup label="PAN" hint="10-character Permanent Account Number (e.g. ABCDE1234F)">
        <WizardInput
          value={pan}
          onChange={e => handlePanChange(e.target.value)}
          placeholder="ABCDE1234F"
          maxLength={10}
        />
        {panError && (
          <p className="flex items-center gap-1.5 text-rose-400 text-xs mt-1">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {panError}
          </p>
        )}
        {gstin && pan && pan === gstin.substring(2, 12) && (
          <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="text-xs text-blue-300">PAN matches GSTIN ✓</span>
          </div>
        )}
      </FieldGroup>

      <button
        onClick={handleSubmit}
        disabled={saving || (!gstin && !pan) || !!gstinError || !!panError}
        className="w-full py-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold rounded-xl hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
        Save & Continue
      </button>
    </div>
  );
}

// ─── Step 2: Address ───────────────────────────────────────────────────────────
function Step2({ onComplete, onSkip }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ address_line1: '', address_line2: '', city: '', district: '', state: '', pincode: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.address_line1 || !form.city || !form.state || !form.pincode) {
      showToast('Fill in required address fields', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.setupAddress(form);
      onComplete();
    } catch (err) {
      showToast(err.message || 'Failed to save address', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <FieldGroup label="Address Line 1" required>
        <WizardInput value={form.address_line1} onChange={e => set('address_line1', e.target.value)} placeholder="House/Building No., Street" />
      </FieldGroup>
      <FieldGroup label="Address Line 2">
        <WizardInput value={form.address_line2} onChange={e => set('address_line2', e.target.value)} placeholder="Locality, Area (optional)" />
      </FieldGroup>
      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="City" required>
          <WizardInput value={form.city} onChange={e => set('city', e.target.value)} placeholder="Bengaluru" />
        </FieldGroup>
        <FieldGroup label="District">
          <WizardInput value={form.district} onChange={e => set('district', e.target.value)} placeholder="Bengaluru Urban" />
        </FieldGroup>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="State" required>
          <WizardSelect value={form.state} onChange={e => set('state', e.target.value)}>
            <option value="">Select state</option>
            {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </WizardSelect>
        </FieldGroup>
        <FieldGroup label="Pincode" required>
          <WizardInput value={form.pincode} onChange={e => set('pincode', e.target.value)} placeholder="560001" maxLength={6} />
        </FieldGroup>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={onSkip} className="flex-1 py-3 border border-slate-700 text-slate-400 font-medium rounded-xl hover:bg-slate-800 transition-colors text-sm flex items-center justify-center gap-2">
          <SkipForward className="w-4 h-4" /> Skip for Now
        </button>
        <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold rounded-xl hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Save & Continue
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Industry ──────────────────────────────────────────────────────────
function Step3({ onComplete, onSkip }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [industry, setIndustry] = useState('');
  const [category, setCategory] = useState('');

  const industryObj = INDUSTRIES.find(i => i.label === industry);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const result = await api.setupIndustry({ industry, business_category: category });
      onComplete(result); // passes licenseRequirements for step 4
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <FieldGroup label="Industry Group">
        <div className="grid grid-cols-2 gap-2">
          {INDUSTRIES.map(ind => (
            <button
              key={ind.label}
              onClick={() => { setIndustry(ind.label); setCategory(''); }}
              className={`px-3 py-2.5 rounded-xl border text-sm font-medium text-left transition-all ${
                industry === ind.label
                  ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {ind.label}
            </button>
          ))}
        </div>
      </FieldGroup>

      {industryObj && (
        <FieldGroup label="Business Category" hint="Determines which licenses apply to your business">
          <WizardSelect value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Select category</option>
            {industryObj.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </WizardSelect>
        </FieldGroup>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onSkip} className="flex-1 py-3 border border-slate-700 text-slate-400 font-medium rounded-xl hover:bg-slate-800 transition-colors text-sm flex items-center justify-center gap-2">
          <SkipForward className="w-4 h-4" /> Skip for Now
        </button>
        <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold rounded-xl hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Save & Continue
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Licenses ──────────────────────────────────────────────────────────
function Step4({ licenseRequirements = [], onComplete, onSkip }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [licenses, setLicenses] = useState(
    licenseRequirements.map(l => ({ license_type: l.license_type, license_number: '', expiry_date: '' }))
  );

  const updateLicense = (idx, field, val) => {
    setLicenses(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  };

  const handleSubmit = async () => {
    const filled = licenses.filter(l => l.license_number.trim());
    setSaving(true);
    try {
      await api.setupLicenses({ licenses: filled });
      onComplete();
    } catch (err) {
      showToast(err.message || 'Failed to save licenses', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (licenseRequirements.length === 0) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-300 flex items-center gap-3">
          <Info className="w-4 h-4 flex-shrink-0" />
          No specific license requirements found for your category. You can add licenses later from Company Profile.
        </div>
        <div className="flex gap-3">
          <button onClick={onSkip} className="flex-1 py-3 border border-slate-700 text-slate-400 font-medium rounded-xl hover:bg-slate-800 transition-colors text-sm flex items-center justify-center gap-2">
            <SkipForward className="w-4 h-4" /> Skip
          </button>
          <button onClick={onComplete} className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold rounded-xl flex items-center justify-center gap-2">
            <ChevronRight className="w-4 h-4" /> Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {licenses.map((lic, idx) => {
        const req = licenseRequirements[idx];
        return (
          <div key={lic.license_type} className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-white text-sm">{lic.license_type.replace(/_/g, ' ')}</p>
              {req?.is_mandatory ? (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded-full uppercase">Mandatory</span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-600/50 text-slate-400 rounded-full uppercase">Recommended</span>
              )}
            </div>
            {req?.description && <p className="text-xs text-slate-500">{req.description}</p>}
            <WizardInput
              value={lic.license_number}
              onChange={e => updateLicense(idx, 'license_number', e.target.value)}
              placeholder="License number"
            />
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Expiry Date (optional)</label>
              <WizardInput
                type="date"
                value={lic.expiry_date}
                onChange={e => updateLicense(idx, 'expiry_date', e.target.value)}
              />
            </div>
          </div>
        );
      })}
      <div className="flex gap-3 pt-2">
        <button onClick={onSkip} className="flex-1 py-3 border border-slate-700 text-slate-400 font-medium rounded-xl hover:bg-slate-800 transition-colors text-sm flex items-center justify-center gap-2">
          <SkipForward className="w-4 h-4" /> Skip for Now
        </button>
        <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold rounded-xl hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Save & Continue
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: Invoice Basics ────────────────────────────────────────────────────
function Step5({ onComplete, onSkip }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [invoicePrefix, setInvoicePrefix] = useState('INV');
  const [gstRate, setGstRate] = useState(18);
  const [addBank, setAddBank] = useState(false);
  const [bank, setBank] = useState({ bank_name: '', account_holder_name: '', account_number: '', ifsc: '', branch_name: '' });
  const setB = (k, v) => setBank(b => ({ ...b, [k]: v }));

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.setupInvoice({
        invoice_prefix: invoicePrefix,
        default_gst_rate: parseFloat(gstRate),
        bank: addBank && bank.bank_name ? bank : undefined,
      });
      onComplete();
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <FieldGroup label="Invoice Prefix" hint="e.g. INV, BILL, TAX">
          <WizardInput value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value.toUpperCase())} maxLength={10} />
        </FieldGroup>
        <FieldGroup label="Default GST Rate %">
          <WizardSelect value={gstRate} onChange={e => setGstRate(e.target.value)}>
            {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
          </WizardSelect>
        </FieldGroup>
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
          <input type="checkbox" checked={addBank} onChange={e => setAddBank(e.target.checked)} className="rounded" />
          Add primary bank account (for invoices)
        </label>
      </div>

      {addBank && (
        <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-3">
          <FieldGroup label="Bank Name" required>
            <WizardInput value={bank.bank_name} onChange={e => setB('bank_name', e.target.value)} placeholder="State Bank of India" />
          </FieldGroup>
          <FieldGroup label="Account Holder Name" required>
            <WizardInput value={bank.account_holder_name} onChange={e => setB('account_holder_name', e.target.value)} placeholder="Business Legal Name" />
          </FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Account Number" required>
              <WizardInput value={bank.account_number} onChange={e => setB('account_number', e.target.value)} placeholder="XXXXXXXXXXXX" />
            </FieldGroup>
            <FieldGroup label="IFSC Code" required>
              <WizardInput value={bank.ifsc} onChange={e => setB('ifsc', e.target.value.toUpperCase())} placeholder="SBIN0001234" maxLength={11} />
            </FieldGroup>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onSkip} className="flex-1 py-3 border border-slate-700 text-slate-400 font-medium rounded-xl hover:bg-slate-800 transition-colors text-sm flex items-center justify-center gap-2">
          <SkipForward className="w-4 h-4" /> Skip for Now
        </button>
        <button onClick={handleSubmit} disabled={saving} className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold rounded-xl hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Save & Continue
        </button>
      </div>
    </div>
  );
}

// ─── Step 6: Branding ──────────────────────────────────────────────────────────
function Step6({ onComplete, onSkip }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [logo, setLogo] = useState('');
  const [color, setColor] = useState('#2563EB');

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setLogo(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleComplete = async (skip = false) => {
    setSaving(true);
    try {
      await api.setupBranding({ skip, logo_url: logo || undefined, brand_color: color });
      onComplete();
    } catch (err) {
      showToast(err.message || 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <FieldGroup label="Company Logo" hint="Upload your logo (PNG, JPG). Will appear on invoices.">
        <div className="flex items-center gap-4">
          {logo ? (
            <img src={logo} alt="logo" className="w-16 h-16 object-contain rounded-xl border border-slate-700 bg-slate-800 p-1" />
          ) : (
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center text-slate-500">
              <Palette className="w-6 h-6" />
            </div>
          )}
          <label className="cursor-pointer px-4 py-2 border border-slate-700 rounded-xl text-sm text-slate-300 hover:bg-slate-800 transition-colors">
            Choose File
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
          </label>
        </div>
      </FieldGroup>

      <FieldGroup label="Brand Color" hint="Used as accent color on invoices and reports">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="w-12 h-12 rounded-lg border border-slate-700 cursor-pointer bg-slate-900"
          />
          <span className="text-slate-400 text-sm font-mono">{color}</span>
          <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: color }} />
        </div>
      </FieldGroup>

      <div className="flex gap-3 pt-2">
        <button onClick={() => handleComplete(true)} disabled={saving} className="flex-1 py-3 border border-slate-700 text-slate-400 font-medium rounded-xl hover:bg-slate-800 transition-colors text-sm flex items-center justify-center gap-2">
          <SkipForward className="w-4 h-4" /> Skip for Now
        </button>
        <button onClick={() => handleComplete(false)} disabled={saving} className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold rounded-xl hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Complete Setup
        </button>
      </div>
    </div>
  );
}

// ─── Main Setup Wizard ─────────────────────────────────────────────────────────
export default function SetupWizard({ onNavigate }) {
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [licenseRequirements, setLicenseRequirements] = useState([]);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const markDone = (s) => setCompletedSteps(prev => new Set([...prev, s]));

  const handleStepComplete = (s, data) => {
    markDone(s);
    if (s < 6) {
      setStep(s + 1);
    } else {
      showToast('Setup complete! Welcome to your dashboard.', 'success');
      onNavigate('home');
    }
  };

  const handleSkip = (s) => {
    if (s < 6) setStep(s + 1);
    else {
      showToast('Setup skipped. You can complete it anytime from Company Profile.', 'info');
      onNavigate('home');
    }
  };

  const completionPct = Math.round((completedSteps.size / 6) * 100);

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 font-sans relative overflow-hidden">
      {/* Background */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-600/15 blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              <span className="text-white font-bold text-sm">Company Setup</span>
            </div>
            <button
              onClick={() => { onNavigate('home'); showToast('You can complete setup from Company Profile.', 'info'); }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Complete later
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2">
            <div
              className="bg-gradient-to-r from-blue-500 to-violet-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(((step - 1) / 6) * 100, 4)}%` }}
            />
          </div>

          {/* Step dots */}
          <div className="flex items-center justify-between">
            {STEPS.map(s => (
              <button
                key={s.number}
                onClick={() => s.number < step && setStep(s.number)}
                className="flex flex-col items-center gap-0.5"
                disabled={s.number > step}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                  completedSteps.has(s.number)
                    ? 'bg-green-500 text-white'
                    : s.number === step
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-1 ring-offset-slate-900'
                    : s.number < step
                    ? 'bg-slate-600 text-slate-300'
                    : 'bg-slate-800 text-slate-600'
                }`}>
                  {completedSteps.has(s.number) ? <Check className="w-3 h-3" /> : s.number}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-lg mx-auto">
          {/* Step Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              {React.createElement(STEPS[step - 1].icon, { className: 'w-5 h-5 text-blue-400' })}
              <h2 className="text-xl font-bold text-white">{STEPS[step - 1].title}</h2>
              {!STEPS[step - 1].required && (
                <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full ml-1">Optional</span>
              )}
            </div>
            <p className="text-sm text-slate-400">{STEPS[step - 1].desc}</p>
          </div>

          {/* Step Content */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
            {step === 1 && (
              <Step1 onComplete={(data) => {
                setLicenseRequirements([]);
                handleStepComplete(1, data);
              }} />
            )}
            {step === 2 && (
              <Step2
                onComplete={() => handleStepComplete(2)}
                onSkip={() => handleSkip(2)}
              />
            )}
            {step === 3 && (
              <Step3
                onComplete={(data) => {
                  if (data?.licenseRequirements) setLicenseRequirements(data.licenseRequirements);
                  handleStepComplete(3, data);
                }}
                onSkip={() => handleSkip(3)}
              />
            )}
            {step === 4 && (
              <Step4
                licenseRequirements={licenseRequirements}
                onComplete={() => handleStepComplete(4)}
                onSkip={() => handleSkip(4)}
              />
            )}
            {step === 5 && (
              <Step5
                onComplete={() => handleStepComplete(5)}
                onSkip={() => handleSkip(5)}
              />
            )}
            {step === 6 && (
              <Step6
                onComplete={() => handleStepComplete(6)}
                onSkip={() => handleSkip(6)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
