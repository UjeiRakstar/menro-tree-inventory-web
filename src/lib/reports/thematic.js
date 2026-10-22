import { FLUP_ELEVATION_CLASSES, FLUP_SLOPE_CLASSES } from '../layers/terrain.js';
import { listOf } from '../reportWriter.js';
import { officialName } from '../psgc.js';
import { buildGhgReport } from './ghg.js';
import { CBI_CREDITS, cbiEventCounts } from '../news.js';
import { planBadges, planKindLabel } from '../lccap.js';
import { originOf } from '../treeOrigin.js';
import { CBI_INDICATORS, pointsOn } from '../cbiPoints.js';

/**
 * The thematic reports (Round C, 18 October): soil; hazards and climate;
 * elevation and slope; biodiversity. The MENRO / CENRO chooses one, and each
 * is laid out the same way —
 *
 *   1. the maps
 *   2. the tables and figures that go with them
 *   3. the narrative, written from those tables, ending with what the
 *      figures mean for the plans the LGU makes: the Forest Land Use Plan
 *      (FLUP), the Comprehensive Land Use Plan and Development Plan
 *      (CLUP / CDP), the enhanced Local Climate Change Action Plan (eLCCAP)
 *      and the City Biodiversity Index (CBI).
 *
 * Every figure is EXPOSURE — how much of a place, how many people, lie in a
 * hazard or a class. Risk needs the likelihood of an event, the severity of
 * its consequence and the LGU's capacity to adapt, which the LCCAP guidebook
 * (DILG-LGA, Book 3, Task 3A.4) leaves to the LGU's own assessment; the
 * reports say so rather than guess at it.
 *
 * Sources read for this: DENR, Draft Guidelines in the Formulation of FLUP
 * for LGUs (Module 2 Table 1, Module 3 Table 3); DILG-LGA, Enhanced LGU
 * Guidebook on the Formulation of LCCAP, Book 3 (2017), Section 2.1 and Tools
 * 3A.1d and 3A.3; DENR-BMB Technical Bulletin 2018-02 (urban biodiversity,
 * CBI); PD 705, section 15.
 */

export const REPORT_KINDS = Object.freeze([
  { id: 'general', label: 'General', title: 'REPORT' },
  { id: 'soil', label: 'Soil', title: 'SOIL REPORT' },
  { id: 'hazards', label: 'Hazards and climate', title: 'HAZARD AND CLIMATE REPORT' },
  { id: 'terrain', label: 'Elevation and slope', title: 'ELEVATION AND SLOPE REPORT' },
  { id: 'biodiversity', label: 'Biodiversity', title: 'BIODIVERSITY REPORT' },
  // 20 October: the trees and forest land's part of the LGU's GHG inventory (reports/ghg.js).
  { id: 'ghg', label: 'GHG inventory', title: 'GREENHOUSE GAS INVENTORY REPORT' },
]);
export const reportKindById = (id) => REPORT_KINDS.find((kind) => kind.id === id) ?? REPORT_KINDS[0];

/** The maps each report opens with: the sheet's survey layer, or how its trees are coloured. */
export const REPORT_MAPS = Object.freeze({
  soil: [{ key: 'soil', survey: 'soil', caption: 'Soil map (DA–BSWM soil series)' }],
  hazards: [
    { key: 'flood', survey: 'flood', caption: 'Flood susceptibility map (UP NOAH)' },
    { key: 'landslide', survey: 'landslide', caption: 'Rain-induced landslide susceptibility map (UP NOAH)' },
  ],
  terrain: [
    { key: 'elevation', survey: 'elevation', caption: 'Elevation map (Copernicus DEM)' },
    { key: 'slope', survey: 'slope', caption: 'Slope map, in the FLUP slope classes (from the Copernicus DEM)' },
  ],
  biodiversity: [
    { key: 'origin', survey: null, treeColour: 'origin', caption: 'Tagged trees by origin — endemic or native, and invasive' },
    { key: 'use', survey: null, treeColour: 'use', caption: 'Tagged trees by use — fruit, timber and ornamental' },
  ],
  ghg: [{ key: 'carbon', survey: null, treeColour: 'carbon', caption: 'Tagged trees by the CO₂ they store above ground' }],
});

