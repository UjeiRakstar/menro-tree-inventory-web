import { geometryAreaM2, toHectares } from './areaGeometry.js';
import { namriaClassById } from './namriaCover.js';
import { originOf } from './treeOrigin.js';
import { capturedAt } from './inventoryFreshness.js';

/**
 * The City Biodiversity Index — and, for a municipality, the Urban
 * Biodiversity Index of DENR-BMB Technical Bulletin 2018-02, the same
 * indicators on its urban barangays — as the Singapore Index on Cities'
 * Biodiversity has it (Handbook, 2021 edition: 28 indicators, 4 points each,
 * 112 in all, in three components).
 *
 * Each indicator is scored one of three ways:
 *
 *   by the system   from what Green Tag holds — land cover and its condition,
 *                   designations, tagged trees, events, residents tagging,
 *                   a verified climate plan
 *   self-assessed   by the office, under Settings, for the year: a level on
 *                   the Handbook's own scale (its policies, plans, school
 *                   curricula) or a figure the system cannot see (its budget,
 *                   its agencies, birds and insects)
 *   not yet         neither — and a gap is not a zero: the points are "of"
 *                   what was scored, never of 112 unless all 28 were
 *
 * An office's own figure, where it gives one, stands in front of the system's
 * stand-in (the partners, projects, events and residents counted from News &
 * Events, a climate plan that is implemented and not only developed).
 */

export const CBI_COMPONENTS = Object.freeze([
  { id: 'native', name: 'Native Biodiversity in the City', from: 1, to: 9 },
  { id: 'services', name: 'Ecosystem Services Provided by Biodiversity', from: 10, to: 14 },
  { id: 'governance', name: 'Governance and Management of Biodiversity', from: 15, to: 28 },
]);

export const componentOf = (no) => CBI_COMPONENTS.find((c) => no >= c.from && no <= c.to);

/**
 * `bands`: the least value for 1, 2, 3 and 4 points; `fewerIsBetter` turns
 * them round. `decimals`: the value is rounded so before it is scored, where
 * the Handbook's bands are written to one decimal with gaps between them.
 *
 * `system`: whether Green Tag can measure it. `self`: what the office gives
 * when it self-assesses — 'level' (a point on the Handbook's scale, `levels`)
 * or 'value' (a figure, `ask` and `unit`, scored on the bands); `perMillion`
 * turns a count into a rate on the population.
 */
