/**
 * Which barangay a point stands in.
 *
 * The barangay written on a tree record is the least reliable thing about it:
 * the field app filled it by reverse-geocoding against OpenStreetMap, which
 * answers with whatever a mapper happened to tag — a subdivision, a
 * neighbourhood, sometimes nothing. The coordinates, on the other hand, came
 * from a GPS standing at the tree.
 *
 * So the coordinates are the ground truth and the barangay is derived from
 * them. The written name is only a fallback, for a tree whose position is
 * missing or falls outside every boundary.
 *
 * The index is 617 KB, which has no business in the main bundle, so it is
 * fetched on demand: call loadBarangayIndex() when a page starts needing it,
 * and barangayAt() answers null until it arrives.
 */
import { municipalityAt } from './lagunaBoundaries.js';
import { canonicalBarangay } from './barangayNames.js';

let index = null;
let pending = null;

/** Fetch the index once, however many callers ask. */
export function loadBarangayIndex() {
  if (index) return Promise.resolve(index);
  if (!pending) {
    pending = import('../data/barangay-index.json')
      .then((module) => {
        index = module.default ?? module;
        return index;
      })
      .catch((error) => {
        // A failed fetch must not wedge the lookup forever: the next caller
        // gets to try again, and until then the written names are used.
        pending = null;
        throw error;
      });
  }
  return pending;
}

/** Has the index arrived? Pages re-render on this to pick up the better names. */
export const barangayIndexReady = () => index !== null;

/** Even-odd ray casting over one flat ring of [x, y, x, y, ...]. */
function inRing(flat, x, y) {
  let inside = false;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i];
    const yi = flat[i + 1];
    const xj = flat[j];
    const yj = flat[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outline and not inside one of its holes. */
function inShape(shape, x, y) {
  for (const polygon of shape) {
    if (!inRing(polygon[0], x, y)) continue;
    let inHole = false;
    for (let i = 1; i < polygon.length; i += 1) {
      if (inRing(polygon[i], x, y)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/**
 * The barangay a [latitude, longitude] falls in, or null.
 *
 * The city or municipality is worked out first and used to narrow the search
 * from 681 barangays to the two dozen in that LGU, which is the difference
 * between this being free and being felt.
 */
export function barangayAt(position) {
  if (!index || !Array.isArray(position)) return null;
  const [lat, lng] = position;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  const municipality = municipalityAt(position);
  const candidates = municipality
    ? index.barangays.filter((b) => b.m === municipality)
    : index.barangays;

  for (const barangay of candidates) {
    const [minX, minY, maxX, maxY] = barangay.b;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    if (inShape(barangay.g, lng, lat)) {
      return { barangay: barangay.n, municipality: barangay.m, psgc: barangay.p };
    }
  }

  // A point inside the LGU but outside every barangay outline — a few metres
  // of gap between polygons, or a tree on a shoreline.
  return null;
}

/**
 * The barangay to file a tree under.
 *
 * Three answers, in order of how much they can be trusted:
 *
 *   barangay_psgc set   The database has already settled it. A trigger keeps
 *                       trees.barangay copied from the reference table
 *                       whenever that code is set, so the text cannot be a
 *                       subdivision, a placeholder or a misspelling — it is a
 *                       barangay that exists.
 *   a usable position   Work it out from the boundaries.
 *   neither             Whatever was written down, tidied.
 */
export function barangayForTree(tree) {
  if (tree?.barangay_psgc) {
    const settled = canonicalBarangay(tree.barangay);
    if (settled) return settled;
  }

  const lat = Number(tree?.latitude);
  const lng = Number(tree?.longitude);
  const derived = barangayAt([lat, lng]);
  if (derived) return derived.barangay;

  return canonicalBarangay(tree?.barangay);
}

/**
 * Is the index worth fetching for this set of trees?
 *
 * It is 617 KB. Once every tree carries a barangay_psgc — which is what
 * supabase/barangay_link.sql and the backfill are for — nothing needs working
 * out and the download is pure waste. A single tree without one brings it
 * back, so a row synced by an older build of the field app is still placed
 * properly rather than quietly showing whatever it was tagged with.
 */
export function needsBarangayIndex(trees) {
  return (Array.isArray(trees) ? trees : []).some((tree) => {
    if (tree?.barangay_psgc) return false;
    const lat = Number(tree?.latitude);
    const lng = Number(tree?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return !(lat === 0 && lng === 0);
  });
}
