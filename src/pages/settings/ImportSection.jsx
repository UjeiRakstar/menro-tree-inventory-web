import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp, Layers, Loader2, MapPinned, ShieldCheck } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { ACCEPTED_FILES, areaCandidates, readAreaFiles } from '../../lib/areaImport.js';
import { formatArea } from '../../lib/areaGeometry.js';
import { withoutPersonalData } from '../../lib/privacyFields.js';
import { buildAreas, guessCover, rowOfArea, sortingFields } from '../../lib/areaBatch.js';
import { NAMRIA_CLASSES, namriaClassById } from '../../lib/namriaCover.js';
import { useMapLayers } from '../../hooks/useMapLayers.js';
import { loadMeasuringLayers } from '../../lib/layers/browser.js';
import { factsFor } from '../../lib/layers/facts.js';
import Section, { buttonClass } from './Section.jsx';

let barangaysOnce = null;
const loadBarangays = () => {
  barangaysOnce ??= import('../../data/Laguna-Barangays.geojson').then((module) => module.default.features);
  return barangaysOnce;
};

const hectares = (m2) => formatArea(m2, 'ha');
const ALL = '__all__';

/**
 * Areas brought in from a file — a GeoJSON, or a shapefile (zipped, or its
 * .shp with the .dbf and .prj).
 *
 * Personal data comes out first (privacyFields.js): owners, addresses,
 * titles, tax declarations and lot numbers are dropped before anything else
 * reads the file, and the office is shown what was dropped. The file is read
 * here and never uploaded.
 *
 * Then either the whole file comes in as land cover — its shapes sorted by a
 * field, each value given a NAMRIA class, merged and cut along the barangay
 * boundaries (areaBatch.js) — or one shape opens on the map to be saved by
 * hand, as before.
 *
 *   lgu     the office's LGU ({ name, label }), or null for PGENRO
 */