export const CBI_INDICATORS = Object.freeze([
  { no: 1, id: 'natural', name: 'Proportion of natural areas', unit: '%', bands: [1, 7, 14, 20.01], system: true, self: null },
  { no: 2, id: 'connectivity', name: 'Connectivity measures or ecological networks to counter fragmentation', unit: '%', bands: [20, 40, 60, 79.01], system: true, self: null },
  { no: 3, id: 'birds-built', name: 'Native biodiversity in built-up areas (bird species)', unit: '%', bands: [6, 11, 16, 20.01], decimals: 1, system: false, self: 'value', ask: 'Native bird species found in built-up areas, as a share of all the native bird species in the place', inputUnit: '%' },
  { no: 4, id: 'plants', name: 'Change in number of native vascular plant species', unit: 'species', bands: [0, 6, 7, 8], system: true, self: 'value', ask: 'Net change in native vascular plant species since the baseline year (a loss is negative)', inputUnit: 'species' },
  { no: 5, id: 'birds', name: 'Change in number of native bird species', unit: 'species', bands: [0, 2, 3, 4], system: false, self: 'value', ask: 'Net change in native bird species since the baseline year (a loss is negative)', inputUnit: 'species' },
  { no: 6, id: 'arthropods', name: 'Change in number of native arthropod species', unit: 'species', bands: [0, 6, 7, 8], system: false, self: 'value', ask: 'Net change in native species of one arthropod group (butterflies, dragonflies…) since the baseline year', inputUnit: 'species' },
  { no: 7, id: 'restoration', name: 'Habitat restoration', unit: '%', bands: [20, 40, 60, 80], decimals: 1, system: true, self: 'value', ask: 'Degraded area restored to good ecological functioning (7A)', inputUnit: '%' },
  { no: 8, id: 'protected', name: 'Proportion of protected natural areas', unit: '%', bands: [1, 6.05, 11.05, 17.01], system: true, self: null },
  { no: 9, id: 'invasive', name: 'Proportion of invasive alien species', unit: '%', bands: [30.01, 20.01, 11.01, 1], fewerIsBetter: true, system: true, self: null },
  { no: 10, id: 'water', name: 'Regulation of quantity of water', unit: '%', bands: [30, 40, 50, 60], decimals: 1, system: false, self: 'value', ask: 'Permeable land — vegetation, soil, water — as a share of the land area (10A)', inputUnit: '%' },
  { no: 11, id: 'canopy', name: 'Climate regulation: benefits of trees and greenery (tree canopy cover)', unit: '%', bands: [10, 25, 40, 55], system: true, self: null },
  { no: 12, id: 'recreation', name: 'Recreational services', unit: 'ha per 1,000', bands: [0.1, 0.4, 0.7, 1.0], decimals: 1, system: true, self: null },
  { no: 13, id: 'parks', name: 'Health and wellbeing: proximity/accessibility to parks', unit: '%', bands: [30, 50, 70, 90], decimals: 1, system: false, self: 'value', ask: 'Households within 400 m of a park or green space (13A)', inputUnit: '%' },
  {
    no: 14, id: 'food', name: 'Food security: urban agriculture', unit: 'level', system: false, self: 'level',
    levels: [
      'No policy, plan or guidelines on urban agriculture.',
      'Policy, plan and guidelines on urban agriculture are being prepared, but do not include biodiversity conservation or community engagement.',
      'Policy, plan and guidelines on urban agriculture that include biodiversity conservation and community engagement are being prepared.',
      'Policy, plan and guidelines on urban agriculture that include some basic elements of biodiversity conservation and community engagement are being implemented.',
      'Policy, plan and guidelines on urban agriculture that include predominantly biodiversity conservation practices — native species, pollinator planting, organic farming — and community engagement are being implemented.',
    ],
  },
  { no: 15, id: 'functions', name: 'Institutional capacity', unit: 'functions', bands: [1, 2, 3, 4], system: false, self: 'value', ask: 'Essential biodiversity-related functions the place uses, provides or supports — a biodiversity centre, botanical garden, herbarium, zoo, museum, arboretum… (list them in the note)', inputUnit: 'functions' },
  { no: 16, id: 'budget', name: 'Budget allocated to biodiversity', unit: '%', bands: [0.4, 2.3, 2.8, 3.8], decimals: 1, system: false, self: 'value', ask: 'Biodiversity-related spending as a share of the total budget', inputUnit: '%' },
  {
    no: 17, id: 'lbsap', name: 'Policies, rules and regulations: existence of a Local Biodiversity Strategy and Action Plan', unit: 'level', system: false, self: 'level',
    levels: [
      'No LBSAP (or equivalent).',
      'An LBSAP not aligned with the NBSAP.',
      'An LBSAP that incorporates elements of the NBSAP and includes at least one CBD initiative.',
      'An LBSAP that incorporates elements of the NBSAP and includes two CBD initiatives.',
      'An LBSAP that incorporates elements of the NBSAP and includes three or more CBD initiatives.',
    ],
  },
  {
    no: 18, id: 'natural-capital', name: 'Status of natural capital assessment', unit: 'level', system: false, self: 'level',
    levels: [
      'No plans for a natural capital assessment.',
      'A natural capital assessment is being considered or planned for.',
      'A natural capital assessment is being prepared.',
      'A natural capital assessment has been completed at least once.',
      'A natural capital assessment is carried out regularly, every three to five years.',
    ],
  },
  {
    no: 19, id: 'green-blue', name: 'State of green and blue space management plans', unit: 'level', system: false, self: 'level',
    levels: [
      'No green and blue space management plans.',
      'Green and blue space management plans exist, but lack aims for improving the quality of green and blue spaces.',
      'Green and blue space management plans exist and express aims for improving the quality of green and blue spaces.',
      'Green and blue space management plans exist and express aims for improving the quality of green and blue spaces through an ecosystem-based management approach.',
      'Green and blue space management plans exist and include aims and benchmarks for improving the quality of green and blue spaces through an ecosystem-based management approach.',
    ],
  },
  {
    no: 20, id: 'climate', name: 'Biodiversity-related responses to climate change', unit: 'level', bands: [1, 2, 3, 4], system: true, self: 'level',
    levels: [
      'No plan for biodiversity-related responses to climate change (adaptation, mitigation, ecological resilience) has been developed.',
      'At least one plan for biodiversity-related responses to climate change has been developed.',
      'One plan for biodiversity-related responses to climate change has been implemented.',
      'Two plans for biodiversity-related responses to climate change have been implemented.',
      'Three plans for biodiversity-related responses to climate change have been implemented.',
    ],
  },
  {
    no: 21, id: 'green-infra', name: 'Policy and/or incentives for green infrastructure as nature-based solutions', unit: 'level', system: false, self: 'level',
    levels: [
      'No policies, regulations or incentives for green infrastructure as nature-based solutions, and none are planned.',
      'Policies and regulations on green infrastructure as nature-based solutions are planned within the next few years.',
      'Policies and regulations on green infrastructure as nature-based solutions have been finalised.',
      'Policies, regulations and incentives on green infrastructure as nature-based solutions have been finalised.',
      'Green infrastructure as nature-based solutions has been implemented, in compliance with the policies, regulations and incentives.',
    ],
  },
  { no: 22, id: 'agencies', name: 'Cross-sectoral and inter-agency collaborations', unit: 'agencies', bands: [3, 4, 5, 6], system: false, self: 'value', ask: 'Government agencies or offices that cooperate on biodiversity matters (planning, water, finance, tourism, health…)', inputUnit: 'agencies' },
  {
    no: 23, id: 'consultation', name: 'Participation and partnership: public consultation process', unit: 'level', system: false, self: 'level',
    levels: [
      'No routine formal or informal public consultation process.',
      'A formal or informal process is being considered as part of the routine process.',
      'A formal or informal process is being planned as part of the routine process.',
      'A formal or informal process is ready for implementation as part of the routine process.',
      'A formal or informal process has been implemented as part of the routine process.',
    ],
  },
  { no: 24, id: 'partnership', name: 'Participation and partnership: agencies, companies, NGOs, academic and international organisations partnered with', unit: 'count', bands: [1, 7, 13, 20], system: true, self: 'value', ask: 'Private companies, NGOs, academic institutions and international organisations partnered with in biodiversity work', inputUnit: 'partners' },
  { no: 25, id: 'project', name: 'Biodiversity projects and programmes implemented a year', unit: 'per million', bands: [8, 24, 57, 102], perMillion: true, system: true, self: 'value', ask: 'Biodiversity projects and programmes carried out this year', inputUnit: 'projects' },
  {
    no: 26, id: 'education', name: 'Education: biodiversity in the school curricula', unit: 'level', system: false, self: 'level',
    levels: [
      'Biodiversity, or elements of it, are not covered in the school curricula.',
      'Biodiversity is being considered for the school curricula, or is taught ad hoc without local government support.',
      'Biodiversity has been planned for inclusion in the school curricula.',
      'Biodiversity is being implemented in the school curricula.',
      'Biodiversity has been fully implemented in the school curricula at all levels.',
    ],
  },
  { no: 27, id: 'outreach', name: 'Awareness: outreach and public awareness events a year', unit: 'per million', bands: [7, 82, 221, 394], perMillion: true, system: true, self: 'value', ask: 'Outreach and public awareness events held this year', inputUnit: 'events' },
  { no: 28, id: 'community', name: 'Community science', unit: 'per million', bands: [2, 10, 49, 118], perMillion: true, round: true, system: true, self: 'value', ask: 'Residents taking part in community science this year (all programmes, not only tree tagging)', inputUnit: 'residents' },
]);

