/**
 * The maps under the map: street and satellite.
 *
 * Shared by the public map and the LGU map, so the two never disagree about
 * where their tiles come from. Both stop drawing new detail at zoom 19; past
 * that the map scales the last real tile (see MAX_NATIVE_ZOOM in the map).
 *
 * The cloud-free Copernicus mosaic joins this list once the PGENRO account is
 * set up with its key — see PARKED.md.
 */
export const BASEMAPS = [
  {
    id: 'street',
    label: 'Street map',
    longLabel: 'Standard Street Map (Fastest)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  {
    id: 'satellite',
    label: 'Satellite',
    longLabel: 'Satellite (Esri)',
    // blankTile=false: a missing tile is a 404, not Esri's "Map data not yet
    // available" picture, so the map can draw the level above instead
    // (src/lib/tileFallback.js). Siniloan's imagery stops at zoom 18.
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false',
    attribution: '&copy; Esri',
    fallbackToParent: true,
  },
];

export const basemapById = (id) => BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];

/**
 * One real tile of a basemap, for its thumbnail button.
 *
 * The thumbnail IS the map it switches to — the same server, the same place —
 * rather than a stock picture of streets, so the visitor sees what they will
 * get. Web Mercator tile arithmetic, the same as Leaflet's.
 */
export function thumbnailTile(basemap, [lat, lng], zoom = 13) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return basemap.url
    .replace('{s}', 'a')
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}
