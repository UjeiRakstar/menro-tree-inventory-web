import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, FileText, Layers, LogOut, MapPinned, ShieldCheck, Sprout, Users } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAttention } from '../hooks/useAttention.js';
import { ROLES, isPgenro, roleLabel, roleOf } from '../lib/roles.js';
import { logoFor } from '../lib/lguLogos.js';
import greenTagLogo from '../assets/GreenTag_Logo.png';
import pgenroLogo from '../assets/lgu-thumbs/PGENRO_LGU_logo.png';
import santaCruzLogo from '../assets/Santa Cruz Logo.png';

/**
 * The four places an office goes every day, in the order of the mockup.
 *
 * "Trees" is the inventory list. The field officers, the permit log and —
 * for PGENRO — the accounts are reached from the office's seal on the right:
 * they are visited, not lived in, and four tabs read faster than seven.
 */
const NAV_ITEMS = [
  { to: '/biodiversity-dashboard', label: 'BioDashboard' },
  { to: '/action-board', label: 'Action Board', badge: 'actions' },
  { to: '/map', label: 'Map' },
  { to: '/inventory', label: 'Trees' },
];

/**
 * Which office is signed in: its name, and its seal for the corner.
 *
 * Exported for the tests. The Santa Cruz seal stays as the fallback for an
 * account the database has not placed in an LGU yet — before accounts.sql
 * runs, that is every account.
 */
export function useOffice() {
  const { profile, lgu } = useAuth();
  if (isPgenro(profile)) {
    return {
      name: 'PGENRO Laguna',
      title: 'Tree Inventory System of PGENRO Laguna',
      seal: { src: pgenroLogo, alt: 'PGENRO Laguna' },
    };
  }
  if (lgu) {
    const office = roleLabel('lgu_admin', { isCity: lgu.is_city, short: true });
    return {
      name: `${office} ${lgu.label}`,
      title: `Tree Inventory System of ${office} ${lgu.label}`,
      seal: { src: logoFor(lgu.name) ?? santaCruzLogo, alt: `${lgu.label} seal` },
    };
  }
  return {
    name: 'MENRO Santa Cruz',
    title: 'Tree Inventory System of MENRO Santa Cruz',
    seal: { src: santaCruzLogo, alt: 'Santa Cruz seal' },
  };
}

const LOGOUT_TIMEOUT_MS = 5000;

/** A red count on a tab or the seal. Said in words to a screen reader. */
function Badge({ count, label, shape = 'count' }) {
  if (!count) return null;
  return (
    <span
      className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-green-800"
      aria-label={label}
      role="status"
    >
      {shape === 'alert' ? '!' : count > 99 ? '99+' : count}
    </span>
  );
}