export const indicatorByNo = (no) => CBI_INDICATORS.find((i) => i.no === Number(no)) ?? null;

/** The indicators an office can self-assess, in order. */
export const SELF_ASSESSED = CBI_INDICATORS.filter((i) => i.self);

/** 0–4 points for a value on an indicator's bands. */
export function pointsOn(indicator, value) {
  if (!Number.isFinite(value)) return null;
  const v = indicator.decimals !== undefined ? Number(value.toFixed(indicator.decimals)) : value;
  if (indicator.fewerIsBetter) return 4 - indicator.bands.filter((least) => v >= least).length;
  return indicator.bands.filter((least) => v >= least).length;
}

/**
 * Natural areas as Indicator 1 has them: natural ecosystems — forest,
 * mangrove, brush, natural grassland, marsh, inland water. Plantations and
 * crops are not, though perennial crops still count as tree canopy.
 */
const NATURAL_CLASSES = new Set(['closed-forest', 'open-forest', 'brush-shrubs', 'mangrove-forest', 'grassland', 'marshland-swamp', 'inland-water']);
export const isNaturalClass = (classId) => NATURAL_CLASSES.has(classId);

/**
 * What the office says of an area's state (cbi_ubi.sql, 27 October). The
 * Handbook counts only what is "not highly disturbed" as natural, and counts
 * restored and naturalised areas too: so a natural class marked degraded is
 * left out, and any area marked restored is counted.
 */
