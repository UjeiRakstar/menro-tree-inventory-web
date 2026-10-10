/**
 * How big a drawn area is.
 *
 * The panel says it shows "the total area rendered from the map", and it means
 * it: nothing here reads a stored hectare figure. The number comes from the
 * polygon the visitor is looking at, so a corrected boundary corrects the area
 * without anybody editing a second field to match.
 */

/** WGS84 equatorial radius, the one Leaflet's own CRS uses. */
const EARTH_RADIUS_M = 6378137;

export const SQ_M_PER_HECTARE = 10000;

/**
 * The area of one closed ring of GeoJSON [longitude, latitude] positions.
 *
 * Spherical excess, the standard geodesic formula — not the planar shoelace,
 * which treats a degree of longitude as a degree of latitude and overstates an
 * area at 14°N by about three per cent. Sign is dropped, so winding order does
 * not matter.
 */
export function ringAreaM2(ring) {
  const points = Array.isArray(ring) ? ring : [];
  if (points.length < 3) return 0;

  const rad = (deg) => (deg * Math.PI) / 180;
  let total = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [lng1, lat1] = points[j];
    const [lng2, lat2] = points[i];
    if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return 0;
    total += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/**
 * The area of a GeoJSON Polygon or MultiPolygon, holes taken out.
 *
 * The first ring of a polygon is its outline and the rest are holes — a forest
 * with a quarry cut out of it is smaller than its outline, and reporting the
 * outline would overstate the biomass growing on it.
 */
export function geometryAreaM2(geometry) {
  const type = geometry?.type;
  const coordinates = geometry?.coordinates;
  if (!Array.isArray(coordinates)) return 0;

  const polygons =
    type === 'Polygon' ? [coordinates] : type === 'MultiPolygon' ? coordinates : [];

  let total = 0;
  for (const rings of polygons) {
    if (!Array.isArray(rings) || rings.length === 0) continue;
    total += ringAreaM2(rings[0]);
    for (let i = 1; i < rings.length; i += 1) total -= ringAreaM2(rings[i]);
  }
  return Math.max(0, total);
}

/** Square metres as hectares. */
export const toHectares = (squareMetres) => (Number(squareMetres) || 0) / SQ_M_PER_HECTARE;

/**
 * An area written for reading, in whichever unit was asked for.
 *
 * Square metres get no decimals past a hectare — "86,331 m²" is a measurement,
 * "86,330.80 m²" is a claim to a precision a traced polygon does not have.
 * Below that, where the tenths mean something, they are kept.
 */
export function formatArea(squareMetres, unit = 'm2') {
  // Not Number() alone: Number(null) and Number('') are both 0, and an area
  // nobody has measured would print as "0.0 m²" — a measurement, not a gap.
  if (squareMetres === null || squareMetres === undefined || squareMetres === '') return '—';
  const value = Number(squareMetres);
  if (!Number.isFinite(value)) return '—';

  if (unit === 'ha') {
    const hectares = toHectares(value);
    const decimals = hectares < 10 ? 2 : 1;
    return `${hectares.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })} ha`;
  }

  const decimals = value < SQ_M_PER_HECTARE ? 1 : 0;
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} m²`;
}

/** The middle of a geometry's outline, for putting a label or flying to it. */
export function centroidOf(geometry) {
  const type = geometry?.type;
  const coordinates = geometry?.coordinates;
  const polygons =
    type === 'Polygon' ? [coordinates] : type === 'MultiPolygon' ? coordinates : [];

  let lat = 0;
  let lng = 0;
  let count = 0;
  for (const rings of polygons) {
    const ring = rings?.[0] ?? [];
    // A GeoJSON ring repeats its first position to close itself. Averaging it
    // twice drags the centre towards that one corner.
    const closed =
      ring.length > 2 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    const corners = closed ? ring.slice(0, -1) : ring;
    for (const [x, y] of corners) {
      lng += x;
      lat += y;
      count += 1;
    }
  }
  return count === 0 ? null : [lat / count, lng / count];
}

/**
 * A GeoJSON ring as Leaflet positions.
 *
 * GeoJSON stores [longitude, latitude] and Leaflet wants [latitude, longitude]
 * — the same flip src/lib/lagunaBoundaries.js does at its own edge.
 */
export function toLeafletPositions(geometry) {
  const type = geometry?.type;
  const coordinates = geometry?.coordinates;
  const polygons =
    type === 'Polygon' ? [coordinates] : type === 'MultiPolygon' ? coordinates : [];
  return polygons.map((rings) => (rings ?? []).map((ring) => ring.map(([x, y]) => [y, x])));
}