export default function ImportSection({ lgu = null }) {
  const navigate = useNavigate();
  const input = useRef(null);
  const mapLayers = useMapLayers();
  const [reading, setReading] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [field, setField] = useState(ALL);
  const [choices, setChoices] = useState({});
  const [built, setBuilt] = useState(null);
  const [working, setWorking] = useState('');
  const [result, setResult] = useState(null);

  async function read(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setReading(true);
    setError('');
    setFile(null);
    setBuilt(null);
    setResult(null);
    try {
      const { collection, dropped } = withoutPersonalData(await readAreaFiles(files));
      const candidates = areaCandidates(collection);
      const fields = sortingFields(collection);
      setFile({ name: files.map((picked) => picked.name).join(', '), collection, dropped, candidates, fields });
      chooseField(fields[0]?.field ?? ALL, fields);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setReading(false);
    }
  }

  /** A field to sort by, its values ticked where they are tree cover. */
  function chooseField(next, fields = file?.fields ?? []) {
    setField(next);
    setBuilt(null);
    setResult(null);
    const values = fields.find((entry) => entry.field === next)?.values ?? [{ value: ALL }];
    setChoices(
      Object.fromEntries(
        values.map(({ value }) => {
          const cover = value === ALL ? 'open-forest' : guessCover(value);
          return [value, { on: Boolean(namriaClassById(cover)?.treeCover), cover }];
        })
      )
    );
  }

  const setChoice = (value, change) => {
    setBuilt(null);
    setResult(null);
    setChoices((current) => ({ ...current, [value]: { ...current[value], ...change } }));
  };

  const chosen = useMemo(
    () => new Map(Object.entries(choices).filter(([, choice]) => choice.on && choice.cover).map(([value, choice]) => [value === ALL ? null : value, choice.cover])),
    [choices]
  );

  async function prepare() {
    setWorking('prepare');
    setResult(null);
    try {
      const all = await loadBarangays();
      const barangays = lgu ? all.filter((feature) => feature.properties.municipality === lgu.name) : all;
      // Let the button show it is working before the merge holds the page.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const made = buildAreas({
        collection: file.collection,
        field: field === ALL ? null : field,
        choices: chosen,
        barangays,
        fileName: file.name.split(', ')[0],
        dropped: file.dropped,
      });
      // An area of the same name already saved is not saved twice.
      const { data } = await supabase.from('map_areas').select('name, municipality');
      const saved = new Set((Array.isArray(data) ? data : []).map((row) => `${row.municipality}|${row.name}`));
      setBuilt({ ...made, areas: made.areas.map((area) => ({ ...area, already: saved.has(`${area.municipality}|${area.name}`) })) });
    } catch (failure) {
      setError(`The areas could not be prepared: ${failure.message}`);
    } finally {
      setWorking('');
    }
  }

  async function save() {
    const fresh = built.areas.filter((area) => !area.already);
    if (fresh.length === 0) return;
    setWorking('save');
    try {
      const live = Object.fromEntries(Object.entries(mapLayers.layers).filter(([, layer]) => layer));
      const grids = Object.keys(live).length ? await loadMeasuringLayers(supabase, live) : null;
      const rows = fresh.map((area) => {
        const facts = grids ? factsFor(grids, live, { geometry: area.geometry, areaM2: area.areaM2 }) : null;
        return { ...rowOfArea(area), ...(facts ? { layer_facts: facts, layer_facts_at: new Date().toISOString() } : {}) };
      });
      const { error: saveError } = await supabase.from('map_areas').insert(rows);
      if (saveError) throw new Error(saveError.message);
      setResult({ ok: true, text: `Saved ${rows.length} land cover ${rows.length === 1 ? 'area' : 'areas'}.` });
      setBuilt((current) => ({ ...current, areas: current.areas.map((area) => ({ ...area, already: true })) }));
    } catch (failure) {
      setResult({ ok: false, text: `Nothing was saved: ${failure.message}` });
    } finally {
      setWorking('');
    }
  }

  const open = (candidate) =>
    navigate('/map', { state: { importArea: { name: candidate.name, geometry: candidate.geometry } } });

  const values = file?.fields.find((entry) => entry.field === field)?.values ?? null;
  const toSave = built?.areas.filter((area) => !area.already) ?? [];
  const place = lgu ? lgu.label : 'Laguna';

  return (
    <Section title="Import areas" description="Land cover, a forest zone or planting sites from a GeoJSON or shapefile">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Choose a GeoJSON, a zipped shapefile, or a shapefile&apos;s .shp with its .dbf and .prj together. Files in UTM
          zone 51N, PRS92 or Luzon 1911 are converted to longitude and latitude. The file is read on this computer and
          is not uploaded.
        </p>
        <button type="button" onClick={() => input.current?.click()} disabled={reading}
          className={`${buttonClass} bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`}>
          {reading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileUp size={15} aria-hidden="true" />}
          Choose a file
        </button>
        <input ref={input} type="file" multiple accept={ACCEPTED_FILES} onChange={read} className="hidden"
          aria-label="Area file (GeoJSON or shapefile)" />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {file && (
          <>
            <div role="note" aria-label="Personal data" className="flex gap-3 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900 ring-1 ring-green-200">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-green-700" aria-hidden="true" />
              {file.dropped.length > 0 ? (
                <div>
                  <p className="font-semibold">Personal data taken out before anything else read the file (Data Privacy Act):</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {file.dropped.map((entry) => (
                      <li key={entry.field} className="rounded-md bg-white px-2 py-0.5 text-xs ring-1 ring-green-200">
                        <span className="font-mono font-semibold">{entry.field}</span> — {entry.reason}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs">These are not kept or shown anywhere. Only outlines and the classes you choose are saved.</p>
                </div>
              ) : (
                <p>No personal data found in this file. Only outlines and the classes you choose are saved.</p>
              )}
            </div>

            <div className="space-y-3 rounded-xl px-4 py-3 ring-1 ring-slate-200">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Layers size={16} className="text-green-700" aria-hidden="true" /> Bring the file in as land cover
              </h3>
              <p className="text-xs text-slate-500">
                {file.candidates.length.toLocaleString('en-US')} shapes in {file.name}. The shapes of each class you tick are merged
                and cut along the barangay boundaries, one land cover area per barangay{lgu ? `, in ${lgu.label} only` : ''}.
                A zoning or land-use class is not always what grows there: check each against the satellite view.
              </p>
              <label className="block text-sm">
                <span className="font-semibold text-slate-700">Sort the shapes by</span>
                <select value={field} onChange={(event) => chooseField(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm sm:w-72">
                  {file.fields.map((entry) => (
                    <option key={entry.field} value={entry.field}>{entry.field} ({entry.values.length} values)</option>
                  ))}
                  <option value={ALL}>Nothing — all the shapes as one</option>
                </select>
              </label>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th scope="col" className="py-1 pr-2 font-semibold">Bring in</th>
                    <th scope="col" className="py-1 pr-2 text-right font-semibold">Shapes</th>
                    <th scope="col" className="py-1 pr-2 text-right font-semibold">In the file</th>
                    <th scope="col" className="py-1 font-semibold">Land cover (NAMRIA)</th>
                  </tr>
                </thead>
                <tbody>
                  {(values ?? [{ value: ALL, count: file.candidates.length, areaM2: file.candidates.reduce((t, c) => t + c.areaM2, 0) }]).map((entry) => {
                    const choice = choices[entry.value] ?? { on: false, cover: '' };
                    const label = entry.value === ALL ? 'All the shapes' : entry.value;
                    return (
                      <tr key={entry.value} className="border-b border-slate-100">
                        <td className="py-1 pr-2">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={choice.on} onChange={(event) => setChoice(entry.value, { on: event.target.checked })} />
                            <span className="font-semibold text-slate-800">{label}</span>
                          </label>
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{entry.count.toLocaleString('en-US')}</td>
                        <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{hectares(entry.areaM2)}</td>
                        <td className="py-1">
                          <select aria-label={`Land cover for ${label}`} value={choice.cover}
                            onChange={(event) => setChoice(entry.value, { cover: event.target.value, on: Boolean(event.target.value) || choice.on })}
                            className="w-full rounded-md border border-slate-300 px-1.5 py-1 text-xs">
                            <option value="">Choose…</option>
                            {NAMRIA_CLASSES.map((cls) => <option key={cls.id} value={cls.id}>{cls.label}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button type="button" onClick={prepare} disabled={chosen.size === 0 || Boolean(working)}
                className={`${buttonClass} bg-white text-green-800 ring-1 ring-green-300 hover:bg-green-50`}>
                {working === 'prepare' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                Merge and cut to the barangays
              </button>

              {built && (
                <div className="space-y-2">
                  {built.areas.length === 0 ? (
                    <p className="text-sm text-slate-600">None of the ticked shapes falls in {place}.</p>
                  ) : (
                    <ul aria-label="Areas to save" className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                      {built.areas.map((area) => (
                        <li key={area.name} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                          <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{area.name}</span>
                          <span className="shrink-0 text-xs text-slate-500">{namriaClassById(area.coverClass)?.label}</span>
                          <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-700">{hectares(area.areaM2)}</span>
                          {area.already && <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">saved</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {built.outsideM2 >= 10000 && (
                    <p className="text-xs text-slate-500">
                      {hectares(built.outsideM2)} of the ticked shapes lies outside {lgu ? `${lgu.label}’s` : 'Laguna’s'} barangays
                      (PSA boundaries) and is left out.
                    </p>
                  )}
                  {built.skipped > 0 && (
                    <p className="text-xs text-slate-500">
                      {built.skipped} {built.skipped === 1 ? 'shape was' : 'shapes were'} drawn too badly to merge (an edge crossing itself) and
                      {built.skipped === 1 ? ' was' : ' were'} set aside.
                    </p>
                  )}
                  {built.failed.length > 0 && <p className="text-xs text-red-700">These could not be merged: {built.failed.join(', ')}.</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={save} disabled={toSave.length === 0 || Boolean(working)}
                      className={`${buttonClass} bg-green-700 text-white hover:bg-green-800`}>
                      {working === 'save' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                      Save {toSave.length} land cover {toSave.length === 1 ? 'area' : 'areas'}
                    </button>
                    {result?.ok && (
                      <button type="button" onClick={() => navigate('/map')} className="text-sm font-semibold text-green-800 underline">
                        See them on the map
                      </button>
                    )}
                  </div>
                  {result && (
                    <p role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-green-800' : 'text-red-700'}`}>{result.text}</p>
                  )}
                </div>
              )}
            </div>

            <details open={file.candidates.length <= 20} className="rounded-xl px-4 py-3 ring-1 ring-slate-200">
              <summary className="cursor-pointer text-sm font-bold text-slate-900">Or open one shape on the map, to save it by hand</summary>
              <p className="mt-1 text-xs text-slate-500">
                For a planting site, or an area that needs its own details: it opens drawn, in the save form.
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {file.candidates.length} {file.candidates.length === 1 ? 'area' : 'areas'} in {file.name}
              </p>
              <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
                {file.candidates.slice(0, 200).map((candidate, i) => (
                  <li key={candidate.index} className="flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-slate-200">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{candidate.name || `Area ${i + 1}`}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {formatArea(candidate.areaM2, candidate.areaM2 >= 10000 ? 'ha' : 'm2')}
                    </span>
                    <button type="button" onClick={() => open(candidate)}
                      aria-label={`Open ${candidate.name || `Area ${i + 1}`} on the map to save`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-green-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-800">
                      <MapPinned size={13} aria-hidden="true" /> Open on the map
                    </button>
                  </li>
                ))}
              </ul>
              {file.candidates.length > 200 && (
                <p className="mt-1 text-xs text-slate-500">The 200 largest are listed.</p>
              )}
            </details>
          </>
        )}
      </div>
    </Section>
  );
}