export const AREA_CONDITIONS = Object.freeze([
  { id: 'natural', label: 'Natural — not highly disturbed' },
  { id: 'degraded', label: 'Degraded — disturbed or being restored' },
  { id: 'restored', label: 'Restored or naturalised — native species dominant again' },
]);

export const isNaturalArea = (props) =>
  props?.kind === 'land-cover' && props.condition !== 'degraded' && (isNaturalClass(props.namriaClass) || props.condition === 'restored');

/**
 * How much of a cover class's ground the tree crowns cover, for Indicator 11:
 * the canopy, not the whole area of the class. NAMRIA defines closed forest
 * as over 40% crown cover and open forest as 10–40%, so each takes the
 * midpoint of its range; the rest are assumed, and the report says so.
 */
export const CROWN_SHARE = Object.freeze({
  'closed-forest': 0.7,
  'open-forest': 0.25,
  'mangrove-forest': 0.7,
  'perennial-crop': 0.5,
  'brush-shrubs': 0.05,
});

/** The designations that protect or secure an area (Indicator 8); a zoning or FLUP zone alone does not. */
const PROTECTING = new Set(['protected-area', 'forest-land']);

/**
 * A place's saved areas, in hectares, for the area-based indicators:
 *   naturalHa      Indicator 1: natural, restored and naturalised areas
 *   canopyHa       Indicator 11: tree crown cover (CROWN_SHARE)
 *   protectedHa    Indicator 8: protected or secured natural areas
 *   greenSpaceHa   Indicator 12: natural and protected areas, each once
 *   restoredHa, degradedHa   Indicator 7A
 *   natural        the natural areas' geometries, for Indicator 2
 *
 *   municipality   only that LGU's areas
 *   barangays      only the areas in these barangays (the urban ones, for a UBI)
 */
export function areaFigures(features, municipality = '', { barangays = null } = {}) {
  const figures = { mapped: false, naturalHa: 0, canopyHa: 0, protectedHa: 0, greenSpaceHa: 0, restoredHa: 0, degradedHa: 0, natural: [] };
  for (const feature of Array.isArray(features) ? features : []) {
    const props = feature?.properties;
    if (!props?.saved || (municipality && props.municipality !== municipality)) continue;
    if (barangays && !barangays.has(props.barangay)) continue;
    const ha = toHectares(geometryAreaM2(feature.geometry));
    const landCover = props.kind === 'land-cover';
    const natural = isNaturalArea(props);
    const protecting = PROTECTING.has(props.designation) && (!landCover || natural);
    if (protecting) figures.protectedHa += ha;
    if (natural || protecting) figures.greenSpaceHa += ha;
    if (!landCover) continue;
    figures.mapped = true;
    if (natural) {
      figures.naturalHa += ha;
      figures.natural.push(feature.geometry);
    }
    if (props.condition === 'restored') figures.restoredHa += ha;
    if (props.condition === 'degraded') figures.degradedHa += ha;
    if (namriaClassById(props.namriaClass)?.treeCover) figures.canopyHa += ha * (CROWN_SHARE[props.namriaClass] ?? 0);
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
    const name = speciesKey(tree);
    if (!name) continue;
    const origin = originOf(tree);
    if (origin === 'invasive') invasive.add(name);
    else if (origin === 'endemic' || origin === 'native') native.add(name);
  }
  const known = invasive.size + native.size;
  return known ? { invasive: invasive.size, native: native.size, share: (invasive.size / known) * 100 } : null;
}

const speciesKey = (tree) => String(tree?.scientific_name || tree?.species || '').trim().toLowerCase();