const ha = (m2) => (Number(m2) || 0) / 10000;
const n = (value) => Number(value || 0).toLocaleString('en-US');
const hectares = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%');
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

/**
 * What the system can give toward the City Biodiversity Index (the Singapore
 * Index, adopted by TB 2018-02), and what it cannot — said plainly, so no
 * reader takes a gap for a zero.
 */
export function cbiTable({ trees = [], landCover = null, protectedHa = 0, placeAreaHa = 0, carbon = null, communityTags = 0, participation = null, events = null, climatePlan = null, year = new Date().getFullYear() }) {
  const coverHa = (landCover?.rows ?? []).filter((row) => row.treeCover).reduce((t, r) => t + r.areaHa, 0);
  const origin = compositionTable(trees).counts;
  const known = trees.length - origin.unrecorded;
  // Points on the index's own bands (src/lib/cbiPoints.js), where the system has the measure.
  const mapped = Boolean(landCover?.rows?.length);
  const scoreOf = (id, value) => {
    const indicator = CBI_INDICATORS.find((i) => i.id === id);
    return value === null || !Number.isFinite(value) ? null : pointsOn(indicator, value);
  };
  const percentOf = (part, whole) => (whole > 0 ? (part / whole) * 100 : null);
  const CREDIT_INDICATOR = { outreach: 'outreach', partnership: 'partnership', project: 'project' };
  const rows = [
    {
      name: 'Proportion of natural areas',
      value: coverHa ? `${hectares(coverHa)} ha of tree cover mapped (${pct(coverHa, placeAreaHa)} of the area)` : 'No tree-cover land cover mapped yet',
      from: 'Land cover the office has mapped',
      points: scoreOf('natural', mapped ? percentOf(coverHa, placeAreaHa) : null),
    },
    {
      name: 'Proportion of protected natural areas',
      value: protectedHa ? `${hectares(protectedHa)} ha designated (${pct(protectedHa, placeAreaHa)})` : 'None designated in the system yet',
      from: 'Areas saved with a legal designation and its document',
      points: scoreOf('protected', mapped || protectedHa ? percentOf(protectedHa, placeAreaHa) : null),
    },
    {
      name: 'Proportion of invasive alien species (trees)',
      value: known ? `${n(origin.invasive)} of ${n(known)} trees of known origin (${pct(origin.invasive, known)})` : 'No origin recorded yet',
      from: 'The tree inventory',
      points: scoreOf('invasive', known ? percentOf(origin.invasive, known) : null),
    },
    {
      name: 'Native biodiversity — trees',
      value: `${n(origin.endemic + origin.native)} endemic or native trees; ${n(diversityIndices(trees).S)} species`,
      from: 'The tree inventory',
    },
    {
      name: 'Climate regulation — carbon storage',
      value: carbon?.co2T ? `${hectares(carbon.co2T)} t CO₂ in ${n(carbon.measured)} measured trees` : 'No tree measured for carbon yet',
      from: 'Chave et al. 2014, on diameter and total height',
    },
    {
      name: 'Climate regulation — tree canopy cover',
      value: mapped ? `${pct(coverHa, placeAreaHa)} of the area under mapped tree cover` : 'No land cover mapped yet',
      from: 'Land cover the office has mapped',
      points: scoreOf('canopy', mapped ? percentOf(coverHa, placeAreaHa) : null),
    },
    {
      name: 'Participation — citizen science',
      value: participation
        ? `${n(participation.residents)} ${participation.residents === 1 ? 'resident' : 'residents'} signed in with Google and tagged trees here; ` +
          `${n(participation.verified_tags)} of their ${n(participation.tags)} tags verified in the field`
        : `${n(communityTags)} community tags verified into the inventory`,
      from: participation
        ? 'Green Tag residents’ accounts, counted where they tagged (community_counts)'
        : 'The public map’s tagging, confirmed in the field',
    },
    // Projects, policies, partnerships and outreach: the events PGENRO posted
    // in News & Events for the place, credited to the CBI (21 October).
    ...CBI_CREDITS.map((credit) => {
      const held = events?.[credit.id] ?? [];
      return {
        name: credit.indicator,
        value: !events
          ? 'Not counted yet'
          : held.length
            ? `${n(held.length)} in ${year}: ${listOf(held.slice(0, 3).map((post) => post.title))}${held.length > 3 ? ', and more' : ''}`
            : `None posted for ${year}`,
        from: 'News & Events, by each event’s purpose',
        points: events && CREDIT_INDICATOR[credit.id] ? scoreOf(CREDIT_INDICATOR[credit.id], held.length) : null,
      };
    }),
    {
      name: 'Policies and plans — climate change action plan',
      value: climatePlan
        ? `${planKindLabel(climatePlan.plan.plan_kind)} ${climatePlan.plan.term_start}–${climatePlan.plan.term_end}, verified by PGENRO${climatePlan.toCcc ? '; submitted to the Climate Change Commission' : ''}`
        : 'None verified for this year',
      from: 'The LGU’s plan, filed and checked in Green Tag',
    },
    { name: 'Budget for biodiversity', value: 'Outside this system', from: 'The LGU’s own records' },
  ];
  const scored = rows.filter((row) => Number.isInteger(row.points));
  rows.push({
    name: 'CBI points, of the indicators scored here',
    value: scored.length
      ? `${scored.reduce((t, r) => t + r.points, 0)} of ${scored.length * 4}, from ${scored.length} of the index’s 23 indicators`
      : 'None scored yet',
    from: 'Green Tag, on the bands of the Singapore Index User’s Manual (2014)',
    points: null,
  });
  return {
    key: 'cbi',
    title: 'Toward the City Biodiversity Index',
    note: 'Indicators of the Singapore Index on Cities’ Biodiversity (Chan et al. 2014), as adopted by TB 2018-02.',
    columns: [
      { key: 'name', label: 'Indicator', kind: 'text' },
      { key: 'value', label: 'What the system shows', kind: 'text' },
      { key: 'points', label: 'Points (0–4)', kind: 'text' },
      { key: 'from', label: 'From', kind: 'text' },
    ],
    rows: rows.map((row) => ({ ...row, points: Number.isInteger(row.points) ? String(row.points) : '' })),
  };
}

