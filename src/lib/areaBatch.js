import polygonClipping from 'polygon-clipping';
import { geometryAreaM2, ringAreaM2 } from './areaGeometry.js';
import { distanceM } from './drawing.js';
import { simplifyRing } from './areaImport.js';

/**
 * A whole map file brought in as land cover at once — the forest zone, the
 * urban forest or the land use map an LGU already keeps — rather than one
 * shape at a time.
 *
 * The office sorts the file's shapes by one of its fields (CLASSIFICA, LAND_USE,
 * COVER…) and says which NAMRIA class each value is. The shapes of a value are
 * merged into one, then cut along the PSA barangay boundaries, so each barangay
 * gets its own area — the barangay tables count it where it lies — and nothing
 * outside the office's LGU is saved. A tax map of a thousand parcels becomes a
 * handful of areas, without a parcel line, an owner or a lot number in them.
 *
 * Runs on personal-data-free collections only (privacyFields.js).
 */

/** The value a shape is sorted by, as a label. */
export const valueOf = (feature, field) => {
  const value = feature?.properties?.[field];
  return value === null || value === undefined || String(value).trim() === '' ? '(blank)' : String(value).trim();
};

const isArea = (feature) => ['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type);

/**
 * The fields the shapes can be sorted by — those with 2 to 60 values — each
 * with its values, how many shapes and how much ground each covers. The
 * likeliest first: a field naming forest or land use, then the fewest values.
 */
export function sortingFields(collection) {
  const features = (collection?.features ?? []).filter(isArea);
  const fields = new Set(features.flatMap((feature) => Object.keys(feature.properties ?? {})));
  const out = [];
  for (const field of fields) {
    const values = new Map();
    for (const feature of features) {
      const value = valueOf(feature, field);
      const entry = values.get(value) ?? { value, count: 0, areaM2: 0 };
      entry.count += 1;
      entry.areaM2 += geometryAreaM2(feature.geometry);
      values.set(value, entry);
      if (values.size > 60) break;
    }
    if (values.size < 2 || values.size > 60) continue;
    out.push({ field, values: [...values.values()].sort((a, b) => b.areaM2 - a.areaM2) });
  }
  const score = ({ field, values }) =>
    (values.some((entry) => /forest/i.test(entry.value)) ? 0 : 2) +
    (/class|cover|use|zone|type|landuse|lu/i.test(field) ? 0 : 1) +
    values.length / 100;
  return out.sort((a, b) => score(a) - score(b));
}

/** The NAMRIA class a value most likely is, or '' when it is not land cover the page can tell. */
export function guessCover(value) {
  const text = String(value).toLowerCase();
  if (/mangrove/.test(text)) return 'mangrove-forest';
  if (/bamboo|kawayan/.test(text)) return 'bamboo-stand';
  if (/closed.?forest|old.?growth|primary/.test(text)) return 'closed-forest';
  if (/forest|timber|woodland|tree/.test(text)) return 'open-forest';
  if (/brush|shrub/.test(text)) return 'brush-shrubs';
  if (/coco|orchard|agroforest|perennial|coffee|fruit|lanz|cocal|plantation/.test(text)) return 'perennial-crop';
  if (/grass|pasture|cogon/.test(text)) return 'grassland';
  if (/rice|corn|annual|vegetable|sugar|secano|crop/.test(text)) return 'annual-crop';
  if (/fishpond|aquacult/.test(text)) return 'fishpond';
  if (/marsh|swamp|wetland/.test(text)) return 'marshland-swamp';
  if (/river|creek|lake|water|reservoir|underwater/.test(text)) return 'inland-water';
  if (/residential|commercial|industrial|institutional|built|settlement|road|urban/.test(text)) return 'built-up';
  if (/barren|quarry|bare|rock/.test(text)) return 'open-barren';
  return '';
}

// ---- Geometry ----------------------------------------------------------------------

/** GeoJSON coordinates as polygon-clipping takes them: a MultiPolygon's, in two dimensions. */
function partsOf(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((rings) => rings.map((ring) => ring.map(([lng, lat]) => [lng, lat])));
}

// Smaller than these is a sliver left where two parcels did not quite meet.
export const MIN_PART_M2 = 500;
export const MIN_HOLE_M2 = 2000;
/** The most outline points one area keeps: plenty for the map, light for the database. */
export const MAX_AREA_POINTS = 3000;

const pointsIn = (polygons) => polygons.reduce((total, rings) => total + rings.reduce((t, ring) => t + ring.length, 0), 0);

/** Slivers out and the outline simplified, as a GeoJSON geometry; null when nothing is left. */
export function cleanGeometry(multi, { maxPoints = MAX_AREA_POINTS } = {}) {
  let polygons = multi
    .filter((rings) => ringAreaM2(rings[0]) >= MIN_PART_M2)
    .map((rings) => [rings[0], ...rings.slice(1).filter((hole) => ringAreaM2(hole) >= MIN_HOLE_M2)]);
  if (polygons.length === 0) return null;
  const simplifyAll = (tolerance) =>
    polygons
      .map((rings) =>
        rings
          .map((ring) => {
            const open = ring.slice(0, -1).map(([lng, lat]) => [lat, lng]);
            const kept = open.length > 8 ? simplifyRing(open, tolerance) : open;
            return kept.length >= 3 ? [...kept.map(([lat, lng]) => [lng, lat]), [kept[0][1], kept[0][0]]] : null;
          })
          .filter(Boolean)
      )
      .filter((rings) => rings.length > 0 && rings[0].length >= 4);
  let tolerance = 0.5;
  let simplified = simplifyAll(tolerance);
  while (pointsIn(simplified) > maxPoints && tolerance < 500) {
    tolerance *= 1.6;
    simplified = simplifyAll(tolerance);
  }
  polygons = simplified;
  if (polygons.length === 0) return null;
  return polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons };
}

