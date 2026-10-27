vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import { canMakeEventAt } from './mapAreas.js';
import { venueMapLink } from './news.js';
import { thumbnailTile } from './basemaps.js';
import { nearestStoredTile, satelliteBasemap, tileAt } from './satellite.js';
import { LAGUNA_BOUNDS } from './lagunaBoundaries.js';

const site = (props = {}) => ({
  properties: { saved: true, kind: 'planting-site', approval: 'approved', lguPsgc: 403426000, ...props },
});
const PGENRO = { role: 'pgenro' };
const SCZ = { role: 'lgu_admin', lgu_psgc: 403426000 };

describe('an event made from a planting site (22 October)', () => {
  it('is for PGENRO, and for the MENRO / CENRO of the site’s LGU', () => {
    expect(canMakeEventAt(PGENRO, site())).toBe(true);
    expect(canMakeEventAt(SCZ, site())).toBe(true);
    expect(canMakeEventAt({ role: 'lgu_admin', lgu_psgc: 403409000 }, site())).toBe(false);
  });

  it('only on an approved, saved planting site, and never from a training account', () => {
    expect(canMakeEventAt(PGENRO, site({ approval: 'requested' }))).toBe(false);
    expect(canMakeEventAt(PGENRO, site({ kind: 'land-cover' }))).toBe(false);
    expect(canMakeEventAt(PGENRO, site({ saved: false }))).toBe(false);
    expect(canMakeEventAt({ ...SCZ, is_training: true }, site())).toBe(false);
    expect(canMakeEventAt(null, site())).toBe(false);
  });
});

describe('a pinned event on the public map', () => {
  it('opens the map at its pin, named by its venue', () => {
    const url = new URL(venueMapLink({ venue: 'Labuin Riverbank', venue_lat: 14.28, venue_lng: 121.41 }), 'https://x.test');
    expect(url.pathname).toBe('/public-map');
    expect(url.searchParams.get('at')).toBe('14.280000,121.410000');
    expect(url.searchParams.get('place')).toBe('Labuin Riverbank');
    expect(venueMapLink({ venue: 'Capitol' })).toBeNull();
  });
});

describe('the Sentinel-2 thumbnail', () => {
  it('is a stored tile on land, not the lake in the middle of the province', () => {
    const [[south, west], [north, east]] = LAGUNA_BOUNDS;
    const middle = [(south + north) / 2, (west + east) / 2];
    const tile = nearestStoredTile(middle, 13);
    expect(tile).not.toBeNull();
    const at = tileAt(middle, 13);
    expect(Math.abs(tile.x - at.x) + Math.abs(tile.y - at.y)).toBeLessThan(10);
    const basemap = satelliteBasemap(supabaseMock.supabase, { id: 's1', imagery_to: '2026-10-21', min_zoom: 9, max_zoom: 14 });
    expect(thumbnailTile(basemap, middle)).toBe(`https://storage.test/satellite-tiles/s1/13/${tile.x}/${tile.y}.jpg`);
  });
});