// ---- The narrative ----------------------------------------------------------------------

const RELEVANCE_HEADING = 'What this means for the plans';

function soilSections({ where, short, tables }) {
  const series = tables.find((t) => t.key === 'soil-series');
  const rows = series?.rows ?? [];
  if (rows.length === 0) {
    return [{ key: 'soil', heading: 'Soils', text: `The soil layer has not been uploaded, or covers none of ${short}.` }];
  }
  const top = rows.slice(0, 3);
  return [
    {
      key: 'soil',
      heading: `The soils of ${short}`,
      text:
        `${n(rows.length)} soil ${rows.length === 1 ? 'series is' : 'series are'} mapped in the ${where} (DA–BSWM). ` +
        `The most extensive ${top.length === 1 ? 'is' : 'are'} ${listOf(top.map((r) => `${r.name} (${hectares(r.areaHa)} ha, ${pct(r.share, 1)})`))}.` +
        (top[0]?.mainIn ? ` ${top[0].name} is the main soil of ${listOf(top[0].mainIn.split(', ').slice(0, 8))}${top[0].mainIn.split(', ').length > 8 ? ', among others' : ''}.` : ''),
    },
    {
      key: 'soil-relevance',
      heading: RELEVANCE_HEADING,
      text:
        'FLUP: the soil map is one of the thematic maps the FLUP guidelines require (Module 2, Table 1), read as a factor of soil ' +
        'erodibility and flooding in the hazard and vulnerability analysis. CLUP / CDP: soils are a basis for the land suitability ' +
        'analysis behind the land use plan, read with slope and elevation; this report gives their extent, not their suitability. ' +
        'eLCCAP: soils enter the impact chain of the natural resources and agriculture sectors — what heavier rains and longer dry ' +
        'spells do to the ground. CBI: the soils belong in the area profile of the urban biodiversity assessment (TB 2018-02, Step 5).',
    },
  ];
}

