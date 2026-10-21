vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import {
  CLOUD_FREE_SCRIPT,
  copernicusProblem,
  copernicusTileUrl,
  imageryWindow,
  nextDue,
  requestsThisMonth,
  satelliteBasemap,
  snapshotPaths,
  snapshotTiles,
  takeSnapshot,
  tileAt,
  tileBbox,
  tileCorner,
} from './satellite.js';

const INSTANCE = '0b9c2f1e-1111-4222-8333-944455556666';

beforeEach(() => supabaseMock.reset());

describe('the tiles of Laguna', () => {
  it('are Leaflet’s tiles, in Web Mercator metres for Copernicus', () => {
    const tile = tileAt([14.2817, 121.4167], 14); // Santa Cruz
    expect(tile).toEqual({ z: 14, x: 13717, y: 7535 });
    const [lat, lng] = tileCorner(14, tile.x, tile.y);
    expect(lat).toBeGreaterThan(14.2817);
    expect(lng).toBeLessThan(121.4167);
    const [minx, miny, maxx, maxy] = tileBbox(tile);
    expect(maxx - minx).toBeCloseTo(2445.98, 1);
    expect(maxy - miny).toBeCloseTo(2445.98, 1);
    expect(minx).toBeCloseTo((lng * 20037508.342789244) / 180, 0);
  });

  it('cover the province at zoom 14 and every wider zoom from it', () => {
    const byZoom = snapshotTiles();
    expect(Object.keys(byZoom).map(Number)).toEqual([9, 10, 11, 12, 13, 14]);
    // The province's ground, not its whole box (about 30 × 30 tiles).
    expect(byZoom[14].length).toBeGreaterThan(300);
    expect(byZoom[14].length).toBeLessThan(800);
    const santaCruz = tileAt([14.2817, 121.4167], 14);
    expect(byZoom[14]).toContainEqual(santaCruz);
    // Every wider tile is the parent of one fetched, and nothing else.
    const parents = new Set(byZoom[14].map(({ x, y }) => `${x >> 1}/${y >> 1}`));
    expect(byZoom[13].every(({ x, y }) => parents.has(`${x}/${y}`))).toBe(true);
    expect(byZoom[13]).toHaveLength(parents.size);
    expect(byZoom[9].length).toBeLessThanOrEqual(4);
  });

  it('knows every file of a snapshot, to remove an old one', () => {
    const paths = snapshotPaths({ id: 's1', min_zoom: 9, max_zoom: 14 });
    const total = Object.values(snapshotTiles()).reduce((n, tiles) => n + tiles.length, 0);
    expect(paths).toHaveLength(total);
    expect(paths[0]).toMatch(/^s1\/9\/\d+\/\d+\.jpg$/);
  });
});

describe('asking Copernicus', () => {
  it('asks for one 256-pixel tile, cloud-free over the window, without the logo', () => {
    const url = new URL(copernicusTileUrl(INSTANCE, { z: 14, x: 13717, y: 7535 }, { from: '2026-08-22', to: '2026-10-21' }));
    expect(url.origin + url.pathname).toBe(`https://sh.dataspace.copernicus.eu/ogc/wms/${INSTANCE}`);
    const p = url.searchParams;
    expect(p.get('CRS')).toBe('EPSG:3857');
    expect(p.get('WIDTH')).toBe('256');
    expect(p.get('TIME')).toBe('2026-08-22/2026-10-21');
    expect(p.get('MAXCC')).toBe('100');
    expect(p.get('SHOWLOGO')).toBe('false');
    expect(atob(p.get('EVALSCRIPT'))).toBe(CLOUD_FREE_SCRIPT);
    expect(p.get('BBOX').split(',').map(Number)).toEqual(tileBbox({ z: 14, x: 13717, y: 7535 }).map((m) => Number(m.toFixed(2))));
  });

  it('looks back sixty days', () => {
    expect(imageryWindow(new Date('2026-10-21T08:00:00Z'))).toEqual({ from: '2026-08-22', to: '2026-10-21' });
  });

  it('says what went wrong in words PGENRO can act on', () => {
    expect(copernicusProblem(401)).toMatch(/instance ID/);
    expect(copernicusProblem(400, '<ServiceException>Unknown band SCL</ServiceException>')).toMatch(/Sentinel-2 L2A/);
    expect(copernicusProblem(400, '<ServiceException>Bad bbox</ServiceException>')).toBe('Copernicus answered 400: Bad bbox.');
  });
});

describe('when the next snapshot is due', () => {
  const live = { taken_at: '2026-10-01T02:00:00Z' };
  it('is the cadence after the live one, or now when there is none', () => {
    expect(nextDue(null, 7).due).toBe(true);
    expect(nextDue(live, 7, new Date('2026-10-05T00:00:00Z')).due).toBe(false);
    expect(nextDue(live, 7, new Date('2026-10-09T00:00:00Z')).due).toBe(true);
    expect(nextDue(live, 15, new Date('2026-10-09T00:00:00Z'))).toMatchObject({ due: false, on: new Date('2026-10-16T02:00:00Z') });
  });

  it('counts this month’s requests against the 30,000', () => {
    const snaps = [
      { taken_at: '2026-10-02T00:00:00', requests: 480 },
      { taken_at: '2026-10-09T00:00:00', requests: 470 },
      { taken_at: '2026-09-25T00:00:00', requests: 900 },
    ];
    expect(requestsThisMonth(snaps, new Date('2026-10-21T00:00:00'))).toBe(950);
  });
});

