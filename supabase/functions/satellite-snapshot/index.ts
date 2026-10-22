// Green Tag: the satellite base map, taken on schedule (22 October).
//
// Called every ten minutes by a cron job. With "Take it automatically" on
// (Map layers → Satellite base map; satellite_settings.auto), it:
//   - carries on a scheduled snapshot that is not finished, or
//   - starts one when the cadence says one is due (every week, or twice a
//     month, after the live one),
// works for about 100 seconds, records how far it got, and stops; the next
// call carries on. Finished, the snapshot goes live on every map, and the
// snapshots before the last one are removed. Otherwise it does nothing, so
// calling it more often than that costs nothing.
//
// Unlike a snapshot taken in PGENRO's browser, which makes the wider zooms
// from the deepest one, this asks Copernicus for every zoom (there is no
// canvas here): about 588 requests a snapshot instead of 406.
//
// Which tiles: plan.json in the satellite-tiles bucket, written by PGENRO's
// browser when the schedule is switched on (src/lib/satellite.js).
// The cloud-free evalscript below must stay the same as CLOUD_FREE_SCRIPT in
// src/lib/satellite.js; src/lib/satellite.test.js checks that it is.
//
//   DEPLOY: Supabase dashboard → Edge Functions → Deploy a new function →
//   name it `satellite-snapshot` → paste this file → Deploy. Then schedule it:
//   PARKED.md, step 32.
//
// Reply: { "ok": true, "did": "nothing" | "started" | "carried on" | "live", ... }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const BUCKET = 'satellite-tiles';
const PLAN = 'plan.json';
const WMS = 'https://sh.dataspace.copernicus.eu/ogc/wms';
const ORIGIN = 20037508.342789244;
const LOOK_BACK_DAYS = 60;
const DAY = 24 * 60 * 60 * 1000;
// Supabase stops a function at 150 seconds; stop well before.
const WORK_MS = 100_000;
const AT_ONCE = 6;