function hazardSections({ short, tables, climate }) {
  const hazards = tables.find((t) => t.key === 'hazards');
  const people = tables.find((t) => t.key === 'people-exposed');
  const cover = tables.find((t) => t.key === 'land-cover');
  const sites = tables.find((t) => t.key === 'planting-sites');
  const t = hazards?.totals ?? {};
  const sections = [];
  for (const [kind, words] of [
    ['flood', 'flooding'],
    ['landslide', 'rain-induced landslides'],
  ]) {
    if (t[`${kind}Ha`] === null || t[`${kind}Ha`] === undefined) {
      sections.push({ key: kind, heading: kind === 'flood' ? 'Flooding' : 'Rain-induced landslides', text: `The ${kind} layer has not been uploaded, so exposure to ${words} is not measured.` });
      continue;
    }
    const ranked = [...(hazards.rows ?? [])].filter((r) => (r[`${kind}Share`] ?? 0) > 0).sort((a, b) => b[`${kind}Share`] - a[`${kind}Share`]).slice(0, 4);
    sections.push({
      key: kind,
      heading: kind === 'flood' ? 'Flooding' : 'Rain-induced landslides',
      text: t[`${kind}Ha`] > 0
        ? `${hectares(t[`${kind}Ha`])} ha (${pct(t[`${kind}Ha`], t.areaHa)}) of ${short} lies within the UP NOAH ${kind === 'flood' ? 'flood' : 'rain-induced landslide'} susceptibility extent: ` +
          `${hectares(t[`${kind}Low`])} ha at the low level, ${hectares(t[`${kind}Medium`])} ha medium and ${hectares(t[`${kind}High`])} ha high. ` +
          `The largest shares are in ${listOf(ranked.map((r) => `${r.name} (${pct(r[`${kind}Share`], 1)})`))}.`
        : `None of ${short} lies within the mapped ${kind === 'flood' ? 'flood' : 'landslide'} extent.`,
    });
  }
  if (people?.totals?.floodPeople || people?.totals?.landslidePeople) {
    sections.push({
      key: 'people',
      heading: 'People in hazard areas',
      text:
        `Of about ${n(people.totals.population)} residents, an estimated ${n(people.totals.floodPeople)} live in flood-susceptible ` +
        `areas${people.totals.highFloodPeople ? ` (${n(people.totals.highFloodPeople)} at the high level)` : ''}` +
        `${people.totals.landslidePeople ? ` and ${n(people.totals.landslidePeople)} in landslide-susceptible areas` : ''}. ` +
        'These are estimates — population times the share of each place exposed, as if people lived evenly across it — and ' +
        'should be checked against the LGU’s own settlement map.',
    });
  }
  const coverExposed = (cover?.rows ?? []).reduce((t2, r) => t2 + (r.floodHa ?? 0), 0);
  const sitesExposed = (sites?.rows ?? []).filter((r) => (r.floodShare ?? 0) >= 0.3).map((r) => r.name);
  if (cover?.rows?.length || sites?.rows?.length) {
    sections.push({
      key: 'resources',
      heading: 'Natural resources exposed',
      text:
        `${cover?.rows?.length ? `Of the ${n(cover.rows.length)} land cover areas mapped, ${hectares(coverExposed)} ha lie within the flood extent.` : 'No land cover has been mapped yet.'} ` +
        (sitesExposed.length ? `${listOf(sitesExposed)} ${sitesExposed.length === 1 ? 'has' : 'have'} more than 30% of the site in the flood extent: plant flood-tolerant species there.` : ''),
    });
  }
  if (climate?.rainfall?.annualMm != null || climate?.temperature?.meanC != null) {
    const proj = climate.rainfall?.projected;
    const projT = climate.temperature?.projected;
    sections.push({
      key: 'climate',
      heading: 'Climate',
      text:
        `Under the DOST-PAGASA CLIRAM observed baseline, ${short} receives about ${n(climate.rainfall?.annualMm)} mm of rain a year ` +
        `and has a mean temperature of about ${climate.temperature?.meanC} °C.` +
        (proj?.annualMm != null ? ` For ${proj.period}${climate.scenario ? ` under ${climate.scenario}` : ''}, annual rainfall is projected at about ${n(proj.annualMm)} mm` : '') +
        (projT?.meanC != null ? `${proj?.annualMm != null ? ' and' : ` For ${projT.period},`} the mean temperature at about ${projT.meanC} °C` : '') +
        (proj?.annualMm != null || projT?.meanC != null ? '.' : ''),
    });
  }
  sections.push({
    key: 'hazards-relevance',
    heading: RELEVANCE_HEADING,
    text:
      'eLCCAP: these tables are the start of the exposure database the LCCAP guidebook asks for — the hazards per barangay ' +
      '(Book 3, Tool 3A.1d) and the people and natural resources in them (Tool 3A.3) — and its Section 2.1 wants exactly these ' +
      'tables, graphs and maps of where each hazard is. They are exposure, not risk: risk needs the likelihood of an event, the ' +
      'severity of its consequence and the LGU’s adaptive capacity (Task 3A.4), which are the LGU’s own assessment. ' +
      'CLUP / CDP: the same exposure feeds the Climate and Disaster Risk Assessment that makes a CLUP risk-sensitive. FLUP: Module 3 ' +
      'asks for the highly vulnerable areas mapped and the population and settlements within them. CBI: natural hazards are part ' +
      'of the area profile (TB 2018-02, Step 5).',
  });
  return sections;
}

