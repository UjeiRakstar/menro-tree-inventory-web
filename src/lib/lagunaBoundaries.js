import provinceData from '../data/Laguna-Province.geojson';
import municipalityData from '../data/Laguna-Municipalities.geojson';

/**
 * Boundary helpers for the public map.
 *
 * Both layers are dissolved from Laguna-Barangays.geojson by
 * tools/dissolve-boundaries.mjs — re-run it if the barangay file changes.
 * GeoJSON stores [longitude, latitude]; Leaflet wants [latitude, longitude],
 * so everything that leaves this module is already flipped.
 */
export const LAGUNA_PROVINCE = provinceData;
export const LAGUNA_MUNICIPALITIES = municipalityData;

/** Every city/municipality, labelled and sorted the way a dropdown wants them. */
export const MUNICIPALITY_LIST = municipalityData.features
  .map((f) => ({
    name: f.properties.municipality,
    label: f.properties.municipality_label,
    isCity: f.properties.is_city,
    psgc: Number(f.properties.municipality_psgc) || null,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

const polygonsOf = (geometry) =>
  geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];

/** The outer ring of every part, as Leaflet [lat, lng] rings. Holes are dropped. */
function shellsOf(geometry) {
  return polygonsOf(geometry).map((poly) => poly[0].map(([lng, lat]) => [lat, lng]));
}

const WORLD_RING = [
  [90, -180],
  [90, 180],
  [-90, 180],
  [-90, -180],
];

/**
 * A polygon covering the globe with Laguna punched out of it. Drawn over the
 * tiles, it leaves the province readable and everything beyond it plain — the
 * PAGASA advisory treatment, where only the area of responsibility is detailed.
 */
export const OUTSIDE_LAGUNA_MASK = [WORLD_RING, ...shellsOf(provinceData.features[0].geometry)];

/**
 * The same treatment for one city or municipality: everything outside it
 * covered over. This is what an LGU account sees — its own area of
 * responsibility detailed, and the rest of the province as out of bounds as
 * the rest of the world. Null for a name that is not an LGU.
 */
export function maskOutsideMunicipality(name) {
  const feature = municipalityData.features.find((f) => f.properties.municipality === name);
  return feature ? [WORLD_RING, ...shellsOf(feature.geometry)] : null;
}

/** Leaflet bounds [[south, west], [north, east]] of a GeoJSON geometry. */
export function boundsOf(geometry) {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const poly of polygonsOf(geometry)) {
    for (const [lng, lat] of poly[0]) {
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      if (lng < west) west = lng;
      if (lng > east) east = lng;
    }
  }
  if (south === Infinity) return null;
  return [
    [south, west],
    [north, east],
  ];
}

export const LAGUNA_BOUNDS = boundsOf(provinceData.features[0].geometry);

/** The dissolved feature for one LGU, by its bare name ("Santa Cruz"). */
export function municipalityNamed(name) {
  if (!name) return null;
  return municipalityData.features.find((f) => f.properties.municipality === name) || null;
}

/** Leaflet bounds of one LGU, or null when the name is unknown. */
export function boundsOfMunicipality(name) {
  const feature = municipalityNamed(name);
  return feature ? boundsOf(feature.geometry) : null;
}

/** Ray casting against a single [lng, lat] ring. */
function ringContains(ring, lat, lng) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Is [lat, lng] inside this geometry? Holes (the lakes) count as outside. */
export function containsPoint(geometry, [lat, lng]) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  for (const poly of polygonsOf(geometry)) {
    if (!ringContains(poly[0], lat, lng)) continue;
    const inHole = poly.slice(1).some((hole) => ringContains(hole, lat, lng));
    if (!inHole) return true;
  }
  return false;
}

/** Name of the LGU a point falls in, or null when it is outside Laguna. */
export function municipalityAt([lat, lng]) {
  const hit = municipalityData.features.find((f) => containsPoint(f.geometry, [lat, lng]));
  return hit ? hit.properties.municipality : null;
}
