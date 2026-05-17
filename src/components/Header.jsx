import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import santaCruzLogo from '../assets/Santa Cruz Logo.png';
import menroLogo from '../assets/MENRO Santa Cruz logo.png';

const NAV_ITEMS = [
  { to: '/biodiversity-dashboard', label: 'Biodiversity Dashboard' },
  { to: '/map',                    label: 'Map' },
  { to: '/action-board',           label: 'Action Board' },
  { to: '/arborists',              label: 'Arborist' },
];

const LOGOUT_TIMEOUT_MS = 5000;

export default function Header() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  async function handleLogout() {
    setLogoutError(false);
    setBusy(true);
    try {
      const signOut = supabase.auth.signOut();
      const timeout = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('logout-timeout')),
          LOGOUT_TIMEOUT_MS
        )
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

  return (
    <header className="bg-green-700 text-white w-full px-6 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-6">
        {/* Left: Logos + Title */}
        <div className="flex items-center gap-3">
          <img
            src={santaCruzLogo}
            alt="Santa Cruz logo"
            className="h-10 w-auto"
          />
          <img
            src={menroLogo}
            alt="MENRO Santa Cruz logo"
            className="h-10 w-auto"
          />
          <span className="font-bold text-lg whitespace-nowrap text-white">
            Tree Inventory System of MENRO Santa Cruz
          </span>
        </div>

        {/* Right: Navigation + Logout */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={false}
              className={({ isActive }) =>
                isActive
                  ? 'px-4 py-1.5 rounded-full text-sm font-semibold bg-white text-green-700 shadow-sm'
                  : 'px-4 py-1.5 rounded-full text-sm font-medium text-white/90 hover:bg-white/10 transition'
              }
            >
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={handleLogout}
            disabled={busy}
            aria-label="Logout"
            className="ml-1 px-4 py-1.5 rounded-full text-sm font-medium text-white/90 hover:bg-white/10 transition disabled:opacity-50"
          >
            Logout
          </button>
        </nav>
      </div>

      {logoutError && (
        <div role="alert" className="mt-2 text-sm text-red-100 bg-red-700/30 rounded px-2 py-1">
          Logout failed. Please try again.
        </div>
      )}
    </header>
  );
}
