import { geometryAreaM2, toHectares } from './areaGeometry.js';
import { namriaClassById } from './namriaCover.js';
import { originOf } from './treeOrigin.js';

/**
 * The City Biodiversity Index points Green Tag can work out for a city: the
 * indicators of the Singapore Index on Cities' Biodiversity (Handbook, 2021
 * edition: 28 indicators, 112 points) that rest on what the system holds,
 * each scored 0–4 on the Handbook's bands. The others — connectivity, birds
 * and arthropods, restoration, water, parks, budget, the LBSAP and the rest —
 * are outside it, so the points are "of" what was scored, never of 112.
 *
 * An indicator is scored only when the system has its measure: land cover
 * once the city has mapped some, invasive species once species of known
 * origin are tagged, the per-resident counts once the population is known, a
 * climate plan once PGENRO verified one. A gap is not a zero.
 *
 * The events are counted from News & Events, where each post's purpose
 * (outreach, partnership, project) says which indicator it is for.
 */

/**
 * `bands`: the least value for 1, 2, 3 and 4 points; `fewerIsBetter` turns
 * them round. Per-resident indicators are per 1,000,000 residents.
 */
export const CBI_INDICATORS = Object.freeze([
  { no: 1, id: 'natural', name: 'Proportion of natural areas', unit: '%', bands: [1, 7, 14, 20.01] },
  { no: 8, id: 'protected', name: 'Proportion of protected natural areas', unit: '%', bands: [1, 6.05, 11.05, 17.01] },
  { no: 9, id: 'invasive', name: 'Proportion of invasive alien species', unit: '%', bands: [30.01, 20.01, 11.01, 1], fewerIsBetter: true },
  { no: 11, id: 'canopy', name: 'Climate regulation: tree canopy cover', unit: '%', bands: [10, 25, 40, 55] },
  { no: 20, id: 'climate', name: 'Biodiversity-related responses to climate change', unit: 'plan', bands: [1, 2, 3, 4] },
  { no: 24, id: 'partnership', name: 'Partnerships in biodiversity work', unit: 'count', bands: [1, 7, 13, 20] },
  { no: 25, id: 'project', name: 'Biodiversity projects a year', unit: 'per million', bands: [8, 24, 57, 102] },
  { no: 27, id: 'outreach', name: 'Outreach and public awareness events a year', unit: 'per million', bands: [7, 82, 221, 394] },
  { no: 28, id: 'community', name: 'Community science', unit: 'per million', bands: [2, 10, 49, 118] },
]);

/** 0–4 points for a value on an indicator's bands. */
export function pointsOn(indicator, value) {
  if (!Number.isFinite(value)) return null;
  if (indicator.fewerIsBetter) return 4 - indicator.bands.filter((least) => value >= least).length;
  return indicator.bands.filter((least) => value >= least).length;
}

/**
 * Natural areas as Indicator 1 has them: natural ecosystems — forest,
 * mangrove, brush, natural grassland, marsh, inland water. Plantations and
 * crops are not, though perennial crops still count as tree canopy.
 */
const NATURAL_CLASSES = new Set(['closed-forest', 'open-forest', 'brush-shrubs', 'mangrove-forest', 'grassland', 'marshland-swamp', 'inland-water']);
export const isNaturalClass = (classId) => NATURAL_CLASSES.has(classId);

/** A city's saved areas, in hectares: { mapped, naturalHa, canopyHa, protectedHa }. */
export function areaFigures(features, municipality = '') {
  const figures = { mapped: false, naturalHa: 0, canopyHa: 0, protectedHa: 0 };
  for (const feature of Array.isArray(features) ? features : []) {
    const props = feature?.properties;
    if (!props?.saved || (municipality && props.municipality !== municipality)) continue;
    const ha = toHectares(geometryAreaM2(feature.geometry));
    if (props.designation) figures.protectedHa += ha;
    if (props.kind !== 'land-cover') continue;
    figures.mapped = true;
    if (isNaturalClass(props.namriaClass)) figures.naturalHa += ha;
    if (namriaClassById(props.namriaClass)?.treeCover) figures.canopyHa += ha;
  }
  return figures;
}

/**
 * Indicator 9 counts species, not trees: invasive alien species ÷ (native
 * species + invasive alien species). Introduced species that are not
 * invasive are left out, as the Handbook says.
 */
