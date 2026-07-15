import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { Sparkles, AlertCircle, ShieldCheck, ChevronRight, Building2 } from 'lucide-react';

// Business entity types as selectable cards (not a dropdown)
const ENTITY_TYPES = [
  { value: 'proprietorship', label: 'Proprietorship', desc: 'Single owner business' },
  { value: 'partnership', label: 'Partnership', desc: 'Two or more partners' },
  { value: 'pvt_ltd', label: 'Pvt Ltd', desc: 'Private limited company' },
  { value: 'llp', label: 'LLP', desc: 'Limited liability partnership' },
  { value: 'opc', label: 'OPC', desc: 'One person company' },
  { value: 'public_ltd', label: 'Public Ltd', desc: 'Publicly listed company' },
];

function InputField({ label, type = 'text', value, onChange, placeholder, required, disabled, hint }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50"
      />
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export default function Register({ onNavigate }) {
  const { register } = useAuth();
  const { showToast } = useToast();

  const [businessName, setBusinessName] = useState('');
  const [entityType, setEntityType] = useState('proprietorship');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!businessName || !entityType || !ownerName || !email || !password || !confirmPassword) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      const result = await register(businessName, entityType, ownerName, email, password, phone);
      showToast('Account created! Let\'s set up your company.', 'success');
      // Resolution: setupRequired tells App to redirect to Setup Wizard
      if (result?.setupRequired) {
        onNavigate('setup-wizard');
      } else {
        onNavigate('home');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Registration failed. Please try again.');
      showToast(err.message || 'Registration failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-center min-h-screen bg-slate-900 font-sans p-5 relative overflow-hidden">
      {/* Decorative Gradients */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-600/25 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-600/15 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md mx-auto z-10 space-y-6">
        {/* Brand */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Create Your Business
            </h1>
            <p className="text-sm text-slate-400 mt-1">Quick setup · Under 60 seconds</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-6 shadow-2xl space-y-5">

          {error && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            <InputField
              label="Business Name"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="Ravi Electronics"
              required
              disabled={loading}
            />

            {/* Entity type cards — more intuitive than a dropdown */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Business Type <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ENTITY_TYPES.map(et => (
                  <button
                    key={et.value}
                    type="button"
                    onClick={() => setEntityType(et.value)}
                    disabled={loading}
                    className={`px-2 py-2.5 rounded-xl border text-left transition-all ${
                      entityType === et.value
                        ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                        : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    <p className="text-xs font-bold">{et.label}</p>
                    <p className="text-[10px] opacity-70 mt-0.5 leading-tight">{et.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <InputField
              label="Your Name (Owner / Admin)"
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
              placeholder="Ravi Kumar"
              required
              disabled={loading}
            />

            <div className="grid grid-cols-2 gap-3">
              <InputField
                label="Email Address"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ravi@business.com"
                required
                disabled={loading}
              />
              <InputField
                label="Phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                disabled={loading}
                hint="Optional"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <InputField
                label="Password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                disabled={loading}
              />
              <InputField
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                required
                disabled={loading}
              />
            </div>

            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px]">
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              <span>You will be registered as the <strong>OWNER</strong> of this business. A setup wizard will guide you through the rest.</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <ChevronRight className="w-4 h-4" />
                  Create Business Account
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 font-medium">
          Already have an account?{' '}
          <button
            onClick={() => onNavigate('login')}
            disabled={loading}
            className="text-blue-400 hover:text-blue-300 font-bold transition-colors underline decoration-blue-400/30 underline-offset-4"
          >
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
