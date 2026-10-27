import { FLUP_ELEVATION_CLASSES, FLUP_SLOPE_CLASSES } from '../layers/terrain.js';
import { originOf } from '../treeOrigin.js';

/**
 * Tables the reports share (Round C, 18 October): the elevation and slope
 * classes of the FLUP guidelines, soil, people exposed to hazards, CLIRAM's
 * climate, and the species, their origin and their diversity as TB 2018-02
 * computes them. The thematic reports they were first written for gave way
 * to the Ecological Profile and Tree Inventory Report (27 October) and the
 * index and GHG reports beside it; the tables stayed.
 *
 * Every figure is EXPOSURE — how much of a place, how many people, lie in a
 * hazard or a class. Risk needs the likelihood of an event, the severity of
 * its consequence and the LGU's capacity to adapt, which the LCCAP guidebook
 * (DILG-LGA, Book 3, Task 3A.4) leaves to the LGU's own assessment.
 */

const ha = (m2) => (Number(m2) || 0) / 10000;
const n = (value) => Number(value || 0).toLocaleString('en-US');
const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
const anyValue = (rows, key) => rows.some((row) => row[key] !== null && row[key] !== undefined);
const placeWord = (label) => (label === 'Barangay' ? 'barangays' : 'cities and municipalities');

// ---- Soil -------------------------------------------------------------------------

