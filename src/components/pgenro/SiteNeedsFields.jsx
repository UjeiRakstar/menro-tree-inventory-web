import { Check } from 'lucide-react';
import { SITE_NEEDS } from '../../lib/siteNeeds.js';

/**
 * A species' site needs as figures, under its RISE prose — what planting
 * sites are matched against (src/lib/speciesMatch.js).
 *
 *   form       the editor's form; the site needs are its keys too
 *   onChange   (formKey, value, needKey) — needKey clears that need's mark
 *   marked     needs the PDF reader filled and nobody has checked yet
 *   onConfirm  (needKey) — "that one is right"
 *   problems   { needKey: message }
 */
export default function SiteNeedsFields({ idBase, form, onChange, marked, onConfirm, problems = {} }) {
  const control = (isMarked) =>
    'w-full rounded-lg border px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 ' +
    (isMarked ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white');

  return (
    <fieldset className="rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-sm font-bold text-slate-800">Site needs, in figures</legend>
      <p className="text-xs text-slate-500">
        The same facts as “Site requirements” above, as numbers and choices, so planting sites can be matched
        against what PGENRO’s layers measured there. Leave blank whatever the issue does not say — a blank is left
        unchecked, never guessed.
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {SITE_NEEDS.map((need) => {
          const id = `${idBase}-need-${need.key}`;
          const isMarked = marked.has(need.key);
          return (
            <div key={need.key} className={need.kind === 'many' ? 'sm:col-span-2' : ''}>
              <div className="flex items-center gap-2">
                <span id={`${id}-label`} className="text-sm font-medium text-slate-700">
                  {need.label}
                  {need.unit && <span className="font-normal text-slate-400"> ({need.unit})</span>}
                </span>
                {isMarked && (
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
                    From the PDF — check it
                    <button
                      type="button"
                      onClick={() => onConfirm(need.key)}
                      aria-label={`${need.label} is right`}
                      className="inline-flex items-center gap-0.5 rounded-md bg-white px-1.5 py-0.5 text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100"
                    >
                      <Check size={11} aria-hidden="true" /> Right
                    </button>
                  </span>
                )}
              </div>

              {need.kind === 'range' && (
                <div className="mt-1 flex items-center gap-2" role="group" aria-labelledby={`${id}-label`}>
                  <input
                    aria-label={`${need.label}, lowest`}
                    inputMode="decimal"
                    placeholder="lowest"
                    value={form[need.min]}
                    onChange={(e) => onChange(need.min, e.target.value, need.key)}
                    className={control(isMarked)}
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    aria-label={`${need.label}, highest`}
                    inputMode="decimal"
                    placeholder="highest"
                    value={form[need.max]}
                    onChange={(e) => onChange(need.max, e.target.value, need.key)}
                    className={control(isMarked)}
                  />
                </div>
              )}

              {need.kind === 'choice' && (
                <select
                  aria-labelledby={`${id}-label`}
                  value={form[need.key]}
                  onChange={(e) => onChange(need.key, e.target.value, need.key)}
                  className={`mt-1 ${control(isMarked)}`}
                >
                  <option value="">Not stated</option>
                  {need.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}

              {need.kind === 'many' && (
                <div
                  role="group"
                  aria-labelledby={`${id}-label`}
                  className={`mt-1 flex flex-wrap gap-1.5 ${isMarked ? 'rounded-lg ring-2 ring-amber-300 ring-offset-2' : ''}`}
                >
                  {need.options.map((option) => {
                    const on = form[need.key].includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          onChange(
                            need.key,
                            on ? form[need.key].filter((id) => id !== option.id) : [...form[need.key], option.id],
                            need.key
                          )
                        }
                        className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ring-1 transition ${
                          on ? 'bg-green-700 text-white ring-green-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {need.hint && <p className="mt-1 text-xs text-slate-500">{need.hint}</p>}
              {problems[need.key] && <p className="mt-1 text-xs font-semibold text-red-700">{problems[need.key]}</p>}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
