import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, KeyRound, Leaf, Lock, Mail, User } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { CODE_REASONS, codeProblem, formatCode, normalizeCode } from '../lib/accountCodes.js';
import { roleLabel } from '../lib/roles.js';
import LguReveal from '../components/LguReveal.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import greenTagLogo from '../assets/GreenTag_Logo.png';

// A map is a heavy thing to load for a page most people see once. It comes
// only when the hall actually has to be pinned.
const PinPicker = lazy(() => import('../components/map/PinPicker.jsx'));

const MIN_PASSWORD_LENGTH = 10;

const INPUT =
  'w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20';

/** One labelled field with its icon, in the login page's style; a password one can be shown. */
function Field({ id, label, icon: Icon, hint, ...input }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
        {input.type === 'password' ? (
          <PasswordInput id={id} {...input} className={INPUT.replace('pr-4 ', '')} />
        ) : (
          <input id={id} className={INPUT} {...input} />
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Setting up an LGU account with a code from PGENRO.
 *
 * Two steps, in this order on purpose. The code comes first, and the page says
 * whose account it unlocks — "Santa Cruz · Municipal ENRO" — before asking for
 * anything else. Someone holding the wrong code finds out before they have
 * typed a password, and someone holding the right one knows they are about to
 * become the account they expected.
 *
 * The database checks the code a second time as the account is created, so
 * this page is a courtesy, not the lock.
 */
export default function Activate() {
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [checking, setChecking] = useState(false);
  // What the code unlocks, once the database has said it is good.
  const [unlocks, setUnlocks] = useState(null);
  // The hall, pinned here when nobody from this LGU has pinned it yet.
  const [hall, setHall] = useState(null);
  const [hallConfirmed, setHallConfirmed] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Signed in at once: Supabase asks for no email confirmation (switched off
  // for a training day, when the free plan's few emails an hour would leave
  // most of a room waiting for a link).
  const [ready, setReady] = useState(false);

  async function handleCheckCode(event) {
    event.preventDefault();
    const problem = codeProblem(code);
    if (problem) {
      setCodeError(problem);
      return;
    }

    setCodeError('');
    setChecking(true);
    const { data, error } = await supabase.rpc('check_account_code', { p_code: normalizeCode(code) });
    setChecking(false);

    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result) {
      setCodeError('The code could not be checked just now. Try again in a moment.');
      return;
    }
    if (!result.ok) {
      setCodeError(CODE_REASONS[result.reason] ?? CODE_REASONS.not_found);
      return;
    }
    setUnlocks({
      label: result.lgu_label,
      isCity: Boolean(result.is_city),
      // Both arrive with municipal_halls.sql. Without them there is no hall
      // step, and activation works exactly as before.
      name: result.lgu_name ?? null,
      hallPinned: result.hall_lat != null,
    });
    setHall(null);
    setHallConfirmed(false);
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setFormError('The two passwords are not the same.');
      return;
    }

    setFormError('');
    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          account_code: normalizeCode(code),
          // Saved with the account, and only if the LGU has no pin yet.
          ...(hall && { hall_lat: hall[0], hall_lng: hall[1] }),
        },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    setSubmitting(false);

    if (error) {
      // The database refuses a bad code by failing the whole sign-up, and
      // Supabase reports that as a generic database error. Between the check
      // above and now, the likeliest cause is the code itself.
      setFormError(
        /database error/i.test(error.message)
          ? 'That code could not be used — it may have been used, revoked or expired since you checked it. Ask PGENRO.'
          : error.message
      );
      return;
    }
    setReady(Boolean(data?.session));
    setDone(true);
  }

  const role = unlocks ? roleLabel('lgu_admin', { isCity: unlocks.isCity }) : '';
  const hallLabel = unlocks?.isCity ? 'City Hall' : 'Municipal Hall';
  // The hall step: this LGU has no pin yet, and this officer has not placed one.
  const needsHall = Boolean(unlocks?.name) && !unlocks.hallPinned && !hallConfirmed;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <Leaf className="absolute left-10 top-10 text-green-200 opacity-30" size={80} />
        <Leaf className="absolute bottom-20 right-16 text-emerald-200 opacity-20" size={120} />
      </div>

      {/* Once the code is good, the map of Laguna and the hall's pin get room
          on a computer; on a phone the page stays one narrow column. */}
      <div className={`relative w-full ${unlocks && !done ? 'max-w-md lg:max-w-5xl' : 'max-w-md'}`}>
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600">
            <img src={greenTagLogo} alt="Green Tag — home" className="mx-auto mb-4 h-20 w-20 object-contain" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Activate your LGU account</h1>
          <p className="mt-1 text-sm text-slate-500">With the account code PGENRO gave you</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-xl">
          {done && ready ? (
            <div role="status">
              <CheckCircle2 className="text-green-600" size={32} aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold text-slate-800">Your account is ready</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                You are signed in as <strong>{email.trim()}</strong> — the {role} account for {unlocks?.label}.
              </p>
              <Link
                to="/biodiversity-dashboard"
                className="mt-6 block w-full rounded-lg bg-green-700 py-2.5 text-center text-sm font-medium text-white transition hover:bg-green-800"
              >
                Open the dashboard
              </Link>
            </div>
          ) : done ? (
            <div role="status">
              <CheckCircle2 className="text-green-600" size={32} aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold text-slate-800">Check your email</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                We sent a confirmation link to <strong>{email.trim()}</strong>. Open it, then sign
                in — your account is the {role} account for {unlocks?.label}.
              </p>
              <Link
                to="/login"
                className="mt-6 block w-full rounded-lg bg-green-700 py-2.5 text-center text-sm font-medium text-white transition hover:bg-green-800"
              >
                Go to sign in
              </Link>
            </div>
          ) : !unlocks ? (
            <form onSubmit={handleCheckCode} className="space-y-4" noValidate>
              <Field
                id="activate-code"
                label="Account code"
                icon={KeyRound}
                value={code}
                onChange={(e) => {
                  setCode(formatCode(e.target.value));
                  setCodeError('');
                }}
                placeholder="SCZ-7K2P-9QXM"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={Boolean(codeError)}
                aria-describedby={codeError ? 'activate-code-error' : undefined}
                className={`${INPUT} font-mono tracking-wider`}
                hint="Three letters for your city or municipality, then eight characters."
              />

              {codeError && (
                <div
                  id="activate-code-error"
                  role="alert"
                  className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {codeError}
                </div>
              )}

              <button
                type="submit"
                disabled={checking}
                className="w-full rounded-lg bg-green-700 py-2.5 text-sm font-medium text-white transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checking ? 'Checking…' : 'Check code'}
              </button>
              <Link
                to="/login"
                className="block w-full rounded-lg bg-orange-500 py-2.5 text-center text-sm font-medium text-white transition hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2"
              >
                Back to sign in
              </Link>
            </form>
          ) : needsHall ? (
            <div className="space-y-4 lg:grid lg:grid-cols-[2fr_3fr] lg:gap-8 lg:space-y-0">
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3" role="status">
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-700">This code sets up</p>
                  <p className="text-base font-bold text-green-900">
                    {unlocks.label} · {role}
                  </p>
                  {unlocks.name && <div className="mt-2"><LguReveal name={unlocks.name} label={unlocks.label} /></div>}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Where is the {unlocks.label} {hallLabel}?</h2>
                  <p className="mt-0.5 text-xs leading-snug text-slate-500">
                    The office map&apos;s centre button flies here. Nobody from {unlocks.label} has pinned it
                    yet, so it is yours to place — and you can move it later from the map.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-slate-100 lg:h-[30rem]" />}>
                  <PinPicker municipality={unlocks.name} value={hall} onChange={setHall} placeLabel={hallLabel} height="h-64 lg:h-[30rem]" />
                </Suspense>
                <button
                  type="button"
                  onClick={() => setHallConfirmed(true)}
                  disabled={!hall}
                  className="w-full rounded-lg bg-green-700 py-2.5 text-sm font-medium text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
              {/* Whose account this is, before anything else is typed. */}
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3" role="status">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                  This code sets up
                </p>
                <p className="text-base font-bold text-green-900">
                  {unlocks.label} · {role}
                </p>
                {unlocks.name && !hallConfirmed && <div className="mt-2"><LguReveal name={unlocks.name} label={unlocks.label} /></div>}
                <button
                  type="button"
                  onClick={() => setUnlocks(null)}
                  className="mt-1 text-xs font-medium text-green-700 underline underline-offset-2 hover:text-green-800"
                >
                  Not yours? Use a different code
                </button>
              </div>

              <div className="space-y-4">
              <Field
                id="activate-name"
                label="Full name"
                icon={User}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
              <Field
                id="activate-email"
                label="Work email"
                icon={Mail}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <Field
                id="activate-password"
                label="Password"
                icon={Lock}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                required
              />
              <Field
                id="activate-confirm"
                label="Password again"
                icon={Lock}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />

              {formError && (
                <div role="alert" className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-green-700 py-2.5 text-sm font-medium text-white transition hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Setting up…' : 'Set up account'}
              </button>
              </div>
            </form>
          )}

          <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            No code? LGU accounts are set up by PGENRO —{' '}
            <a href="mailto:pgenro@laguna.gov.ph" className="font-medium text-green-700 hover:text-green-800">
              pgenro@laguna.gov.ph
            </a>
            . Field officers register in the Green Tag mobile app.
            {unlocks && !done && (
              <>
                {' '}
                <Link to="/login" className="font-medium text-green-700 hover:text-green-800">
                  Back to sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
