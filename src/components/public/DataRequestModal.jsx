import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const FIELDS = [
  { id: 'request-first-name', label: 'First Name', autoComplete: 'given-name', required: true },
  { id: 'request-last-name', label: 'Last Name', autoComplete: 'family-name', required: true },
  { id: 'request-email', label: 'Email', type: 'email', autoComplete: 'email', required: true, full: true },
  { id: 'request-affiliation', label: 'Affiliation', autoComplete: 'organization', required: true },
  { id: 'request-purpose', label: 'Purpose', required: true },
];

/**
 * The form someone fills in to ask for the inventory data.
 *
 * Nothing is downloaded yet — the exports themselves are still to be built —
 * so the form says so on submit rather than appearing to work. It is here now
 * because what it asks for is the part that needs agreeing on: who wants the
 * data, where they are from, and what for.
 */
export default function DataRequestModal({ open, onClose }) {
  const [submitted, setSubmitted] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setSubmitted(false);
      return undefined;
    }
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-green-950/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        // Only a click that starts on the backdrop closes it, so a drag that
        // ends outside the dialog does not.
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-request-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 id="data-request-title" className="text-base font-bold uppercase tracking-wide text-green-800 sm:text-lg">
            Green Tag Tree Inventory Data Request Form
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close the data request form"
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          >
            <X size={24} />
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field.id} className={field.full ? 'sm:col-span-2' : ''}>
                <label
                  htmlFor={field.id}
                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-700"
                >
                  {field.label}
                  {field.required && <span className="ml-1 text-green-700" aria-hidden="true">*</span>}
                </label>
                <input
                  id={field.id}
                  name={field.id}
                  type={field.type || 'text'}
                  autoComplete={field.autoComplete}
                  required={field.required}
                  className="w-full rounded-lg bg-slate-200/70 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
            ))}
          </div>

          {submitted && (
            <p role="status" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              Downloads are not available yet. The tables, maps and images are still being prepared — write to
              pgenro@laguna.gov.ph in the meantime and the team will send what you need.
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-green-700 px-6 py-4 text-base font-bold uppercase tracking-widest text-white transition hover:bg-green-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-green-500/50"
          >
            Download
          </button>
        </form>
      </div>
    </div>
  );
}
