import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import greenTagLogo from '../assets/GreenTag_Logo.png';
import { useAuthIfAny } from '../context/AuthContext.jsx';
import { displayNameOf } from '../lib/community.js';
import { REPLIES_READ_EVENT, countUnreadReplies } from '../lib/replies.js';

/**
 * The order a visitor meets the site in: who we are, then the thing they came
 * for, then the figures behind it. The map earns second place because it is
 * what a resident opens — the dashboard is where they go once the map has made
 * them curious.
 */
const navLinks = [
  { to: '/about', label: 'About Us' },
  { to: '/public-map', label: 'Map' },
  { to: '/biodiversity', label: 'BioDashboard' },
  { to: '/community', label: 'Community' },
  { to: '/contact', label: 'Contact Us' },
];

export default function PublicNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  // A resident signed in with Google is shown by name, and goes to the
  // community page; the office sign-in is not theirs.
  const auth = useAuthIfAny();
  const resident = auth?.session && !auth.profile ? auth.resident : null;
  const account = resident
    ? { to: '/community', label: resident.consented_at ? displayNameOf(resident) : 'Finish joining' }
    : { to: '/login', label: 'Log In / Sign Up' };

  // An office's reply waiting for the resident: a "!" on their name, as the
  // offices' own header marks what waits (replies.sql). Read again on every
  // page, so it clears once the Community page has shown it.
  const [waiting, setWaiting] = useState(0);
  const residentId = resident?.id ?? null;
  useEffect(() => {
    if (!residentId) {
      setWaiting(0);
      return undefined;
    }
    let cancelled = false;
    countUnreadReplies().then((n) => {
      if (!cancelled) setWaiting(n);
    });
    return () => {
      cancelled = true;
    };
  }, [residentId, location.pathname]);
  useEffect(() => {
    const cleared = () => setWaiting(0);
    window.addEventListener(REPLIES_READ_EVENT, cleared);
    return () => window.removeEventListener(REPLIES_READ_EVENT, cleared);
  }, []);
  const waitingLabel = waiting ? `${waiting} ${waiting === 1 ? 'reply' : 'replies'} from an office waiting` : '';
  const replyMark = waiting ? (
    <span
      role="status"
      aria-label={waitingLabel}
      title={waitingLabel}
      className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-green-800"
    >
      !
    </span>
  ) : null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-green-900/95 backdrop-blur-md shadow-lg'
          : 'bg-green-800'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16 sm:h-[68px]">
          {/* Left: GreenTag Diamond Logo + Title — home link */}
          <Link
            to="/"
            className="flex items-center gap-3 group flex-shrink-0"
          >
            <img
              src={greenTagLogo}
              alt="Green Tag Logo"
              className="w-12 h-12 sm:w-13 sm:h-13 object-contain drop-shadow-lg group-hover:scale-105 transition-transform duration-200"
            />
            <span className="text-[11px] sm:text-xs font-bold text-white uppercase tracking-widest leading-tight">
              Green Tag
              <br />
              <span className="font-normal tracking-wider opacity-80">
                Tree Inventory System
              </span>
            </span>
          </Link>

          {/* Spacer to push nav and login to the right */}
          <div className="flex-1" />

          {/* Desktop: Nav Links — evenly spaced */}
          <div className="hidden lg:flex items-center gap-2">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`relative px-5 py-2 text-sm font-semibold uppercase tracking-wider transition-all duration-200 rounded-md ${
                    isActive
                      ? 'text-white bg-green-600/40'
                      : 'text-green-100/90 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {link.label}
                  {/* Active indicator dot */}
                  {isActive && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-green-300 rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Desktop: Log In Button. It says sign up too, because an officer
              arriving for the first time has no account yet and would otherwise
              have to guess that one is made behind a button marked Log In. */}
          <div className="relative hidden lg:flex items-center ml-6">
            <Link
              to={account.to}
              className="max-w-[14rem] truncate whitespace-nowrap px-5 py-2 text-sm font-semibold text-white border border-white/70 rounded-lg
                         hover:bg-white hover:text-green-800 transition-all duration-300
                         hover:shadow-lg hover:shadow-white/10 active:scale-95"
            >
              {account.label}
            </Link>
            {replyMark}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 rounded-md text-green-100 hover:text-white hover:bg-green-700 ml-3 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu — slides down */}
      <div
        className={`lg:hidden overflow-hidden transition-all duration-300 ${
          mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="border-t border-green-700/50 bg-green-800/95 backdrop-blur-md px-4 py-3 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              className={`block px-4 py-2.5 rounded-lg text-base font-medium transition-colors ${
                location.pathname === link.to
                  ? 'bg-green-600/40 text-white'
                  : 'text-green-100 hover:text-white hover:bg-white/10'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="relative pt-2 border-t border-green-700/50">
            <Link
              to={account.to}
              onClick={() => setMobileOpen(false)}
              className="block px-4 py-2.5 rounded-lg text-base font-semibold text-white border border-white/60 text-center hover:bg-white hover:text-green-800 transition-all duration-200"
            >
              {account.label}
            </Link>
            {mobileOpen && replyMark}
          </div>
        </div>
      </div>
    </nav>
  );
}
