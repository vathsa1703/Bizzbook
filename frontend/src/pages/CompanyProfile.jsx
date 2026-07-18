import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../context/AuthContext';
import {
  Building2, ChevronLeft, ShieldCheck, MapPin, FileText, CreditCard,
  Palette, Lock, Crown, Plus, Edit2, Trash2, Check, X, AlertTriangle,
  CheckCircle2, Clock, RefreshCw, XCircle, Loader2, Bell, ChevronRight,
  Users, Globe, Calendar, Hash, BadgeCheck, Briefcase, Phone, Mail,
  DollarSign, Settings, Eye, EyeOff
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',   label: 'Overview',    icon: Building2 },
  { id: 'identity',   label: 'Business',    icon: BadgeCheck },
  { id: 'addresses',  label: 'Addresses',   icon: MapPin },
  { id: 'licenses',   label: 'Licenses',    icon: FileText },
  { id: 'bank',       label: 'Banking',     icon: CreditCard },
  { id: 'finance',    label: 'Finance',     icon: DollarSign },
  { id: 'branding',   label: 'Branding',    icon: Palette },
  { id: 'security',   label: 'Security',    icon: Lock },
  { id: 'subscription', label: 'Plan',      icon: Crown },
];

const STATUS_BADGE = {
  active: { label: 'Active', cls: 'bg-green-100 dark:bg-green-500/15 dark:bg-green-500/20 text-green-600 dark:text-green-400 dark:text-green-400' },
  expired: { label: 'Expired', cls: 'bg-red-100 dark:bg-red-500/15 dark:bg-red-500/20 text-red-600 dark:text-red-400 dark:text-red-400' },
  pending_renewal: { label: 'Renew Soon', cls: 'bg-amber-100 dark:bg-amber-500/15 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 dark:text-amber-400' },
};

const BUSINESS_TYPES = [
  { value: 'proprietorship', label: 'Proprietorship' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'llp', label: 'LLP' },
  { value: 'pvt_ltd', label: 'Pvt Ltd' },
  { value: 'public_ltd', label: 'Public Ltd' },
  { value: 'opc', label: 'OPC' },
];

const LICENSE_TYPES = [
  'GSTIN','PAN','CIN','LLPIN','UDYAM','TAN','IEC',
  'FSSAI','DRUG_LICENSE','TRADE_LICENSE','SHOP_ESTABLISHMENT',
  'PROFESSIONAL_TAX','EPFO','ESIC',
];

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
  'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
  'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman & Nicobar Islands','Chandigarh','Dadra & Nagar Haveli and Daman & Diu',
  'Delhi','Jammu & Kashmir','Ladakh','Lakshadweep','Puducherry',
];

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Label({ children, required }) {
  return (
    <label className="block text-xs font-semibold text-inkB dark:text-inkB-dark uppercase tracking-wider mb-1">
      {children} {required && <span className="text-rose-600 dark:text-rose-400">*</span>}
    </label>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      {children}
    </div>
  );
}

function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full px-3 py-2 bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-lg text-sm text-inkA dark:text-inkA-dark placeholder-gray-400 dark:placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all ${className}`}
      {...props}
    />
  );
}

function Select({ children, className = '', ...props }) {
  return (
    <select
      className={`w-full px-3 py-2 bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-lg text-sm text-inkA dark:text-inkA-dark outline-none focus:border-blue-500 transition-all ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

