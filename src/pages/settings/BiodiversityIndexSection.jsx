import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CBI_COMPONENTS, SELF_ASSESSED } from '../../lib/cbiPoints.js';
import { loadSelfAssessment, saveSelfAssessment, selfAssessmentChanges, selfAssessmentProblems } from '../../lib/cbiSelf.js';
import Section, { Outcome, buttonClass, inputClass } from './Section.jsx';

const toForm = (entries) =>
  Object.fromEntries(
    SELF_ASSESSED.map((indicator) => {
      const entry = entries[indicator.no];
      return [
        indicator.no,
        {
          points: entry?.points === null || entry?.points === undefined ? '' : String(entry.points),
          value: entry?.value === null || entry?.value === undefined ? '' : String(entry.value),
          note: entry?.note ?? '',
        },
      ];
    })
  );

/**
 * The office's self-assessment toward the City Biodiversity Index — or, for a
 * municipality, the Urban Biodiversity Index of TB 2018-02 (27 October): the
 * indicators of the Singapore Index the system cannot measure, a year at a
 * time. A level on the Handbook's own scale, or a figure scored on its bands,
 * each with a note of the evidence. Its report (the map sheet's Report tab)
 * marks every one of them as self-assessed.
 *
 *   lgu   the LGU's entry in MUNICIPALITY_LIST: { psgc, name, isCity }
 */
export default function BiodiversityIndexSection({ lgu, now = new Date() }) {
  const thisYear = now.getFullYear();
  const [year, setYear] = useState(thisYear);
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(() => toForm({}));
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const index = lgu?.isCity ? 'City Biodiversity Index' : 'Urban Biodiversity Index';

  useEffect(() => {
    let cancelled = false;
    setSaved(null);
    setOutcome(null);
    loadSelfAssessment(lgu?.psgc, year).then(({ entries, missing: notThere }) => {
      if (cancelled) return;
      setMissing(notThere);
      setSaved(entries);
      setForm(toForm(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [lgu?.psgc, year]);

  const problems = selfAssessmentProblems(form);
  const shown = tried ? problems : {};
  const set = (no, key) => (event) =>
    setForm((current) => ({ ...current, [no]: { ...current[no], [key]: event.target.value } }));
  const filled = SELF_ASSESSED.filter((i) => (i.self === 'level' ? form[i.no]?.points !== '' : String(form[i.no]?.value ?? '').trim() !== '')).length;

  async function save(event) {
    event.preventDefault();
    setTried(true);
    setOutcome(null);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    const changes = selfAssessmentChanges(form, saved ?? {}, { lguPsgc: lgu.psgc, year });
    const error = await saveSelfAssessment(changes, { lguPsgc: lgu.psgc, year });
    setBusy(false);
    if (error) return setOutcome({ ok: false, text: error.message });
    const { entries } = await loadSelfAssessment(lgu.psgc, year);
    setSaved(entries);
    setForm(toForm(entries));
    setOutcome({ ok: true, text: `Saved for ${year}. The ${index} report counts it, marked as self-assessed.` });
  }

  return (
    <Section title={index} description={`Your self-assessment of what the system cannot measure, for the ${index} report`}>
      {missing ? (
        <p role="note" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          The self-assessment needs supabase/cbi_ubi.sql to be run (step 38).
        </p>
      ) : (
        <form onSubmit={save} aria-label={`${index} self-assessment`} className="space-y-5">
          <p className="text-sm text-slate-600">
            The Singapore Index on Cities’ Biodiversity (Handbook, 2021){lgu?.isCity ? '' : ', applied to your urban barangays as DENR-BMB Technical Bulletin 2018-02 asks,'} has
            28 indicators. Green Tag measures the land cover, trees, events and residents for you; these are the rest — your plans,
            budget, agencies and programmes. Choose the level that fits, or give the figure, with a note of the document that shows it.
            Leave one blank if you do not know: it is left out, not scored zero.
          </p>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            Year
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1 text-sm">
              {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {saved === null && <Loader2 size={15} className="animate-spin text-slate-400" aria-label="Loading" />}
          </label>

          {CBI_COMPONENTS.map((component) => {
            const list = SELF_ASSESSED.filter((i) => i.no >= component.from && i.no <= component.to);
            if (list.length === 0) return null;
            return (
              <fieldset key={component.id} className="min-w-0 space-y-3">
                <legend className="text-xs font-bold uppercase tracking-wider text-green-800">{component.name}</legend>
                {list.map((indicator) => {
                  const entry = form[indicator.no];
                  const fieldId = `cbi-${indicator.no}`;
                  return (
                    <div key={indicator.no} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_16rem]">
                      <div className="min-w-0">
                        <label htmlFor={fieldId} className="block text-sm font-semibold text-slate-800">
                          {indicator.no}. {indicator.name}
                        </label>
                        {indicator.self === 'level' ? (
                          <select id={fieldId} value={entry.points} onChange={set(indicator.no, 'points')} className={inputClass}>
                            <option value="">Not assessed</option>
                            {indicator.levels.map((text, points) => (
                              <option key={points} value={points}>{points} — {text}</option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <span className="mt-0.5 block text-xs text-slate-500">{indicator.ask}</span>
                            <span className="mt-1 flex items-center gap-2">
                              <input id={fieldId} inputMode="decimal" value={entry.value} onChange={set(indicator.no, 'value')}
                                aria-invalid={Boolean(shown[indicator.no])} className={`${inputClass} mt-0 max-w-[9rem]`} />
                              <span className="text-xs text-slate-500">{indicator.inputUnit}</span>
                            </span>
                            {shown[indicator.no] && <span className="mt-1 block text-xs text-red-600">{shown[indicator.no]}</span>}
                          </>
                        )}
                      </div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Evidence
                        <input value={entry.note} onChange={set(indicator.no, 'note')} placeholder="e.g. SB Ordinance No. 12, s. 2025"
                          aria-label={`Evidence for indicator ${indicator.no}`} className={inputClass} />
                      </label>
                    </div>
                  );
                })}
              </fieldset>
            );
          })}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy || saved === null} className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
              {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              Save {year}
            </button>
            <span className="text-xs text-slate-500">{filled} of {SELF_ASSESSED.length} answered</span>
            <Outcome outcome={outcome} />
          </div>
        </form>
      )}
    </Section>
  );
}
