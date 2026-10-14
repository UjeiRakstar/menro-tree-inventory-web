import { useEffect, useState } from 'react';
import { Monitor, X } from 'lucide-react';

const PHONE = '(max-width: 639px)';
const BELOW_DESKTOP = '(max-width: 1023px)';
const DISMISSED_KEY = 'greentag.desktopNotice.dismissed';

/** Which kind of screen this is, following the window if it is resized. */
function useScreen() {
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