/** Each soil series mapped in the place: its area, its share, where it is the main soil. */
export function soilSeriesTable({ places = [], measured = null, placeLabel = 'Barangay' }) {
  const bySeries = new Map();
  for (const place of places) {
    const soils = measured?.get(place.name)?.soil ?? [];
    soils.forEach((soil, i) => {
      const key = soil.series || soil.description || 'Unnamed';
      const entry = bySeries.get(key) ?? { name: key, description: new Set(), areaHa: 0, mainIn: [] };
      if (soil.description && soil.description !== key) entry.description.add(soil.description);
      entry.areaHa += (place.areaHa || 0) * (Number(soil.share) || 0);
      if (i === 0) entry.mainIn.push(place.name);
      bySeries.set(key, entry);
    });
  }
  const total = [...bySeries.values()].reduce((t, e) => t + e.areaHa, 0);
  const rows = [...bySeries.values()]
    .map((e) => ({
      name: e.name,
      description: [...e.description].join('; ') || null,
      areaHa: e.areaHa,
      share: total ? e.areaHa / total : null,
      mainIn: e.mainIn.sort().join(', ') || null,
    }))
    .sort((a, b) => b.areaHa - a.areaHa);
  return {
    key: 'soil-series',
    title: 'Soil series',
    note: 'DA–BSWM soil map, measured on a grid of about 60 m.',
    columns: [
      { key: 'name', label: 'Soil series', kind: 'text' },
      { key: 'description', label: 'Described as', kind: 'text' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      { key: 'share', label: 'Share', kind: 'percent' },
      { key: 'mainIn', label: `Main soil of (${placeWord(placeLabel)})`, kind: 'text' },
    ],
    rows,
    totals: { name: `${rows.length} series`, areaHa: total, share: rows.length ? 1 : null },
  };
}

/** Each place's main and second soils. */
export function soilByPlaceTable({ places = [], measured = null, placeLabel = 'Barangay' }) {
  const rows = places
    .map((place) => {
      const soils = measured?.get(place.name)?.soil ?? [];
      return {
        name: place.name,
        areaHa: place.areaHa,
        main: soils[0]?.series ?? null,
        mainShare: soils[0]?.share ?? null,
        second: soils[1]?.series ?? null,
        secondShare: soils[1]?.share ?? null,
        others: soils.length > 2 ? soils.length - 2 : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    key: 'soil-places',
    title: `Soils by ${placeLabel === 'Barangay' ? 'barangay' : 'city and municipality'}`,
    columns: [
      { key: 'name', label: placeLabel, kind: 'text' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      { key: 'main', label: 'Main soil', kind: 'text' },
      { key: 'mainShare', label: 'Share', kind: 'percent' },
      { key: 'second', label: 'Second soil', kind: 'text' },
      { key: 'secondShare', label: 'Share', kind: 'percent' },
      { key: 'others', label: 'Other series', kind: 'number' },
    ],
    rows,
    totals: { name: `${rows.length} ${placeWord(placeLabel)}`, areaHa: sum(rows, 'areaHa') },
  };
}

// ---- Elevation and slope ------------------------------------------------------------

function classTable({ key, title, classes, factsKey, places, measured, placeLabel, extra }) {
  const rows = places
    .map((place) => {
      const facts = measured?.get(place.name);
      const terrain = facts?.terrain;
      const row = { name: place.name, areaHa: place.areaHa };
      for (const cls of classes) row[cls.id] = terrain ? ha(terrain[factsKey][cls.id]) : null;
      return { ...row, ...extra(facts) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const totals = { name: `${rows.length} ${placeWord(placeLabel)}`, areaHa: sum(rows, 'areaHa') };
  for (const cls of classes) totals[cls.id] = anyValue(rows, cls.id) ? sum(rows, cls.id) : null;
  return { key, title, rows, totals, classes };
}

export function elevationTable({ places = [], measured = null, placeLabel = 'Barangay' }) {
  const table = classTable({
    key: 'elevation',
    title: `Elevation by ${placeLabel === 'Barangay' ? 'barangay' : 'city and municipality'}, in the FLUP classes`,
    classes: FLUP_ELEVATION_CLASSES,
    factsKey: 'elevation',
    places,
    measured,
    placeLabel,
    extra: (facts) => ({
      min: facts?.elevation?.min ?? null,
      max: facts?.elevation?.max ?? null,
      mean: facts?.elevation?.mean ?? null,
    }),
  });
  table.note = 'Copernicus DEM, measured on a grid of about 60 m. Classes as in the FLUP guidelines, Table 1.';
  table.columns = [
    { key: 'name', label: placeLabel, kind: 'text' },
    { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
    ...FLUP_ELEVATION_CLASSES.map((cls) => ({ key: cls.id, label: `${cls.label} (ha)`, kind: 'ha' })),
    { key: 'min', label: 'Lowest (m)', kind: 'number' },
    { key: 'max', label: 'Highest (m)', kind: 'number' },
    { key: 'mean', label: 'Mean (m)', kind: 'number' },
  ];
  return table;
}

export function slopeTable({ places = [], measured = null, placeLabel = 'Barangay' }) {
  const table = classTable({
    key: 'slope',
    title: `Slope by ${placeLabel === 'Barangay' ? 'barangay' : 'city and municipality'}, in the FLUP classes`,
    classes: FLUP_SLOPE_CLASSES,
    factsKey: 'slope',
    places,
    measured,
    placeLabel,
    extra: (facts) => {
      const terrain = facts?.terrain;
      if (!terrain) return { steep: null, meanSlope: null };
      const total = Object.values(terrain.slope).reduce((t, v) => t + v, 0);
      const steep = terrain.slope.from18 + terrain.slope.from30 + terrain.slope.above50;
      return { steep: total ? steep / total : null, meanSlope: terrain.meanSlope };
    },
  });
  table.note = 'Worked out from the Copernicus DEM, cell by cell. 18% and over: PD 705, section 15.';
  table.columns = [
    { key: 'name', label: placeLabel, kind: 'text' },
    { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
    ...FLUP_SLOPE_CLASSES.map((cls) => ({ key: cls.id, label: `${cls.label} (ha)`, kind: 'ha' })),
    { key: 'steep', label: '18% and over', kind: 'percent' },
    { key: 'meanSlope', label: 'Mean slope (%)', kind: 'decimal' },
  ];
  const all = sum(table.rows, 'below18') + sum(table.rows, 'from18') + sum(table.rows, 'from30') + sum(table.rows, 'above50');
  table.totals.steep = all ? (sum(table.rows, 'from18') + sum(table.rows, 'from30') + sum(table.rows, 'above50')) / all : null;
  return table;
}

// ---- People in hazard areas, and the climate ------------------------------------------

/**
 * The people in each place's hazard areas — an ESTIMATE: the population times
 * the share of the place exposed, as if people lived evenly across it. They do
 * not, and the note says so; it is the order of magnitude the FLUP (Module 3,
 * "population and settlement within highly vulnerable areas") asks for until
 * the LGU's own settlement map is laid over the hazards.
 */
export function peopleExposedTable({ hazards, populationOf, placeLabel = 'Barangay' }) {
  const rows = (hazards?.rows ?? [])
    .map((row) => {
      const population = populationOf(row.name);
      const of = (share) => (population && share !== null && share !== undefined ? Math.round(population * share) : null);
      return {
        name: row.name,
        population: population ?? null,
        floodShare: row.floodShare,
        floodPeople: of(row.floodShare),
        highFloodPeople: row.areaHa && row.floodHigh !== null ? of(row.floodHigh / row.areaHa) : null,
        landslideShare: row.landslideShare,
        landslidePeople: of(row.landslideShare),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    key: 'people-exposed',
    title: 'People in hazard areas (estimate)',
    note: 'Population × the share of the place exposed, as if people lived evenly across it. An estimate, not a count.',
    columns: [
      { key: 'name', label: placeLabel, kind: 'text' },
      { key: 'population', label: 'Population', kind: 'number' },
      { key: 'floodShare', label: 'Flood (% of area)', kind: 'percent' },
      { key: 'floodPeople', label: 'People in flood areas', kind: 'number' },
      { key: 'highFloodPeople', label: '…at the high level', kind: 'number' },
      { key: 'landslideShare', label: 'Landslide (% of area)', kind: 'percent' },
      { key: 'landslidePeople', label: 'People in landslide areas', kind: 'number' },
    ],
    rows,
    totals: {
      name: `${rows.length} ${placeWord(placeLabel)}`,
      population: sum(rows, 'population') || null,
      floodPeople: anyValue(rows, 'floodPeople') ? sum(rows, 'floodPeople') : null,
      highFloodPeople: anyValue(rows, 'highFloodPeople') ? sum(rows, 'highFloodPeople') : null,
      landslidePeople: anyValue(rows, 'landslidePeople') ? sum(rows, 'landslidePeople') : null,
    },
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The CLIRAM observed baseline by month, and the projection. Null without a CLIRAM row. */
export function climateTable(climate) {
  const rain = climate?.rainfall?.monthly;
  const temp = climate?.temperature?.monthly;
  if (!Array.isArray(rain) && !Array.isArray(temp)) return null;
  const rows = MONTHS.map((month, i) => ({
    name: month,
    rainfall: Array.isArray(rain) && Number.isFinite(Number(rain[i])) ? Number(rain[i]) : null,
    temperature: Array.isArray(temp) && Number.isFinite(Number(temp[i])) ? Number(temp[i]) : null,
  }));
  return {
    key: 'climate',
    title: `Climate — observed baseline${climate.place ? `, ${climate.place}` : ''}`,
    note: `DOST-PAGASA CLIRAM${climate.scenario ? `; projections for ${climate.scenario}` : ''}.`,
    columns: [
      { key: 'name', label: 'Month', kind: 'text' },
      { key: 'rainfall', label: 'Rainfall (mm)', kind: 'decimal' },
      { key: 'temperature', label: 'Mean temperature (°C)', kind: 'decimal' },
    ],
    rows,
    totals: {
      name: 'Year',
      rainfall: climate.rainfall?.annualMm ?? (anyValue(rows, 'rainfall') ? sum(rows, 'rainfall') : null),
      temperature: climate.temperature?.meanC ?? null,
    },
  };
}

// ---- Biodiversity ---------------------------------------------------------------------

// Each tree's origin (endemic, native, exotic, invasive): src/lib/treeOrigin.js.
export { originOf };
const ORIGIN_LABELS = { endemic: 'Endemic', native: 'Native / indigenous', exotic: 'Exotic (introduced)', invasive: 'Invasive', unrecorded: 'Not recorded' };

/**
 * Species richness and diversity, as TB 2018-02 Attachment 1 computes them:
 * S, Shannon's H′ = −Σ pᵢ ln pᵢ, evenness J = H′ / ln S, and Simpson's
 * dominance c = Σ pᵢ² (1 − c is the chance two trees picked at random differ).
 * Trees with no species recorded are left out.
 */
export function diversityIndices(trees = []) {
  const counts = new Map();
  for (const tree of trees) {
    const species = String(tree.species ?? '').trim();
    if (!species || /^unknown$/i.test(species)) continue;
    const key = species.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const N = [...counts.values()].reduce((t, v) => t + v, 0);
  const S = counts.size;
  if (N === 0) return { S: 0, N: 0, shannon: null, evenness: null, simpson: null };
  let shannon = 0;
  let simpson = 0;
  for (const count of counts.values()) {
    const p = count / N;
    shannon -= p * Math.log(p);
    simpson += p * p;
  }
  return { S, N, shannon, evenness: S > 1 ? shannon / Math.log(S) : null, simpson };
}

export function speciesTable(trees = []) {
  const bySpecies = new Map();
  for (const tree of trees) {
    const name = String(tree.species ?? '').trim() || 'Not identified';
    const entry = bySpecies.get(name.toLowerCase()) ?? { name, scientific: tree.scientific_name || null, origin: originOf(tree), count: 0 };
    entry.count += 1;
    if (!entry.scientific && tree.scientific_name && !/unknown/i.test(tree.scientific_name)) entry.scientific = tree.scientific_name;
    bySpecies.set(name.toLowerCase(), entry);
  }
  const total = trees.length;
  const rows = [...bySpecies.values()]
    .map((e) => ({ ...e, originLabel: ORIGIN_LABELS[e.origin], share: total ? e.count / total : null }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    key: 'species',
    title: 'Species of the tagged trees',
    columns: [
      { key: 'name', label: 'Species', kind: 'text' },
      { key: 'scientific', label: 'Scientific name', kind: 'text' },
      { key: 'originLabel', label: 'Origin', kind: 'text' },
      { key: 'count', label: 'Trees', kind: 'number' },
      { key: 'share', label: 'Share', kind: 'percent' },
    ],
    rows,
    totals: { name: `${rows.length} species`, count: total, share: total ? 1 : null },
  };
}

/** The vegetation structure TB 2018-02 asks the inventory for, and the diversity indices. */
export function compositionTable(trees = []) {
  const counts = Object.fromEntries(Object.keys(ORIGIN_LABELS).map((key) => [key, 0]));
  for (const tree of trees) counts[originOf(tree)] += 1;
  const d = diversityIndices(trees);
  const total = trees.length;
  const rows = [
    ...Object.entries(ORIGIN_LABELS).map(([key, label]) => ({ name: `${label} trees`, value: n(counts[key]), share: total ? counts[key] / total : null })),
    { name: 'Species richness (S)', value: n(d.S), share: null },
    { name: "Shannon diversity (H′)", value: d.shannon === null ? '—' : d.shannon.toFixed(2), share: null },
    { name: 'Evenness (J = H′ / ln S)', value: d.evenness === null ? '—' : d.evenness.toFixed(2), share: null },
    { name: "Simpson's dominance (c = Σpᵢ²)", value: d.simpson === null ? '—' : d.simpson.toFixed(3), share: null },
  ];
  return {
    key: 'composition',
    title: 'Vegetation structure and diversity',
    note: 'Categories and formulas as in DENR-BMB Technical Bulletin 2018-02 (Annex A, Step 6; Attachment 1).',
    columns: [
      { key: 'name', label: 'Measure', kind: 'text' },
      { key: 'value', label: 'Value', kind: 'text' },
      { key: 'share', label: 'Share of trees', kind: 'percent' },
    ],
    rows,
    counts,
    diversity: d,
  };
}
