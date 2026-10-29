import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Monitor, Smartphone, X } from 'lucide-react';
import { useAuthIfAny } from '../context/AuthContext.jsx';
import { ROLES, roleOf } from '../lib/roles.js';

const PHONE = '(max-width: 639px)';
const BELOW_DESKTOP = '(max-width: 1023px)';
const DISMISSED_KEY = 'greentag.desktopNotice.dismissed';

/** Which kind of screen this is, following the window if it is resized. */
export function useScreen() {
  const read = () => {
    if (globalThis.matchMedia?.(PHONE).matches) return 'phone';
    if (globalThis.matchMedia?.(BELOW_DESKTOP).matches) return 'tablet';
    return 'desktop';
  };
  const [screen, setScreen] = useState(read);
  useEffect(() => {
    const queries = [PHONE, BELOW_DESKTOP].map((q) => globalThis.matchMedia?.(q)).filter(Boolean);
    const update = () => setScreen(read());
    queries.forEach((q) => q.addEventListener?.('change', update));
    return () => queries.forEach((q) => q.removeEventListener?.('change', update));
  }, []);
  return screen;
}

/**
 * A tool a city or municipal office does not use on a phone (29 October):
 * the office map and Maps and reports. On a phone the office gets a page that
 * sends it to a computer, and to the mobile app in the field; on a tablet or
 * a computer, and for PGENRO, the tool itself.
 *
 *   what   the tool's name, e.g. "The office map"
 */
export function ComputerOnly({ what, children }) {
  const screen = useScreen();
  const profile = useAuthIfAny()?.profile ?? null;
  if (screen !== 'phone' || roleOf(profile) !== ROLES.LGU_ADMIN) return children;
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div role="note" className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg ring-1 ring-slate-200">
        <Monitor size={32} className="mx-auto text-green-700" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-bold text-slate-900">{what} needs a computer</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Open Green Tag in a web browser on a desktop or laptop to use it. In the field, tag and check trees with the Green Tag mobile app.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Smartphone size={13} aria-hidden="true" /> Not available on a phone
        </p>
        <Link to="/biodiversity-dashboard" className="mt-5 block rounded-lg bg-green-700 py-2.5 text-sm font-semibold text-white hover:bg-green-800">
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}

/**
 * The office tools are built for a desktop, and say so where it matters.
 *
 * On a desktop, nothing. On a tablet, a note that most things work and some
 * do not. On a phone, a plain statement that this is not the tool, and which
 * one is. Dismissible for the session — a notice that cannot be closed on a
 * screen this small is a notice in the way of the thing it is about.
 */
export default function DesktopNotice() {
  const screen = useScreen();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (screen === 'desktop' || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Private browsing: it simply comes back next page.
    }
  }

  return (
    <div
      role="note"
      className="flex shrink-0 items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-snug text-amber-900 sm:px-6"
    >
      <Monitor size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
      <p className="flex-1">
        {screen === 'phone' ? (
          <>
            <strong>Green Tag&apos;s office tools are made for a desktop computer</strong> and do not work
            properly on a phone. In the field, use the Green Tag mobile app.
          </>
        ) : (
          <>
            <strong>Made for a desktop computer.</strong> On a tablet most tools work, but not all —
            drawing and the side panels are easiest with a mouse and a wide screen.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-0.5 text-amber-700 hover:bg-amber-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}
