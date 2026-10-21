import { LAGUNA_BOUNDS, LAGUNA_PROVINCE } from './lagunaBoundaries.js';

/**
 * The cloud-free satellite base map, kept in the system (supabase/satellite.sql).
 *
 * Every week or twice a month PGENRO takes a snapshot from its Copernicus Data
 * Space configuration: Sentinel-2 over Laguna, each spot as its clear looks
 * over the last sixty days show it (CLOUD_FREE_SCRIPT, below). The deepest zoom (14, about 9 m a pixel — Sentinel-2's own
 * 10 m) is fetched from Copernicus one map tile at a time; the wider zooms are
 * made from those in the browser, so they cost nothing more. Every tile goes
 * into the 'satellite-tiles' bucket, and the maps read them from there: looking
 * at the map never asks Copernicus for anything.
 *
 * A snapshot that stops part-way — a closed tab, a dropped connection, the
 * month's quota — carries on where it stopped: the Copernicus tiles are taken
 * in a fixed order, and the snapshot records how far it got.
 */
export const SATELLITE_BUCKET = 'satellite-tiles';
export const SATELLITE_ZOOMS = Object.freeze({ min: 9, max: 14 });
export const LOOK_BACK_DAYS = 60;
export const MONTHLY_REQUESTS = 30000;
export const CADENCES = Object.freeze([
  { days: 7, label: 'Every week' },
  { days: 15, label: 'Twice a month' },
]);

const WMS = 'https://sh.dataspace.copernicus.eu/ogc/wms';
const TILE = 256;
const ORIGIN = 20037508.342789244;

/**
 * Sentinel Hub's evalscript. Each pixel's clear looks — leaving out cloud,
 * cloud shadow, snow, no data and the unclassified (scene classes 0, 1, 3, 7,
 * 8, 9, 10, 11) — and, band by band, the one a third of the way up from the
 * darkest: the haze at a cloud's edge, which the classes miss, is brighter
 * than the ground under it. With no clear look at all, the least bright one.
 * Tried on Laguna, August to October 2026: no clouds left, no seams between
 * tiles fetched one at a time.
 */
