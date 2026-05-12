import { NavLink, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { supabase } from '../supabaseClient.js';

const NAV_TABS = [
  { to: '/map', label: 'Main Dashboard' },
  { to: '/action-board', label: 'Action Board' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/arborists', label: 'Arborists' },
  { to: '/analytics', label: 'Analytics' },
];

export default function Header() {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <header className="bg-green-700 text-white w-full px-6 py-3">
      <div className="flex items-center justify-between">
        {/* Left: Title area */}
        <div className="flex flex-col">
          <span className="text-lg font-semibold">Tree Inventory &amp; Carbon Dashboard</span>
          <span className="text-xs text-green-200"><span>Mission Control</span> • Decision Support System v1.2</span>
        </div>

        {/* Right: Navigation tabs + Logout */}
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1">
            {NAV_TABS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  isActive
                    ? 'px-3 py-1.5 rounded-full text-sm font-medium bg-white text-green-700'
                    : 'px-3 py-1.5 rounded-full text-sm font-medium text-white hover:bg-green-600'
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-green-200 hover:text-white hover:bg-green-600 transition"
            title="Sign out"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
