import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import santaCruzLogo from '../assets/Santa Cruz Logo.png';
import menroLogo from '../assets/MENRO Santa Cruz logo.png';

const navLinks = [
  { to: '/biodiversity', label: 'Biodiversity Dashboard' },
  { to: '/public-map', label: 'Map' },
  { to: '/wiki-trees', label: 'Wiki Trees' },
  { to: '/about', label: 'About Us' },
];

export default function PublicNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <nav className="bg-green-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Left: Logos + Title */}
          <div className="flex items-center gap-3">
            {/* Santa Cruz Logo */}
            <img
              src={santaCruzLogo}
              alt="Municipality of Santa Cruz Logo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover flex-shrink-0"
            />
            {/* MENRO Logo */}
            <img
              src={menroLogo}
              alt="MENRO Santa Cruz Logo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover flex-shrink-0"
            />
            <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">
              Tree Inventory System of MENRO Santa Cruz
            </span>
          </div>

          {/* Center: Desktop Links */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === link.to
                    ? 'bg-green-700 text-white'
                    : 'text-green-100 hover:text-white hover:bg-green-700'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right: Login Button */}
          <div className="hidden lg:flex items-center">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-white border border-green-400 rounded-lg hover:bg-green-700 transition-colors"
            >
              MENRO Login
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 rounded-md text-green-100 hover:text-white hover:bg-green-700"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-green-700 bg-green-800">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  location.pathname === link.to
                    ? 'bg-green-700 text-white'
                    : 'text-green-100 hover:text-white hover:bg-green-700'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-green-700">
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-white border border-green-400 text-center hover:bg-green-700"
              >
                MENRO Login
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
