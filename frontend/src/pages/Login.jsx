import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastContext';
import { LogIn, Sparkles, AlertCircle, ShieldAlert } from 'lucide-react';

export default function Login({ onNavigate }) {
  const { login } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(email, password);
      showToast('success', 'Logged in successfully!');
      onNavigate('home');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Login failed. Please check your credentials.');
      showToast('error', err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-center min-h-screen bg-slate-900 font-sans p-6 relative overflow-hidden">
      {/* Decorative Gradients */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-600/30 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-600/20 blur-3xl" />

      <div className="w-full max-w-md mx-auto z-10 space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20 ring-1 ring-white/20 animate-pulse">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              BIZZBOOK <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">Voice</span>
            </h1>
            <p className="text-sm text-slate-400 font-medium">AI Business & Sales Assistant</p>
          </div>
        </div>

        {/* Card Body */}
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-white">Welcome Back</h2>
            <p className="text-xs text-slate-400">Sign in to manage your inventory, sales, and assistant</p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium animate-shake">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Email Address</label>
              <input
                type="email"
                placeholder="you@business.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50"
                required
              />
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
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Accounts Info */}
          <div className="pt-4 border-t border-slate-700/50 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>DEMO CREDENTIALS:</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-400">
              <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-700/30">
                <span className="font-bold text-blue-400 block mb-0.5">Admin</span>
                <span>admin@business.com</span>
                <span className="block text-slate-500 mt-0.5">pwd: admin123</span>
              </div>
              <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-700/30">
                <span className="font-bold text-violet-400 block mb-0.5">Employee</span>
                <span>employee@business.com</span>
                <span className="block text-slate-500 mt-0.5">pwd: employee123</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Link to Register */}
        <p className="text-center text-xs text-slate-400 font-medium">
          Don't have an account?{' '}
          <button
            onClick={() => onNavigate('register')}
            disabled={loading}
            className="text-blue-400 hover:text-blue-300 font-bold transition-colors underline decoration-blue-400/30 underline-offset-4"
          >
            Create an Account
          </button>
        </p>
      </div>
    </div>
  );
}
