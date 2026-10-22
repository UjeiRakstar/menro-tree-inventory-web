import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Loader2, X } from 'lucide-react';
import { saveAs } from 'file-saver';
import { supabase } from '../../supabaseClient.js';
import { MUNICIPALITY_LIST } from '../../lib/lagunaBoundaries.js';
import { DOWNLOAD_FORMATS, downloadRecords, inventoryGeoJson, inventoryWorkbook } from '../../lib/publicDownloads.js';
import { PUBLIC_DASHBOARD_COLUMNS, selectPublicTrees } from '../../lib/treeColumns.js';
import { loadWoodDensities, withWoodDensities } from '../../lib/woodDensities.js';

const FIELDS = [
  { id: 'request-first-name', key: 'firstName', label: 'First Name', autoComplete: 'given-name' },
  { id: 'request-last-name', key: 'lastName', label: 'Last Name', autoComplete: 'family-name' },
  { id: 'request-email', key: 'email', label: 'Email', type: 'email', autoComplete: 'email', full: true },
  { id: 'request-affiliation', key: 'affiliation', label: 'Affiliation', autoComplete: 'organization', full: true },
];

/** PostgREST's "no such function": data_requests.sql has not been run yet. */
const isMissingFunction = (error) => /could not find the function|does not exist/i.test(error?.message ?? '');

const stamp = () => new Date().toISOString().slice(0, 10);
const fileStem = (lgu) => `Green-Tag_trees_${(lgu?.label ?? 'Laguna').replace(/\s+/g, '-')}_${stamp()}`;

/**
 * The data request form, and the downloads behind it (21 October).
 *
 * Who wants the data, from where and what for, is recorded first
 * (supabase/data_requests.sql) — with the requester's agreement, under RA
 * 10173 — and PGENRO reads the requests in its Inbox. Then the tagged trees
 * of Laguna, or of one city or municipality, download as an Excel workbook
 * in the standard look and as GeoJSON (src/lib/publicDownloads.js): only what
 * the public map already shows of a tree.
 *
 *   place   the LGU the page has selected, by name, to start the form on
 */
