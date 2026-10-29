import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { House, Leaf, Lock, Mail, Monitor } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import PasswordInput from '../components/PasswordInput.jsx';
import NoticeDialog, { noticeHidden } from '../components/NoticeDialog.jsx';
import greenTagLogo from '../assets/GreenTag_Logo.png';

const DEVICE_NOTICE_KEY = 'greentag.deviceNotice.hidden';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // Which devices an office account is made for, on every sign-in until the box is ticked.
  const [deviceNotice, setDeviceNotice] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    // A city or municipal office is told first which devices its account is for.
    let office = false;
    if (data?.user?.id && !noticeHidden(DEVICE_NOTICE_KEY)) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
      office = profile?.role === 'lgu_admin';
    }
    setLoading(false);
    if (office) {
      setDeviceNotice(true);
      return;
    }
    navigate('/biodiversity-dashboard');
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setError('');
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setResetSent(true);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 flex items-center justify-center p-4">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Leaf className="absolute top-10 left-10 text-green-200 opacity-30" size={80} />
        <Leaf className="absolute bottom-20 right-16 text-emerald-200 opacity-20" size={120} />
        <Leaf className="absolute top-1/3 right-10 text-teal-200 opacity-25" size={60} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          {/* The brand is the way home, as on every other page. */}
          <Link to="/" className="group inline-block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
            <img src={greenTagLogo} alt="" aria-hidden="true" className="mx-auto mb-4 h-20 w-20 object-contain transition group-hover:scale-105" />
            <h1 className="text-2xl font-bold text-slate-800 transition group-hover:text-green-800">Green Tag Tree Inventory System</h1>
          </Link>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Sign in to your account</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <PasswordInput
                  id="login-password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {resetSent && (
              <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-700">
                Password reset link sent! Check your email.
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-green-700 text-white text-sm font-medium hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-green-700 hover:text-green-800 font-medium"
            >
              Forgot password?
            </button>
            {/* There is no open sign-up: an LGU account is set up with a code
                PGENRO issues, and field officers register in the mobile app. */}
            <Link to="/activate" className="text-green-700 hover:text-green-800 font-medium">
              Have an account code?
            </Link>
          </div>
        </div>

        {/* The way back for a visitor who came to the wrong door. */}
        <Link
          to="/"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-green-300 bg-white py-2.5 text-sm font-semibold text-green-800 shadow-sm transition hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
        >
          <House size={16} aria-hidden="true" /> Back to home
        </Link>

        <p className="text-center text-xs text-slate-400 mt-6">
          © 2026 PGENRO Laguna • Laguna State Polytechnic University
        </p>
      </div>

      <NoticeDialog
        open={deviceNotice}
        storageKey={DEVICE_NOTICE_KEY}
        title="Before you start"
        icon={Monitor}
        onClose={() => {
          setDeviceNotice(false);
          navigate('/biodiversity-dashboard');
        }}
      >
        <p>Office accounts are made for a desktop or laptop computer.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Computer:</strong> every tool works.</li>
          <li><strong>Tablet:</strong> most tools work.</li>
          <li><strong>Phone:</strong> the office map is not available; use the Green Tag mobile app in the field.</li>
        </ul>
      </NoticeDialog>
    </div>
  );
}
