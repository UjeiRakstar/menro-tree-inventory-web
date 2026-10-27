import { createContext, useContext, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Set by Settings around the sections that keep the real office's records —
 * its profile, barangay figures, documents, climate plan and AI key — for a
 * training account, which the database will not let change them
 * (keeps_office(), lccap.sql). Such a section still opens, to be seen, with
 * every field and button disabled and the reason said, rather than a form
 * that fails with "new row violates row-level security policy".
 */
export const TrainingLock = createContext(false);

/** One part of Settings: a heading that opens and closes what is under it. */
export default function Section({ title, description, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const locked = useContext(TrainingLock);
  return (
    <section aria-labelledby={`${id}-title`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 id={`${id}-title`}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          className="flex w-full items-center gap-3 bg-slate-50 px-5 py-3.5 text-left hover:bg-slate-100"
        >
          <span className="flex-1">
            <span className="block text-base font-bold text-slate-900">{title}</span>
            {description && <span className="block text-xs font-normal text-slate-500">{description}</span>}
          </span>
          <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </h2>
      {open && (
        <div id={`${id}-body`} className="border-t border-slate-200 px-5 py-4">
          {locked ? (
            <>
              <p role="note" className="mb-4 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900 ring-1 ring-violet-200">
                Practice account: this is the real office&apos;s, so it can be seen here but not changed. On the office&apos;s
                own account, this is where it is done.
              </p>
              <fieldset disabled className="min-w-0 opacity-70">
                {children}
              </fieldset>
            </>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}

export const inputClass =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20';
export const buttonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition disabled:opacity-50';

/** A saved / failed line under a section's button. */
export function Outcome({ outcome }) {
  if (!outcome) return null;
  return (
    <p role={outcome.ok ? 'status' : 'alert'} className={`text-sm ${outcome.ok ? 'text-green-800' : 'text-red-700'}`}>
      {outcome.text}
    </p>
  );
}