export default function DataRequestModal({ open, onClose, place = '' }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', affiliation: '', purpose: '' });
  const [lguName, setLguName] = useState(place || '');
  const [formats, setFormats] = useState(['xlsx']);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState(null); // { count, files: [{ name, blob }] }
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setDone(null);
      setProblem('');
      setBusy(false);
      return undefined;
    }
    setLguName(place || '');
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, place]);

  if (!open) return null;

  const lgu = MUNICIPALITY_LIST.find((item) => item.name === lguName) ?? null;
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const toggleFormat = (id) =>
    setFormats((current) => (current.includes(id) ? current.filter((f) => f !== id) : [...current, id]));

  async function handleSubmit(event) {
    event.preventDefault();
    setProblem('');
    if (formats.length === 0) {
      setProblem('Choose at least one file to download.');
      return;
    }
    if (!agreed) {
      setProblem('Tick the box to agree to your details being kept, so the data can be released.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('log_data_request', {
        p_first_name: form.firstName,
        p_last_name: form.lastName,
        p_email: form.email,
        p_affiliation: form.affiliation,
        p_purpose: form.purpose,
        p_place: lgu ? lgu.label : 'Laguna',
        p_formats: formats,
      });
      // Before data_requests.sql has run the request cannot be kept; the data
      // still goes out, since the form asked for everything it would record.
      if (error && !isMissingFunction(error)) {
        setProblem(error.message);
        return;
      }

      const [{ data, error: loadError }, densities] = await Promise.all([
        selectPublicTrees(supabase, PUBLIC_DASHBOARD_COLUMNS),
        loadWoodDensities(supabase),
      ]);
      if (loadError) {
        setProblem(loadError.message || 'The inventory could not be loaded. Try again.');
        return;
      }
      const records = downloadRecords(withWoodDensities(Array.isArray(data) ? data : [], densities), { place: lgu?.name ?? null });
      const files = [];
      if (formats.includes('xlsx')) {
        files.push({ name: `${fileStem(lgu)}.xlsx`, blob: await inventoryWorkbook(records, { lgu }) });
      }
      if (formats.includes('geojson')) {
        const text = inventoryGeoJson(records, { placeLabel: lgu ? lgu.label : 'Laguna' });
        files.push({ name: `${fileStem(lgu)}.geojson`, blob: new Blob([text], { type: 'application/geo+json' }) });
      }
      for (const file of files) saveAs(file.blob, file.name);
      setDone({ count: records.length, files });
    } catch (failure) {
      setProblem(`The files could not be made: ${failure.message}`);
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    'w-full rounded-lg bg-slate-200/70 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-600';
  const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-700';

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

        {done ? (
          <div role="status" className="space-y-4">
            <p className="flex items-start gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900 ring-1 ring-green-200">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Downloaded: {done.count.toLocaleString('en-US')} {done.count === 1 ? 'tree' : 'trees'} in {lgu ? lgu.label : 'Laguna'}.
                Each file says how to cite it and where every figure comes from.
              </span>
            </p>
            <ul className="space-y-2">
              {done.files.map((file) => (
                <li key={file.name}>
                  <button
                    type="button"
                    onClick={() => saveAs(file.blob, file.name)}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50"
                  >
                    <Download size={15} aria-hidden="true" /> Download {file.name} again
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit} aria-label="Data request">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <div key={field.id} className={field.full ? 'sm:col-span-2' : ''}>
                  <label htmlFor={field.id} className={labelClass}>
                    {field.label}
                    <span className="ml-1 text-green-700" aria-hidden="true">*</span>
                  </label>
                  <input
                    id={field.id}
                    name={field.id}
                    type={field.type || 'text'}
                    autoComplete={field.autoComplete}
                    required
                    value={form[field.key]}
                    onChange={set(field.key)}
                    className={fieldClass}
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <label htmlFor="request-purpose" className={labelClass}>
                  Purpose<span className="ml-1 text-green-700" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="request-purpose"
                  name="request-purpose"
                  required
                  rows={3}
                  maxLength={1000}
                  value={form.purpose}
                  onChange={set('purpose')}
                  placeholder="e.g. a thesis on urban trees, a barangay greening plan"
                  className={fieldClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="request-place" className={labelClass}>
                  Trees of
                </label>
                <select id="request-place" value={lguName} onChange={(event) => setLguName(event.target.value)} className={fieldClass}>
                  <option value="">All of Laguna</option>
                  {MUNICIPALITY_LIST.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset>
              <legend className={labelClass}>Files</legend>
              <div className="space-y-2">
                {DOWNLOAD_FORMATS.map((format) => (
                  <label key={format.id} className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={formats.includes(format.id)} onChange={() => toggleFormat(format.id)} className="mt-1" />
                    <span>
                      <span className="font-semibold">{format.label}</span>
                      <span className="block text-xs text-slate-500">{format.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-3 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
              <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5" />
              <span>
                I agree that PGENRO Laguna keeps my name, email, affiliation and purpose, to know who uses the inventory and
                for what (Data Privacy Act of 2012, RA 10173). They are not shown to anyone else.{' '}
                <a href="/privacy.html" target="_blank" rel="noreferrer" className="font-semibold text-green-800 underline">
                  Privacy policy
                </a>{' '}
                · <a href="/terms.html" target="_blank" rel="noreferrer" className="font-semibold text-green-800 underline">Terms of use</a>
              </span>
            </label>

            {problem && (
              <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {problem}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-700 px-6 py-4 text-base font-bold uppercase tracking-widest text-white transition hover:bg-green-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-green-500/50 disabled:opacity-60"
            >
              {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
              {busy ? 'Preparing the files…' : 'Download'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
