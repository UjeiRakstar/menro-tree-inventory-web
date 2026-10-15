import { useId, useMemo, useState } from 'react';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { MONTHS, RISE_FIELDS, filledKeys, profileFromForm } from '../../lib/riseFields.js';
import { formKeysOf, siteNeedsProblems } from '../../lib/siteNeeds.js';
import RiseAutofill from './RiseAutofill.jsx';
import SiteNeedsFields from './SiteNeedsFields.jsx';

/** Twelve toggles, one per month; the value is the month numbers chosen. */
function MonthPicker({ label, value, onChange, labelId }) {
  const chosen = new Set(value);
  return (
    <div role="group" aria-labelledby={labelId} className="mt-1 grid grid-cols-6 gap-1 sm:grid-cols-12">
      {MONTHS.map((name, index) => {
        const month = index + 1;
        const on = chosen.has(month);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={on}
            aria-label={`${label}: ${name}`}
            onClick={() => {
              const next = new Set(chosen);
              if (on) next.delete(month);
              else next.add(month);
              onChange([...next].sort((a, b) => a - b));
            }}
            className={`rounded-md px-1 py-1.5 text-xs font-semibold ring-1 transition ${
              on ? 'bg-green-700 text-white ring-green-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One species' RISE write-up: typed in, or read from the PDF and checked.
 *
 * Fields the PDF reader filled are marked until the forester changes them or
 * says they are right, and Save asks for that once for all of them — a
 * language model can misread a table or put a fact under the wrong heading,
 * and what is saved here is what the public map shows.
 */
export default function SpeciesEditor({ initial, isNew, knownSpecies = [], takenNames = [], onSaved, onBack }) {
  const idBase = useId();
  const [form, setForm] = useState(initial);
  const [fromPdf, setFromPdf] = useState(() => new Set());
  const [everFromPdf, setEverFromPdf] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const taken = useMemo(() => new Set(takenNames.map((name) => name.toLowerCase())), [takenNames]);
  const nameClash = isNew && form.species.trim() && taken.has(form.species.trim().toLowerCase());
  const unchecked = fromPdf.size;
  const needProblems = siteNeedsProblems(form);

  // markKey: the field whose mark this clears — a site need's range is two
  // inputs under one mark.
  function setField(key, value, markKey = key) {
    setForm((current) => ({ ...current, [key]: value }));
    // Changing a field is checking it.
    setFromPdf((current) => {
      if (!current.has(markKey)) return current;
      const next = new Set(current);
      next.delete(markKey);
      return next;
    });
  }

  function confirmField(key) {
    setFromPdf((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  function handleFilled(extracted) {
    const keys = filledKeys(extracted).filter(
      // An existing write-up keeps its name: it is what the map looks it up by.
      (key) => isNew || key !== 'species'
    );
    setForm((current) => {
      const next = { ...current };
      for (const key of keys) for (const formKey of formKeysOf(key)) next[formKey] = extracted[formKey];
      return next;
    });
    setFromPdf(new Set(keys));
    setEverFromPdf(true);
    setChecked(false);
    setNote(
      !isNew && extracted.species && extracted.species.toLowerCase() !== form.species.toLowerCase()
        ? `The PDF calls it “${extracted.species}”. The name here is kept, because the map finds trees by it.`
        : ''
    );
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!form.species.trim()) {
      setError('A common name is needed — it is how the map finds the trees.');
      return;
    }
    if (nameClash) {
      setError(`${form.species.trim()} already has a write-up. Open it from the list instead.`);
      return;
    }
    if (Object.keys(needProblems).length > 0) {
      setError('Some of the site needs are not right — see the figures marked in red.');
      return;
    }
    if (unchecked > 0 && !checked) {
      setError('Tick the box to say you have checked what was read from the PDF.');
      return;
    }
    setSaving(true);
    setError('');
    const row = profileFromForm(form, { autofilled: everFromPdf });
    const { error: saveError } = await supabase
      .from('species_profiles')
      .upsert(row, { onConflict: 'species' });
    setSaving(false);
    if (saveError) {
      const missing =
        saveError.code === 'PGRST204' || saveError.code === '42703' || /column .* does not exist/i.test(saveError.message ?? '');
      setError(
        missing
          ? 'Some of these fields are not in the database yet. Run supabase/species_rise.sql and supabase/species_site_needs.sql in the SQL editor, then save again.'
          : saveError.message
      );
      return;
    }
    onSaved(row);
  }

  const knownListId = `${idBase}-known`;

  return (
    <form onSubmit={handleSave} aria-label={isNew ? 'New species' : `Edit ${initial.species}`} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft size={16} aria-hidden="true" /> All species
        </button>
        <h2 className="text-lg font-bold text-slate-900">{isNew ? 'New species' : initial.species}</h2>
      </div>

      {/* TEMPORARY — remove with the rise-extract function. */}
      <RiseAutofill onFilled={handleFilled} />

      {note && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{note}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {RISE_FIELDS.map((field) => {
          const id = `${idBase}-${field.key}`;
          const marked = fromPdf.has(field.key);
          const wide = field.kind !== 'text';
          const input =
            'mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 ' +
            (marked ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white');
          return (
            <div key={field.key} className={wide ? 'sm:col-span-2' : ''}>
              <div className="flex items-center gap-2">
                <label id={`${id}-label`} htmlFor={id} className="text-sm font-medium text-slate-700">
                  {field.label}
                  {field.required && <span className="text-red-600"> *</span>}
                </label>
                {marked && (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
                    From the PDF — check it
                    <button
                      type="button"
                      onClick={() => confirmField(field.key)}
                      aria-label={`${field.label} is right`}
                      className="inline-flex items-center gap-0.5 rounded-md bg-white px-1.5 py-0.5 text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100"
                    >
                      <Check size={11} aria-hidden="true" /> Right
                    </button>
                  </span>
                )}
              </div>
              {field.kind === 'months' ? (
                <div id={id} className={marked ? 'rounded-lg ring-2 ring-amber-300 ring-offset-2' : ''}>
                  <MonthPicker
                    label={field.label}
                    labelId={`${id}-label`}
                    value={form[field.key]}
                    onChange={(value) => setField(field.key, value)}
                  />
                </div>
              ) : field.kind === 'long' ? (
                <textarea
                  id={id}
                  rows={field.key === 'description' ? 6 : 3}
                  value={form[field.key]}
                  onChange={(e) => setField(field.key, e.target.value)}
                  className={input}
                />
              ) : (
                <input
                  id={id}
                  value={form[field.key]}
                  onChange={(e) => setField(field.key, e.target.value)}
                  readOnly={field.key === 'species' && !isNew}
                  list={field.key === 'species' ? knownListId : undefined}
                  className={`${input} ${field.key === 'species' && !isNew ? 'bg-slate-50 text-slate-500' : ''}`}
                />
              )}
              {field.hint && <p className="mt-1 text-xs text-slate-500">{field.hint}</p>}
              {field.key === 'species' && nameClash && (
                <p className="mt-1 text-xs font-semibold text-amber-700">This species already has a write-up.</p>
              )}
            </div>
          );
        })}
      </div>

      <SiteNeedsFields
        idBase={idBase}
        form={form}
        onChange={setField}
        marked={fromPdf}
        onConfirm={confirmField}
        problems={needProblems}
      />

      <datalist id={knownListId}>
        {knownSpecies.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="space-y-3 border-t border-slate-200 pt-4">
        {unchecked > 0 && (
          <label className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I have checked the {unchecked} {unchecked === 1 ? 'field' : 'fields'} read from the PDF against
              the publication.
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-green-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-50"
        >
          {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
