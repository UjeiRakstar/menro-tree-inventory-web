import { geometryAreaM2 } from './areaGeometry.js';

/**
 * Indicator 2 of the Singapore Index (Handbook, 2021): how connected a city's
 * natural areas are. Patches less than 100 m apart are one group; the
 * effective mesh size is Σ(group area²) ÷ total natural area, and the
 * coherence — what is scored — is that over the total natural area again:
 * Σ(group area²) ÷ (total natural area)², 0 to 100%.
 *
 * Distances are worked out flat, in metres, round Laguna's latitude — close
 * enough over a few kilometres. The Handbook's barriers (roads 15 m wide or
 * more, concreted canals) are not known to the system, so two patches either
 * side of a highway still count as joined: the score can only be read as
 * "at best".
 */
export const LINK_M = 100;

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG = 111_320 * Math.cos((14.25 * Math.PI) / 180);

/** A polygon or multipolygon's rings, in metres: [[x, y], …] per ring. */
function ringsOf(geometry) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.flat().map((ring) => ring.map(([lng, lat]) => [lng * M_PER_DEG_LNG, lat * M_PER_DEG_LAT]));
}

function boxOf(rings) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) {
    for (const [x, y] of ring) {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  }
  return box;
}

const boxGap = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));

function pointToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const crosses = (a, b, c, d) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;

function segmentGap(a, b, c, d) {
  if (crosses(a, b, c, d)) return 0;
  return Math.min(pointToSegment(a, c, d), pointToSegment(b, c, d), pointToSegment(c, a, b), pointToSegment(d, a, b));
}

/** Whether a point lies inside a ring (even–odd). */
function inside([x, y], ring) {
  let within = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) within = !within;
  }
  return within;
}

/** The least distance between two patches, in metres; 0 when they touch or one holds the other. */
export function patchGap(a, b) {
  if (inside(a[0][0], b[0]) || inside(b[0][0], a[0])) return 0;
  let least = Infinity;
  for (const ringA of a) {
    for (const ringB of b) {
      for (let i = 1; i < ringA.length; i += 1) {
        for (let j = 1; j < ringB.length; j += 1) {
          least = Math.min(least, segmentGap(ringA[i - 1], ringA[i], ringB[j - 1], ringB[j]));
          if (least === 0) return 0;
        }
      }
    }
  }
  return least;
}

/**
 * The natural patches (GeoJSON geometries) as groups and their coherence:
 * { groups: [hectares, …] largest first, totalHa, meshHa, coherence (%) },
 * or null when there are none.
 */
export function connectivityOf(geometries = []) {
  const patches = geometries
    .map((geometry) => {
      const rings = ringsOf(geometry);
      return rings.length ? { rings, box: boxOf(rings), m2: geometryAreaM2(geometry) } : null;
    })
    .filter((patch) => patch && patch.m2 > 0);
  if (patches.length === 0) return null;

  // Groups by union–find: two patches join when less than 100 m apart.
  const parent = patches.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < patches.length; i += 1) {
    for (let j = i + 1; j < patches.length; j += 1) {
      if (root(i) === root(j) || boxGap(patches[i].box, patches[j].box) >= LINK_M) continue;
      if (patchGap(patches[i].rings, patches[j].rings) < LINK_M) parent[root(j)] = root(i);
    }
  }
  const groupM2 = new Map();
  patches.forEach((patch, i) => groupM2.set(root(i), (groupM2.get(root(i)) ?? 0) + patch.m2));
  const groups = [...groupM2.values()].sort((a, b) => b - a);
  const total = groups.reduce((sum, m2) => sum + m2, 0);
  const squares = groups.reduce((sum, m2) => sum + m2 * m2, 0);
  return {
    groups: groups.map((m2) => m2 / 10_000),
    totalHa: total / 10_000,
    meshHa: squares / total / 10_000,
    coherence: (squares / (total * total)) * 100,
  };
}