/** The length round each part's outline, in metres. */
export function perimeterM(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  for (const rings of polygons) {
    const ring = rings[0];
    for (let i = 1; i < ring.length; i += 1) total += distanceM([ring[i - 1][1], ring[i - 1][0]], [ring[i][1], ring[i][0]]);
  }
  return total;
}

function boundsOf(multi) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const rings of multi) {
    for (const [lng, lat] of rings[0]) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return { west, east, south, north };
}
const overlaps = (a, b) => a.west <= b.east && b.west <= a.east && a.south <= b.north && b.south <= a.north;

/**
 * The shapes merged into one. A tax map always has a few parcels drawn badly —
 * an edge crossing itself, a ring left open — on which a merge of all of them
 * fails; so a failing set is merged in halves, and a parcel that fails on its
 * own is set aside and counted rather than sink the rest.
 */
export function mergeShapes(partsList) {
  const set = (list) => {
    try {
      return { merged: polygonClipping.union(...list), skipped: 0 };
    } catch {
      if (list.length === 1) return { merged: [], skipped: 1 };
      const half = Math.ceil(list.length / 2);
      const a = set(list.slice(0, half));
      const b = set(list.slice(half));
      const skipped = a.skipped + b.skipped;
      if (a.merged.length === 0) return { merged: b.merged, skipped };
      if (b.merged.length === 0) return { merged: a.merged, skipped };
      try {
        return { merged: polygonClipping.union(a.merged, b.merged), skipped };
      } catch {
        // Both halves stand; the larger is kept rather than lose both.
        const area = (multi) => multi.reduce((t, rings) => t + ringAreaM2(rings[0]), 0);
        return { merged: area(a.merged) >= area(b.merged) ? a.merged : b.merged, skipped: skipped + 1 };
      }
    }
  };
  return set(partsList);
}

