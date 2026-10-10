/**
 * Builds the compact barangay index the public site looks points up in.
 *
 *   node tools/build-barangay-index.mjs
 *
 * src/data/Laguna-Barangays.geojson is 784 KB of GeoJSON and exists only as a
 * source for the dissolve tools — nothing imports it. This turns it into
 * something small enough to ship: coordinates flattened into one array per
 * ring instead of a pair of brackets each, and a bounding box per barangay so
 * a lookup can reject almost all of them without walking a single edge.
 *
 * The output is committed. Re-run it only if the boundaries change.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '..', 'src', 'data', 'Laguna-Barangays.geojson');
const OUT = join(here, '..', 'src', 'data', 'barangay-index.json');

/** Five decimal places is about a metre, which is finer than any GPS fix. */
const round = (n) => Math.round(n * 1e5) / 1e5;

const geojson = JSON.parse(await readFile(SOURCE, 'utf8'));

const barangays = geojson.features.map((feature) => {
  const { barangay, barangay_psgc: psgc, municipality } = feature.properties;
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // One flat array per ring: [x, y, x, y, ...]. Rings stay grouped by polygon
  // so a hole is still a hole — the first ring of each is its outline.
  const shape = polygons.map((polygon) =>
    polygon.map((ring) => {
      const flat = new Array(ring.length * 2);
      for (let i = 0; i < ring.length; i += 1) {
        const x = round(ring[i][0]);
        const y = round(ring[i][1]);
        flat[i * 2] = x;
        flat[i * 2 + 1] = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return flat;
    })
  );

  return { n: barangay, m: municipality, p: psgc, b: [minX, minY, maxX, maxY], g: shape };
});

barangays.sort((a, b) => a.m.localeCompare(b.m) || a.n.localeCompare(b.n));

await writeFile(OUT, JSON.stringify({ version: 1, barangays }));

const [source, out] = await Promise.all([
  readFile(SOURCE).then((b) => b.length),
  readFile(OUT).then((b) => b.length),
]);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`${barangays.length} barangays across ${new Set(barangays.map((b) => b.m)).size} LGUs`);
console.log(`${kb(source)} -> ${kb(out)}`);