describe('the live snapshot on the map', () => {
  it('is a base map read from the bucket, never from Copernicus', () => {
    const basemap = satelliteBasemap(supabaseMock.supabase, { id: 's1', imagery_to: '2026-10-21', min_zoom: 9, max_zoom: 14 });
    expect(basemap).toMatchObject({
      id: 'sentinel',
      url: 'https://storage.test/satellite-tiles/s1/{z}/{x}/{y}.jpg',
      attribution: 'Contains modified Copernicus Sentinel data 2026',
      minNativeZoom: 9,
      maxNativeZoom: 14,
      imagery: true,
    });
    expect(basemap.longLabel).toMatch(/Sentinel-2, to Oct 21, 2026/);
    expect(satelliteBasemap(supabaseMock.supabase, null)).toBeNull();
  });
});

describe('taking a snapshot', () => {
  const image = () => ({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, blob: async () => new Blob(['jpeg']) });
  const SMALL = { id: 'snap', imagery_from: '2026-08-22', imagery_to: '2026-10-21', min_zoom: 10, max_zoom: 12, tiles_done: 0, requests: 0 };
  const byZoom = snapshotTiles({ min: 10, max: 12 });
  const copernicusUrls = (fetchImpl) => fetchImpl.mock.calls.map(([url]) => url).filter((u) => u.includes('dataspace'));

  it('fetches the deepest tiles, makes the wider ones, stores all, and goes live', async () => {
    const fetchImpl = vi.fn(async () => image());
    const shrink = vi.fn(async () => new Blob(['small']));
    const progress = vi.fn();
    const done = await takeSnapshot(supabaseMock.supabase, { instanceId: INSTANCE, snapshot: SMALL, fetchImpl, shrink, onProgress: progress });

    expect(copernicusUrls(fetchImpl)).toHaveLength(byZoom[12].length);
    expect(shrink).toHaveBeenCalledTimes(byZoom[11].length + byZoom[10].length);
    const stored = supabaseMock.supabase.storage.upload.mock.calls.map(([bucket, path, , options]) => [bucket, path, options.contentType]);
    expect(stored).toHaveLength(byZoom[12].length + byZoom[11].length + byZoom[10].length);
    expect(stored.every(([bucket, path, type]) => bucket === 'satellite-tiles' && path.startsWith('snap/') && type === 'image/jpeg')).toBe(true);

    const updates = supabaseMock.writesTo('satellite_snapshots', 'update').map((w) => w.payload);
    expect(updates.at(-1)).toEqual({ status: 'live', tile_count: stored.length, requests: byZoom[12].length });
    expect(done.status).toBe('live');
    expect(progress).toHaveBeenCalledWith({ phase: 'wider', done: byZoom[11].length + byZoom[10].length, total: byZoom[11].length + byZoom[10].length });
  });

  it('waits when Copernicus is busy, and counts every request', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? { ok: false, status: 429, headers: { get: () => 'text/plain' }, text: async () => '' } : image();
    });
    const wait = vi.fn(async () => {});
    await takeSnapshot(supabaseMock.supabase, { instanceId: INSTANCE, snapshot: SMALL, fetchImpl, shrink: async () => new Blob(['s']), wait });
    expect(wait).toHaveBeenCalledWith(15000, undefined);
    const updates = supabaseMock.writesTo('satellite_snapshots', 'update').map((w) => w.payload);
    expect(updates.at(-1).requests).toBe(byZoom[12].length + 1);
  });

  it('stops on an instance ID Copernicus refuses, and says so on the snapshot', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, headers: { get: () => 'text/xml' }, text: async () => 'Unauthorized' }));
    await expect(
      takeSnapshot(supabaseMock.supabase, { instanceId: INSTANCE, snapshot: SMALL, fetchImpl, shrink: async () => new Blob(['s']) })
    ).rejects.toThrow(/instance ID/);
    expect(supabaseMock.supabase.storage.upload).not.toHaveBeenCalled();
    const updates = supabaseMock.writesTo('satellite_snapshots', 'update').map((w) => w.payload);
    expect(updates.at(-1)).toEqual({ note: expect.stringMatching(/instance ID/) });
    expect(updates.some((u) => u.status === 'live')).toBe(false);
  });

  it('carries on where a stopped one stopped', async () => {
    const fetchImpl = vi.fn(async () => image());
    const shrink = vi.fn(async () => new Blob(['s']));
    await takeSnapshot(supabaseMock.supabase, { instanceId: INSTANCE, snapshot: { ...SMALL, tiles_done: 10, requests: 10 }, fetchImpl, shrink });
    expect(copernicusUrls(fetchImpl)).toHaveLength(byZoom[12].length - 10);
    // The ten from before are read back from the bucket for the wider zooms.
    const fromBucket = fetchImpl.mock.calls.map(([url]) => url).filter((u) => u.startsWith('https://storage.test/'));
    expect(fromBucket).toHaveLength(10);
  });

  it('keeps the live one and the one before, and removes the rest', async () => {
    supabaseMock.setResponse('satellite_snapshots:select', {
      data: [
        { id: 'snap', status: 'live', min_zoom: 10, max_zoom: 12 },
        { id: 'prev', status: 'retired', min_zoom: 10, max_zoom: 12 },
        { id: 'older', status: 'retired', min_zoom: 10, max_zoom: 12 },
        { id: 'broken', status: 'failed', min_zoom: 10, max_zoom: 12 },
      ],
      error: null,
    });
    await takeSnapshot(supabaseMock.supabase, { instanceId: INSTANCE, snapshot: SMALL, fetchImpl: async () => image(), shrink: async () => new Blob(['s']) });
    const removed = supabaseMock.supabase.storage.remove.mock.calls.flatMap(([, paths]) => paths);
    expect(new Set(removed.map((p) => p.split('/')[0]))).toEqual(new Set(['older', 'broken']));
    expect(supabaseMock.writesTo('satellite_snapshots', 'delete').map((w) => w.filters)).toEqual([[['id', 'older']], [['id', 'broken']]]);
  });
});
