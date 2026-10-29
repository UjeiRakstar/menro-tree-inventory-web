import { climateTable, diversityIndices, elevationTable, slopeTable, speciesTable } from './thematic.js';
import { listOf } from '../reportWriter.js';
import { lguFacts, officialName, provinceFacts } from '../psgc.js';
import { originOf } from '../treeOrigin.js';
import { treeClassOf } from '../mapSheet.js';
import { diameterDistribution } from '../treeVolume.js';
import { LAGUNA_GRID } from '../layers/grid.js';
import { levelAt } from '../layers/measure.js';

/**
 * The one report (27 October): the Ecological Profile and Tree Inventory
 * Report, in place of the six — general, soil, hazards and climate, elevation
 * and slope, biodiversity, GHG inventory — the map sheet used to offer.
 *
 *   1. Executive Summary
 *   2. Ecological Profile — location, elevation, slope, climate
 *   3. Exposure of Natural Resources to Hazards — the trees; land cover and
 *      tree planting sites
 *
 * The biodiversity of the trees — overview, origin, structure, phenology —
 * was chapter 3 until 29 October; it is now the biological features of the
 * Urban Biodiversity Management Plan (biodiversityPlan.js). Its tables stay
 * here, for the plan to use.
 *
 * Each part keeps its own maps, tables and narrative together, rather than
 * all the maps, then all the tables, then all the text. The narrative is
 * written from the figures, in fixed sentences, so it always says what the
 * tables say; the office edits every paragraph, and Improve with AI only
 * proposes wording.
 *
 * Every hazard figure is EXPOSURE — what lies in a hazard's extent — never
 * risk, which needs the likelihood, the consequence and the LGU's capacity
 * (DILG-LGA LCCAP Guidebook, Book 3, Task 3A.4).
 */

export const ECOLOGICAL_REPORT = Object.freeze({
  id: 'ecological',
  label: 'Ecological profile and tree inventory',
  title: 'ECOLOGICAL PROFILE AND TREE INVENTORY REPORT',
});

/**
 * The maps, drawn from the sheet one by one: a survey layer or none, the
 * trees coloured one way or by origin or left off, the areas on or off.
 */
export function ecologicalMaps(placeLabel = 'Barangay') {
  const places = placeLabel === 'Barangay' ? 'its barangays' : 'its cities and municipalities';
  return [
    { key: 'location', survey: null, trees: false, sites: false, caption: `Location map — the place and ${places}` },
    { key: 'elevation', survey: 'elevation', trees: false, sites: false, caption: 'Elevation map (Copernicus DEM)' },
    { key: 'slope', survey: 'slope', trees: false, sites: false, caption: 'Slope map, in the FLUP slope classes (from the Copernicus DEM)' },
    { key: 'trees', survey: null, treeColour: 'one', sites: false, caption: 'The tagged trees' },
    { key: 'origin', survey: null, treeColour: 'origin', sites: false, caption: 'Endemic or native, and invasive trees' },
    { key: 'trees-flood', survey: 'flood', treeColour: 'one', sites: false, caption: 'The tagged trees and flood susceptibility (UP NOAH)' },
    { key: 'trees-landslide', survey: 'landslide', treeColour: 'one', sites: false, caption: 'The tagged trees and rain-induced landslide susceptibility (UP NOAH)' },
    { key: 'areas-flood', survey: 'flood', trees: false, sites: true, caption: 'Land cover, tree planting sites and flood susceptibility (UP NOAH)' },
    { key: 'areas-landslide', survey: 'landslide', trees: false, sites: true, caption: 'Land cover, tree planting sites and rain-induced landslide susceptibility (UP NOAH)' },
  ];
}

const n = (value) => Number(value || 0).toLocaleString('en-US');
const hectares = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%');
const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const placesWord = (label) => (label === 'Barangay' ? 'barangays' : 'cities and municipalities');
const speciesKey = (value) => String(value ?? '').trim().toLowerCase();

// ---- Tables ---------------------------------------------------------------------------

