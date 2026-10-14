import { ringAreaM2 } from './areaGeometry.js';
import { projectAt } from './clusterPins.js';

/**
 * Drawing an area on the map, the way Google Maps measures one.
 *
 * Click to add a point. Drag a point to move it. Click a point to take it
 * away. Click the first point again to close the shape. Drag the faint dot in
 * the middle of an edge to bend the edge with a new point.
 *
 * Everything here is a plain function of a plain value — `{ points, closed }`,
 * points as Leaflet [lat, lng] — so the rules can be tested without a map, and
 * the map component only has to say what the user did.
 */

export const EMPTY_SHAPE = Object.freeze({ points: [], closed: false });

/** Fewest points that make an area rather than a line. */
export const MIN_AREA_POINTS = 3;

/** Leaflet's own earth radius for distances, so these agree with its ruler. */
const EARTH_RADIUS_M = 6371000;

const rad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two [lat, lng] points, in metres. */
export function distanceM([lat1, lng1], [lat2, lng2]) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const midpoint = ([lat1, lng1], [lat2, lng2]) => [(lat1 + lat2) / 2, (lng1 + lng2) / 2];

// ---- Editing -------------------------------------------------------------

/** A point at the end of the line. Nothing is added to a closed shape. */
export function addPoint(shape, point) {
  if (shape.closed) return shape;
  return { ...shape, points: [...shape.points, point] };
}

export function movePoint(shape, index, point) {
  if (index < 0 || index >= shape.points.length) return shape;
  const points = shape.points.slice();
  points[index] = point;
  return { ...shape, points };
}

/**
 * Take a point away.
 *
 * A closed shape that drops below three points cannot stay an area, so it
 * opens back into a line rather than collapsing into something meaningless.
 */
export function removePoint(shape, index) {
  if (index < 0 || index >= shape.points.length) return shape;
  const points = shape.points.filter((_, i) => i !== index);
  return { points, closed: shape.closed && points.length >= MIN_AREA_POINTS };
}

/** A new point on the edge that starts at `afterIndex`. */
export function insertPoint(shape, afterIndex, point) {
  const points = shape.points.slice();
  points.splice(afterIndex + 1, 0, point);
  return { ...shape, points };
}

export const canClose = (shape) => !shape.closed && shape.points.length >= MIN_AREA_POINTS;

export function closeShape(shape) {
  return canClose(shape) ? { ...shape, closed: true } : shape;
}

/** Undo, as people mean it while drawing: take back the last point placed. */
export function undoLast(shape) {
  if (shape.points.length === 0) return shape;
  return removePoint(shape, shape.points.length - 1);
}

/**
 * What clicking point `index` does: closes the shape when it is the first
 * point and the line could close, otherwise removes it.
 */
export function clickPoint(shape, index) {
  if (index === 0 && canClose(shape)) return closeShape(shape);
  return removePoint(shape, index);
}

// ---- Measuring -----------------------------------------------------------

/**
 * Each edge, with its length and where to write it. A closed shape includes
 * the edge back to the first point.
 */
export function segments(shape) {
  const { points, closed } = shape;
  const out = [];
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i += 1) {
    const from = points[i];
    const to = points[(i + 1) % points.length];
    out.push({ index: i, from, to, lengthM: distanceM(from, to), mid: midpoint(from, to), angle: labelAngle(from, to) });
  }
  return out;
}

/** The line's length while drawing, the perimeter once closed. */
export const lengthM = (shape) => segments(shape).reduce((sum, seg) => sum + seg.lengthM, 0);

/**
 * The area, once there is one.
 *
 * Only for a closed shape that does not cross itself: a figure-eight has no
 * single area, and the formula would quietly return the difference between
 * its two loops.
 */
export function areaM2(shape) {
  if (!shape.closed || shape.points.length < MIN_AREA_POINTS || selfIntersects(shape)) return null;
  const ring = shape.points.map(([lat, lng]) => [lng, lat]);
  ring.push(ring[0]);
  return ringAreaM2(ring);
}

/**
 * Which way to turn an edge's length label so it lies along the edge.
 *
 * Measured on the Web Mercator plane the map is drawn on. Mercator keeps
 * angles, so one zoom's angle is every zoom's. Kept upright: a label is never
 * turned past a quarter-turn, or half of them would read upside down.
 */
export function labelAngle(from, to) {
  const a = projectAt(from, 0);
  const b = projectAt(to, 0);
  let degrees = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (degrees > 90) degrees -= 180;
  if (degrees < -90) degrees += 180;
  return degrees;
}

// ---- Validity ------------------------------------------------------------

/** Do segments p1–p2 and p3–p4 cross (touching at an end does not count)? */
function crosses(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Does the outline cross itself?
 *
 * Checked on every edge against every edge that does not share a point with
 * it. A hand-drawn outline has tens of points, so the square of that is
 * nothing.
 */
export function selfIntersects(shape) {
  const edges = segments(shape);
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const adjacent = j === i + 1 || (shape.closed && i === 0 && j === edges.length - 1);
      if (adjacent) continue;
      if (crosses(edges[i].from, edges[i].to, edges[j].from, edges[j].to)) return true;
    }
  }
  return false;
}

/** The shape as GeoJSON, for saving: [lng, lat], ring closed on itself. */
export function toGeoJSON(shape) {
  if (!shape.closed) return null;
  const ring = shape.points.map(([lat, lng]) => [lng, lat]);
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

// ---- Writing it down -------------------------------------------------------

/** "850 m" under a kilometre, "2.31 km" over. */
export function formatLength(metres) {
  if (!Number.isFinite(metres)) return '—';
  if (metres < 1000) return `${Math.round(metres).toLocaleString('en-US')} m`;
  return `${(metres / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}

/**
 * What the measure box tells the person drawing, given where they are.
 *
 * One sentence, always about the next thing they can do — the instruction
 * changes as they draw, so they never have to remember the gestures.
 */
export function drawingHint(shape) {
  const n = shape.points.length;
  if (shape.closed) {
    return selfIntersects(shape)
      ? 'The outline crosses itself, so it has no single area. Drag a point to untangle it.'
      : 'Drag a point to move it, click one to remove it, or drag the faint dot on an edge to add one.';
  }
  if (n === 0) return 'Click on the map to place the first point.';
  if (n < MIN_AREA_POINTS) return 'Keep clicking to add points. Click a point to remove it.';
  return 'Click the first point to close the shape and measure its area.';
}