/**
 * Indicator 4 from the tagged trees: native and endemic tree species tagged
 * by the end of the first year of tagging — the baseline — against those
 * tagged by now. Trees are vascular plants, so a tree species newly found is
 * a vascular plant species newly found; the office's own full count, if it
 * keeps one, stands in front of this. In the baseline year itself there is
 * nothing to compare: { baselineYear, baseline, now, change: null }.
 */
export function nativeSpeciesChange(trees = [], { year = new Date().getFullYear() } = {}) {
  const dated = trees
    .map((tree) => ({ tree, at: capturedAt(tree) }))
    .filter(({ tree, at }) => at && speciesKey(tree) && ['endemic', 'native'].includes(originOf(tree)));
  if (dated.length === 0) return null;
  const baselineYear = Math.min(...dated.map(({ at }) => at.getFullYear()));
  const by = (last) => new Set(dated.filter(({ at }) => at.getFullYear() <= last).map(({ tree }) => speciesKey(tree))).size;
  const baseline = by(baselineYear);
  const now = by(year);
  return { baselineYear, baseline, now, change: year > baselineYear ? now - baseline : null };
}

const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : null);
const perMillion = (count, population) => (population > 0 ? (count / population) * 1e6 : null);

/**
 *   trees               the place's tagged trees
 *   areas               areaFigures() of its saved areas
 *   placeAreaHa         its land area
 *   population          its residents (PSA 2024), for the per-resident indicators
 *   events              cbiEventCounts() for the place and year, or null when unread
 *   communityScientists residents who tagged trees there (community_counts), or null
 *   climatePlan         planBadges() for the place: a verified LCCAP in force, or null
 *   connectivity        connectivityOf() its natural areas, or null
 *   nativeChange        nativeSpeciesChange() its trees, or null
 *   self                the office's self-assessment for the year:
 *                       { [no]: { points, value, note } }
 *
 * Returns { indicators: [{ ...indicator, value, count, points, source }],
 * points, of, scored, components: [{ ...component, points, of, scored }] }.
 */
export function cbiPoints({
  trees = [],
  areas = { mapped: false, naturalHa: 0, canopyHa: 0, protectedHa: 0, greenSpaceHa: 0, restoredHa: 0, degradedHa: 0 },
  placeAreaHa = 0,
  population = 0,
  events = null,
  communityScientists = null,
  climatePlan = null,
  connectivity = null,
  nativeChange = null,
  self = {},
}) {
  const invasive = invasiveShare(trees);
  const held = (id) => (events ? (events[id] ?? []).length : null);
  // Partners named on the events, each once; until any are named, the
  // partnership events stand in for them, and say so.
  const partnersNamed = events?.partners?.length ?? 0;
  const counts = {
    partnership: events ? (partnersNamed || held('partnership')) : null,
    project: held('project'),
    outreach: held('outreach'),
    community: Number.isFinite(communityScientists) ? communityScientists : null,
  };
  const conditioned = (areas.restoredHa ?? 0) + (areas.degradedHa ?? 0);
  const system = {
    natural: areas.mapped ? share(areas.naturalHa, placeAreaHa) : null,
    connectivity: connectivity ? connectivity.coherence : null,
    plants: nativeChange?.change ?? null,
    restoration: conditioned > 0 ? share(areas.restoredHa, conditioned) : null,
    protected: areas.mapped || areas.protectedHa > 0 ? share(areas.protectedHa, placeAreaHa) : null,
    invasive: invasive ? invasive.share : null,
    canopy: areas.mapped ? share(areas.canopyHa, placeAreaHa) : null,
    recreation: (areas.mapped || (areas.greenSpaceHa ?? 0) > 0) && population > 0 ? ((areas.greenSpaceHa ?? 0) / population) * 1000 : null,
    // A verified LCCAP is a plan developed (1 point); implemented plans are
    // the office's to show, in its self-assessment.
    climate: climatePlan ? 1 : null,
    partnership: counts.partnership,
    project: counts.project === null ? null : perMillion(counts.project, population),
    outreach: counts.outreach === null ? null : perMillion(counts.outreach, population),
    // The Handbook rounds this one to the nearest whole number.
    community: counts.community === null || !(population > 0) ? null : Math.round(perMillion(counts.community, population)),
  };

  const indicators = CBI_INDICATORS.map((indicator) => {
    const own = self?.[indicator.no];
    if (own && indicator.self === 'level' && Number.isInteger(own.points)) {
      return { ...indicator, value: own.points, count: null, points: Math.max(0, Math.min(4, own.points)), source: 'self', note: own.note ?? '' };
    }
    if (own && indicator.self === 'value' && Number.isFinite(Number(own.value)) && own.value !== null && own.value !== '') {
      const entered = Number(own.value);
      let value = indicator.perMillion ? perMillion(entered, population) : entered;
      if (value !== null && indicator.round) value = Math.round(value);
      return { ...indicator, value, count: indicator.perMillion ? entered : null, points: value === null ? null : pointsOn(indicator, value), source: 'self', note: own.note ?? '' };
    }
    const value = system[indicator.id] ?? null;
    return {
      ...indicator,
      value,
      count: counts[indicator.id] ?? null,
      points: value === null ? null : indicator.id === 'climate' ? value : pointsOn(indicator, value),
      source: value === null ? null : 'system',
      // Indicator 24 counted from partnership events, no partner named yet.
      proxy: indicator.id === 'partnership' && value !== null && partnersNamed === 0 ? 'events' : undefined,
    };
  });
  const total = (list) => {
    const scored = list.filter((i) => i.points !== null);
    return { points: scored.reduce((sum, i) => sum + i.points, 0), of: scored.length * 4, scored: scored.length };
  };
  return {
    indicators,
    ...total(indicators),
    components: CBI_COMPONENTS.map((component) => ({
      ...component,
      max: (component.to - component.from + 1) * 4,
      ...total(indicators.filter((i) => i.no >= component.from && i.no <= component.to)),
    })),
  };
}

