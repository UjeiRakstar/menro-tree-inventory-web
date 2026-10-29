import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';

/** Whether this browser asked not to be shown a notice again. Storage may be blocked: then it shows. */
export function noticeHidden(storageKey) {
  try {
    return window.localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

function hideNotice(storageKey) {
  try {
    window.localStorage.setItem(storageKey, '1');
  } catch {
    // Not kept: it shows again next time.
  }
}

/**
 * A notice to acknowledge (29 October): "I understood" closes it, and the
 * "Don't show this again" box, ticked, keeps it closed in this browser.
 *
 *   storageKey  where the browser remembers the box
 *   title       its heading
 *   icon        the heading's icon (Info by default)
 */
export default function NoticeDialog({ open, storageKey, title, icon: Icon = Info, onClose, children }) {
  const [again, setAgain] = useState(false);
  const buttonRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    buttonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const understood = () => {
    if (again) hideNotice(storageKey);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-green-950/40 p-4 backdrop-blur-sm print:hidden">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <h2 id={titleId} className="flex items-center gap-2 text-base font-bold text-green-800 sm:text-lg">
          <Icon size={20} aria-hidden="true" /> {title}
        </h2>
        <div className="mt-4 text-sm text-slate-700">{children}</div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={again} onChange={(event) => setAgain(event.target.checked)} className="h-4 w-4 accent-green-700" />
            Don’t show this again
          </label>
          <button ref={buttonRef} type="button" onClick={understood} className="rounded-xl bg-green-700 px-5 py-2 text-sm font-bold text-white hover:bg-green-800">
            I understood
          </button>
        </div>
      </div>
    </div>
  );
}
