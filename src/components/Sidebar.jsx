import { NavLink } from 'react-router-dom';
import { Map, TreePine, ClipboardList, Users, BarChart3, History } from 'lucide-react';

export const NAV_ITEMS = [
  { to: '/map', label: 'Command Center', Icon: Map },
  { to: '/inventory', label: 'Inventory', Icon: TreePine },
  { to: '/action-board', label: 'Action Board', Icon: ClipboardList },
  { to: '/arborists', label: 'Field Team', Icon: Users },
  { to: '/analytics', label: 'Analytics', Icon: BarChart3 },
  { to: '/audit-log', label: 'Audit Log', Icon: History },
];

function Sidebar() {
  return (
    <nav className="hidden md:flex md:flex-col w-60 bg-slate-900 text-slate-100 p-4 gap-1">
      {NAV_ITEMS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded ${
              isActive ? 'bg-slate-700 text-white' : 'hover:bg-slate-800'
            }`
          }
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default Sidebar;
