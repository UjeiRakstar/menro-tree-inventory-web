import { useEffect, useMemo, useState } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { isMissingTable, statsRow } from '../../lib/officeSettings.js';
import Section, { Outcome, buttonClass } from './Section.jsx';

let barangaysOnce = null;
const loadBarangays = () => {
  barangaysOnce ??= import('../../data/Laguna-Barangays.geojson').then((module) => module.default);
  return barangaysOnce;
};

const number = (value) => (value === null || value === undefined ? '' : Number(value).toLocaleString('en-US'));

/**
 * Each barangay of the LGU: its area, measured from the PSA boundary, and
 * the population and households the office keeps — for the indicators that
 * count per person or per household.
 */
export default function BarangaySection({ lgu }) {
  const [barangays, setBarangays] = useState(null);
  const [figures, setFigures] = useState({});
  const [edits, setEdits] = useState({});
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [all, stats] = await Promise.all([
        loadBarangays(),
        supabase.from('barangay_stats').select('*').eq('lgu_psgc', lgu.psgc),
      ]);
      if (cancelled) return;
      setBarangays(
        all.features
          .filter((f) => f.properties.municipality === lgu.name)
          .map((f) => ({ psgc: Number(f.properties.barangay_psgc), name: f.properties.barangay, areaKm2: f.properties.area_km2 }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setMissing(isMissingTable(stats.error));
      setFigures(Object.fromEntries((stats.error ? [] : stats.data ?? []).map((row) => [Number(row.barangay_psgc), row])));
    })();
    return () => {
      cancelled = true;
    };
  }, [lgu]);

  const valueOf = (psgc, key) => edits[psgc]?.[key] ?? (figures[psgc]?.[key] != null ? String(figures[psgc][key]) : '');
  const edit = (psgc, key) => (event) =>
    setEdits((current) => ({ ...current, [psgc]: { ...current[psgc], [key]: event.target.value } }));
  const changed = useMemo(() => Object.keys(edits).map(Number), [edits]);
  const totals = useMemo(() => {
    const sum = (key) =>
      (barangays ?? []).reduce((total, b) => total + (Number(String(valueOf(b.psgc, key)).replace(/,/g, '')) || 0), 0);
    return { population: sum('population'), households: sum('households') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barangays, figures, edits]);

  async function save() {
    setOutcome(null);
    const rows = [];
    for (const psgc of changed) {
      const result = statsRow(psgc, lgu.psgc, { population: valueOf(psgc, 'population'), households: valueOf(psgc, 'households') });
      if (result.error) {
        setOutcome({ ok: false, text: `${barangays.find((b) => b.psgc === psgc)?.name}: ${result.error}` });
        return;
      }
      rows.push(result.row);
    }
    if (rows.length === 0) return;
    setSaving(true);
    const { data, error } = await supabase.from('barangay_stats').upsert(rows, { onConflict: 'barangay_psgc' }).select();
    setSaving(false);
    if (error) {
      setOutcome({ ok: false, text: isMissingTable(error) ? 'Barangay figures need supabase/office_settings.sql.' : error.message });
      return;
    }
    setFigures((current) => ({
      ...current,
      ...Object.fromEntries((Array.isArray(data) ? data : rows).map((row) => [Number(row.barangay_psgc), row])),
    }));
    setEdits({});
    setOutcome({ ok: true, text: `Saved ${rows.length} ${rows.length === 1 ? 'barangay' : 'barangays'}.` });
  }

  return (
    <Section title="Barangays" description={`${lgu.label}'s barangays — area, population and households`}>
      {barangays === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading the barangays…
        </p>
      ) : (
        <div className="space-y-3">
          {missing && (
            <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              Barangay figures need supabase/office_settings.sql, which has not been run yet.
            </p>
          )}
          <div className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Barangay</th>
                  <th scope="col" className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1" title="Measured from the PSA barangay boundary; it changes only with the boundary.">
                      Area <Info size={12} aria-hidden="true" />
                    </span>
                  </th>
                  <th scope="col" className="px-3 py-2">Population</th>
                  <th scope="col" className="px-3 py-2">Households</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {barangays.map((b) => (
                  <tr key={b.psgc} className={edits[b.psgc] ? 'bg-amber-50/50' : ''}>
                    <th scope="row" className="px-3 py-1.5 font-semibold text-slate-800">{b.name}</th>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right text-slate-600">
                      {b.areaKm2 != null ? `${(b.areaKm2 * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} ha` : '—'}
                    </td>
                    {['population', 'households'].map((key) => (
                      <td key={key} className="px-3 py-1.5">
                        <input
                          inputMode="numeric"
                          aria-label={`${key === 'population' ? 'Population' : 'Households'} of ${b.name}`}
                          value={valueOf(b.psgc, key)}
                          onChange={edit(b.psgc, key)}
                          disabled={missing}
                          className="w-28 rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-green-500 focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 text-sm font-semibold text-slate-700">
                <tr>
                  <th scope="row" className="px-3 py-2">{barangays.length} barangays</th>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2">{number(totals.population)}</td>
                  <td className="px-3 py-2">{number(totals.households)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={save} disabled={saving || changed.length === 0}
              className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
              {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              Save changes{changed.length > 0 ? ` (${changed.length})` : ''}
            </button>
            <Outcome outcome={outcome} />
          </div>
        </div>
      )}
    </Section>
  );
}
