import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FileText, Lightbulb, Loader2, Upload, X } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { formatArea, SQ_M_PER_HECTARE } from '../../lib/areaGeometry.js';
import { municipalityAt } from '../../lib/lagunaBoundaries.js';
import { barangayAt, loadBarangayIndex } from '../../lib/barangayLookup.js';
import { suggestCover, suggestionLabel } from '../../lib/coverSuggestion.js';
import {
  DESIGNATIONS,
  NAMRIA_CLASSES,
  PLANNING_ONLY,
  namriaClassById,
  noRateReason,
} from '../../lib/namriaCover.js';
import {
  AREA_KINDS,
  PLANTING_STATUSES,
  areaFormProblems,
  measure,
  rowFromForm,
  treesInside,
} from '../../lib/mapAreas.js';
import { ProvisionalNote } from '../public/Provisional.jsx';

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const TITLES = {
  new: 'Save this area',
  edit: 'Edit this area',
  propose: 'Propose a change',
};

const isMissingTable = (error) =>
  Boolean(error) && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message ?? ''));

/** Where the area's middle falls: barangay and town, from the PSA boundaries. */
function usePlace(centroid) {
  const [place, setPlace] = useState(null);
  const key = centroid ? centroid.map((n) => n.toFixed(6)).join(',') : '';
  useEffect(() => {
    if (!centroid) {
      setPlace(null);
      return undefined;
    }
    let cancelled = false;
    const municipality = municipalityAt(centroid);
    setPlace((current) => ({ ...current, municipality }));
    loadBarangayIndex()
      .then(() => {
        if (cancelled) return;
        const hit = barangayAt(centroid);
        setPlace({
          municipality: hit?.municipality ?? municipality,
          barangay: hit?.barangay ?? null,
          psgc: hit?.psgc ?? null,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // The centroid is a fresh array on every render; its rounded key is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return place;
}

/** Said once, before any document is chosen — decision 7's warning. */
function DocumentNotice({ onChoose, onCancel }) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Before you upload"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-bold text-slate-900">Before you upload</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-snug text-slate-700">
          <li>The system does not check what is uploaded.</li>
          <li>
            The file will be <strong>published on the website for anyone to read</strong>.
          </li>
          <li>Upload only public documents — laws, ordinances, proclamations, plans.</li>
        </ul>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onChoose}
            className="flex-1 rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800"
          >
            I understand — choose the PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, problem, hint, children, required = false }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && !problem && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
      {problem && <p className="mt-1 text-[11px] font-semibold text-red-700">{problem}</p>}
    </div>
  );
}

const input =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20';

/**
 * Saving what was drawn — phase 3 of ACCOUNTS_AND_MAPPING.md.
 *
 * Reviews what the map measured, offers the suggestion from the trees inside,
 * takes the class, any legal designation with its document, and a planting
 * site's details. It saves a new area, saves an edit, or — PGENRO on an
 * office's area — files the change as a proposal for the MENRO to decide.
 * The boundary is whatever is drawn on the map while this is open, so it can
 * be adjusted right up to saving.
 */
export default function AreaForm({ mode = 'new', initial, existing = null, shape, trees = [], onSaved, onCancel }) {
  const idBase = useId();
  const id = (name) => `${idBase}-${name}`;
  const fileInput = useRef(null);
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState(null);
  const [notice, setNotice] = useState(false);
  const [proposalNote, setProposalNote] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const measured = useMemo(() => measure(shape), [shape]);
  const measurable = measured.areaM2 !== null;
  const place = usePlace(shape?.closed ? measured.centroid : null);
  const inside = useMemo(
    () => (shape?.closed ? treesInside(trees, measured.geometry) : []),
    [shape, trees, measured]
  );
  const suggestion = useMemo(() => suggestCover(inside), [inside]);
  const problems = areaFormProblems(form, { measurable, hasNewDocument: Boolean(file) });
  const shown = tried ? problems : {};
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const chosen = namriaClassById(form.coverClass);
  const unit = (measured.areaM2 ?? 0) >= SQ_M_PER_HECTARE ? 'ha' : 'm2';

  function handleFile(event) {
    const picked = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!picked) return;
    if (picked.type && picked.type !== 'application/pdf') {
      setError('The document must be a PDF.');
      return;
    }
    if (picked.size > MAX_DOCUMENT_BYTES) {
      setError('That PDF is over 20 MB.');
      return;
    }
    setError('');
    setFile(picked);
  }

  async function uploadDocument() {
    const folder = String(place?.municipality ?? 'laguna').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const path = `${folder}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('area-documents')
      .upload(path, file, { contentType: 'application/pdf', upsert: false });
    if (uploadError) {
      throw new Error(
        /bucket not found/i.test(uploadError.message ?? '')
          ? 'The documents bucket is not there yet. Run supabase/map_areas.sql, then save again.'
          : `The document could not be uploaded: ${uploadError.message}`
      );
    }
    return supabase.storage.from('area-documents').getPublicUrl(path).data.publicUrl;
  }

  async function handleSave(event) {
    event.preventDefault();
    setTried(true);
    setError('');
    if (Object.keys(problems).length > 0) return;
    setSaving(true);
    try {
      const docUrl = form.designation && file ? await uploadDocument() : null;
      const row = rowFromForm(form, { shape, place, suggestion, treesCount: inside.length, docUrl });

      let result;
      if (mode === 'propose') {
        result = await supabase
          .from('map_area_proposals')
          .insert({ area_id: existing.id, changes: row, note: proposalNote.trim() || null })
          .select()
          .single();
      } else if (mode === 'edit') {
        result = await supabase.from('map_areas').update(row).eq('id', existing.id).select().single();
      } else {
        result = await supabase.from('map_areas').insert(row).select().single();
      }
      if (result.error) {
        throw new Error(
          isMissingTable(result.error)
            ? 'Saving areas needs supabase/map_areas.sql, which has not been run yet.'
            : result.error.message
        );
      }
      onSaved({ id: mode === 'propose' ? existing.id : result.data?.id ?? existing?.id, mode });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside
      role="complementary"
      aria-label={TITLES[mode]}
      className="absolute inset-y-0 right-0 z-[600] flex w-full flex-col bg-white shadow-2xl sm:w-[380px] sm:rounded-l-2xl"
    >
      <form onSubmit={handleSave} noValidate className="flex min-h-0 flex-1 flex-col" aria-label={TITLES[mode]}>
        <div className="flex items-start gap-2 border-b border-slate-200 px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold leading-tight text-slate-900">{TITLES[mode]}</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {mode === 'propose'
                ? `${existing?.name} — the MENRO / CENRO decides whether it is applied.`
                : 'Adjust the boundary on the map until it is right, then save.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {/* What the map measured */}
          <section aria-label="What the map measured" className="rounded-xl bg-slate-50 px-3 py-2.5 text-[12.5px] ring-1 ring-inset ring-slate-200">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-slate-500">Area</dt>
              <dd className="font-semibold text-slate-800">
                {measurable ? formatArea(measured.areaM2, unit) : shape?.closed ? 'Edges cross — not measurable' : 'Close the shape'}
              </dd>
              <dt className="text-slate-500">Perimeter</dt>
              <dd className="font-semibold text-slate-800">
                {measured.perimeterM != null ? `${Math.round(measured.perimeterM).toLocaleString('en-US')} m` : '—'}
              </dd>
              <dt className="text-slate-500">Where</dt>
              <dd className="font-semibold text-slate-800">
                {[place?.barangay && `Brgy. ${place.barangay}`, place?.municipality].filter(Boolean).join(', ') || '—'}
              </dd>
              <dt className="text-slate-500">Tagged trees</dt>
              <dd className="font-semibold text-slate-800">
                {shape?.closed ? `${inside.length} inside, ${suggestion.facts.species} species` : '—'}
              </dd>
            </dl>
            {shown.shape && <p className="mt-1 text-[11px] font-semibold text-red-700">{shown.shape}</p>}
          </section>

          <ProvisionalNote kind="awaiting" title="elevation, soil, climate, hazards">
            Filled in for each area once PGENRO uploads its layers. Nothing to enter here.
          </ProvisionalNote>

          <div role="radiogroup" aria-label="Kind of area" className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {AREA_KINDS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                role="radio"
                aria-checked={form.kind === kind.id}
                onClick={() => setForm((current) => ({ ...current, kind: kind.id }))}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  form.kind === kind.id ? 'bg-white text-green-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {kind.label}
              </button>
            ))}
          </div>

          <Field id={id('name')} label="Name" required problem={shown.name}>
            <input id={id('name')} value={form.name} onChange={set('name')} className={input}
              placeholder={form.kind === 'planting-site' ? 'e.g. Labuin Riverbank' : 'e.g. Labuin Secondary Forest'} />
          </Field>

          {form.kind === 'land-cover' && (
            <>
              <section aria-label="Suggestion" className="rounded-xl border border-green-200 bg-green-50/60 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-green-900">
                  <Lightbulb size={14} aria-hidden="true" />
                  {suggestion.classId ? `Suggested: ${suggestionLabel(suggestion)}` : 'No suggestion'}
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-green-900/80">{suggestion.reason}</p>
                {suggestion.plantation && (
                  <p className="mt-1 text-[11.5px] font-semibold text-green-900">Likely a plantation.</p>
                )}
                {suggestion.classId && form.coverClass !== suggestion.classId && (
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, coverClass: suggestion.classId }))}
                    className="mt-2 rounded-lg bg-white px-2.5 py-1 text-[11.5px] font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50"
                  >
                    Use this
                  </button>
                )}
                <p className="mt-1.5 text-[10.5px] text-green-900/60">The page suggests; you decide, from what is on the ground.</p>
              </section>

              <Field id={id('cover')} label="Land cover (NAMRIA)" required problem={shown.coverClass}
                hint={chosen ? chosen.match ?? noRateReason(chosen.id) : null}>
                <select id={id('cover')} value={form.coverClass} onChange={set('coverClass')} className={input}>
                  <option value="">Choose…</option>
                  <optgroup label="Tree cover">
                    {NAMRIA_CLASSES.filter((cls) => cls.treeCover).map((cls) => (
                      <option key={cls.id} value={cls.id}>{cls.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Not tree cover">
                    {NAMRIA_CLASSES.filter((cls) => !cls.treeCover).map((cls) => (
                      <option key={cls.id} value={cls.id}>{cls.label}</option>
                    ))}
                  </optgroup>
                </select>
              </Field>
            </>
          )}

          {form.kind === 'planting-site' && (
            <>
              <Field id={id('status')} label="Status">
                <select id={id('status')} value={form.plantingStatus} onChange={set('plantingStatus')} className={input}>
                  {PLANTING_STATUSES.map((status) => (
                    <option key={status.id} value={status.id}>{status.label}</option>
                  ))}
                </select>
              </Field>
              <Field id={id('window')} label="When to plant" hint="e.g. June to August, at the start of the rains">
                <input id={id('window')} value={form.plantingWindow} onChange={set('plantingWindow')} className={input} />
              </Field>
              <Field id={id('spacing')} label="Spacing (m)" problem={shown.spacingM} hint="Used to work out how many seedlings fit.">
                <input id={id('spacing')} inputMode="decimal" value={form.spacingM} onChange={set('spacingM')} className={input} />
              </Field>
              <Field id={id('recommended')} label="Recommended species" hint="Common names, separated by commas.">
                <textarea id={id('recommended')} rows={2} value={form.recommended} onChange={set('recommended')} className={input} />
              </Field>
              <Field id={id('access')} label="Getting there">
                <input id={id('access')} value={form.accessNote} onChange={set('accessNote')} className={input} />
              </Field>
              <Field id={id('contact')} label="Who to ask">
                <input id={id('contact')} value={form.contact} onChange={set('contact')} className={input} />
              </Field>
            </>
          )}

          {/* A legal designation needs its document; land cover alone does not. */}
          <Field id={id('designation')} label="Legal designation" hint="Optional. Choosing one asks for its document.">
            <select id={id('designation')} value={form.designation} onChange={set('designation')} className={input}>
              <option value="">None</option>
              {DESIGNATIONS.map((designation) => (
                <option key={designation.id} value={designation.id}>{designation.label}</option>
              ))}
            </select>
          </Field>

          {form.designation && (
            <section aria-label="The document" className="space-y-3 rounded-xl border border-slate-200 px-3 py-3">
              <Field id={id('docType')} label="Kind of document" required problem={shown.docType}
                hint="e.g. Municipal Ordinance, Presidential Proclamation">
                <input id={id('docType')} value={form.docType} onChange={set('docType')} className={input} />
              </Field>
              <Field id={id('docNumber')} label="Number">
                <input id={id('docNumber')} value={form.docNumber} onChange={set('docNumber')} className={input} placeholder="e.g. 2019-012" />
              </Field>
              <Field id={id('docTitle')} label="Title" required problem={shown.docTitle}
                hint="So the public can find it without opening it.">
                <input id={id('docTitle')} value={form.docTitle} onChange={set('docTitle')} className={input}
                  placeholder="e.g. Zoning Ordinance of Santa Cruz" />
              </Field>
              <div>
                <p className="text-[12.5px] font-semibold text-slate-700">
                  The document (PDF)<span className="text-red-600"> *</span>
                </p>
                {(file || form.docUrl) && (
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-700">
                    <FileText size={14} className="text-green-700" aria-hidden="true" />
                    {file ? file.name : (
                      <a href={form.docUrl} target="_blank" rel="noreferrer" className="text-green-700 underline">
                        The document already attached
                      </a>
                    )}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setNotice(true)}
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  <Upload size={13} aria-hidden="true" />
                  {file || form.docUrl ? 'Replace the PDF' : 'Attach the PDF'}
                </button>
                <input ref={fileInput} type="file" accept="application/pdf" onChange={handleFile} className="sr-only"
                  aria-label="Document PDF" tabIndex={-1} />
                {shown.document && <p className="mt-1 text-[11px] font-semibold text-red-700">{shown.document}</p>}
              </div>
            </section>
          )}

          <Field id={id('notes')} label="Notes">
            <textarea id={id('notes')} rows={2} value={form.notes} onChange={set('notes')} className={input} />
          </Field>

          {mode === 'propose' && (
            <Field id={id('why')} label="For the MENRO / CENRO: what and why" hint="Shown with the proposal.">
              <textarea id={id('why')} rows={2} value={proposalNote} onChange={(e) => setProposalNote(e.target.value)} className={input} />
            </Field>
          )}

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-medium leading-snug text-slate-600 ring-1 ring-inset ring-slate-200">
            {PLANNING_ONLY}
          </p>
        </div>

        <div className="space-y-2 border-t border-slate-200 bg-slate-50/80 px-4 py-3">
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>
          )}
          {tried && Object.keys(problems).length > 0 && !error && (
            <p role="alert" className="text-[12px] font-semibold text-red-700">Some details are missing — see above.</p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onCancel}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-white">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50">
              {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {saving ? 'Saving…' : mode === 'propose' ? 'Send the proposal' : 'Save the area'}
            </button>
          </div>
        </div>
      </form>

      {notice && (
        <DocumentNotice
          onCancel={() => setNotice(false)}
          onChoose={() => {
            setNotice(false);
            fileInput.current?.click();
          }}
        />
      )}
    </aside>
  );
}