export const CLOUD_FREE_SCRIPT = `//VERSION=3
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

// ---- Tiles -------------------------------------------------------------------------

/** The tile a [lat, lng] falls in, at a zoom (Leaflet's own arithmetic). */
export function tileAt([lat, lng], z) {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return {
    z,
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n),
  };
}

/** A tile's corner [lat, lng] — its north-west at (x, y), and so on. */
export function tileCorner(z, x, y) {
  const n = 2 ** z;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lat, (x / n) * 360 - 180];
}

/** A tile in Web Mercator metres, as WMS wants it for EPSG:3857: minx, miny, maxx, maxy. */
export function tileBbox({ z, x, y }) {
  const size = (2 * ORIGIN) / 2 ** z;
  const minx = -ORIGIN + x * size;
  const maxy = ORIGIN - y * size;
  return [minx, maxy - size, minx + size, maxy];
}

const keyOf = ({ z, x, y }) => `${z}/${x}/${y}`;

/** Ray casting against a [lng, lat] ring. */
function ringContains(ring, lat, lng) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The tiles at a zoom that touch the ground: a corner or the middle of the
 * tile inside one of its outer rings, or a corner of the ring inside the
 * tile. Holes are kept: a lake inside a town is still on its map.
 */
export function tilesCovering(geometry, z, bounds) {
  const shells = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map((poly) => poly[0]);
  const [[south, west], [north, east]] = bounds;
  const from = tileAt([north, west], z);
  const to = tileAt([south, east], z);
  const touched = new Set();
  for (const ring of shells) {
    for (const [lng, lat] of ring) touched.add(keyOf(tileAt([lat, lng], z)));
  }
  const inside = ([lat, lng]) => shells.some((ring) => ringContains(ring, lat, lng));
  const tiles = [];
  for (let y = from.y; y <= to.y; y += 1) {
    for (let x = from.x; x <= to.x; x += 1) {
      const tile = { z, x, y };
      const [top, left] = tileCorner(z, x, y);
      const [bottom, right] = tileCorner(z, x + 1, y + 1);
      const points = [[top, left], [top, right], [bottom, left], [bottom, right], [(top + bottom) / 2, (left + right) / 2]];
      if (touched.has(keyOf(tile)) || points.some(inside)) tiles.push(tile);
    }
  }
  return tiles;
}

/** The parents of a set of tiles, one zoom up, each once, in order. */
export function parentsOf(tiles) {
  const seen = new Map();
  for (const { z, x, y } of tiles) {
    const parent = { z: z - 1, x: Math.floor(x / 2), y: Math.floor(y / 2) };
    seen.set(keyOf(parent), parent);
  }
  return [...seen.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

let lagunaTiles = null;

/**
 * Laguna's tiles at every zoom of a snapshot: { [zoom]: [{ z, x, y }] }, the
 * deepest fetched from Copernicus, each zoom above made from the one below.
 */
export function snapshotTiles({ min, max } = SATELLITE_ZOOMS) {
  if (!lagunaTiles || lagunaTiles.max !== max) {
    const byZoom = { [max]: tilesCovering(LAGUNA_PROVINCE.features[0].geometry, max, LAGUNA_BOUNDS) };
    for (let z = max - 1; z >= 0; z -= 1) byZoom[z] = parentsOf(byZoom[z + 1]);
    lagunaTiles = { max, byZoom };
  }
  const byZoom = {};
  for (let z = min; z <= max; z += 1) byZoom[z] = lagunaTiles.byZoom[z];
  return byZoom;
}

export const tilePath = (snapshotId, { z, x, y }) => `${snapshotId}/${z}/${x}/${y}.jpg`;

/** Every file a snapshot put in the bucket — for removing an old one. */
export function snapshotPaths(snapshot) {
  const byZoom = snapshotTiles({ min: snapshot.min_zoom ?? SATELLITE_ZOOMS.min, max: snapshot.max_zoom ?? SATELLITE_ZOOMS.max });
  return Object.values(byZoom).flatMap((tiles) => tiles.map((tile) => tilePath(snapshot.id, tile)));
}

// ---- Copernicus ----------------------------------------------------------------------

const isoDay = (date) => date.toISOString().slice(0, 10);

/** The days a snapshot taken now chooses its imagery from. */
export function imageryWindow(now = new Date()) {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - LOOK_BACK_DAYS);
  return { from: isoDay(from), to: isoDay(now) };
}

const base64 = (text) =>
  typeof btoa === 'function' ? btoa(text) : Buffer.from(text, 'utf8').toString('base64');

/** The WMS request for one tile, at 256 pixels, from PGENRO's configuration. */
export function copernicusTileUrl(instanceId, tile, { from, to }) {
  const [minx, miny, maxx, maxy] = tileBbox(tile);
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.3.0',
    LAYERS: 'TRUE_COLOR',
    CRS: 'EPSG:3857',
    BBOX: [minx, miny, maxx, maxy].map((m) => m.toFixed(2)).join(','),
    WIDTH: String(TILE),
    HEIGHT: String(TILE),
    FORMAT: 'image/jpeg',
    TIME: `${from}/${to}`,
    // Every scene in: the clouds are left out pixel by pixel, not scene by scene.
    MAXCC: '100',
    SHOWLOGO: 'false',
    EVALSCRIPT: base64(CLOUD_FREE_SCRIPT),
  });
  return `${WMS}/${encodeURIComponent(instanceId.trim())}?${params}`;
}

/** What went wrong, in words PGENRO can act on. */
export function copernicusProblem(status, text = '') {
  if (status === 401 || status === 403 || /instance|not found|unauthori[sz]ed/i.test(text)) {
    return 'Copernicus did not accept the instance ID. Copy it again from the configuration on the Copernicus dashboard.';
  }
  if (/SCL|band|evalscript|data ?source/i.test(text)) {
    return 'The configuration’s TRUE_COLOR layer is not Sentinel-2 L2A. Point it at Sentinel-2 L2A on the Copernicus dashboard.';
  }
  const said = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  return `Copernicus answered ${status}${said ? `: ${said}` : ''}.`;
}

const pause = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Stopped', 'AbortError'));
    });
  });

/**
 * One tile from Copernicus. Busy (429) or down (5xx): wait and try again, a
 * little longer each time; anything else is a mistake to report.
 */
async function fromCopernicus(url, { fetchImpl, signal, onRequest, wait }) {
  for (let attempt = 1; ; attempt += 1) {
    onRequest();
    let response;
    try {
      response = await fetchImpl(url, { signal });
    } catch (failure) {
      if (signal?.aborted) throw failure;
      if (attempt >= 5) throw new Error('Copernicus could not be reached. Check the connection, then carry on.');
      await wait(attempt * 5000, signal);
      continue;
    }
    const type = response.headers?.get?.('content-type') ?? '';
    if (response.ok && type.startsWith('image/')) return response.blob();
    if (response.status === 429 || response.status >= 500) {
      if (attempt >= 8) {
        throw new Error(
          response.status === 429
            ? 'Copernicus is turning requests away — the month’s quota, or too many at once. Carry on later.'
            : 'Copernicus is not answering just now. Carry on later.'
        );
      }
      await wait(attempt * 15000, signal);
      continue;
    }
    throw new Error(copernicusProblem(response.status, await response.text?.().catch(() => '')));
  }
}

// ---- The wider zooms ----------------------------------------------------------------

/**
 * Four tiles [north-west, north-east, south-west, south-east] (blobs, or null
 * where there is none) as one tile of the zoom above: a JPEG, black where a
 * quarter is missing — the same as Copernicus outside Laguna.
 */
export async function shrinkTiles(children) {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(TILE, TILE)
      : Object.assign(document.createElement('canvas'), { width: TILE, height: TILE });
  const context = canvas.getContext('2d');
  context.fillStyle = '#000';
  context.fillRect(0, 0, TILE, TILE);
  context.imageSmoothingQuality = 'high';
  const half = TILE / 2;
  await Promise.all(
    children.map(async (blob, i) => {
      if (!blob) return;
      const bitmap = await createImageBitmap(blob);
      context.drawImage(bitmap, (i % 2) * half, Math.floor(i / 2) * half, half, half);
      bitmap.close?.();
    })
  );
  return canvas.convertToBlob
    ? canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 })
    : new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
}

/** Run `work` over `items`, `limit` at a time; stops at the first failure. */
async function inTurn(items, limit, work) {
  let next = 0;
  let failure = null;
  async function worker() {
    while (!failure && next < items.length) {
      const i = next;
      next += 1;
      try {
        await work(items[i], i);
      } catch (error) {
        failure ??= error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure;
}

// ---- A snapshot -------------------------------------------------------------------

/**
 * Take a snapshot, or carry one on: Copernicus tiles from `snapshot.tiles_done`,
 * then every wider zoom, then live on the maps, and the snapshots before the
 * last one removed.
 *
 *   onProgress({ phase: 'copernicus' | 'wider' | 'tidying', done, total })
 *
 * fetchImpl, shrink and wait are the browser's own unless a test says
 * otherwise. Returns the snapshot as it went live.
 */
export async function takeSnapshot(
  supabase,
  { instanceId, snapshot, onProgress = () => {}, signal, fetchImpl = (...a) => fetch(...a), shrink = shrinkTiles, wait = pause }
) {
  const zooms = { min: snapshot.min_zoom ?? SATELLITE_ZOOMS.min, max: snapshot.max_zoom ?? SATELLITE_ZOOMS.max };
  const byZoom = snapshotTiles(zooms);
  const deepest = byZoom[zooms.max];
  const days = { from: snapshot.imagery_from, to: snapshot.imagery_to };
  const bucket = supabase.storage.from(SATELLITE_BUCKET);
  const made = new Map();
  let requests = snapshot.requests ?? 0;
  const start = Math.min(snapshot.tiles_done ?? 0, deepest.length);

  const upload = async (tile, blob) => {
    const { error } = await bucket.upload(tilePath(snapshot.id, tile), blob, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
    });
    if (error) throw new Error(`A tile could not be stored: ${error.message}`);
  };
  const record = (fields) => supabase.from('satellite_snapshots').update(fields).eq('id', snapshot.id);

  // 1. Copernicus, in order; how far it got is the run of tiles all done.
  const finished = new Set();
  let saved = start;
  const advance = async (force) => {
    let prefix = start;
    while (finished.has(prefix)) prefix += 1;
    if (force || prefix - saved >= 20) {
      saved = prefix;
      await record({ tiles_done: prefix, requests });
    }
    return prefix;
  };
  onProgress({ phase: 'copernicus', done: start, total: deepest.length });
  try {
    await inTurn(deepest.slice(start), 4, async (tile, i) => {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Stopped', 'AbortError');
      const blob = await fromCopernicus(copernicusTileUrl(instanceId, tile, days), {
        fetchImpl,
        signal,
        wait,
        onRequest: () => {
          requests += 1;
        },
      });
      await upload(tile, blob);
      made.set(keyOf(tile), blob);
      finished.add(start + i);
      onProgress({ phase: 'copernicus', done: start + finished.size, total: deepest.length });
      await advance(false);
    });
  } catch (failure) {
    const stopped = signal?.aborted;
    const done = await advance(true);
    await record({ note: stopped ? `Stopped at ${done} of ${deepest.length}.` : failure.message });
    throw failure;
  }
  await record({ tiles_done: deepest.length, requests, note: null });

  // 2. The wider zooms, each from the four below it — from this run's tiles,
  // or, carried on, from the bucket.
  const childOf = async (tile) => {
    const key = keyOf(tile);
    if (made.has(key)) {
      const blob = made.get(key);
      made.delete(key);
      return blob;
    }
    const { data } = bucket.getPublicUrl(tilePath(snapshot.id, tile));
    try {
      const response = await fetchImpl(data.publicUrl, { signal });
      return response.ok ? await response.blob() : null;
    } catch {
      return null;
    }
  };
  const wider = [];
  for (let z = zooms.max - 1; z >= zooms.min; z -= 1) wider.push(...byZoom[z]);
  let built = 0;
  for (let z = zooms.max - 1; z >= zooms.min; z -= 1) {
    const below = new Set(byZoom[z + 1].map(keyOf));
    await inTurn(byZoom[z], 6, async (tile) => {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Stopped', 'AbortError');
      const children = await Promise.all(
        [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => {
          const child = { z: z + 1, x: tile.x * 2 + dx, y: tile.y * 2 + dy };
          return below.has(keyOf(child)) ? childOf(child) : null;
        })
      );
      const blob = await shrink(children);
      await upload(tile, blob);
      made.set(keyOf(tile), blob);
      built += 1;
      onProgress({ phase: 'wider', done: built, total: wider.length });
    });
  }

  // 3. Live — the database retires the one before — then tidy up.
  const tileCount = deepest.length + wider.length;
  const { error } = await record({ status: 'live', tile_count: tileCount, requests });
  if (error) throw new Error(`The snapshot is stored but could not go live: ${error.message}`);
  onProgress({ phase: 'tidying', done: 0, total: 1 });
  await removeOldSnapshots(supabase, snapshot.id);
  return { ...snapshot, status: 'live', tile_count: tileCount, tiles_done: deepest.length, requests };
}

/**
 * Keep the live snapshot and the one before it; remove every other — files
 * first, then the row. Best effort: what is left is tried again next time.
 */
export async function removeOldSnapshots(supabase, keepId) {
  const { data } = await supabase
    .from('satellite_snapshots')
    .select('id, status, min_zoom, max_zoom, taken_at')
    .order('taken_at', { ascending: false });
  const rows = Array.isArray(data) ? data : [];
  const previous = rows.find((row) => row.status === 'retired' && row.id !== keepId);
  const old = rows.filter((row) => row.id !== keepId && row.status !== 'live' && row !== previous && row.status !== 'building');
  for (const row of old) {
    const paths = snapshotPaths(row);
    let failed = false;
    for (let i = 0; i < paths.length; i += 500) {
      const { error } = await supabase.storage.from(SATELLITE_BUCKET).remove(paths.slice(i, i + 500));
      if (error) failed = true;
    }
    if (!failed) await supabase.from('satellite_snapshots').delete().eq('id', row.id);
  }
  return old.length;
}

// ---- Due, quota, and the map ---------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

/** When the next snapshot is due: the live one's day plus the cadence. */
export function nextDue(live, cadenceDays, now = new Date()) {
  if (!live) return { due: true, on: null };
  const on = new Date(new Date(live.taken_at).getTime() + cadenceDays * DAY);
  return { due: now >= on, on };
}

/** Copernicus requests the snapshots taken this calendar month spent. */
export function requestsThisMonth(snapshots, now = new Date()) {
  return snapshots
    .filter((s) => {
      const at = new Date(s.taken_at);
      return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
    })
    .reduce((sum, s) => sum + (Number(s.requests) || 0), 0);
}

const longDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

/** The live snapshot as a base map, in the shape of src/lib/basemaps.js. */
export function satelliteBasemap(supabase, snapshot) {
  if (!snapshot?.id) return null;
  const { data } = supabase.storage.from(SATELLITE_BUCKET).getPublicUrl(snapshot.id);
  const year = String(snapshot.imagery_to).slice(0, 4);
  return {
    id: 'sentinel',
    label: 'Sentinel-2',
    longLabel: `Cloud-free satellite (Copernicus Sentinel-2, to ${longDate(snapshot.imagery_to)})`,
    sheetLabel: `Satellite, cloud-free (Sentinel-2, to ${longDate(snapshot.imagery_to)})`,
    url: `${data.publicUrl}/{z}/{x}/{y}.jpg`,
    attribution: `Contains modified Copernicus Sentinel data ${year}`,
    minNativeZoom: snapshot.min_zoom ?? SATELLITE_ZOOMS.min,
    maxNativeZoom: snapshot.max_zoom ?? SATELLITE_ZOOMS.max,
    imagery: true,
    imageryTo: snapshot.imagery_to,
  };
}
