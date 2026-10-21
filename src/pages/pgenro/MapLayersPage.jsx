import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CloudRain, Layers as LayersIcon, Loader2, Upload } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { useMapLayers } from '../../hooks/useMapLayers.js';
import { LAYER_KINDS, prepareInBackground, publishLayer } from '../../lib/layers/browser.js';
import { refreshAllAreaFacts } from '../../lib/layers/facts.js';
import { readClimateFiles } from '../../lib/layers/climateFiles.js';
import { MUNICIPALITY_LIST } from '../../lib/lagunaBoundaries.js';
import SatelliteCard from './SatelliteCard.jsx';

const when = (value) =>
  value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const thousands = (n) => Number(n ?? 0).toLocaleString('en-US');

/** What a prepared or published layer holds, in a line. */
function summaryOf(meta) {
  if (!meta) return '';
  if (meta.kind === 'soil') return `${meta.classes?.length ?? 0} soil units`;
  if (meta.kind === 'elevation') return `${thousands(meta.range?.min)} to ${thousands(meta.range?.max)} m above sea level`;
  const ha = meta.hectares ?? {};
  return `${thousands(ha.low)} ha low · ${thousands(ha.medium)} ha medium · ${thousands(ha.high)} ha high`;
}

function Legend({ meta }) {
  const items =
    meta?.kind === 'soil'
      ? (meta.classes ?? []).map((c) => ({ label: c.description, colour: c.colour }))
      : (meta?.legend ?? []).map((l) => ({ label: l.label, colour: `rgba(${l.colour.join(',')})` }));
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-y-auto text-[11px] text-slate-600">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
          <span className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/10" style={{ background: item.colour }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** One layer: what is live, and a new file to replace it. */
function LayerCard({ kind, live, onPublished, layers }) {
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [state, setState] = useState('idle'); // idle · preparing · ready · publishing · measuring
  const [prepared, setPrepared] = useState(null);
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  async function handleFile(event) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    setFile(chosen);
    setError('');
    setNotice('');
    setPrepared(null);
    setState('preparing');
    try {
      const result = await prepareInBackground(kind.id, chosen);
      setPrepared(result);
      setPreview(result.files['picture.png'] ? URL.createObjectURL(result.files['picture.png']) : null);
      setState('ready');
    } catch (failure) {
      setError(failure.message);
      setState('idle');
    }
  }

  async function handlePublish() {
    setState('publishing');
    setError('');
    try {
      const row = await publishLayer(supabase, kind.id, prepared, file.name);
      setState('measuring');
      const { done, failed } = await refreshAllAreaFacts(
        supabase,
        { ...layers, [kind.id]: row },
        { onProgress: (n, total) => setProgress(`${n} of ${total}`) }
      );
      setNotice(
        `Live. ${done} saved ${done === 1 ? 'area' : 'areas'} measured against it${failed ? `; ${failed} could not be updated` : ''}.`
      );
      setPrepared(null);
      setFile(null);
      setState('idle');
      onPublished();
    } catch (failure) {
      setError(failure.message);
      setState('ready');
    }
  }

  const busy = state === 'preparing' || state === 'publishing' || state === 'measuring';

  return (
    <section aria-label={kind.label} className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900">{kind.label}</h2>
          <p className="text-xs text-slate-500">{kind.source} · {kind.format}</p>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-green-800 ring-1 ring-green-200 hover:bg-green-50 disabled:opacity-50"
        >
          <Upload size={14} aria-hidden="true" /> {live ? 'Replace' : 'Upload'}
        </button>
        <input
          ref={input}
          type="file"
          accept={kind.accepts}
          onChange={handleFile}
          className="hidden"
          aria-label={`${kind.label} file`}
        />
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
        {live ? (
          <>
            <p className="flex items-center gap-1.5 font-semibold text-green-800">
              <CheckCircle2 size={14} aria-hidden="true" /> Live on the maps
            </p>
            <p className="mt-0.5">
              {live.file_name} · uploaded {when(live.uploaded_at)} · {summaryOf(live.meta)}
            </p>
            <Legend meta={live.meta} />
          </>
        ) : (
          <p className="text-amber-800">Not uploaded yet. Areas show this as awaiting data.</p>
        )}
      </div>

      {state === 'preparing' && (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <Loader2 size={14} className="animate-spin text-green-700" aria-hidden="true" />
          Reading and preparing {file?.name} — up to a minute for a large file.
        </p>
      )}

      {prepared && (state === 'ready' || state === 'publishing' || state === 'measuring') && (
        <div className="mt-3 rounded-xl border border-green-200 bg-green-50/50 p-3">
          <p className="text-xs font-bold text-green-900">Ready to publish: {file?.name}</p>
          <p className="mt-0.5 text-xs text-green-900">{summaryOf(prepared.meta)}</p>
          {prepared.meta.field && (
            <p className="text-[11px] text-green-900/70">Hazard level read from the “{prepared.meta.field}” property.</p>
          )}
          {prepared.meta.fields && (
            <p className="text-[11px] text-green-900/70">
              Soil read from {Object.values(prepared.meta.fields).filter(Boolean).map((f) => `“${f}”`).join(', ')}.
            </p>
          )}
          {preview && (
            <img src={preview} alt={`${kind.label} as it will be drawn`} className="mt-2 max-h-48 rounded-lg border border-slate-200 bg-white" />
          )}
          <Legend meta={prepared.meta} />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPrepared(null);
                setState('idle');
              }}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-white disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {busy && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
              {state === 'publishing' ? 'Publishing…' : state === 'measuring' ? `Measuring areas ${progress}…` : 'Publish'}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-900">{notice}</p>}
    </section>
  );
}

/** CLIRAM, one workbook per LGU — all thirty at once if PGENRO likes. */
function ClimateCard({ climateByLgu, onSaved }) {
  const input = useRef(null);
  const [reading, setReading] = useState(false);
  const [results, setResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleFiles(event) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (chosen.length === 0) return;
    setReading(true);
    setError('');
    setNotice('');
    setResults(await readClimateFiles(chosen));
    setReading(false);
  }

  // A province-wide workbook covers every LGU that has no workbook of its own.
  const rows = useMemo(() => {
    if (!results) return [];
    const own = new Map();
    let province = null;
    for (const result of results) {
      if (!result.climate) continue;
      if (result.lgu.province) province = result;
      else own.set(result.lgu.psgc, result);
    }
    return MUNICIPALITY_LIST.map((lgu) => {
      const found = own.get(lgu.psgc) ?? (climateByLgu.has(lgu.psgc) ? null : province);
      return found ? { lgu, ...found, fromProvince: found === province } : null;
    }).filter(Boolean);
  }, [results, climateByLgu]);

  async function handleSave() {
    setSaving(true);
    setError('');
    const { error: saveError } = await supabase.from('lgu_climate').upsert(
      rows.map(({ lgu, climate, fileName }) => ({
        lgu_psgc: lgu.psgc,
        place: climate.place,
        scenario: climate.scenario,
        temperature: climate.temperature,
        rainfall: climate.rainfall,
        file_name: fileName,
      })),
      { onConflict: 'lgu_psgc' }
    );
    setSaving(false);
    if (saveError) {
      setError(
        /lgu_climate|does not exist|could not find/i.test(saveError.message ?? '')
          ? 'The climate table is not there yet. Run supabase/map_layers.sql, then save again.'
          : saveError.message
      );
      return;
    }
    setNotice(`Saved for ${rows.length} ${rows.length === 1 ? 'LGU' : 'LGUs'}.`);
    setResults(null);
    onSaved();
  }

  const problems = (results ?? []).filter((r) => r.error);

  return (
    <section aria-label="Climate (CLIRAM)" className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-base font-bold text-slate-900">
            <CloudRain size={16} aria-hidden="true" /> Rainfall and temperature
          </h2>
          <p className="text-xs text-slate-500">
            DOST-PAGASA CLIRAM · the .zip downloads from climap.pagasa.dost.gov.ph, or the .xlsx in them — any number at once
          </p>
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={reading || saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-green-800 ring-1 ring-green-200 hover:bg-green-50 disabled:opacity-50"
        >
          <Upload size={14} aria-hidden="true" /> Upload workbooks
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".zip,.xlsx"
          onChange={handleFiles}
          className="hidden"
          aria-label="CLIRAM files"
        />
      </div>

      <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
        {climateByLgu.size > 0
          ? `Figures for ${climateByLgu.size} of ${MUNICIPALITY_LIST.length} cities and municipalities.`
          : 'No climate figures yet. Areas show rainfall and temperature as awaiting data.'}
      </p>

      {reading && (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <Loader2 size={14} className="animate-spin text-green-700" aria-hidden="true" /> Reading the workbooks…
        </p>
      )}

      {results && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs" aria-label="Climate figures to save">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left">City / municipality</th>
                <th scope="col" className="px-3 py-1.5 text-right">Mean temperature</th>
                <th scope="col" className="px-3 py-1.5 text-right">Yearly rainfall</th>
                <th scope="col" className="px-3 py-1.5 text-left">From</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ lgu, climate, fileName, fromProvince }) => (
                <tr key={lgu.psgc}>
                  <th scope="row" className="px-3 py-1.5 text-left font-semibold text-slate-800">{lgu.label}</th>
                  <td className="px-3 py-1.5 text-right">{climate.temperature.meanC} °C</td>
                  <td className="px-3 py-1.5 text-right">{thousands(climate.rainfall.annualMm)} mm</td>
                  <td className="px-3 py-1.5 text-slate-500">
                    {fromProvince ? 'Province-wide workbook' : fileName} · {climate.scenario}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {problems.length > 0 && (
            <ul className="border-t border-slate-100 px-3 py-2 text-xs text-red-700">
              {problems.map((p) => (
                <li key={p.fileName}>
                  {p.fileName}: {p.error}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 px-3 py-2">
            <button
              type="button"
              onClick={() => setResults(null)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {saving && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
              Save for {rows.length} {rows.length === 1 ? 'LGU' : 'LGUs'}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-900">{notice}</p>}
    </section>
  );
}

/**
 * PGENRO's map layers — phase 4 of ACCOUNTS_AND_MAPPING.md. The survey layers
 * the province holds, uploaded once and drawn on every map, and measured
 * against every area the offices save.
 */
export default function MapLayersPage() {
  const { layers, climateByLgu, missing, loaded, reload } = useMapLayers();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <LayersIcon className="text-green-700" size={24} aria-hidden="true" /> Map layers
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          The survey layers drawn on every map, public and office, and measured against every area an office saves:
          its soil, its elevation, how much of it floods, and its climate. Each file is prepared in this browser before
          it goes up; nothing is published until you press Publish.
        </p>
      </header>

      {missing && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The layers are not in the database yet. Run supabase/map_layers.sql in the Supabase SQL editor, then reload.
        </p>
      )}

      {!loaded ? (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin text-green-700" aria-hidden="true" /> Loading the layers…
        </p>
      ) : (
        <>
          {LAYER_KINDS.map((kind) => (
            <LayerCard key={kind.id} kind={kind} live={layers[kind.id]} layers={layers} onPublished={reload} />
          ))}
          <ClimateCard climateByLgu={climateByLgu} onSaved={reload} />
          <SatelliteCard />
        </>
      )}
    </div>
  );
}
