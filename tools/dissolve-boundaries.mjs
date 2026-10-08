/**
 * Dissolve Laguna-Barangays.geojson into the two boundary layers the public map
 * draws: one polygon per city/municipality, and one outline for the province.
 *
 * The barangay polygons are not topologically shared — neighbours only partly
 * agree on their vertices — so the merge is a real polygon union, not an
 * edge-cancellation trick.
 *
 *   node tools/dissolve-boundaries.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import polygonClipping from 'polygon-clipping';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'src', 'data');

const SRC = join(dataDir, 'Laguna-Barangays.geojson');
const OUT_MUNI = join(dataDir, 'Laguna-Municipalities.geojson');
const OUT_PROV = join(dataDir, 'Laguna-Province.geojson');

/**
 * Because neighbouring barangays disagree slightly along their shared edges, the
 * union leaves hairline gaps behind. Rings below these sizes are that noise, not
 * geography: at the province level only the real lakes and islands survive.
 */
const MIN_PART_KM2 = { municipality: 0.02, province: 0.5 };

/** Coordinates are published at 5 decimals (~1 m); keep the union at that. */
const PRECISION = 5;

const toMulti = (geom) =>
  geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];

/** Ring area in km², good enough for Laguna's latitude. */
const ringArea = (ring) => {
  let s = 0;
  for (let i = 0; i + 1 < ring.length; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(s / 2) * 111.32 * 111.32 * Math.cos((14.2 * Math.PI) / 180);
};

const round = (n) => Number(n.toFixed(PRECISION));

/** Strip sliver rings and trim coordinates back to the source precision. */
function clean(multi, minKm2) {
  return multi
    .map((poly) => poly.filter((ring) => ringArea(ring) >= minKm2))
    .filter((poly) => poly.length > 0)
    .map((poly) => poly.map((ring) => ring.map(([x, y]) => [round(x), round(y)])));
}

function unionAll(polys) {
  // Union in small batches — one 800-polygon call is far slower than many small ones.
  let acc = null;
  for (let i = 0; i < polys.length; i += 20) {
    const batch = polys.slice(i, i + 20);
    const merged = polygonClipping.union(batch[0], ...batch.slice(1));
    acc = acc ? polygonClipping.union(acc, merged) : merged;
  }
  return acc || [];
}

const fc = JSON.parse(readFileSync(SRC, 'utf8'));

const groups = new Map();
for (const f of fc.features) {
  const name = f.properties.municipality;
  if (!groups.has(name)) groups.set(name, []);
  groups.get(name).push(f);
}

const muniFeatures = [];
for (const [name, feats] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const parts = feats.flatMap((f) => toMulti(f.geometry));
  const coordinates = clean(unionAll(parts), MIN_PART_KM2.municipality);
  const p = feats[0].properties;
  muniFeatures.push({
    type: 'Feature',
    properties: {
      municipality: name,
      municipality_label: p.municipality_label,
      municipality_psgc: p.municipality_psgc,
      is_city: p.is_city,
      barangay_count: feats.length,
      area_km2: Math.round(feats.reduce((s, f) => s + (f.properties.area_km2 || 0), 0) * 1000) / 1000,
    },
    geometry: { type: 'MultiPolygon', coordinates },
  });
  console.log(`${name.padEnd(14)} barangays=${String(feats.length).padStart(3)} parts=${coordinates.length}`);
}

writeFileSync(
  OUT_MUNI,
  JSON.stringify({ type: 'FeatureCollection', name: 'Laguna-Municipalities', features: muniFeatures })
);

const province = clean(unionAll(muniFeatures.map((f) => f.geometry.coordinates)), MIN_PART_KM2.province);
console.log(`Laguna         parts=${province.length}`);
writeFileSync(
  OUT_PROV,
  JSON.stringify({
    type: 'FeatureCollection',
    name: 'Laguna-Province',
    features: [{ type: 'Feature', properties: { province: 'Laguna' }, geometry: { type: 'MultiPolygon', coordinates: province } }],
  })
);
