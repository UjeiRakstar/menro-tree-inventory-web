import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Satellite, Square } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { forgetSatelliteBasemap } from '../../hooks/useSatellite.js';
import {
  CADENCES,
  MONTHLY_REQUESTS,
  LOOK_BACK_DAYS,
  imageryWindow,
  nextDue,
  requestsThisMonth,
  snapshotTiles,
  takeSnapshot,
} from '../../lib/satellite.js';

const when = (value) =>
  value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const day = (iso) => when(`${iso}T00:00:00`);
const thousands = (n) => Number(n ?? 0).toLocaleString('en-US');
const isMissingTable = (error) =>
  Boolean(error) && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message ?? ''));

const PHASES = {
  copernicus: 'Fetching Sentinel-2 tiles from Copernicus',
  wider: 'Making the wider views',
  tidying: 'Removing the older snapshots',
};

const FETCHED = snapshotTiles()[14].length;

/**
 * The cloud-free satellite base map (supabase/satellite.sql): PGENRO's
 * Copernicus instance ID, how often a snapshot is due, and the snapshot
 * itself — taken here, in this browser, and stored for every map to read.
 */
export default function SatelliteCard() {
  const [settings, setSettings] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ instanceId: '', cadenceDays: 7 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const stopper = useRef(null);

  const load = useCallback(async () => {
    const [kept, taken] = await Promise.all([
      supabase.from('satellite_settings').select('instance_id, cadence_days').maybeSingle(),
      supabase.from('satellite_snapshots').select('*').order('taken_at', { ascending: false }),
    ]);
    setMissing(isMissingTable(kept.error) || isMissingTable(taken.error));
    const row = !kept.error && kept.data && !Array.isArray(kept.data) ? kept.data : null;
    setSettings(row);
    setForm({ instanceId: row?.instance_id ?? '', cadenceDays: row?.cadence_days ?? 7 });
    setSnapshots(!taken.error && Array.isArray(taken.data) ? taken.data : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => stopper.current?.abort(), []);

  async function saveSettings(event) {
    event.preventDefault();
    setSavingSettings(true);
    setError('');
    setNotice('');
    const { error: saveError } = await supabase
      .from('satellite_settings')
      .upsert({ id: true, instance_id: form.instanceId.trim() || null, cadence_days: Number(form.cadenceDays) }, { onConflict: 'id' });
    setSavingSettings(false);
    if (saveError) {
      setError(
        /instance_check/.test(saveError.message ?? '')
          ? 'That is not an instance ID. It looks like 1a2b3c4d-5e6f-…, on the configuration’s page.'
          : saveError.message
      );
      return;
    }
    setNotice('Saved.');
    load();
  }

  const live = snapshots.find((s) => s.status === 'live') ?? null;
  const unfinished = snapshots.find((s) => s.status === 'building') ?? null;
  const cadence = settings?.cadence_days ?? 7;
  const due = nextDue(live, cadence);
  const used = requestsThisMonth(snapshots);
  const instanceId = settings?.instance_id ?? '';
  const busy = Boolean(progress);

  async function run(carryOn) {
    setError('');
    setNotice('');
    let snapshot = carryOn;
    if (!snapshot) {
      if (unfinished) {
        await supabase.from('satellite_snapshots').update({ status: 'failed' }).eq('id', unfinished.id);
      }
      const windowNow = imageryWindow();
      const { data, error: insertError } = await supabase
        .from('satellite_snapshots')
        .insert({ imagery_from: windowNow.from, imagery_to: windowNow.to, min_zoom: 9, max_zoom: 14 })
        .select()
        .single();
      if (insertError || !data) {
        setError(insertError?.message ?? 'The snapshot could not be started.');
        return;
      }
      snapshot = data;
    }
    const controller = new AbortController();
    stopper.current = controller;
    setProgress({ phase: 'copernicus', done: snapshot.tiles_done ?? 0, total: FETCHED });
    try {
      const done = await takeSnapshot(supabase, {
        instanceId,
        snapshot,
        signal: controller.signal,
        onProgress: setProgress,
      });
      forgetSatelliteBasemap();
      setNotice(`Live on every map: Sentinel-2 from ${day(done.imagery_from)} to ${day(done.imagery_to)}, ${thousands(done.tile_count)} tiles.`);
    } catch (failure) {
      setError(
        controller.signal.aborted
          ? 'Stopped. What was fetched is kept: carry on whenever you like.'
          : `${failure.message} What was fetched is kept: carry on to finish it.`
      );
    } finally {
      stopper.current = null;
      setProgress(null);
      load();
    }
  }

  return (
    <section aria-label="Satellite base map" className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-1.5 text-base font-bold text-slate-900">
        <Satellite size={16} aria-hidden="true" /> Satellite base map
      </h2>
      <p className="text-xs text-slate-500">
        Copernicus Sentinel-2, cloud-free: each spot as its clear looks over the last {LOOK_BACK_DAYS} days show it.
        Taken here and stored in the system, so the maps — public and office — and the map sheet read it from here, as
        often as anyone likes, without asking Copernicus for anything.
      </p>

      {missing ? (
        <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          The snapshots are not in the database yet. Run supabase/satellite.sql in the Supabase SQL editor, then reload.
        </p>
      ) : (
        <>
          <form aria-label="Copernicus settings" onSubmit={saveSettings} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="text-xs font-semibold text-slate-700">
              Instance ID
              <input
                value={form.instanceId}
                onChange={(e) => setForm((f) => ({ ...f, instanceId: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
                placeholder="From the configuration, on the Copernicus dashboard"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              A new snapshot
              <select
                value={form.cadenceDays}
                onChange={(e) => setForm((f) => ({ ...f, cadenceDays: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              >
                {CADENCES.map((c) => (
                  <option key={c.days} value={c.days}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={savingSettings || busy}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-green-800 ring-1 ring-green-200 hover:bg-green-50 disabled:opacity-50"
            >
              Save
            </button>
            <p className="text-[11px] text-slate-500 sm:col-span-3">
              Kept for PGENRO alone, like a key. Set the configuration’s map bounds to Laguna on the Copernicus dashboard,
              so the ID is no use anywhere else.
            </p>
          </form>

          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-700">
            {live ? (
              <>
                <p className="flex items-center gap-1.5 font-semibold text-green-800">
                  <CheckCircle2 size={14} aria-hidden="true" /> Live on the maps
                </p>
                <p className="mt-0.5">
                  Imagery from {day(live.imagery_from)} to {day(live.imagery_to)} · taken {when(live.taken_at)} ·{' '}
                  {thousands(live.tile_count)} tiles
                </p>
              </>
            ) : (
              <p className="text-amber-800">No snapshot yet. The maps offer Esri’s satellite until there is one.</p>
            )}
            <p className={`mt-1 ${due.due ? 'font-semibold text-amber-800' : ''}`}>
              {due.due ? 'A new snapshot is due.' : `Next one due ${when(due.on)}.`}
            </p>
            <p className="mt-1 text-slate-500">
              This month: {thousands(used)} of {thousands(MONTHLY_REQUESTS)} Copernicus requests. A snapshot takes about{' '}
              {thousands(FETCHED)}; looking at the maps takes none.
            </p>
          </div>

          {progress ? (
            <div className="mt-3 rounded-xl border border-green-200 bg-green-50/50 p-3" role="status">
              <p className="flex items-center gap-2 text-xs font-semibold text-green-900">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {PHASES[progress.phase]}
                {progress.phase !== 'tidying' && ` — ${thousands(progress.done)} of ${thousands(progress.total)}`}
              </p>
              <div
                role="progressbar"
                aria-label="Snapshot progress"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-green-100"
              >
                <div
                  className="h-full rounded-full bg-green-700 transition-all"
                  style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-green-900/80">Keep this tab open. It takes a few minutes.</p>
                <button
                  type="button"
                  onClick={() => stopper.current?.abort()}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-white"
                >
                  <Square size={11} aria-hidden="true" /> Stop
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {unfinished && (
                <button
                  type="button"
                  onClick={() => run(unfinished)}
                  disabled={!instanceId}
                  className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  Carry on the snapshot of {day(unfinished.imagery_to)} ({thousands(unfinished.tiles_done)} of {thousands(FETCHED)})
                </button>
              )}
              <button
                type="button"
                onClick={() => run(null)}
                disabled={!instanceId}
                className={
                  unfinished
                    ? 'rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50'
                    : 'rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-50'
                }
              >
                {unfinished ? 'Start a new one instead' : 'Take a new snapshot'}
              </button>
              {!instanceId && <p className="text-[11px] text-slate-500">Save the instance ID first.</p>}
            </div>
          )}
        </>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {notice && !progress && <p role="status" className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-900">{notice}</p>}
    </section>
  );
}
