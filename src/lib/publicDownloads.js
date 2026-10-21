import { barangayOf, isEndemic, isInvasive } from './dashboardMetrics.js';
import { MUNICIPALITY_LIST, municipalityAt } from './lagunaBoundaries.js';
import { annualCo2Kg, carbonDioxideKg, totalHeightOf, whyNoCarbon, woodDensityOf } from './treeCarbon.js';
import { addTableSheet, createWorkbook, workbookBlob } from './workbookLook.js';

/**
 * What the public can download, behind the data request form (21 October):
 * the tagged trees of Laguna, or of one city or municipality, as an Excel
 * workbook in the standard look and as GeoJSON for a GIS.
 *
 * Only what the public map already shows of a tree goes out — where it is,
 * what it is, its measurements and its carbon — never a photo, never who
 * tagged it. The workbook says how to cite it and where each figure comes from.
 */

export const DOWNLOAD_FORMATS = Object.freeze([
  { id: 'xlsx', label: 'Excel workbook (.xlsx)', detail: 'Every tree, a summary by place, and the species list' },
  { id: 'geojson', label: 'GeoJSON (.geojson)', detail: 'Every tree as a point, for QGIS or ArcGIS' },
]);

const number = (value) => {
  const n = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round = (value, places) => (value === null || value === undefined ? null : Math.round(value * 10 ** places) / 10 ** places);
const dayOf = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
};
const labelOfLgu = (name) => MUNICIPALITY_LIST.find((lgu) => lgu.name === name)?.label ?? null;

function originOf(tree) {
  if (isInvasive(tree)) return 'Invasive';
  if (isEndemic(tree)) return 'Endemic';
  const status = String(tree?.biodiversity_status || tree?.species_type || '').trim();
  return status || null;
}

/**
 * The trees as they go out: one plain record each, in the place asked for.
 *   place   an LGU's name ("Santa Cruz"), or null for all of Laguna
 */