/** Each place's area, urban or rural, and population. */
export function locationTable({ places = [], populationOf = () => null, urbanOf = () => null, placeLabel = 'Barangay' }) {
  const rows = places
    .map((place) => ({ name: place.name, areaHa: place.areaHa ?? null, urban: urbanOf(place.name), population: populationOf(place.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    key: 'location',
    title: `The ${placesWord(placeLabel)}`,
    note: 'Area from the PSA / NAMRIA boundaries; urban or rural and the 2024 population from the PSA, or the office’s own figures.',
    columns: [
      { key: 'name', label: placeLabel, kind: 'text' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      ...(placeLabel === 'Barangay' ? [{ key: 'urban', label: 'Urban / rural', kind: 'text' }] : []),
      { key: 'population', label: 'Population', kind: 'number' },
    ],
    rows,
    totals: {
      name: `${rows.length} ${placesWord(placeLabel)}`,
      areaHa: sum(rows, 'areaHa'),
      urban: placeLabel === 'Barangay' ? `${rows.filter((row) => row.urban === 'Urban').length} urban` : undefined,
      population: sum(rows, 'population') || null,
    },
  };
}

/** The trees at a glance: by origin and by use. */
export function treeSummaryTable(trees = []) {
  const total = trees.length;
  const origin = { endemic: 0, native: 0, exotic: 0, invasive: 0, unrecorded: 0 };
  const use = { fruit: 0, timber: 0, ornamental: 0, unrecorded: 0 };
  for (const tree of trees) {
    origin[originOf(tree)] += 1;
    use[treeClassOf(tree, 'use')] += 1;
  }
  const row = (name, count) => ({ name, count, share: total ? count / total : null });
  return {
    key: 'tree-summary',
    title: 'The tagged trees by origin and by use',
    columns: [
      { key: 'name', label: 'Trees', kind: 'text' },
      { key: 'count', label: 'Number', kind: 'number' },
      { key: 'share', label: 'Share', kind: 'percent' },
    ],
    rows: [
      row('Endemic', origin.endemic),
      row('Native / indigenous', origin.native),
      row('Exotic (introduced)', origin.exotic),
      row('Invasive', origin.invasive),
      row('Origin not recorded', origin.unrecorded),
      row('Fruit trees', use.fruit),
      row('Timber trees', use.timber),
      row('Ornamental trees', use.ornamental),
      row('Use not recorded', use.unrecorded),
    ],
    totals: { name: 'All tagged trees', count: total, share: total ? 1 : null },
    origin,
    use,
  };
}

/** The trees of each place: how many, of how many species, by origin and use. */
export function treesByPlaceTable({ trees = [], places = [], placeOf = (tree) => tree.barangay, placeLabel = 'Barangay' }) {
  const rows = places
    .map((place) => {
      const here = trees.filter((tree) => placeOf(tree) === place.name);
      const origin = (id) => here.filter((tree) => originOf(tree) === id).length;
      const use = (id) => here.filter((tree) => treeClassOf(tree, 'use') === id).length;
      return {
        name: place.name,
        trees: here.length,
        species: new Set(here.map((tree) => speciesKey(tree.species)).filter(Boolean)).size,
        endemic: origin('endemic'),
        native: origin('native'),
        exotic: origin('exotic'),
        invasive: origin('invasive'),
        fruit: use('fruit'),
        timber: use('timber'),
        ornamental: use('ornamental'),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    key: 'trees-by-place',
    title: `Tagged trees by ${placeLabel === 'Barangay' ? 'barangay' : 'city and municipality'}`,
    columns: [
      { key: 'name', label: placeLabel, kind: 'text' },
      { key: 'trees', label: 'Trees', kind: 'number' },
      { key: 'species', label: 'Species', kind: 'number' },
      { key: 'endemic', label: 'Endemic', kind: 'number' },
      { key: 'native', label: 'Native', kind: 'number' },
      { key: 'exotic', label: 'Exotic', kind: 'number' },
      { key: 'invasive', label: 'Invasive', kind: 'number' },
      { key: 'fruit', label: 'Fruit', kind: 'number' },
      { key: 'timber', label: 'Timber', kind: 'number' },
      { key: 'ornamental', label: 'Ornamental', kind: 'number' },
    ],
    rows,
    totals: {
      name: `${rows.length} ${placesWord(placeLabel)}`,
      trees: sum(rows, 'trees'),
      species: new Set(trees.map((tree) => speciesKey(tree.species)).filter(Boolean)).size,
      endemic: sum(rows, 'endemic'),
      native: sum(rows, 'native'),
      exotic: sum(rows, 'exotic'),
      invasive: sum(rows, 'invasive'),
      fruit: sum(rows, 'fruit'),
      timber: sum(rows, 'timber'),
      ornamental: sum(rows, 'ornamental'),
    },
  };
}

/** Endemic, native and invasive trees in each place. */
export function originByPlaceTable({ trees = [], places = [], placeOf = (tree) => tree.barangay, placeLabel = 'Barangay' }) {
  const rows = places
    .map((place) => {
      const here = trees.filter((tree) => placeOf(tree) === place.name);
      const count = (id) => here.filter((tree) => originOf(tree) === id).length;
      return { name: place.name, trees: here.length, endemic: count('endemic'), native: count('native'), invasive: count('invasive'), invasiveShare: here.length ? count('invasive') / here.length : null };
    })
    .filter((row) => row.trees > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const all = sum(rows, 'trees');
  return {
    key: 'origin-by-place',
    title: `Endemic, native and invasive trees by ${placeLabel === 'Barangay' ? 'barangay' : 'city and municipality'}`,
    note: 'Only the places with tagged trees.',
    columns: [
      { key: 'name', label: placeLabel, kind: 'text' },
      { key: 'trees', label: 'Trees', kind: 'number' },
      { key: 'endemic', label: 'Endemic', kind: 'number' },
      { key: 'native', label: 'Native', kind: 'number' },
      { key: 'invasive', label: 'Invasive', kind: 'number' },
      { key: 'invasiveShare', label: 'Invasive (%)', kind: 'percent' },
    ],
    rows,
    totals: { name: 'All', trees: all, endemic: sum(rows, 'endemic'), native: sum(rows, 'native'), invasive: sum(rows, 'invasive'), invasiveShare: all ? sum(rows, 'invasive') / all : null },
  };
}

/** The endemic, native and invasive species: how many trees, and in how many places. */
export function originSpeciesTable({ trees = [], placeOf = (tree) => tree.barangay, placeLabel = 'Barangay' }) {
  const bySpecies = new Map();
  for (const tree of trees) {
    const origin = originOf(tree);
    if (!['endemic', 'native', 'invasive'].includes(origin)) continue;
    const name = String(tree.species ?? '').trim() || 'Not identified';
    const entry = bySpecies.get(speciesKey(name)) ?? { name, scientific: null, origin, count: 0, places: new Set() };
    entry.count += 1;
    if (!entry.scientific && tree.scientific_name && !/unknown/i.test(tree.scientific_name)) entry.scientific = tree.scientific_name;
    if (placeOf(tree)) entry.places.add(placeOf(tree));
    bySpecies.set(speciesKey(name), entry);
  }
  const ORDER = { endemic: 0, native: 1, invasive: 2 };
  const LABEL = { endemic: 'Endemic', native: 'Native', invasive: 'Invasive' };
  const rows = [...bySpecies.values()]
    .map((entry) => ({ name: entry.name, scientific: entry.scientific, origin: LABEL[entry.origin], originId: entry.origin, count: entry.count, places: entry.places.size }))
    .sort((a, b) => ORDER[a.originId] - ORDER[b.originId] || b.count - a.count || a.name.localeCompare(b.name));
  return {
    key: 'origin-species',
    title: 'Endemic, native and invasive species',
    columns: [
      { key: 'name', label: 'Species', kind: 'text' },
      { key: 'scientific', label: 'Scientific name', kind: 'text' },
      { key: 'origin', label: 'Origin', kind: 'text' },
      { key: 'count', label: 'Trees', kind: 'number' },
      { key: 'places', label: `${placeLabel === 'Barangay' ? 'Barangays' : 'Cities / municipalities'} found in`, kind: 'number' },
    ],
    rows,
  };
}

/** The DENR diameter classes (FMB TB No. 3): the size structure. */
export function diameterTable(trees = []) {
  const distribution = diameterDistribution(trees);
  return {
    key: 'diameter-classes',
    title: 'Size structure — diameter classes',
    note:
      `DENR FMB Technical Bulletin No. 3, 10 cm classes, of the ${n(distribution.measured)} trees measured at 5 cm and over` +
      `${distribution.belowSmallest ? `; ${n(distribution.belowSmallest)} under 5 cm` : ''}${distribution.unmeasured ? `; ${n(distribution.unmeasured)} not measured` : ''}.`,
    columns: [
      { key: 'name', label: 'Diameter class', kind: 'text' },
      { key: 'count', label: 'Trees', kind: 'number' },
      { key: 'share', label: 'Share', kind: 'percent' },
    ],
    rows: distribution.classes.map((klass) => ({ name: klass.range, count: klass.count, share: klass.share })),
    totals: { name: 'Measured', count: distribution.measured, share: distribution.measured ? 1 : null },
    distribution,
  };
}

const HEIGHT_CLASSES = [
  { name: 'Under 5 m', test: (h) => h < 5 },
  { name: '5 to under 10 m', test: (h) => h >= 5 && h < 10 },
  { name: '10 to under 15 m', test: (h) => h >= 10 && h < 15 },
  { name: '15 to under 20 m', test: (h) => h >= 15 && h < 20 },
  { name: '20 m and over', test: (h) => h >= 20 },
];

/** The vertical structure: the trees by total height. */
export function heightTable(trees = []) {
  const heights = trees.map((tree) => Number(tree.total_height)).filter((h) => Number.isFinite(h) && h > 0);
  const measured = heights.length;
  return {
    key: 'height-classes',
    title: 'Vertical structure — total height',
    note: `Of the ${n(measured)} trees with a measured total height${trees.length > measured ? `; ${n(trees.length - measured)} not measured` : ''}.`,
    columns: [
      { key: 'name', label: 'Height', kind: 'text' },
      { key: 'count', label: 'Trees', kind: 'number' },
      { key: 'share', label: 'Share', kind: 'percent' },
    ],
    rows: HEIGHT_CLASSES.map((cls) => {
      const count = heights.filter(cls.test).length;
      return { name: cls.name, count, share: measured ? count / measured : null };
    }),
    totals: { name: 'Measured', count: measured, share: measured ? 1 : null },
    mean: measured ? heights.reduce((t, h) => t + h, 0) / measured : null,
  };
}

/** Tagged trees per hectare in each place: the density of the inventory. */
export function densityTable({ trees = [], places = [], placeOf = (tree) => tree.barangay, placeLabel = 'Barangay' }) {
  const rows = places
    .map((place) => {
      const count = trees.filter((tree) => placeOf(tree) === place.name).length;
      return { name: place.name, areaHa: place.areaHa ?? null, trees: count, perHa: place.areaHa ? count / place.areaHa : null };
    })
    .sort((a, b) => (b.perHa ?? 0) - (a.perHa ?? 0) || a.name.localeCompare(b.name));
  const areaHa = sum(rows, 'areaHa');
  const total = sum(rows, 'trees');
  return {
    key: 'density',
    title: `Tagged trees per hectare by ${placeLabel === 'Barangay' ? 'barangay' : 'city and municipality'}`,
    note: 'The trees tagged so far over the whole land area — the reach of the inventory, not a census of every tree.',
    columns: [
      { key: 'name', label: placeLabel, kind: 'text' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      { key: 'trees', label: 'Tagged trees', kind: 'number' },
      { key: 'perHa', label: 'Trees per ha', kind: 'rate' },
    ],
    rows,
    totals: { name: 'All', areaHa, trees: total, perHa: areaHa ? total / areaHa : null },
  };
}

/** Richness and the TB 2018-02 diversity indices. */
export function diversityTable(trees = []) {
  const d = diversityIndices(trees);
  return {
    key: 'diversity',
    title: 'Species richness and diversity',
    note: 'Formulas as in DENR-BMB Technical Bulletin 2018-02, Attachment 1. Trees with no species recorded are left out.',
    columns: [
      { key: 'name', label: 'Measure', kind: 'text' },
      { key: 'value', label: 'Value', kind: 'text' },
    ],
    rows: [
      { name: 'Species richness (S)', value: n(d.S) },
      { name: 'Shannon diversity (H′)', value: d.shannon === null ? '—' : d.shannon.toFixed(2) },
      { name: 'Evenness (J = H′ / ln S)', value: d.evenness === null ? '—' : d.evenness.toFixed(2) },
      { name: 'Simpson’s dominance (c = Σpᵢ²)', value: d.simpson === null ? '—' : d.simpson.toFixed(3) },
    ],
    diversity: d,
  };
}

/** "March to May", "November to January", or "March, June". */
export function monthsLabel(months) {
  const list = [...new Set((Array.isArray(months) ? months : []).map(Number).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
  if (list.length === 0) return null;
  if (list.length === 12) return 'All year';
  // Runs of consecutive months, joined across December–January.
  const runs = [];
  for (const month of list) {
    const last = runs.at(-1);
    if (last && month === last.at(-1) + 1) last.push(month);
    else runs.push([month]);
  }
  if (runs.length > 1 && runs[0][0] === 1 && runs.at(-1).at(-1) === 12) runs[0] = [...runs.pop(), ...runs[0]];
  return runs
    .map((run) => (run.length === 1 ? MONTHS[run[0] - 1] : `${MONTHS[run[0] - 1]} to ${MONTHS[run.at(-1) - 1]}`))
    .join(', ');
}

const flowering = (status) => Boolean(status) && !/none/i.test(status);

/**
 * Each species: its trees, its use, when it flowers and fruits (the species'
 * RISE profile), and what the field officers last saw on its trees.
 */
export function phenologyTable({ trees = [], profiles = [], records = [] }) {
  const profileOf = new Map();
  for (const profile of profiles) {
    if (profile.species) profileOf.set(speciesKey(profile.species), profile);
    if (profile.scientific_name) profileOf.set(speciesKey(profile.scientific_name), profile);
  }
  // The latest observation of each tree.
  const latest = new Map();
  for (const record of records) {
    const seen = latest.get(record.tree_id);
    if (!seen || String(record.observed_at) > String(seen.observed_at)) latest.set(record.tree_id, record);
  }
  const bySpecies = new Map();
  for (const tree of trees) {
    const name = String(tree.species ?? '').trim();
    if (!name || /^unknown$/i.test(name)) continue;
    const entry = bySpecies.get(speciesKey(name)) ?? { name, trees: [], profile: profileOf.get(speciesKey(name)) ?? profileOf.get(speciesKey(tree.scientific_name)) ?? null };
    entry.trees.push(tree);
    bySpecies.set(speciesKey(name), entry);
  }
  const USE = { fruit: 'Fruit', timber: 'Timber', ornamental: 'Ornamental', unrecorded: '—' };
  const rows = [...bySpecies.values()]
    .map((entry) => {
      const uses = new Map();
      for (const tree of entry.trees) {
        const use = treeClassOf(tree, 'use');
        uses.set(use, (uses.get(use) ?? 0) + 1);
      }
      const mainUse = [...uses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unrecorded';
      const seen = entry.trees.map((tree) => latest.get(tree.id)).filter(Boolean);
      return {
        name: entry.name,
        trees: entry.trees.length,
        use: USE[mainUse],
        useId: mainUse,
        flowering: monthsLabel(entry.profile?.flowering_months),
        fruiting: monthsLabel(entry.profile?.fruiting_months),
        inFlower: seen.filter((record) => flowering(record.flowering_status)).length,
        inFruit: seen.filter((record) => flowering(record.fruiting_status)).length,
        observed: seen.length,
      };
    })
    .sort((a, b) => b.trees - a.trees || a.name.localeCompare(b.name));
  return {
    key: 'phenology',
    title: 'Phenology and harvest periods by species',
    note:
      'Flowering and fruiting months from each species’ profile (DENR-ERDB RISE), where PGENRO has recorded them; ' +
      'in flower and in fruit as the field officers last saw each tree.',
    columns: [
      { key: 'name', label: 'Species', kind: 'text' },
      { key: 'trees', label: 'Trees', kind: 'number' },
      { key: 'use', label: 'Use', kind: 'text' },
      { key: 'flowering', label: 'Flowering', kind: 'text' },
      { key: 'fruiting', label: 'Fruiting / harvest', kind: 'text' },
      { key: 'inFlower', label: 'Seen in flower', kind: 'number' },
      { key: 'inFruit', label: 'Seen in fruit', kind: 'number' },
    ],
    rows,
  };
}

/**
 * Each place's trees by the hazard level at their own point: how many stand
 * in the flood and landslide extents, and how many at the high level.
 */
export function treeExposureTable({ trees = [], places = [], placeOf = (tree) => tree.barangay, grids = null, placeLabel = 'Barangay' }) {
  const level = (tree, kind) => (grids?.[kind] ? levelAt(LAGUNA_GRID, grids[kind], tree.latitude, tree.longitude) : null);
  const rows = places
    .map((place) => {
      const here = trees.filter((tree) => placeOf(tree) === place.name);
      const flood = here.map((tree) => level(tree, 'flood'));
      const slide = here.map((tree) => level(tree, 'landslide'));
      const exposed = here.filter((_, i) => (flood[i] ?? 0) > 0 || (slide[i] ?? 0) > 0).length;
      return {
        name: place.name,
        trees: here.length,
        flood: grids?.flood ? flood.filter((v) => v > 0).length : null,
        floodHigh: grids?.flood ? flood.filter((v) => v === 3).length : null,
        landslide: grids?.landslide ? slide.filter((v) => v > 0).length : null,
        landslideHigh: grids?.landslide ? slide.filter((v) => v === 3).length : null,
        // Not measured is not 0%: with no hazard layer, no share.
        share: here.length && (grids?.flood || grids?.landslide) ? exposed / here.length : null,
      };
    })
    .filter((row) => row.trees > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const all = sum(rows, 'trees');
  const total = (key) => (rows.some((row) => row[key] !== null) ? sum(rows, key) : null);
  const exposedAll = rows.reduce((t, row) => t + Math.round((row.share ?? 0) * row.trees), 0);
  return {
    key: 'tree-exposure',
    title: `Tagged trees in hazard areas by ${placeLabel === 'Barangay' ? 'barangay' : 'city and municipality'}`,
    note: 'Each tree by the UP NOAH level at its own point, on a grid of about 60 m. Only the places with tagged trees.',
    columns: [
      { key: 'name', label: placeLabel, kind: 'text' },
      { key: 'trees', label: 'Trees', kind: 'number' },
      { key: 'flood', label: 'In flood areas', kind: 'number' },
      { key: 'floodHigh', label: '…high level', kind: 'number' },
      { key: 'landslide', label: 'In landslide areas', kind: 'number' },
      { key: 'landslideHigh', label: '…high level', kind: 'number' },
      { key: 'share', label: 'Exposed (%)', kind: 'percent' },
    ],
    rows,
    totals: { name: 'All', trees: all, flood: total('flood'), floodHigh: total('floodHigh'), landslide: total('landslide'), landslideHigh: total('landslideHigh'), share: all && (grids?.flood || grids?.landslide) ? exposedAll / all : null },
  };
}

// ---- The narrative ---------------------------------------------------------------------

const PLANS =
  'the Forest Land Use Plan (FLUP), the Comprehensive Land Use Plan and Comprehensive Development Plan (CLUP / CDP), ' +
  'the enhanced Local Climate Change Action Plan (eLCCAP) and the City Biodiversity Index (CBI)';

function locationText({ where, short, place, places, placeLabel, totalHa, population, urban }) {
  const facts = place ? lguFacts(place.psgc) : provinceFacts();
  const CITY_CLASS = { CC: 'a component city', ICC: 'an independent component city', HUC: 'a highly urbanized city' };
  const kind = place ? (place.isCity ? CITY_CLASS[facts?.cityClass] ?? 'a city' : 'a municipality') : 'the province';
  return (
    `${where.charAt(0).toUpperCase()}${where.slice(1)} is ${kind}${facts?.income ? ` of the ${facts.income} income class` : ''}${place ? ' in the Province of Laguna, Region IV-A (CALABARZON)' : ' of Region IV-A (CALABARZON)'}. ` +
    `It covers about ${hectares(totalHa)} ha in ${n(places.length)} ${placesWord(placeLabel)}` +
    `${placeLabel === 'Barangay' && urban !== null ? `, ${n(urban)} of them urban and ${n(places.length - urban)} rural by the PSA’s classification` : ''}, ` +
    `with about ${n(population)} residents (PSA 2024). ` +
    `Its ecological profile — where the land is high or low, steep or level, how much rain falls, and what grows on it — ` +
    `is the setting in which ${short}’s trees, forests and planting sites are read in the rest of this report.`
  );
}

function elevationText({ short, table }) {
  const rows = table.rows ?? [];
  const known = rows.filter((row) => row.min !== null && row.max !== null);
  if (known.length === 0) return 'The elevation layer has not been uploaded, so the ground’s height is not measured.';
  const t = table.totals ?? {};
  const all = (t.below500 ?? 0) + (t.from500 ?? 0) + (t.above1000 ?? 0);
  const lowest = Math.min(...known.map((row) => row.min));
  const highest = Math.max(...known.map((row) => row.max));
  const upland = [...rows].filter((row) => (row.from500 ?? 0) + (row.above1000 ?? 0) > 0).sort((a, b) => (b.from500 + b.above1000) - (a.from500 + a.above1000)).slice(0, 4);
  return (
    `${short} rises from about ${n(lowest)} m to ${n(highest)} m above sea level. In the FLUP elevation classes, ` +
    `${hectares(t.below500)} ha (${pct(t.below500, all)}) lie below 500 masl, ${hectares(t.from500)} ha (${pct(t.from500, all)}) ` +
    `between 500 and 1,000 masl and ${hectares(t.above1000)} ha (${pct(t.above1000, all)}) above 1,000 masl` +
    `${upland.length ? `; the higher ground is mostly in ${listOf(upland.map((row) => row.name))}` : ''}.\n\n` +
    'Elevation sets the ecological zones of the land: the lowland, where settlement, farming and most of the tagged trees are, ' +
    'and the upland, where forest cover and the headwaters of streams are more often found. It is one of the thematic maps the ' +
    'FLUP guidelines require, and it guides which species suit a planting site — each species’ elevation range is part of its profile.'
  );
}

function slopeText({ table }) {
  const t = table.totals ?? {};
  const all = (t.below18 ?? 0) + (t.from18 ?? 0) + (t.from30 ?? 0) + (t.above50 ?? 0);
  if (!all) return 'The elevation layer has not been uploaded, so the slope is not measured.';
  const steep = [...(table.rows ?? [])].filter((row) => row.steep).sort((a, b) => b.steep - a.steep).slice(0, 4);
  return (
    `${hectares(t.below18)} ha (${pct(t.below18, all)}) slope less than 18%; ${hectares(t.from18)} ha are 18–30%, ` +
    `${hectares(t.from30)} ha 30–50% and ${hectares(t.above50)} ha steeper than 50%.` +
    `${steep.length ? ` The largest shares of ground at 18% and over are in ${listOf(steep.map((row) => `${row.name} (${pct(row.steep, 1)})`))}.` : ''}\n\n` +
    'Slope governs how fast rain runs off, how easily soil erodes and where landslides start. It also draws a legal line: no land ' +
    'of the public domain 18% in slope or over may be classified alienable and disposable (PD 705, section 15), so the steeper ground ' +
    'is where forest land is kept, and where tree cover protects the soil and the communities below it.'
  );
}

function climateText({ short, climate }) {
  if (climate?.rainfall?.annualMm == null && climate?.temperature?.meanC == null) {
    return 'No CLIRAM figures are on file for this place yet; PGENRO uploads them on the Map layers page.';
  }
  const proj = climate.rainfall?.projected;
  const projT = climate.temperature?.projected;
  return (
    `Under the DOST-PAGASA CLIRAM observed baseline, ${short} receives about ${n(climate.rainfall?.annualMm)} mm of rain a year ` +
    `and has a mean temperature of about ${climate.temperature?.meanC} °C.` +
    (proj?.annualMm != null ? ` For ${proj.period}${climate.scenario ? ` under ${climate.scenario}` : ''}, annual rainfall is projected at about ${n(proj.annualMm)} mm` : '') +
    (projT?.meanC != null ? `${proj?.annualMm != null ? ' and' : ` For ${projT.period},`} the mean temperature at about ${projT.meanC} °C` : '') +
    (proj?.annualMm != null || projT?.meanC != null ? '.' : '') +
    '\n\nRainfall and temperature decide which trees thrive, when seedlings are best planted — at the start of the rainy months — and ' +
    'how often the ground floods or slides. The projections are what the eLCCAP plans against: species chosen for planting today ' +
    'should suit the climate they will grow into. CLIRAM gives one set of figures for the whole place, so it is shown here as a table ' +
    'and a chart rather than a map.'
  );
}

function treeExposureText({ table, grids }) {
  if (!grids?.flood && !grids?.landslide) return 'The hazard layers have not been uploaded, so the trees’ exposure is not measured.';
  const t = table.totals ?? {};
  if (!t.trees) return 'No tree has been tagged here yet.';
  const most = [...table.rows].sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).filter((row) => row.share > 0).slice(0, 4);
  return (
    (t.flood !== null ? `${n(t.flood)} of the ${n(t.trees)} tagged trees (${pct(t.flood, t.trees)}) stand in UP NOAH’s flood susceptibility extent, ${n(t.floodHigh)} at the high level. ` : '') +
    (t.landslide !== null ? `${n(t.landslide)} (${pct(t.landslide, t.trees)}) stand in the rain-induced landslide extent, ${n(t.landslideHigh)} at the high level. ` : '') +
    (most.length ? `The largest shares of exposed trees are in ${listOf(most.map((row) => `${row.name} (${pct(row.share, 1)})`))}.` : '') +
    '\n\nTrees in flood areas slow and hold water and need species that tolerate it; trees on landslide-prone slopes bind the soil, but ' +
    'leaning, decayed or undercut trees there are hazards themselves and are the first to check before the rains. This is exposure, ' +
    'not risk: it does not say how likely an event is or how much damage it would do.'
  );
}

function areaExposureText({ landCover, plantingSites }) {
  const cover = landCover?.rows ?? [];
  const sites = plantingSites?.rows ?? [];
  if (cover.length === 0 && sites.length === 0) return 'No land cover or tree planting site has been mapped yet.';
  const coverFlood = cover.reduce((t, row) => t + (row.floodHa ?? 0), 0);
  const coverSlide = cover.reduce((t, row) => t + (row.landslideHa ?? 0), 0);
  const coverHa = cover.reduce((t, row) => t + (row.areaHa ?? 0), 0);
  const wetSites = sites.filter((row) => (row.floodShare ?? 0) >= 0.3).map((row) => row.name);
  const slideSites = sites.filter((row) => (row.landslideShare ?? 0) >= 0.3).map((row) => row.name);
  // Not measured is not 0 ha: say so when no area has its hazard figures.
  const measuredFlood = cover.some((row) => row.floodHa !== null && row.floodHa !== undefined);
  const measuredSlide = cover.some((row) => row.landslideHa !== null && row.landslideHa !== undefined);
  return (
    (cover.length
      ? `Of the ${n(cover.length)} land cover areas mapped (${hectares(coverHa)} ha), ` +
        (measuredFlood ? `${hectares(coverFlood)} ha lie in the flood extent` : 'the flood exposure is not measured') +
        (measuredSlide ? ` and ${hectares(coverSlide)} ha in the landslide extent. ` : ', nor the landslide exposure. ')
      : 'No land cover has been mapped yet. ') +
    (sites.length ? `${n(sites.length)} tree planting ${sites.length === 1 ? 'site is' : 'sites are'} approved. ` : 'No tree planting site has been approved yet. ') +
    (wetSites.length ? `${listOf(wetSites)} ${wetSites.length === 1 ? 'has' : 'have'} 30% or more of the site in the flood extent: plant flood-tolerant species there. ` : '') +
    (slideSites.length ? `${listOf(slideSites)} ${slideSites.length === 1 ? 'has' : 'have'} 30% or more in the landslide extent: deep-rooted species, planted along the contour, hold the slope. ` : '') +
    '\n\nForests, brush, grassland and planting sites in hazard areas are both exposed and protective: their cover reduces runoff and ' +
    'erosion for the land below. The eLCCAP’s exposure database counts these natural resources among the exposed sectors (Book 3, ' +
    'Tool 3A.3), and the FLUP asks where the highly vulnerable areas are. Planting in them should match the hazard.'
  );
}

function summaryText({ where, short, totalHa, places, placeLabel, population, elevation, slope, trees, summary, speciesCount, exposure, landCover, plantingSites }) {
  const et = elevation.totals ?? {};
  const st = slope.totals ?? {};
  const slopeAll = (st.below18 ?? 0) + (st.from18 ?? 0) + (st.from30 ?? 0) + (st.above50 ?? 0);
  const steep = slopeAll ? (st.from18 ?? 0) + (st.from30 ?? 0) + (st.above50 ?? 0) : null;
  const elevAll = (et.below500 ?? 0) + (et.from500 ?? 0) + (et.above1000 ?? 0);
  const xt = exposure.totals ?? {};
  return (
    `This report profiles the ecology of ${where} and its tagged trees, as recorded in the LGU’s tree inventory. ` +
    `It brings together the place — its ${n(places.length)} ${placesWord(placeLabel)}, about ${hectares(totalHa)} ha and ${n(population)} residents — ` +
    `its terrain and climate, the trees the field officers and residents have tagged, and the exposure of the trees, land cover and ` +
    `planting sites to flooding and landslides.\n\n` +
    (elevAll ? `${pct(et.below500, elevAll)} of ${short} lies below 500 m above sea level` : 'The ground’s height is not yet measured') +
    (steep !== null ? `, and ${pct(steep, slopeAll)} slopes 18% or more. ` : '. ') +
    (trees.length
      ? `${n(trees.length)} trees of ${n(speciesCount)} species are tagged: ${n(summary.origin.endemic)} endemic, ${n(summary.origin.native)} native and ` +
        `${n(summary.origin.invasive)} invasive; ${n(summary.use.fruit)} fruit trees and ${n(summary.use.timber)} timber trees. `
      : 'No tree has been tagged yet. ') +
    (xt.trees && xt.flood !== null ? `${pct(xt.flood, xt.trees)} of the tagged trees stand in flood-susceptible areas${xt.landslide !== null ? ` and ${pct(xt.landslide, xt.trees)} in landslide-susceptible areas` : ''}. ` : '') +
    `${n(landCover?.rows?.length ?? 0)} land cover areas and ${n(plantingSites?.rows?.length ?? 0)} tree planting sites are mapped.\n\n` +
    `The figures are a baseline for ${PLANS}. They describe exposure, not risk, and the inventory grows as more trees are tagged — ` +
    'every figure says how many trees it speaks for.'
  );
}

/** How each report's Data and Limitations opens: Green Tag is named here, and only here. */
export const PREPARED_WITH =
  'This report was prepared with the Green Tag Tree Inventory System, developed for the Provincial Government of Laguna ' +
  'through its Provincial Government Environment and Natural Resources Office (PGENRO), with Laguna State Polytechnic University. ' +
  'Its figures and narrative are written by the system from the data below, then reviewed and edited by the office.';

/** How each one ends: the figures are the users' own. */
export const DISCLAIMER =
  'Disclaimer: this report is based on the data entered by its users. The population, for example, is the PSA’s (PSGC) or as ' +
  'validated by the user. Where a figure differs from another source — the Community-Based Monitoring System (CBMS), or the figures ' +
  'in the CLUP, CDP or CDRA — the latest data should be used, as validated by the user.';

const SOURCES =
  `${PREPARED_WITH}\n\n` +
  'Boundaries: PSA and NAMRIA; population and urban or rural: PSA 2024 Census (PSGC 3rd quarter 2026), or the office’s own figures. ' +
  'Elevation: Copernicus DEM, on a grid of about 60 m; slope worked out from it cell by cell, in the FLUP classes. Climate: DOST-PAGASA ' +
  'CLIRAM. Hazards: UP NOAH flood and rain-induced landslide susceptibility. Trees: the field inventory of the LGU’s field officers and ' +
  'the residents’ tags they verified; diameter classes as DENR FMB Technical Bulletin No. 3; diversity indices as DENR-BMB Technical ' +
  'Bulletin 2018-02; flowering and fruiting months from the species’ DENR-ERDB RISE profiles. Land cover and planting sites: as the ' +
  'office and PGENRO mapped them, in NAMRIA’s classes.\n\n' +
  'Limitations: the figures describe exposure, not risk; the tree inventory covers the trees tagged so far, not every tree; and each ' +
  'layer is measured on a grid of about 60 m, so small areas are approximate. For planning purposes only — not a land title, survey ' +
  'plan or proof of ownership.\n\n' +
  DISCLAIMER;

/**
 * Where the data and the methods come from, with where to find them: the
 * same for every LGU, so written once. One reference to a paragraph.
 */
export const REFERENCES = [
  'Philippine Statistics Authority. (2026). Philippine Standard Geographic Code (PSGC), 3rd quarter 2026; 2024 Census of Population. https://psa.gov.ph/classification/psgc',
  'National Mapping and Resource Information Authority (NAMRIA). Administrative boundaries and land cover classification. https://www.namria.gov.ph',
  'University of the Philippines Resilience Institute, Project NOAH. Flood and rain-induced landslide hazard maps (ESRI shapefiles, Open Database License). https://noah.up.edu.ph',
  'Department of Agriculture – Bureau of Soils and Water Management. Soil series maps. https://www.bswm.da.gov.ph',
  'European Space Agency / Copernicus. Copernicus Digital Elevation Model, through the Copernicus Data Space Ecosystem. https://dataspace.copernicus.eu',
  'DOST-PAGASA. Climate Information and Risk Analysis Matrix (CLIRAM): observed and projected rainfall and temperature. https://www.pagasa.dost.gov.ph',
  'DENR Ecosystems Research and Development Bureau. ERDB Services and Knowledge Resources Integrated System (RISE): species profiles. https://erdb.denr.gov.ph',
  'DENR Forest Management Bureau. (2014). Technical Bulletin No. 3: Measurement standards and procedures in the conduct of inventory for standing trees. https://forestry.denr.gov.ph',
  'DENR Biodiversity Management Bureau. (2018). Technical Bulletin No. 2018-02: Procedures in the conduct of assessment of urban biodiversity. https://bmb.gov.ph',
  'DENR. Draft guidelines in the formulation of Forest Land Use Plan for local government units. https://forestry.denr.gov.ph',
  'Local Government Academy, DILG. (2017). Enhanced LGU guidebook on the formulation of the Local Climate Change Action Plan, Book 3. https://lga.gov.ph',
  'Presidential Decree No. 705, Revised Forestry Code of the Philippines (1975), section 15. https://lawphil.net/statutes/presdecs/pd1975/pd_705_1975.html',
  'Santamour, F. S., Jr. (1990). Trees for urban planting: diversity, uniformity, and common sense. Proceedings of the 7th Conference of the Metropolitan Tree Improvement Alliance (METRIA 7), 57–65.',
];

// ---- The report -----------------------------------------------------------------------

/**
 * The report, as chapters of parts — each part { key, heading, maps (keys),
 * tables, sections } — and, flattened, every table (for Excel) and every
 * section (for editing and Improve with AI).
 *
 * `ctx`: place (the LGU, or null for the province), places (each { name,
 * areaHa }), measured (the places' layer facts), grids (the measuring grids,
 * for each tree's hazard level), placeLabel, tables (the map sheet's
 * attribute tables by key: landCover, plantingSites), trees, placeOf,
 * climate (CLIRAM), populationOf, urbanOf.
 */
export function buildEcologicalReport(ctx) {
  const placeLabel = ctx.placeLabel ?? 'Barangay';
  // "the Municipality of Santa Cruz", "the City of Biñan", "the Province of Laguna".
  const where = `the ${officialName(ctx.place)}`;
  const short = ctx.place ? ctx.place.label : 'Laguna';
  const places = ctx.places ?? [];
  const trees = ctx.trees ?? [];
  const placeOf = ctx.placeOf ?? ((tree) => tree.barangay);
  const common = { places, measured: ctx.measured ?? null, placeLabel };
  const byKey = ctx.tables ?? {};

  const location = locationTable({ places, populationOf: ctx.populationOf ?? (() => null), urbanOf: ctx.urbanOf ?? (() => null), placeLabel });
  const elevation = elevationTable(common);
  const slope = slopeTable(common);
  const climate = climateTable(ctx.climate);
  const summary = treeSummaryTable(trees);
  const species = speciesTable(trees);
  const exposure = treeExposureTable({ trees, places, placeOf, grids: ctx.grids ?? null, placeLabel });
  const landCover = byKey.landCover ?? null;
  const plantingSites = byKey.plantingSites ?? null;

  const totalHa = places.reduce((t, place) => t + (place.areaHa || 0), 0);
  const population = location.totals.population ?? 0;
  const urban = placeLabel === 'Barangay' && location.rows.some((row) => row.urban) ? location.rows.filter((row) => row.urban === 'Urban').length : null;

  const part = (key, heading, maps, tables, sections) => ({ key, heading, maps, tables: tables.filter(Boolean), sections });
  const chapters = [
    {
      key: 'summary',
      heading: '1. Executive Summary',
      parts: [
        part('summary', null, [], [], [
          {
            key: 'summary',
            heading: 'Executive summary',
            text: summaryText({ where, short, totalHa, places, placeLabel, population, elevation, slope, trees, summary, speciesCount: species.rows.length, exposure, landCover, plantingSites }),
          },
        ]),
      ],
    },
    {
      key: 'profile',
      heading: '2. Ecological Profile',
      parts: [
        part('location', '2.1 Location', ['location'], [location], [
          { key: 'location', heading: 'Location', text: locationText({ where, short, place: ctx.place, places, placeLabel, totalHa, population, urban }) },
        ]),
        part('elevation', '2.2 Elevation', ['elevation'], [elevation], [{ key: 'elevation', heading: 'Elevation', text: elevationText({ short, table: elevation }) }]),
        part('slope', '2.3 Slope', ['slope'], [slope], [{ key: 'slope', heading: 'Slope', text: slopeText({ table: slope }) }]),
        part('climate', '2.4 Climate', [], [climate], [{ key: 'climate', heading: 'Climate', text: climateText({ short, climate: ctx.climate }) }]),
      ],
    },
    {
      key: 'exposure',
      heading: '3. Exposure of Natural Resources to Hazards',
      parts: [
        part('tree-exposure', '3.1 Exposure of the Trees', ['trees-flood', 'trees-landslide'], [exposure], [
          { key: 'tree-exposure', heading: 'Exposure of the trees', text: treeExposureText({ table: exposure, grids: ctx.grids }) },
        ]),
        part('area-exposure', '3.2 Exposure of Land Cover and Tree Planting Sites', ['areas-flood', 'areas-landslide'], [landCover, plantingSites], [
          { key: 'area-exposure', heading: 'Exposure of land cover and tree planting sites', text: areaExposureText({ landCover, plantingSites }) },
        ]),
        part('sources', 'Data and Limitations', [], [], [{ key: 'sources', heading: 'Data and limitations', text: SOURCES }]),
        part('references', 'References', [], [], [{ key: 'references', heading: 'References', text: REFERENCES.join('\n\n') }]),
      ],
    },
  ];

  const parts = chapters.flatMap((chapter) => chapter.parts);
  // Only the maps the chapters show, so none is drawn for nothing.
  const usedMaps = new Set(parts.flatMap((p) => p.maps));
  return {
    kind: ECOLOGICAL_REPORT.id,
    title: ECOLOGICAL_REPORT.title,
    maps: ecologicalMaps(placeLabel).filter((map) => usedMaps.has(map.key)),
    chapters,
    tables: parts.flatMap((p) => p.tables),
    sections: parts.flatMap((p) => p.sections),
  };
}