function terrainSections({ short, tables }) {
  const elevation = tables.find((t) => t.key === 'elevation');
  const slope = tables.find((t) => t.key === 'slope');
  const et = elevation?.totals ?? {};
  const st = slope?.totals ?? {};
  if (!anyValue(elevation?.rows ?? [], 'below500')) {
    return [{ key: 'terrain', heading: 'Elevation and slope', text: 'The elevation layer has not been uploaded, so neither is measured.' }];
  }
  const lowest = Math.min(...elevation.rows.map((r) => r.min).filter((v) => v !== null));
  const highest = Math.max(...elevation.rows.map((r) => r.max).filter((v) => v !== null));
  const all = (et.below500 ?? 0) + (et.from500 ?? 0) + (et.above1000 ?? 0);
  const slopeAll = (st.below18 ?? 0) + (st.from18 ?? 0) + (st.from30 ?? 0) + (st.above50 ?? 0);
  const steepRows = [...slope.rows].filter((r) => r.steep).sort((a, b) => b.steep - a.steep).slice(0, 4);
  return [
    {
      key: 'elevation',
      heading: 'Elevation',
      text:
        `${short} rises from about ${n(lowest)} m to ${n(highest)} m above sea level. In the FLUP classes, ${hectares(et.below500)} ha ` +
        `(${pct(et.below500, all)}) lie below 500 masl, ${hectares(et.from500)} ha (${pct(et.from500, all)}) between 500 and 1,000 masl, ` +
        `and ${hectares(et.above1000)} ha (${pct(et.above1000, all)}) above 1,000 masl.`,
    },
    {
      key: 'slope',
      heading: 'Slope',
      text:
        `${hectares(st.below18)} ha (${pct(st.below18, slopeAll)}) slope less than 18%; ${hectares(st.from18)} ha are 18–30%, ` +
        `${hectares(st.from30)} ha 30–50% and ${hectares(st.above50)} ha steeper than 50%. ` +
        (steepRows.length ? `The largest shares of ground at 18% and over are in ${listOf(steepRows.map((r) => `${r.name} (${pct(r.steep, 1)})`))}.` : ''),
    },
    {
      key: 'terrain-relevance',
      heading: RELEVANCE_HEADING,
      text:
        'FLUP: the elevation and slope maps are two of the thematic maps the FLUP guidelines require (Module 2, Table 1), in these ' +
        'classes. Slope carries a legal line: no land of the public domain 18% in slope or over may be classified alienable and ' +
        'disposable (PD 705, section 15), so ground at 18% and over is where forest land is to be looked for, and the steepest ' +
        'classes are candidates for protection rather than production. CLUP / CDP: steep slopes constrain settlement and ' +
        'infrastructure, and read with soils they guide land suitability. eLCCAP: steep upland ground is where rain-induced ' +
        'landslides start — read this report with the landslide map — and it marks the upland ecosystem the guidebook analyses ' +
        'apart from the lowland. CBI: topography is part of the area profile (TB 2018-02, Step 5).',
    },
  ];
}

