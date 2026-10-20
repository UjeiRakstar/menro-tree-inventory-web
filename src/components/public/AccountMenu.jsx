import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LayoutDashboard, LogOut, Users } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { displayNameOf } from '../../lib/community.js';
import { ROLES, isPgenro, roleLabel, roleOf } from '../../lib/roles.js';

const LOGOUT_TIMEOUT_MS = 5000;

/**
 * Who is signed in, as the public pages show it (20 October): the person's
 * photo — or their initials — where Log In / Sign Up would be, opening a menu
 * with their name, where their account lives, and Log out.
 *
 * An office account (MENRO / CENRO, PGENRO) goes back to its dashboard; a
 * resident who signed in with Google to the Community page. The photo is the
 * office user's own from onboarding, or the one Google gives the resident's
 * session — it is shown, never kept.
 */
export function whoIsSignedIn(auth) {
  if (!auth?.session) return null;
  const user = auth.session.user ?? {};
  const meta = user.user_metadata ?? {};
  const { profile, lgu, resident } = auth;
  if (profile) {
    const role = roleOf(profile);
    const office = isPgenro(profile)
      ? 'PGENRO Laguna'
      : role === ROLES.LGU_ADMIN && lgu
        ? `${roleLabel(ROLES.LGU_ADMIN, { isCity: lgu.is_city, short: true })} ${lgu.label}`
        : roleLabel(role);
    return {
      name: profile.full_name || user.email || 'Office account',
      detail: office,
      photo: profile.avatar_url || null,
      home: { to: '/biodiversity-dashboard', label: 'Go to the dashboard', icon: LayoutDashboard },
    };
  }
  const joined = Boolean(resident?.consented_at);
  return {
    name: joined ? displayNameOf(resident) : meta.full_name || meta.name || user.email || 'Resident',
    detail: joined ? 'Resident' : 'Not joined yet',
    photo: meta.avatar_url || meta.picture || null,
    home: { to: '/community', label: joined ? 'My community page' : 'Finish joining', icon: Users },
  };
}

/** "Ana Reyes" → "AR"; one word → its first letter. */
export function initialsOf(name) {
  const words = String(name ?? '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (words.length === 1 ? words[0][0] : words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function Avatar({ who, size = 'h-9 w-9 text-sm' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [who.photo]);
  return who.photo && !broken ? (
    <img src={who.photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`${size} shrink-0 rounded-full object-cover ring-2 ring-white/80`} />
  ) : (
    <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full bg-lime-300 font-bold text-green-900 ring-2 ring-white/80`}>
      {initialsOf(who.name)}
    </span>
  );
}

async function logOut() {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('logout-timeout')), LOGOUT_TIMEOUT_MS));
  const result = await Promise.race([supabase.auth.signOut(), timeout]);
  if (result?.error) throw result.error;
}

/**
 *   who       whoIsSignedIn(auth)
 *   mark      the "!" for a reply waiting, or null
 *   mobile    laid out in the mobile menu rather than as a dropdown
 *   onDone    called after a link is followed (closes the mobile menu)
 */
export default function AccountMenu({ who, mark = null, mobile = false, onDone = () => {} }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef(null);
  const Home = who.home.icon;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => !ref.current?.contains(event.target) && setOpen(false);
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function handleLogOut() {
    setFailed(false);
    setBusy(true);
    try {
      await logOut();
      setOpen(false);
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const failure = failed && (
    <p role="alert" className="px-3 pb-2 text-xs text-red-700">
      Logging out failed. Please try again.
    </p>
  );

  if (mobile) {
    return (
      <div className="space-y-2 rounded-lg bg-white/10 p-3">
        <div className="flex items-center gap-3">
          <span className="relative">
            <Avatar who={who} size="h-10 w-10 text-sm" />
            {mark}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-white">{who.name}</span>
            <span className="block truncate text-xs text-green-100/80">{who.detail}</span>
          </span>
        </div>
        <div className="flex gap-2">
          <Link to={who.home.to} onClick={onDone}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/60 px-3 py-2 text-sm font-semibold text-white hover:bg-white hover:text-green-800">
            <Home size={15} aria-hidden="true" /> {who.home.label}
          </Link>
          <button type="button" onClick={handleLogOut} disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg border border-white/60 px-3 py-2 text-sm font-semibold text-white hover:bg-white hover:text-green-800 disabled:opacity-50">
            <LogOut size={15} aria-hidden="true" /> {busy ? 'Logging out…' : 'Log out'}
          </button>
        </div>
        {failed && <p role="alert" className="text-xs text-red-100">Logging out failed. Please try again.</p>}
      </div>
    );
  }

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100';
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu"
        aria-label={`Account: ${who.name}`}
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-2 text-white transition hover:bg-white/10">
        <span className="relative">
          <Avatar who={who} />
          {mark}
        </span>
        <ChevronDown size={16} aria-hidden="true" className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl bg-white p-1 normal-case tracking-normal shadow-xl ring-1 ring-black/5">
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar who={who} size="h-10 w-10 text-sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">{who.name}</span>
              <span className="block truncate text-xs text-slate-500">{who.detail}</span>
            </span>
          </div>
          <div className="border-t border-slate-100 py-1">
            <Link role="menuitem" to={who.home.to} onClick={() => setOpen(false)} className={item}>
              <Home size={16} aria-hidden="true" className="text-slate-500" /> {who.home.label}
            </Link>
          </div>
          <div className="border-t border-slate-100 pt-1">
            <button role="menuitem" type="button" onClick={handleLogOut} disabled={busy} className={`${item} disabled:opacity-50`}>
              <LogOut size={16} aria-hidden="true" className="text-slate-500" /> {busy ? 'Logging out…' : 'Log out'}
            </button>
            {failure}
          </div>
        </div>
      )}
    </div>
  );
}
