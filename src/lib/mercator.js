/**
 * Web Mercator, the projection the map is drawn in.
 *
 * Kept as plain arithmetic rather than calls on a Leaflet map instance, so the
 * code that needs screen geometry — the drawing tool's label angles — stays a
 * plain function of its inputs, with nothing to stand up in a test.
 */

/** Leaflet's own zoom-0 tile size; the scale everything below is built on. */
const TILE_SIZE = 256;

const MAX_LATITUDE = 85.0511287798;

/** Where a latitude/longitude falls, in pixels, at a given zoom. */
export function projectAt([lat, lng], zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const clamped = Math.max(Math.min(lat, MAX_LATITUDE), -MAX_LATITUDE);
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: scale * (lng / 360 + 0.5),
    y: scale * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)),
  };
}