const CLOUD_FREE_SCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "SCL", "dataMask"] }],
    output: { bands: 3 },
    mosaicking: "ORBIT"
  };
}
var CLOUDY = [0, 1, 3, 7, 8, 9, 10, 11];
var GAIN = 3;
function low(values) {
  values.sort(function (a, b) { return a - b; });
  return values[Math.floor((values.length - 1) / 3)];
}
function evaluatePixel(samples) {
  var r = [], g = [], b = [], haziest = null;
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (!s.dataMask) continue;
    if (CLOUDY.indexOf(s.SCL) === -1) {
      r.push(s.B04); g.push(s.B03); b.push(s.B02);
    } else if (!haziest || s.B02 < haziest.B02) {
      haziest = s;
    }
  }
  if (b.length) return [GAIN * low(r), GAIN * low(g), GAIN * low(b)];
  return haziest ? [GAIN * haziest.B04, GAIN * haziest.B03, GAIN * haziest.B02] : [0, 0, 0];
}
`;

type Tile = { z: number; x: number; y: number };
type Plan = { min: number; max: number; tiles: Record<string, [number, number][]> };

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function tileUrl(instanceId: string, { z, x, y }: Tile, from: string, to: string) {
  const size = (2 * ORIGIN) / 2 ** z;
  const minx = -ORIGIN + x * size;
  const maxy = ORIGIN - y * size;
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.3.0',
    LAYERS: 'TRUE_COLOR',
    CRS: 'EPSG:3857',
    BBOX: [minx, maxy - size, minx + size, maxy].map((m) => m.toFixed(2)).join(','),
    WIDTH: '256',
    HEIGHT: '256',
    FORMAT: 'image/jpeg',
    TIME: `${from}/${to}`,
    MAXCC: '100',
    SHOWLOGO: 'false',
    EVALSCRIPT: btoa(CLOUD_FREE_SCRIPT),
  });
  return `${WMS}/${encodeURIComponent(instanceId.trim())}?${params}`;
}

/** Every tile of the plan, deepest zoom first, in a fixed order a later run picks up from. */
function orderedTiles(plan: Plan, min: number, max: number): Tile[] {
  const tiles: Tile[] = [];
  for (let z = max; z >= min; z -= 1) {
    for (const [x, y] of plan.tiles[String(z)] ?? []) tiles.push({ z, x, y });
  }
  return tiles;
}

const pathOf = (id: string, { z, x, y }: Tile) => `${id}/${z}/${x}/${y}.jpg`;

Deno.serve(async () => {
  const started = Date.now();
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: settings } = await db.from('satellite_settings').select('instance_id, cadence_days, auto').maybeSingle();
  if (!settings?.auto || !settings.instance_id) return reply(200, { ok: true, did: 'nothing', why: 'the schedule is off' });

  const { data: rows } = await db.from('satellite_snapshots').select('*').order('taken_at', { ascending: false });
  const snapshots = rows ?? [];
  let snapshot = snapshots.find((s) => s.status === 'building' && s.by_schedule) ?? null;
  // One PGENRO is taking in its browser is left to it.
  if (!snapshot && snapshots.some((s) => s.status === 'building' && !s.by_schedule)) {
    return reply(200, { ok: true, did: 'nothing', why: 'a snapshot is being taken in the browser' });
  }

  const { data: planFile, error: planError } = await db.storage.from(BUCKET).download(PLAN);
  if (planError || !planFile) return reply(200, { ok: false, did: 'nothing', why: 'no plan.json: switch the schedule on again on Map layers' });
  const plan: Plan = JSON.parse(await planFile.text());

  let did = 'carried on';
  if (!snapshot) {
    const live = snapshots.find((s) => s.status === 'live');
    const due = !live || Date.now() >= new Date(live.taken_at).getTime() + settings.cadence_days * DAY;
    if (!due) return reply(200, { ok: true, did: 'nothing', why: 'not due yet' });
    const to = new Date();
    const from = new Date(to.getTime() - LOOK_BACK_DAYS * DAY);
    const { data, error } = await db
      .from('satellite_snapshots')
      .insert({ imagery_from: isoDay(from), imagery_to: isoDay(to), min_zoom: plan.min, max_zoom: plan.max, by_schedule: true, status: 'building' })
      .select()
      .single();
    if (error || !data) return reply(500, { ok: false, error: error?.message ?? 'The snapshot could not be started.' });
    snapshot = data;
    did = 'started';
  }

  const tiles = orderedTiles(plan, snapshot.min_zoom, snapshot.max_zoom);
  const startAt = Math.min(snapshot.tiles_done ?? 0, tiles.length);
  let requests = snapshot.requests ?? 0;
  const finished = new Set<number>();
  let next = startAt;
  let stop: string | null = null;

  async function worker() {
    while (!stop && next < tiles.length && Date.now() - started < WORK_MS) {
      const i = next;
      next += 1;
      requests += 1;
      let response: Response;
      try {
        response = await fetch(tileUrl(settings!.instance_id, tiles[i], snapshot.imagery_from, snapshot.imagery_to));
      } catch {
        stop = 'Copernicus could not be reached.';
        return;
      }
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !type.startsWith('image/')) {
        const text = (await response.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        stop = response.status === 429 ? 'Copernicus is busy, or the month’s quota is spent.' : `Copernicus answered ${response.status}: ${text.slice(0, 160)}`;
        return;
      }
      const { error } = await db.storage
        .from(BUCKET)
        .upload(pathOf(snapshot.id, tiles[i]), await response.blob(), { contentType: 'image/jpeg', cacheControl: '31536000', upsert: true });
      if (error) {
        stop = `A tile could not be stored: ${error.message}`;
        return;
      }
      finished.add(i);
    }
  }
  await Promise.all(Array.from({ length: AT_ONCE }, worker));

  let done = startAt;
  while (finished.has(done)) done += 1;

  if (done < tiles.length) {
    await db.from('satellite_snapshots').update({ tiles_done: done, requests, note: stop }).eq('id', snapshot.id);
    return reply(200, { ok: !stop, did, done, of: tiles.length, note: stop });
  }

  // Live — the database retires the one before — then the old ones go.
  await db.from('satellite_snapshots').update({ status: 'live', tiles_done: done, tile_count: tiles.length, requests, note: null }).eq('id', snapshot.id);
  const { data: after } = await db.from('satellite_snapshots').select('id, status, min_zoom, max_zoom').order('taken_at', { ascending: false });
  const previous = (after ?? []).find((s) => s.status === 'retired');
  for (const old of (after ?? []).filter((s) => s.id !== snapshot.id && s !== previous && s.status !== 'live' && s.status !== 'building')) {
    const paths = orderedTiles(plan, old.min_zoom, old.max_zoom).map((tile) => pathOf(old.id, tile));
    let failed = false;
    for (let i = 0; i < paths.length; i += 500) {
      const { error } = await db.storage.from(BUCKET).remove(paths.slice(i, i + 500));
      if (error) failed = true;
    }
    if (!failed) await db.from('satellite_snapshots').delete().eq('id', old.id);
  }
  return reply(200, { ok: true, did: 'live', tiles: tiles.length, requests });
});