function SaveButton({ loading, onClick, children = 'Save Changes' }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      {children}
    </button>
  );
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 mb-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-inkA dark:text-inkA-dark">{title}</h3>
          {subtitle && <p className="text-xs text-inkB dark:text-inkB-dark mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ExpiryAlertBanner({ alerts, onDismiss }) {
  if (!alerts?.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {alerts.map(alert => (
        <div key={alert.id} className="flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 dark:border-amber-500/30 rounded-xl">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {alert.license_type.replace(/_/g, ' ')} expires in {alert.days_until_expiry} day{alert.days_until_expiry !== 1 ? 's' : ''}
              </p>
              {alert.license_number && (
                <p className="text-xs text-amber-600 dark:text-amber-400 dark:text-amber-400/70">#{alert.license_number} · Expires {alert.expiry_date}</p>
              )}
            </div>
          </div>
          <button onClick={() => onDismiss(alert.id)} className="text-amber-500 dark:text-amber-400 hover:text-amber-300 ml-4">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────
function OverviewTab({ data }) {
  const { company, setupProgress, expiryAlerts, setupCompletionPct } = data;
  const { showToast } = useToast();

  const handleDismiss = async (id) => {
    try {
      await api.dismissLicenseAlert(id);
    } catch (_) {}
  };

  const initials = (company?.name || 'CO').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      <ExpiryAlertBanner alerts={expiryAlerts} onDismiss={handleDismiss} />

      {/* Company card */}
      <div className="bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-blue-200 dark:border-blue-500/25 dark:border-blue-500/20 rounded-2xl p-5">
        <div className="flex items-start gap-4">
          {data.branding?.logo_url ? (
            <img src={data.branding.logo_url} alt="logo" className="w-16 h-16 rounded-xl object-contain border border-edge dark:border-edge-dark bg-panel2 dark:bg-panel2-dark p-1" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-inkA dark:text-inkA-dark truncate">{company?.name}</h2>
            {company?.legal_business_name && company.legal_business_name !== company.name && (
              <p className="text-xs text-inkB dark:text-inkB-dark">{company.legal_business_name}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {company?.company_code && (
                <span className="text-[11px] font-mono bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark px-2 py-0.5 rounded">{company.company_code}</span>
              )}
              <span className="text-[11px] bg-green-100 dark:bg-green-500/15 dark:bg-green-500/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded font-medium">Active</span>
              {company?.business_type && (
                <span className="text-[11px] bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark px-2 py-0.5 rounded capitalize">{company.business_type}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {company?.gstin && (
            <div>
              <p className="text-[11px] text-inkB dark:text-inkB-dark uppercase font-semibold">GSTIN</p>
              <p className="text-sm text-inkA dark:text-inkA-dark font-mono">{company.gstin}</p>
            </div>
          )}
          {company?.pan && (
            <div>
              <p className="text-[11px] text-inkB dark:text-inkB-dark uppercase font-semibold">PAN</p>
              <p className="text-sm text-inkA dark:text-inkA-dark font-mono">{company.pan}</p>
            </div>
          )}
        </div>
      </div>

      {/* Setup completion */}
      <SectionCard title="Setup Progress" subtitle={`${setupCompletionPct}% complete`}>
        <div className="w-full bg-panel2 dark:bg-panel2-dark rounded-full h-2 mb-3">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-700"
            style={{ width: `${setupCompletionPct}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(setupProgress || []).map(step => (
            <div key={step.step_number} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 ${
              step.status === 'completed' ? 'bg-green-500/15 text-green-600 dark:text-green-400' :
              step.status === 'skipped' ? 'bg-panel2 dark:bg-panel2-dark text-inkB dark:text-inkB-dark' :
              'bg-panel2 dark:bg-panel2-dark text-gray-400 dark:text-slate-500'
            }`}>
              {step.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> :
               step.status === 'skipped' ? <SkipForwardIcon className="w-3 h-3" /> :
               <Clock className="w-3 h-3" />}
              Step {step.step_number}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Addresses', value: data.addresses?.length || 0, icon: MapPin },
          { label: 'Licenses', value: data.licenses?.length || 0, icon: FileText },
          { label: 'Bank Accounts', value: data.bankAccounts?.length || 0, icon: CreditCard },
          { label: 'Expiry Alerts', value: data.expiryAlerts?.length || 0, icon: Bell },
        ].map(stat => (
          <div key={stat.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 flex items-center gap-3">
            <stat.icon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-xl font-bold text-inkA dark:text-inkA-dark">{stat.value}</p>
              <p className="text-xs text-inkB dark:text-inkB-dark">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkipForwardIcon({ className }) {
  return <ChevronRight className={className} />;
}

// ─── Tab: Business Identity ────────────────────────────────────────────────────
function IdentityTab({ data, onRefresh }) {
  const { showToast } = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.company) setForm({ ...data.company });
  }, [data]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateCompanyProfile(form);
      showToast('Business profile updated', 'success');
      onRefresh();
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Legal Identity" subtitle="Core registration details">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <Field label="Business Name (Display Name)" required>
              <Input value={form.name || ''} onChange={e => set('name', e.target.value)} />
            </Field>
            <Field label="Legal Business Name">
              <Input value={form.legal_business_name || ''} onChange={e => set('legal_business_name', e.target.value)} placeholder="As per MCA/GST registration" />
            </Field>
            <Field label="Trade Name">
              <Input value={form.trade_name || ''} onChange={e => set('trade_name', e.target.value)} placeholder="Brand or trade name" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Business Type">
              <Select value={form.business_type || ''} onChange={e => set('business_type', e.target.value)}>
                {BUSINESS_TYPES.map(bt => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
              </Select>
            </Field>
            <Field label="Registration Type">
              <Select value={form.registration_type || 'regular'} onChange={e => set('registration_type', e.target.value)}>
                <option value="regular">Regular</option>
                <option value="composition">Composition</option>
                <option value="unregistered">Unregistered</option>
                <option value="casual">Casual</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="GSTIN">
              <Input value={form.gstin || ''} onChange={e => set('gstin', e.target.value.toUpperCase())} maxLength={15} placeholder="29ABCDE1234F1Z5" className="font-mono" />
            </Field>
            <Field label="PAN">
              <Input value={form.pan || ''} onChange={e => set('pan', e.target.value.toUpperCase())} maxLength={10} placeholder="ABCDE1234F" className="font-mono" />
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Business Details">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Industry">
              <Input value={form.industry || ''} onChange={e => set('industry', e.target.value)} />
            </Field>
            <Field label="Business Category">
              <Input value={form.business_category || ''} onChange={e => set('business_category', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of Incorporation">
              <Input type="date" value={form.date_of_incorporation || ''} onChange={e => set('date_of_incorporation', e.target.value)} />
            </Field>
            <Field label="NIC Code">
              <Input value={form.nic_code || ''} onChange={e => set('nic_code', e.target.value)} placeholder="e.g. 47110" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Business Size">
              <Select value={form.business_size_bracket || ''} onChange={e => set('business_size_bracket', e.target.value)}>
                <option value="">Select range</option>
                {['1-10','11-50','51-200','201-500','500+'].map(s => <option key={s} value={s}>{s} employees</option>)}
              </Select>
            </Field>
            <Field label="Annual Turnover">
              <Select value={form.turnover_bracket || ''} onChange={e => set('turnover_bracket', e.target.value)}>
                <option value="">Select range</option>
                {['<20L','20L-1Cr','1Cr-5Cr','5Cr-25Cr','25Cr+'].map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
            </Field>
            <Field label="Website">
              <Input value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://..." />
            </Field>
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton loading={saving} onClick={handleSave} />
      </div>
    </div>
  );
}

// ─── Tab: Addresses ────────────────────────────────────────────────────────────
function AddressesTab({ data, onRefresh }) {
  const { showToast } = useToast();
  const [addresses, setAddresses] = useState(data?.addresses || []);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ address_type: 'registered', address_line1: '', city: '', state: '', pincode: '', is_primary: false });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { setAddresses(data?.addresses || []); }, [data]);

  const openNew = () => { setEditId(null); setForm({ address_type: 'registered', address_line1: '', city: '', state: '', pincode: '', is_primary: false }); setShowForm(true); };
  const openEdit = (addr) => { setEditId(addr.id); setForm({ ...addr }); setShowForm(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editId) await api.updateCompanyAddress(editId, form);
      else await api.addCompanyAddress(form);
      showToast('Address saved', 'success');
      setShowForm(false);
      onRefresh();
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this address?')) return;
    try {
      await api.deleteCompanyAddress(id);
      showToast('Address deleted', 'success');
      onRefresh();
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
  };

  return (
    <div className="space-y-3">
      {addresses.map(addr => (
        <div key={addr.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark px-2 py-0.5 rounded">{addr.address_type}</span>
                {addr.is_primary ? <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">Primary</span> : null}
              </div>
              <p className="text-sm text-inkA dark:text-inkA-dark">{addr.address_line1}</p>
              {addr.address_line2 && <p className="text-xs text-inkB dark:text-inkB-dark">{addr.address_line2}</p>}
              <p className="text-xs text-inkB dark:text-inkB-dark">{addr.city}, {addr.district ? addr.district + ', ' : ''}{addr.state} - {addr.pincode}</p>
              {addr.gstin && <p className="text-xs text-inkB dark:text-inkB-dark font-mono mt-1">Branch GSTIN: {addr.gstin}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(addr)} className="p-1.5 text-inkB dark:text-inkB-dark hover:text-inkA dark:hover:text-white transition-colors"><Edit2 className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(addr.id)} className="p-1.5 text-inkB dark:text-inkB-dark hover:text-rose-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ))}

      <button onClick={openNew} className="w-full py-3 border-2 border-dashed border-edge dark:border-edge-dark rounded-xl text-inkB dark:text-inkB-dark hover:border-blue-600 hover:text-blue-400 transition-colors text-sm flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Add Address
      </button>

      {showForm && (
        <div className="bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-2xl p-5 space-y-4">
          <h4 className="font-bold text-inkA dark:text-inkA-dark text-sm">{editId ? 'Edit' : 'New'} Address</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={form.address_type} onChange={e => set('address_type', e.target.value)}>
                {['registered','branch','billing','shipping','warehouse'].map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Primary">
              <label className="flex items-center gap-2 mt-2 cursor-pointer text-sm text-inkB dark:text-inkB-dark">
                <input type="checkbox" checked={form.is_primary} onChange={e => set('is_primary', e.target.checked)} /> Set as primary
              </label>
            </Field>
          </div>
          <Field label="Address Line 1" required><Input value={form.address_line1||''} onChange={e => set('address_line1', e.target.value)} /></Field>
          <Field label="Address Line 2"><Input value={form.address_line2||''} onChange={e => set('address_line2', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" required><Input value={form.city||''} onChange={e => set('city', e.target.value)} /></Field>
            <Field label="District"><Input value={form.district||''} onChange={e => set('district', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State" required>
              <Select value={form.state||''} onChange={e => set('state', e.target.value)}>
                <option value="">Select state</option>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Pincode" required><Input value={form.pincode||''} onChange={e => set('pincode', e.target.value)} maxLength={6} /></Field>
          </div>
          <Field label="Branch GSTIN (optional)"><Input value={form.gstin||''} onChange={e => set('gstin', e.target.value.toUpperCase())} className="font-mono" /></Field>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 border border-edge dark:border-edge-dark text-inkB dark:text-inkB-dark rounded-lg text-sm hover:bg-panel2 dark:hover:bg-panel2-dark">Cancel</button>
            <SaveButton loading={saving} onClick={handleSave} children="Save Address" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Licenses ─────────────────────────────────────────────────────────────
function LicensesTab({ data, onRefresh }) {
  const { showToast } = useToast();
  const [licenses, setLicenses] = useState(data?.licenses || []);
  const [alerts, setAlerts] = useState(data?.expiryAlerts || []);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ license_type: 'FSSAI', license_number: '', issue_date: '', expiry_date: '', issuing_authority: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { setLicenses(data?.licenses || []); setAlerts(data?.expiryAlerts || []); }, [data]);

  const handleDismiss = async (id) => {
    try {
      await api.dismissLicenseAlert(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
      showToast('Alert dismissed', 'success');
    } catch (_) {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.addCompanyLicense(form);
      showToast('License added', 'success');
      setShowForm(false);
      onRefresh();
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this license?')) return;
    try {
      await api.deleteCompanyLicense(id);
      showToast('License deleted', 'success');
      onRefresh();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const getLicenseBadge = (lic) => {
    if (!lic.expiry_date) return STATUS_BADGE.active;
    const days = Math.ceil((new Date(lic.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
    if (days < 0) return STATUS_BADGE.expired;
    if (days <= 30) return STATUS_BADGE.pending_renewal;
    return STATUS_BADGE.active;
  };

  return (
    <div className="space-y-3">
      <ExpiryAlertBanner alerts={alerts} onDismiss={handleDismiss} />

      {licenses.map(lic => {
        const badge = getLicenseBadge(lic);
        return (
          <div key={lic.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark px-2 py-0.5 rounded">{lic.license_type.replace(/_/g, ' ')}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                </div>
                {lic.license_number && <p className="text-sm text-inkA dark:text-inkA-dark font-mono">{lic.license_number}</p>}
                {lic.issuing_authority && <p className="text-xs text-inkB dark:text-inkB-dark">{lic.issuing_authority}</p>}
                <div className="flex gap-3 mt-1">
                  {lic.issue_date && <span className="text-xs text-inkB dark:text-inkB-dark">Issued: {lic.issue_date}</span>}
                  {lic.expiry_date && <span className={`text-xs font-medium ${badge === STATUS_BADGE.expired ? 'text-red-600 dark:text-red-400' : badge === STATUS_BADGE.pending_renewal ? 'text-amber-600 dark:text-amber-400' : 'text-inkB dark:text-inkB-dark'}`}>Expires: {lic.expiry_date}</span>}
                </div>
              </div>
              <button onClick={() => handleDelete(lic.id)} className="p-1.5 text-inkB dark:text-inkB-dark hover:text-rose-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        );
      })}

      <button onClick={() => setShowForm(true)} className="w-full py-3 border-2 border-dashed border-edge dark:border-edge-dark rounded-xl text-inkB dark:text-inkB-dark hover:border-blue-600 hover:text-blue-400 transition-colors text-sm flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Add License
      </button>

      {showForm && (
        <div className="bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-2xl p-5 space-y-4">
          <h4 className="font-bold text-inkA dark:text-inkA-dark text-sm">Add License</h4>
          <Field label="License Type" required>
            <Select value={form.license_type} onChange={e => set('license_type', e.target.value)}>
              {LICENSE_TYPES.map(lt => <option key={lt} value={lt}>{lt.replace(/_/g, ' ')}</option>)}
            </Select>
          </Field>
          <Field label="License Number"><Input value={form.license_number} onChange={e => set('license_number', e.target.value)} className="font-mono" /></Field>
          <Field label="Issuing Authority"><Input value={form.issuing_authority} onChange={e => set('issuing_authority', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue Date"><Input type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} /></Field>
            <Field label="Expiry Date"><Input type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} /></Field>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 border border-edge dark:border-edge-dark text-inkB dark:text-inkB-dark rounded-lg text-sm hover:bg-panel2 dark:hover:bg-panel2-dark">Cancel</button>
            <SaveButton loading={saving} onClick={handleSave} children="Add License" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Bank Accounts ────────────────────────────────────────────────────────
function BankTab({ data, onRefresh }) {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState(data?.bankAccounts || []);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bank_name: '', account_holder_name: '', account_number: '', ifsc: '', branch_name: '', upi_id: '', is_primary: false, show_on_invoice: true });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [showAccNum, setShowAccNum] = useState({});

  useEffect(() => { setAccounts(data?.bankAccounts || []); }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.addBankAccount(form);
      showToast('Bank account added', 'success');
      setShowForm(false);
      onRefresh();
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bank account?')) return;
    try {
      await api.deleteBankAccount(id);
      showToast('Bank account deleted', 'success');
      onRefresh();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const maskAccNum = (num) => num ? '••••' + num.slice(-4) : '••••';

  return (
    <div className="space-y-3">
      {accounts.map(acc => (
        <div key={acc.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-inkA dark:text-inkA-dark text-sm">{acc.bank_name}</p>
                {acc.is_primary ? <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded-full">Primary</span> : null}
                {acc.show_on_invoice ? <span className="text-[11px] text-inkB dark:text-inkB-dark bg-panel2 dark:bg-panel2-dark px-2 py-0.5 rounded-full">On Invoice</span> : null}
              </div>
              <p className="text-xs text-inkB dark:text-inkB-dark">{acc.account_holder_name}</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-inkA dark:text-inkA-dark font-mono">
                  {showAccNum[acc.id] ? acc.account_number : maskAccNum(acc.account_number)}
                </p>
                <button onClick={() => setShowAccNum(s => ({ ...s, [acc.id]: !s[acc.id] }))} className="text-inkB dark:text-inkB-dark hover:text-slate-300">
                  {showAccNum[acc.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-xs text-inkB dark:text-inkB-dark font-mono mt-0.5">IFSC: {acc.ifsc}</p>
              {acc.upi_id && <p className="text-xs text-inkB dark:text-inkB-dark mt-0.5">UPI: {acc.upi_id}</p>}
            </div>
            <button onClick={() => handleDelete(acc.id)} className="p-1.5 text-inkB dark:text-inkB-dark hover:text-rose-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      ))}

      <button onClick={() => setShowForm(true)} className="w-full py-3 border-2 border-dashed border-edge dark:border-edge-dark rounded-xl text-inkB dark:text-inkB-dark hover:border-blue-600 hover:text-blue-400 transition-colors text-sm flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Add Bank Account
      </button>

      {showForm && (
        <div className="bg-panel2 dark:bg-panel2-dark border border-edge dark:border-edge-dark rounded-2xl p-5 space-y-4">
          <h4 className="font-bold text-inkA dark:text-inkA-dark text-sm">Add Bank Account</h4>
          <Field label="Bank Name" required><Input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} /></Field>
          <Field label="Account Holder Name" required><Input value={form.account_holder_name} onChange={e => set('account_holder_name', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account Number" required><Input value={form.account_number} onChange={e => set('account_number', e.target.value)} /></Field>
            <Field label="IFSC Code" required><Input value={form.ifsc} onChange={e => set('ifsc', e.target.value.toUpperCase())} className="font-mono" maxLength={11} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch Name"><Input value={form.branch_name} onChange={e => set('branch_name', e.target.value)} /></Field>
            <Field label="UPI ID"><Input value={form.upi_id} onChange={e => set('upi_id', e.target.value)} /></Field>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-inkB dark:text-inkB-dark">
              <input type="checkbox" checked={form.is_primary} onChange={e => set('is_primary', e.target.checked)} /> Set as primary
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-inkB dark:text-inkB-dark">
              <input type="checkbox" checked={form.show_on_invoice} onChange={e => set('show_on_invoice', e.target.checked)} /> Show on invoice
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 border border-edge dark:border-edge-dark text-inkB dark:text-inkB-dark rounded-lg text-sm hover:bg-panel2 dark:hover:bg-panel2-dark">Cancel</button>
            <SaveButton loading={saving} onClick={handleSave} children="Add Account" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Finance Settings ─────────────────────────────────────────────────────
function FinanceTab({ data, onRefresh }) {
  const { showToast } = useToast();
  const [fin, setFin] = useState(data?.finSettings || {});
  const [gst, setGst] = useState(data?.gstSettings || {});
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setFin(f => ({ ...f, [k]: v }));
  const setG = (k, v) => setGst(g => ({ ...g, [k]: v }));

  useEffect(() => { setFin(data?.finSettings || {}); setGst(data?.gstSettings || {}); }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        api.updateFinancialSettings(fin),
        api.updateGstSettings(gst),
      ]);
      showToast('Finance settings saved', 'success');
      onRefresh();
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Invoice Prefixes">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Invoice Prefix"><Input value={fin.invoice_prefix||'INV'} onChange={e => setF('invoice_prefix', e.target.value)} maxLength={10} /></Field>
          <Field label="Purchase Prefix"><Input value={fin.purchase_prefix||'PO'} onChange={e => setF('purchase_prefix', e.target.value)} maxLength={10} /></Field>
          <Field label="Credit Note Prefix"><Input value={fin.credit_note_prefix||'CN'} onChange={e => setF('credit_note_prefix', e.target.value)} maxLength={10} /></Field>
        </div>
      </SectionCard>

      <SectionCard title="Accounting & Tax">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default GST Rate %">
            <Select value={gst.default_gst_rate || 18} onChange={e => setG('default_gst_rate', e.target.value)}>
              {[0,5,12,18,28].map(r => <option key={r} value={r}>{r}%</option>)}
            </Select>
          </Field>
          <Field label="Accounting Method">
            <Select value={fin.accounting_method||'cash'} onChange={e => setF('accounting_method', e.target.value)}>
              <option value="cash">Cash</option>
              <option value="accrual">Accrual</option>
            </Select>
          </Field>
          <Field label="GST Registration Type">
            <Select value={gst.registration_type||'regular'} onChange={e => setG('registration_type', e.target.value)}>
              <option value="regular">Regular</option>
              <option value="composition">Composition</option>
              <option value="unregistered">Unregistered</option>
              <option value="casual">Casual</option>
            </Select>
          </Field>
          <Field label="Financial Year Start">
            <Select value={fin.financial_year_start_month||4} onChange={e => setF('financial_year_start_month', parseInt(e.target.value))}>
              {[{v:1,l:'January'},{v:4,l:'April (Default)'},{v:7,l:'July'},{v:10,l:'October'}].map(m => (
                <option key={m.v} value={m.v}>{m.l}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-inkB dark:text-inkB-dark">
            <input type="checkbox" checked={!!gst.is_gst_registered} onChange={e => setG('is_gst_registered', e.target.checked ? 1 : 0)} /> GST Registered
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-inkB dark:text-inkB-dark">
            <input type="checkbox" checked={!!gst.inclusive_pricing} onChange={e => setG('inclusive_pricing', e.target.checked ? 1 : 0)} /> Inclusive Pricing
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-inkB dark:text-inkB-dark">
            <input type="checkbox" checked={!!gst.reverse_charge_applicable} onChange={e => setG('reverse_charge_applicable', e.target.checked ? 1 : 0)} /> Reverse Charge
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Currency & Locale">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            <Select value={fin.currency||'INR'} onChange={e => setF('currency', e.target.value)}>
              <option value="INR">INR — Indian Rupee</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
            </Select>
          </Field>
          <Field label="Decimal Precision">
            <Select value={fin.decimal_precision||2} onChange={e => setF('decimal_precision', parseInt(e.target.value))}>
              {[0,1,2,3].map(d => <option key={d} value={d}>{d} decimal places</option>)}
            </Select>
          </Field>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton loading={saving} onClick={handleSave} />
      </div>
    </div>
  );
}

// ─── Tab: Branding ─────────────────────────────────────────────────────────────
function BrandingTab({ data, onRefresh }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(data?.branding || {});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { setForm(data?.branding || {}); }, [data]);

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set('logo_url', ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateCompanyBranding(form);
      showToast('Branding saved', 'success');
      onRefresh();
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Logo & Visuals">
        <div className="space-y-4">
          <Field label="Company Logo">
            <div className="flex items-center gap-4">
              {form.logo_url ? (
                <img src={form.logo_url} alt="logo" className="w-16 h-16 object-contain rounded-xl border border-edge dark:border-edge-dark bg-panel2 dark:bg-panel2-dark p-1" />
              ) : (
                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-edge dark:border-edge-dark flex items-center justify-center text-gray-400 dark:text-slate-500">
                  <Palette className="w-6 h-6" />
                </div>
              )}
              <label className="cursor-pointer px-4 py-2 border border-edge dark:border-edge-dark rounded-lg text-sm text-inkB dark:text-inkB-dark hover:bg-panel2 dark:hover:bg-panel2-dark transition-colors">
                Upload Logo <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
              {form.logo_url && <button onClick={() => set('logo_url', '')} className="text-rose-600 dark:text-rose-400 text-xs hover:text-rose-300">Remove</button>}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand Color">
              <div className="flex items-center gap-3">
                <input type="color" value={form.brand_color||'#2563EB'} onChange={e => set('brand_color', e.target.value)}
                  className="w-10 h-10 rounded-lg border border-edge dark:border-edge-dark cursor-pointer bg-panel dark:bg-panel-dark" />
                <span className="text-sm text-inkB dark:text-inkB-dark font-mono">{form.brand_color||'#2563EB'}</span>
              </div>
            </Field>
          </div>
          <Field label="Invoice Footer Text">
            <textarea value={form.invoice_footer||''} onChange={e => set('invoice_footer', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-panel dark:bg-panel-dark border border-edge dark:border-edge-dark rounded-lg text-sm text-inkA dark:text-inkA-dark outline-none focus:border-blue-500 resize-none"
              placeholder="Thank you for your business. GST@18% included where applicable." />
          </Field>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton loading={saving} onClick={handleSave} />
      </div>
    </div>
  );
}

// ─── Tab: Security ─────────────────────────────────────────────────────────────
function SecurityTab({ data, onRefresh }) {
  const { showToast } = useToast();
  const [form, setForm] = useState(data?.securitySettings || {});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { setForm(data?.securitySettings || {}); }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSecuritySettings(form);
      showToast('Security settings saved', 'success');
      onRefresh();
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Session & Access">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-panel dark:bg-panel-dark rounded-xl border border-edge dark:border-edge-dark">
            <div>
              <p className="text-sm font-medium text-inkA dark:text-inkA-dark">Two-Factor Authentication</p>
              <p className="text-xs text-inkB dark:text-inkB-dark">Add an extra layer of security at login</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only" checked={!!form.two_factor_enabled} onChange={e => set('two_factor_enabled', e.target.checked ? 1 : 0)} />
              <div className={`w-11 h-6 rounded-full transition-colors ${form.two_factor_enabled ? 'bg-blue-600' : 'bg-panel2 dark:bg-panel2-dark'}`}>
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-panel dark:bg-panel-dark rounded-full shadow transition-transform ${form.two_factor_enabled ? 'translate-x-5' : ''}`} />
              </div>
            </label>
          </div>
          <Field label="Session Timeout (minutes)">
            <Select value={form.session_timeout_minutes||60} onChange={e => set('session_timeout_minutes', parseInt(e.target.value))}>
              {[15,30,60,120,240,480].map(m => <option key={m} value={m}>{m} minutes</option>)}
            </Select>
          </Field>
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <SaveButton loading={saving} onClick={handleSave} />
      </div>
    </div>
  );
}

// ─── Tab: Subscription ────────────────────────────────────────────────────────
function SubscriptionTab({ data }) {
  const sub = data?.subscription || {};
  const planLabels = { free: 'Free Plan', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };
  const planColors = { free: 'text-inkB dark:text-inkB-dark', starter: 'text-blue-600 dark:text-blue-400 dark:text-blue-400', pro: 'text-violet-600 dark:text-violet-400 dark:text-violet-400', enterprise: 'text-amber-600 dark:text-amber-400 dark:text-amber-400' };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-violet-600/20 to-blue-600/20 border border-violet-200 dark:border-violet-500/25 dark:border-violet-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          <p className={`text-xl font-bold ${planColors[sub.plan_id] || 'text-inkB dark:text-inkB-dark'}`}>
            {planLabels[sub.plan_id] || sub.plan_id || 'Free Plan'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-inkB dark:text-inkB-dark uppercase font-semibold mb-0.5">Status</p>
            <p className="text-sm text-inkA dark:text-inkA-dark capitalize">{sub.status || 'trialing'}</p>
          </div>
          <div>
            <p className="text-xs text-inkB dark:text-inkB-dark uppercase font-semibold mb-0.5">Billing Cycle</p>
            <p className="text-sm text-inkA dark:text-inkA-dark capitalize">{sub.billing_cycle || 'monthly'}</p>
          </div>
          {sub.trial_ends_at && (
            <div>
              <p className="text-xs text-inkB dark:text-inkB-dark uppercase font-semibold mb-0.5">Trial Ends</p>
              <p className="text-sm text-inkA dark:text-inkA-dark">{sub.trial_ends_at?.slice(0,10)}</p>
            </div>
          )}
          {sub.current_period_end && (
            <div>
              <p className="text-xs text-inkB dark:text-inkB-dark uppercase font-semibold mb-0.5">Period End</p>
              <p className="text-sm text-inkA dark:text-inkA-dark">{sub.current_period_end?.slice(0,10)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 dark:border-blue-500/20 rounded-xl text-sm text-blue-600 dark:text-blue-400">
        Subscription management coming soon. Contact support to upgrade your plan.
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CompanyProfile({ onNavigate }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const result = await api.getCompanyProfile();
      setData(result);
    } catch (err) {
      showToast(err.message || 'Failed to load company profile', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const licenseAlertCount = data?.expiryAlerts?.length || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-panel dark:bg-panel-dark">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 dark:text-blue-400 animate-spin" />
          <p className="text-inkB dark:text-inkB-dark text-sm">Loading company profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-panel dark:bg-panel-dark font-sans">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-md border-b border-edge dark:border-edge-dark px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('more')} className="p-2 text-inkB dark:text-inkB-dark hover:text-inkA dark:hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-inkA dark:text-inkA-dark">Company Profile</h1>
            <p className="text-xs text-inkB dark:text-inkB-dark">{data?.company?.company_code} · {data?.setupCompletionPct || 0}% setup complete</p>
          </div>
          <button onClick={fetchProfile} className="p-2 text-inkB dark:text-inkB-dark hover:text-inkA dark:hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none mt-3 pb-1 -mb-px">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all relative flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-inkB dark:text-inkB-dark hover:text-slate-300 hover:bg-panel2 dark:hover:bg-panel2-dark'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.id === 'licenses' && licenseAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {licenseAlertCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 pb-24 max-w-2xl mx-auto">
        {activeTab === 'overview'      && <OverviewTab data={data} />}
        {activeTab === 'identity'      && <IdentityTab data={data} onRefresh={fetchProfile} />}
        {activeTab === 'addresses'     && <AddressesTab data={data} onRefresh={fetchProfile} />}
        {activeTab === 'licenses'      && <LicensesTab data={data} onRefresh={fetchProfile} />}
        {activeTab === 'bank'          && <BankTab data={data} onRefresh={fetchProfile} />}
        {activeTab === 'finance'       && <FinanceTab data={data} onRefresh={fetchProfile} />}
        {activeTab === 'branding'      && <BrandingTab data={data} onRefresh={fetchProfile} />}
        {activeTab === 'security'      && <SecurityTab data={data} onRefresh={fetchProfile} />}
        {activeTab === 'subscription'  && <SubscriptionTab data={data} />}
      </div>
    </div>
  );
}