export function invasiveShare(trees = []) {
  const invasive = new Set();
  const native = new Set();
  for (const tree of trees) {
    const name = String(tree?.scientific_name || tree?.species || '').trim().toLowerCase();
    if (!name) continue;
    const origin = originOf(tree);
    if (origin === 'invasive') invasive.add(name);
    else if (origin === 'endemic' || origin === 'native') native.add(name);
  }
  const known = invasive.size + native.size;
  return known ? { invasive: invasive.size, native: native.size, share: (invasive.size / known) * 100 } : null;
}

const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : null);
const perMillion = (count, population) => (population > 0 ? (count / population) * 1e6 : null);

/**
 *   trees               the city's tagged trees
 *   areas               areaFigures() of its saved areas
 *   placeAreaHa         the city's land area
 *   population          its residents (PSA 2024), for the per-resident indicators
 *   events              cbiEventCounts() for the city and year, or null when unread
 *   communityScientists residents who tagged trees there (community_counts), or null
 *   climatePlan         planBadges() for the city: a verified LCCAP in force, or null
 *
 * Returns { indicators: [{ ...indicator, value, count, points }], points, of, scored }.
 */
export function cbiPoints({
  trees = [],
  areas = { mapped: false, naturalHa: 0, canopyHa: 0, protectedHa: 0 },
  placeAreaHa = 0,
  population = 0,
  events = null,
  communityScientists = null,
  climatePlan = null,
}) {
  const invasive = invasiveShare(trees);
  const held = (id) => (events ? (events[id] ?? []).length : null);
  const counts = {
    partnership: held('partnership'),
    project: held('project'),
    outreach: held('outreach'),
    community: Number.isFinite(communityScientists) ? communityScientists : null,
  };
  const values = {
    natural: areas.mapped ? share(areas.naturalHa, placeAreaHa) : null,
    protected: areas.mapped || areas.protectedHa > 0 ? share(areas.protectedHa, placeAreaHa) : null,
    invasive: invasive ? invasive.share : null,
    canopy: areas.mapped ? share(areas.canopyHa, placeAreaHa) : null,
    // A verified LCCAP is a plan developed (1 point); whether it is being
    // carried out is the city's to show, not the system's.
    climate: climatePlan ? 1 : null,
    partnership: counts.partnership,
    project: counts.project === null ? null : perMillion(counts.project, population),
    outreach: counts.outreach === null ? null : perMillion(counts.outreach, population),
    // The Handbook rounds this one to the nearest whole number.
    community: counts.community === null || !(population > 0) ? null : Math.round(perMillion(counts.community, population)),
  };

  const indicators = CBI_INDICATORS.map((indicator) => {
    const value = values[indicator.id];
    return {
      ...indicator,
      value: value ?? null,
      count: counts[indicator.id] ?? null,
      points: value === null || value === undefined ? null : pointsOn(indicator, value),
    };
  });
  const scored = indicators.filter((i) => i.points !== null);
  return {
    indicators,
    points: scored.reduce((total, i) => total + i.points, 0),
    of: scored.length * 4,
    scored: scored.length,
  };
}

const oneDecimal = (value) => (Math.round(value * 10) / 10).toLocaleString('en-US');
const whole = (value) => Math.round(value).toLocaleString('en-US');
const MISSING = {
  natural: 'No land cover mapped yet',
  protected: 'No land cover mapped yet',
  invasive: 'No species of known origin yet',
  canopy: 'No land cover mapped yet',
  climate: 'No climate plan verified by PGENRO',
  partnership: 'Events not readable yet',
  project: 'Events not readable yet',
  outreach: 'Events not readable yet',
  community: 'Residents taking part not counted yet',
};

/** What an indicator's figure is, in a line under its name. */
export function describeIndicator(indicator) {
  if (indicator.value === null) return MISSING[indicator.id] ?? 'Not measured yet';
  if (indicator.unit === '%') return `${oneDecimal(indicator.value)}%`;
  if (indicator.unit === 'plan') return 'A climate change action plan, verified by PGENRO';
  if (indicator.unit === 'count') return `${whole(indicator.value)} this year`;
  const what = indicator.id === 'community' ? `${whole(indicator.count)} residents tagging trees` : `${whole(indicator.count)} this year`;
  return `${what} · ${whole(indicator.value)} per million residents`;
}