const titleCase = (text) => text.toLowerCase().replace(/(^|[\s/(-])([a-zñ])/g, (_, gap, letter) => gap + letter.toUpperCase());

/**
 * The areas to save, before saving: one per chosen value per barangay.
 *
 *   collection  the file, personal data already out
 *   field       the field the shapes are sorted by, or null for all of them as one
 *   choices     Map(value → NAMRIA class id); a value not in it is left out
 *   barangays   PSA barangay features the areas may fall in — the office's own,
 *               or every barangay for PGENRO
 *   fileName    for the name, when not sorted, and the note
 *   dropped     the personal fields taken out, for the note
 *
 * Returns { areas: [{ name, coverClass, value, geometry, areaM2, perimeterM,
 * municipality, barangay, barangayPsgc, shapes, notes }], outsideM2, skipped, failed:
 * [value] } — skipped, the shapes set aside as drawn too badly to merge.
 */
export function buildAreas({ collection, field = null, choices, barangays = [], fileName = 'the file', dropped = [] }) {
  const features = (collection?.features ?? []).filter(isArea);
  const groups = new Map();
  for (const feature of features) {
    const value = field ? valueOf(feature, field) : null;
    if (!choices.has(value)) continue;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(feature);
  }
  const places = barangays.map((feature) => ({
    feature,
    parts: partsOf(feature.geometry),
    bounds: boundsOf(partsOf(feature.geometry)),
  }));
  const stem = fileName.replace(/\.(zip|shp|geojson|json)$/i, '').replace(/[_-]+/g, ' ').trim();
  const privacy = dropped.length ? ` Taken out for privacy before it was read: ${dropped.map((entry) => entry.field).join(', ')}.` : '';

  const areas = [];
  const failed = [];
  let outsideM2 = 0;
  let skipped = 0;
  for (const [value, members] of groups) {
    const { merged, skipped: setAside } = mergeShapes(members.map((feature) => partsOf(feature.geometry)));
    skipped += setAside;
    if (merged.length === 0) {
      failed.push(value ?? stem);
      continue;
    }
    const total = merged.reduce((sum, rings) => sum + ringAreaM2(rings[0]) - rings.slice(1).reduce((t, hole) => t + ringAreaM2(hole), 0), 0);
    const bounds = boundsOf(merged);
    let inside = 0;
    for (const place of places) {
      if (!overlaps(bounds, place.bounds)) continue;
      let cut;
      try {
        cut = polygonClipping.intersection(merged, place.parts);
      } catch {
        failed.push(value ?? stem);
        continue;
      }
      const geometry = cleanGeometry(cut);
      if (!geometry) continue;
      const areaM2 = geometryAreaM2(geometry);
      inside += areaM2;
      const props = place.feature.properties;
      const label = value === null ? stem : titleCase(value);
      areas.push({
        name: `${label} — ${props.barangay}`,
        coverClass: choices.get(value),
        value,
        geometry,
        areaM2,
        perimeterM: perimeterM(geometry),
        municipality: props.municipality,
        barangay: props.barangay,
        barangayPsgc: Number(props.barangay_psgc) || null,
        shapes: members.length,
        notes:
          `Imported from ${fileName}: ${members.length.toLocaleString('en-US')} ${members.length === 1 ? 'shape' : 'shapes'}` +
          `${value === null ? '' : ` where ${field} is “${value}”`}, merged and cut along the PSA barangay boundary.${privacy}`,
      });
    }
    outsideM2 += Math.max(0, total - inside);
  }
  areas.sort((a, b) => a.name.localeCompare(b.name));
  return { areas, outsideM2, skipped, failed: [...new Set(failed)] };
}

/** An area as a map_areas row (supabase/map_areas.sql). */
export function rowOfArea(area) {
  return {
    kind: 'land-cover',
    name: area.name,
    geometry: area.geometry,
    area_m2: area.areaM2,
    perimeter_m: area.perimeterM,
    municipality: area.municipality,
    barangay: area.barangay,
    barangay_psgc: area.barangayPsgc,
    cover_class: area.coverClass,
    notes: area.notes,
  };
}