function biodiversitySections({ short, tables, trees, communityTags }) {
  const composition = tables.find((t) => t.key === 'composition');
  const species = tables.find((t) => t.key === 'species');
  const cbi = tables.find((t) => t.key === 'cbi');
  const c = composition?.counts ?? {};
  const d = composition?.diversity ?? diversityIndices(trees);
  const total = trees.length;
  if (total === 0) {
    return [{ key: 'biodiversity', heading: 'The tree inventory', text: `No tree has been tagged in ${short} yet.` }];
  }
  const top = (species?.rows ?? []).slice(0, 5);
  const over = (species?.rows ?? []).filter((r) => r.share > 0.1).map((r) => r.name);
  return [
    {
      key: 'composition',
      heading: 'Species and their origin',
      text:
        `${n(total)} trees of ${n(d.S)} species have been tagged in ${short}. The most common are ` +
        `${listOf(top.map((r) => `${r.name} (${n(r.count)})`))}. By origin, ${n(c.endemic)} are endemic, ${n(c.native)} native, ` +
        `${n(c.exotic)} exotic and ${n(c.invasive)} invasive${c.unrecorded ? `; ${n(c.unrecorded)} have no origin recorded` : ''}.`,
    },
    {
      key: 'diversity',
      heading: 'Diversity',
      text:
        d.shannon === null
          ? 'Too few species are identified to measure diversity.'
          : `Shannon’s diversity index is H′ = ${d.shannon.toFixed(2)}, with an evenness of J = ${d.evenness === null ? '—' : d.evenness.toFixed(2)} ` +
            `(1 would be every species equally common); Simpson’s dominance is c = ${d.simpson.toFixed(3)}, so two trees picked at random ` +
            `are of different species ${pct(1 - d.simpson, 1)} of the time.` +
            (over.length ? ` ${listOf(over)} ${over.length === 1 ? 'is' : 'are each'} more than 10% of the inventory, above Santamour’s guideline for one species.` : ''),
    },
    {
      key: 'cbi',
      heading: 'The City Biodiversity Index',
      text:
        `${(cbi?.rows ?? []).slice(0, 6).map((r) => `${r.name}: ${r.value}.`).join(' ')} ` +
        `${communityTags ? `The ${n(communityTags)} community tags show residents taking part, as the bulletin’s citizen-science approach intends.` : ''}`,
    },
    {
      key: 'biodiversity-relevance',
      heading: RELEVANCE_HEADING,
      text:
        'CBI: TB 2018-02 asks the urban biodiversity assessment for the vegetation structure — total trees, endemic, native and ' +
        'exotic — and for the species richness and diversity indices computed here (Annex A, Step 6; Attachment 1), with the ' +
        'results going into the CLUP and zoning ordinance and the biodiversity section of the Ecological Profile. FLUP: the ' +
        'biodiversity resources map and the inventory of flora are part of its situational analysis (Module 3). CLUP / CDP: ' +
        'where the trees are, and where there are none, is the basis for green spaces and urban greening. eLCCAP: urban greening ' +
        'and reforestation are named in the guidebook as actions that serve both adaptation and mitigation, and the trees’ ' +
        'carbon is the sink they add.',
    },
  ];
}