export function downloadRecords(trees, { place = null } = {}) {
  const records = [];
  for (const tree of Array.isArray(trees) ? trees : []) {
    const lat = number(tree.latitude) ?? Number(tree.latitude);
    const lng = number(tree.longitude) ?? Number(tree.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const lgu = municipalityAt([lat, lng]);
    if (!lgu || (place && lgu !== place)) continue;
    const co2 = carbonDioxideKg(tree);
    records.push({
      species: tree.species || null,
      scientificName: tree.scientific_name || null,
      origin: originOf(tree),
      category: tree.tree_category || null,
      barangay: barangayOf(tree),
      municipality: labelOfLgu(lgu),
      latitude: round(lat, 6),
      longitude: round(lng, 6),
      dbhCm: round(number(tree.dbh), 1),
      totalHeightM: round(totalHeightOf(tree)?.metres ?? null, 2),
      merchantableHeightM: round(number(tree.merchantable_height), 2),
      woodDensity: co2 === null ? null : woodDensityOf(tree),
      co2Kg: round(co2, 1),
      co2YearKg: round(annualCo2Kg(tree), 2),
      notCountedBecause: whyNoCarbon(tree),
      dateTagged: dayOf(tree.dateCaptured ?? tree.created_at),
    });
  }
  return records.sort((a, b) =>
    `${a.municipality} ${a.barangay ?? ''} ${a.species ?? ''}`.localeCompare(`${b.municipality} ${b.barangay ?? ''} ${b.species ?? ''}`)
  );
}

/** Each place's trees and carbon: barangays inside one LGU, LGUs across Laguna. */
export function placeSummary(records, { byBarangay = false } = {}) {
  const places = new Map();
  for (const record of records) {
    const name = (byBarangay ? record.barangay : record.municipality) ?? 'Not recorded';
    const row = places.get(name) ?? { name, trees: 0, species: new Set(), native: 0, invasive: 0, measured: 0, co2T: 0, co2YearT: 0 };
    row.trees += 1;
    if (record.species) row.species.add(record.species.toLowerCase());
    if (record.origin === 'Endemic' || record.origin === 'Native') row.native += 1;
    if (record.origin === 'Invasive') row.invasive += 1;
    if (record.co2Kg !== null) {
      row.measured += 1;
      row.co2T += record.co2Kg / 1000;
      row.co2YearT += (record.co2YearKg ?? 0) / 1000;
    }
    places.set(name, row);
  }
  return [...places.values()]
    .map((row) => ({ ...row, species: row.species.size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Each species: how many, and its share of the trees. */
export function speciesSummary(records) {
  const species = new Map();
  for (const record of records) {
    const key = (record.species ?? 'Not identified').trim();
    const row = species.get(key.toLowerCase()) ?? { name: key, scientificName: record.scientificName, origin: record.origin, trees: 0 };
    row.trees += 1;
    species.set(key.toLowerCase(), row);
  }
  const total = records.length || 1;
  return [...species.values()].map((row) => ({ ...row, share: row.trees / total })).sort((a, b) => b.trees - a.trees || a.name.localeCompare(b.name));
}

const citation = (placeLabel, date) =>
  `Cite as: Green Tag Tree Inventory System, Provincial Government of Laguna (PGENRO) and Laguna State Polytechnic University. ` +
  `Tagged trees of ${placeLabel}, downloaded ${date.toISOString().slice(0, 10)}.`;

const METHOD_NOTES = [
  'Trees: the Green Tag field inventory and verified community tags — the trees tagged so far, not every tree standing.',
  'Carbon above ground: Chave et al. (2014), AGB = 0.0673 × (ρD²H)^0.976, on diameter at breast height and total height; carbon 45% of biomass ' +
    '(Lasco & Pulhin 2000); CO₂ = C × 44/12. Wood density ρ is the species’ own where the species library has it, else 0.57 g/cm³ (Reyes et al. 1992).',
  'A year’s uptake: the same equation after 1.19 cm of diameter growth (Schneider et al. 2013, as applied to city trees by Pansit 2019).',
  'A blank is a measurement not recorded, never a zero.',
];

/**
 * The workbook, as a Blob.
 *   lgu   the place's LGU ({ psgc, name, label, isCity }), or null for Laguna
 */
export async function inventoryWorkbook(records, { lgu = null, date = new Date() } = {}) {
  const placeLabel = lgu ? lgu.label : 'Laguna';
  const workbook = await createWorkbook();
  const preparedBy = 'Green Tag, for public download';

  await addTableSheet(workbook, {
    name: 'Trees',
    lgu,
    title: 'TAGGED TREES',
    subtitle: `${records.length.toLocaleString('en-US')} ${records.length === 1 ? 'tree' : 'trees'} in ${placeLabel}`,
    preparedBy,
    date,
    landscape: true,
    columns: [
      { label: 'Species', width: 18 },
      { label: 'Scientific name', width: 22 },
      { label: 'Origin', width: 11 },
      { label: 'Category', width: 12 },
      { label: 'Barangay', width: 18 },
      { label: 'City / municipality', width: 18 },
      { label: 'Latitude', kind: 'coord', width: 11 },
      { label: 'Longitude', kind: 'coord', width: 11 },
      { label: 'DBH (cm)', kind: 'decimal', width: 9 },
      { label: 'Total height (m)', kind: 'tonnes', width: 10 },
      { label: 'Merchantable height (m)', kind: 'tonnes', width: 12 },
      { label: 'Wood density (g/cm³)', kind: 'tonnes', width: 11 },
      { label: 'CO₂ stored above ground (kg)', kind: 'kg', width: 14 },
      { label: 'CO₂ taken up a year (kg)', kind: 'tonnes', width: 13 },
      { label: 'Not counted for carbon because', width: 24 },
      { label: 'Date tagged', width: 11 },
    ],
    rows: records.map((r) => [
      r.species, r.scientificName, r.origin, r.category, r.barangay, r.municipality, r.latitude, r.longitude,
      r.dbhCm, r.totalHeightM, r.merchantableHeightM, r.woodDensity, r.co2Kg, r.co2YearKg, r.notCountedBecause, r.dateTagged,
    ]),
    notes: [citation(placeLabel, date), ...METHOD_NOTES],
  });

  const byBarangay = Boolean(lgu);
  const places = placeSummary(records, { byBarangay });
  const sum = (key) => places.reduce((total, row) => total + row[key], 0);
  await addTableSheet(workbook, {
    name: byBarangay ? 'By barangay' : 'By city and municipality',
    lgu,
    title: byBarangay ? 'TREES AND CARBON BY BARANGAY' : 'TREES AND CARBON BY CITY AND MUNICIPALITY',
    subtitle: placeLabel,
    preparedBy,
    date,
    columns: [
      { label: byBarangay ? 'Barangay' : 'City / municipality', width: 24 },
      { label: 'Trees', kind: 'number', width: 9 },
      { label: 'Species', kind: 'number', width: 9 },
      { label: 'Endemic or native', kind: 'number', width: 11 },
      { label: 'Invasive', kind: 'number', width: 10 },
      { label: 'Measured for carbon', kind: 'number', width: 12 },
      { label: 'CO₂ stored above ground (t)', kind: 'tonnes', width: 14 },
      { label: 'CO₂ taken up a year (t)', kind: 'tonnes', width: 14 },
    ],
    rows: places.map((row) => [row.name, row.trees, row.species, row.native, row.invasive, row.measured,
      row.measured ? row.co2T : null, row.measured ? row.co2YearT : null]),
    totals: [placeLabel, sum('trees'), speciesSummary(records).length, sum('native'), sum('invasive'), sum('measured'), sum('co2T'), sum('co2YearT')],
    notes: [citation(placeLabel, date)],
  });

  const species = speciesSummary(records);
  await addTableSheet(workbook, {
    name: 'Species',
    lgu,
    title: 'SPECIES',
    subtitle: `${species.length} in ${placeLabel}`,
    preparedBy,
    date,
    columns: [
      { label: 'Species', width: 22 },
      { label: 'Scientific name', width: 26 },
      { label: 'Origin', width: 12 },
      { label: 'Trees', kind: 'number', width: 9 },
      { label: 'Share of the trees', kind: 'percent', width: 12 },
    ],
    rows: species.map((row) => [row.name, row.scientificName, row.origin, row.trees, row.share]),
    totals: [`${species.length} species`, null, null, records.length, records.length ? 1 : null],
    notes: [citation(placeLabel, date)],
  });

  return workbookBlob(workbook);
}

/** The trees as a GeoJSON FeatureCollection, as text. */
export function inventoryGeoJson(records, { placeLabel = 'Laguna', date = new Date() } = {}) {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      name: `Green Tag tagged trees, ${placeLabel}`,
      metadata: { citation: citation(placeLabel, date), notes: METHOD_NOTES },
      features: records.map(({ latitude, longitude, ...properties }) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        properties,
      })),
    },
    null,
    1
  );
}