export default function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const { profile, lgu } = useAuth();
  const office = useOffice();
  const pgenro = isPgenro(profile);
  const lguAdmin = roleOf(profile) === ROLES.LGU_ADMIN;
  const attention = useAttention({
    lguPsgc: pgenro ? null : lgu?.psgc ?? null,
    withProposals: lguAdmin,
    // PGENRO decides planting site requests; an office answers a declined one.
    withRequests: pgenro ? 'waiting' : lguAdmin ? 'declined' : null,
  });
  // The seal's "!" is everything waiting on this office's say-so.
  const waiting = attention.approvals + attention.proposals + attention.requests;
  const waitingLabel = [
    attention.approvals > 0 &&
      `${attention.approvals} field ${attention.approvals === 1 ? 'officer is' : 'officers are'} waiting for approval`,
    attention.proposals > 0 &&
      `${attention.proposals} PGENRO ${attention.proposals === 1 ? 'proposal is' : 'proposals are'} waiting for a decision`,
    attention.requests > 0 &&
      (pgenro
        ? `${attention.requests} planting site ${attention.requests === 1 ? 'request is' : 'requests are'} waiting for a decision`
        : `${attention.requests} planting site ${attention.requests === 1 ? 'request was' : 'requests were'} declined`),
  ]
    .filter(Boolean)
    .join('; ');

  // A menu left open across pages, or open behind a click elsewhere, is a
  // menu in the way.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => event.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setLogoutError(false);
    setBusy(true);
    try {
      const signOut = supabase.auth.signOut();
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('logout-timeout')), LOGOUT_TIMEOUT_MS)
      );
      const result = await Promise.race([signOut, timeout]);
      if (result && result.error) {
        throw result.error;
      }
      navigate('/login');
    } catch {
      setLogoutError(true);
    } finally {
      setBusy(false);
    }
  }

  const tab = ({ isActive }) =>
    `relative rounded-lg px-3 py-2 text-[15px] font-semibold transition xl:px-4 ${
      isActive ? 'bg-lime-400/90 text-green-950' : 'text-white hover:bg-white/10'
    }`;

  const menuItem =
    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100';

  return (
    <header className="relative z-[1000] w-full bg-green-800 text-white shadow-md">
      <div className="flex h-16 items-center gap-4 px-4 sm:px-6 lg:h-[68px] lg:px-8">
        {/* Left: the system, as on the public site */}
        <Link to="/biodiversity-dashboard" className="flex min-w-0 items-center gap-3">
          <img src={greenTagLogo} alt="" aria-hidden="true" className="h-11 w-11 shrink-0 object-contain drop-shadow-lg" />
          <span className="truncate text-sm font-bold uppercase tracking-wider sm:text-base lg:text-lg">
            Green Tag Tree Inventory System
          </span>
        </Link>

        <span className="flex-1" />

        {/* The four daily places */}
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map(({ to, label, badge }) => (
            <NavLink key={to} to={to} className={tab}>
              {label}
              {badge === 'actions' && (
                <Badge
                  count={attention.actions}
                  label={`${attention.actions} ${attention.actions === 1 ? 'hazard needs' : 'hazards need'} dispatching`}
                />
              )}
            </NavLink>
          ))}
        </nav>

        {/* The office's seal: who is signed in, and everything visited less often */}
        <div ref={menuRef} className="relative ml-2">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="account-menu"
            aria-label={`${office.name} — account menu`}
            title={office.title}
            className="relative flex items-center gap-1 rounded-full p-0.5 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-300"
          >
            <img
              src={office.seal.src}
              alt={office.seal.alt}
              className="h-11 w-11 rounded-full bg-white object-contain p-0.5"
            />
            <ChevronDown size={16} aria-hidden="true" className="text-white/80" />
            <Badge count={waiting} shape="alert" label={waitingLabel} />
          </button>

          {menuOpen && (
            <div
              id="account-menu"
              className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-white p-2 text-slate-800 shadow-2xl ring-1 ring-slate-200"
            >
              <div className="px-3 pb-2 pt-1">
                <p className="text-sm font-bold text-slate-900">{office.name}</p>
                {profile?.email && <p className="truncate text-xs text-slate-500">{profile.email}</p>}
              </div>

              {/* On a narrow screen the four tabs live here too. */}
              <nav aria-label="Main (menu)" className="border-t border-slate-100 py-1 lg:hidden">
                {NAV_ITEMS.map(({ to, label, badge }) => (
                  <NavLink key={to} to={to} className={menuItem}>
                    <span className="flex-1">{label}</span>
                    {badge === 'actions' && attention.actions > 0 && (
                      <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">
                        {attention.actions}
                      </span>
                    )}
                  </NavLink>
                ))}
              </nav>

              <div className="border-t border-slate-100 py-1">
                <NavLink to="/arborists" className={menuItem}>
                  <Users size={16} aria-hidden="true" className="text-slate-500" />
                  <span className="flex-1">Field officers</span>
                  {attention.approvals > 0 && (
                    <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">
                      {attention.approvals} waiting
                    </span>
                  )}
                </NavLink>
                {attention.proposals > 0 && (
                  <NavLink to={`/map?area=${encodeURIComponent(attention.firstProposalArea)}`} className={menuItem}>
                    <MapPinned size={16} aria-hidden="true" className="text-slate-500" />
                    <span className="flex-1">Proposals from PGENRO</span>
                    <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">
                      {attention.proposals} to decide
                    </span>
                  </NavLink>
                )}
                {(pgenro || lguAdmin) && (
                  <NavLink to="/action-board?tab=requests" className={menuItem}>
                    <Sprout size={16} aria-hidden="true" className="text-slate-500" />
                    <span className="flex-1">Planting site requests</span>
                    {attention.requests > 0 && (
                      <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">
                        {attention.requests} {pgenro ? 'to decide' : 'declined'}
                      </span>
                    )}
                  </NavLink>
                )}
                <NavLink to="/permits" className={menuItem}>
                  <FileText size={16} aria-hidden="true" className="text-slate-500" />
                  Permit logs
                </NavLink>
                {pgenro && (
                  <NavLink to="/accounts" className={menuItem}>
                    <ShieldCheck size={16} aria-hidden="true" className="text-slate-500" />
                    Accounts
                  </NavLink>
                )}
                {pgenro && (
                  <NavLink to="/map-layers" className={menuItem}>
                    <Layers size={16} aria-hidden="true" className="text-slate-500" />
                    Map layers
                  </NavLink>
                )}
              </div>

              <div className="border-t border-slate-100 pt-1">
                <button type="button" onClick={handleLogout} disabled={busy} className={`${menuItem} disabled:opacity-50`}>
                  <LogOut size={16} aria-hidden="true" className="text-slate-500" />
                  {busy ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {logoutError && (
        <div role="alert" className="mx-4 mb-2 rounded bg-red-700/30 px-2 py-1 text-sm text-red-100 sm:mx-6 lg:mx-8">
          Logout failed. Please try again.
        </div>
      )}
    </header>
  );
}