function sourcesSection(kind) {
  const by = {
    soil: 'Soils: DA–BSWM soil map, measured on a grid of about 60 m (2 arc-seconds).',
    hazards: 'Hazards: UP NOAH flood and rain-induced landslide susceptibility, measured on a grid of about 60 m. Population: PSA 2024 Census (PSGC 3Q 2026), or the office’s own figures. Climate: DOST-PAGASA CLIRAM.',
    terrain: 'Elevation: Copernicus DEM, on a grid of about 60 m; slope worked out from it cell by cell.',
    biodiversity: 'Trees: the Green Tag field inventory and verified community tags. Diversity indices as TB 2018-02 Attachment 1 gives them. Carbon: Chave et al. 2014 on diameter and total height, with Philippine rates.',
    ghg:
      'Method: the Climate Change Commission’s Community-level GHG Inventory Tool (31 July 2024), Forestlands sheet, with its growth rates ' +
      '(Lasco et al. 1999; Racelis 2000; Lasco and Suson 1989) and root-to-shoot ratio of 0.37. Trees: the Green Tag field inventory and ' +
      'verified community tags, by Chave et al. (2014) with the tropical Asian mean wood density (Reyes et al. 1992), carbon 45% of biomass ' +
      '(Lasco & Pulhin 2000) and 1.19 cm of diameter growth a year (Schneider et al. 2013). Land cover: as the office mapped it.',
  };
  return {
    key: 'sources',
    heading: 'Data and limitations',
    text: `${by[kind] ?? ''} Boundaries: PSA and NAMRIA. For planning purposes only — not a land title, survey plan or proof of ownership.`,
  };
}

/**
 * A thematic report: its title, the maps it opens with, its tables (in order),
 * and its narrative. `ctx` holds what the map sheet already has:
 *
 *   place, places, measured, placeLabel, tables (the attribute tables by key),
 *   trees, climate, populationOf, protectedHa, placeAreaHa, communityTags,
 *   participation (community_counts() for the place: residents taking part),
 *   areas (the saved areas in scope, for the GHG report's mapped tree cover),
 *   permits (the place's cutting permits, for the GHG report's losses),
 *   newsPosts (News & Events, for the CBI's projects, policies, partnerships and outreach)
 */
export function buildThemeReport(kind, ctx) {
  const where = officialName(ctx.place);
  const short = ctx.place ? ctx.place.label : 'Laguna';
  const common = { places: ctx.places ?? [], measured: ctx.measured ?? null, placeLabel: ctx.placeLabel ?? 'Barangay' };
  const byKey = ctx.tables ?? {};
  let tables;
  let sections;
  // Tables for the Excel file only: too long to print (the GHG report's tree list).
  let annex = [];
  if (kind === 'soil') {
    tables = [soilSeriesTable(common), soilByPlaceTable(common)];
    sections = soilSections({ where, short, tables });
  } else if (kind === 'hazards') {
    const people = peopleExposedTable({ hazards: byKey.hazards, populationOf: ctx.populationOf ?? (() => null), placeLabel: common.placeLabel });
    tables = [byKey.hazards, people, climateTable(ctx.climate), byKey.landCover, byKey.plantingSites].filter(Boolean);
    sections = hazardSections({ short, tables, climate: ctx.climate });
  } else if (kind === 'terrain') {
    tables = [elevationTable(common), slopeTable(common)];
    sections = terrainSections({ short, tables });
  } else if (kind === 'ghg') {
    const ghg = buildGhgReport({
      trees: ctx.trees ?? [],
      areas: ctx.areas ?? [],
      places: common.places,
      placeLabel: common.placeLabel,
      short,
      permits: ctx.permits ?? [],
    });
    tables = ghg.tables;
    sections = ghg.sections;
    annex = ghg.annex;
  } else if (kind === 'biodiversity') {
    const trees = ctx.trees ?? [];
    tables = [
      compositionTable(trees),
      speciesTable(trees),
      byKey.barangays,
      cbiTable({
        trees,
        landCover: byKey.landCover,
        protectedHa: ctx.protectedHa ?? 0,
        placeAreaHa: ctx.placeAreaHa ?? 0,
        carbon: byKey.carbon?.totals ?? null,
        communityTags: ctx.communityTags ?? 0,
        participation: ctx.participation ?? null,
        events: ctx.newsPosts ? cbiEventCounts(ctx.newsPosts, { lgu: ctx.place?.psgc ?? null }) : null,
        climatePlan: ctx.place && ctx.climatePlans ? planBadges(ctx.climatePlans, ctx.place.psgc) : null,
      }),
    ].filter(Boolean);
    sections = biodiversitySections({ short, tables, trees, communityTags: ctx.communityTags ?? 0 });
  } else {
    return null;
  }
  return {
    kind,
    title: reportKindById(kind).title,
    maps: REPORT_MAPS[kind],
    tables,
    annex,
    sections: [...sections, sourcesSection(kind)],
  };
}