const oneDecimal = (value) => (Math.round(value * 10) / 10).toLocaleString('en-US');
const twoDecimals = (value) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (value) => Math.round(value).toLocaleString('en-US');
const MISSING = {
  natural: 'No land cover mapped yet',
  connectivity: 'No natural areas mapped yet',
  plants: 'No native species tagged with a date yet',
  restoration: 'No area marked degraded or restored yet',
  protected: 'No land cover mapped yet',
  invasive: 'No species of known origin yet',
  canopy: 'No land cover mapped yet',
  recreation: 'No natural or protected areas mapped yet',
  climate: 'No climate plan verified by PGENRO',
  partnership: 'Events not readable yet',
  project: 'Events not readable yet',
  outreach: 'Events not readable yet',
  community: 'Residents taking part not counted yet',
};

/** What an indicator's figure is, in a line under its name. */
export function describeIndicator(indicator) {
  if (indicator.value === null || indicator.value === undefined) {
    return MISSING[indicator.id] ?? (indicator.self ? 'Not self-assessed yet' : 'Not measured yet');
  }
  if (indicator.source === 'self') {
    if (indicator.self === 'level') return `Self-assessed: ${indicator.levels[indicator.points]}`;
    if (indicator.perMillion) return `Self-assessed: ${whole(indicator.count)} ${indicator.inputUnit} · ${whole(indicator.value)} per million residents`;
    return `Self-assessed: ${indicator.unit === '%' ? `${oneDecimal(indicator.value)}%` : `${whole(indicator.value)} ${indicator.inputUnit}`}`;
  }
  if (indicator.id === 'plants') return `${indicator.value >= 0 ? '+' : ''}${whole(indicator.value)} native species since the baseline year`;
  if (indicator.id === 'recreation') return `${twoDecimals(indicator.value)} ha per 1,000 residents`;
  if (indicator.id === 'connectivity') return `Coherence ${oneDecimal(indicator.value)}% (patches under 100 m apart joined)`;
  if (indicator.id === 'restoration') return `${oneDecimal(indicator.value)}% of the degraded and restored area restored`;
  if (indicator.unit === '%') return `${oneDecimal(indicator.value)}%`;
  if (indicator.id === 'climate') return 'A climate change action plan, verified by PGENRO';
  if (indicator.id === 'partnership') {
    return indicator.proxy === 'events'
      ? `${whole(indicator.value)} partnership events this year — no partner named on them yet`
      : `${whole(indicator.value)} partner organisations named on this year's events`;
  }
  if (indicator.unit === 'count') return `${whole(indicator.value)} this year`;
  const what = indicator.id === 'community' ? `${whole(indicator.count)} residents tagging trees` : `${whole(indicator.count)} this year`;
  return `${what} · ${whole(indicator.value)} per million residents`;
}
