import { CBI_COMPONENTS, CROWN_SHARE, areaFigures, cbiPoints, describeIndicator, nativeSpeciesChange } from '../cbiPoints.js';
import { connectivityOf } from '../connectivity.js';
import { cbiEventCounts } from '../news.js';
import { planBadges } from '../lccap.js';
import { namriaClassById } from '../namriaCover.js';
import { geometryAreaM2, toHectares } from '../areaGeometry.js';
import { lguFacts, officialName } from '../psgc.js';
import { listOf } from '../reportWriter.js';
import { DISCLAIMER, PREPARED_WITH, buildEcologicalReport, ecologicalMaps } from './ecological.js';

/**
 * The biodiversity index report (27 October): for a city, the City
 * Biodiversity Index — the Singapore Index on Cities' Biodiversity (Handbook,
 * 2021) — and for a municipality the Urban Biodiversity Index of DENR-BMB
 * Technical Bulletin 2018-02, the same three components and indicators,
 * measured on its urban barangays (NSCB Resolution No. 9, s. 2003, as the
 * PSA classes them).
 *
 * Laid out as the Handbook lays an application out: the profile of the place
 * first — the Ecological Profile of the other report, as its introduction —
 * then the indicators, component by component, each with its figure, its
 * points and where they come from: measured by the system, self-assessed by
 * the office (Settings), or not yet scored. The total is "of" what was
 * scored; a gap is not a zero.
 */

export const CBI_REPORT = Object.freeze({ id: 'cbi', label: 'City Biodiversity Index', title: 'CITY BIODIVERSITY INDEX REPORT' });
export const UBI_REPORT = Object.freeze({ id: 'ubi', label: 'Urban Biodiversity Index', title: 'URBAN BIODIVERSITY INDEX REPORT' });
export const indexReportFor = (place) => (place?.isCity ? CBI_REPORT : UBI_REPORT);

const n = (value) => Number(value || 0).toLocaleString('en-US');
const hectares = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
const SOURCE_LABEL = { system: 'Measured by the system', self: 'Self-assessed by the office' };

/**
 * Where the index is measured: the whole city, or a municipality's urban
 * barangays — the whole municipality when none is urban, and said so.
 */
export function indexScope({ place, places = [], urbanOf = () => null, populationOf = () => null }) {
  const urban = place?.isCity ? null : places.filter((p) => urbanOf(p.name) === 'Urban');
  const inScope = urban && urban.length ? urban : places;
  const populationSum = inScope.reduce((total, p) => total + (Number(populationOf(p.name)) || 0), 0);
  return {
    whole: !urban || urban.length === 0,
    noUrban: Boolean(urban) && urban.length === 0,
    names: urban && urban.length ? new Set(urban.map((p) => p.name)) : null,
    places: inScope,
    areaHa: inScope.reduce((total, p) => total + (p.areaHa || 0), 0),
    population: populationSum || (place ? lguFacts(place.psgc)?.population2024 ?? 0 : 0),
  };
}

/** The land cover in scope, by class: area, natural, canopy and protected (the Part I profile's biodiversity features). */
export function indexAreasTable(features = [], { municipality = '', barangays = null } = {}) {
  const byClass = new Map();
  for (const feature of features) {
    const props = feature?.properties;
    if (!props?.saved || props.kind !== 'land-cover' || (municipality && props.municipality !== municipality)) continue;
    if (barangays && !barangays.has(props.barangay)) continue;
    const one = areaFigures([feature]);
    const row = byClass.get(props.namriaClass) ?? {
      name: namriaClassById(props.namriaClass)?.label ?? props.namriaClass ?? 'Not classified',
      areas: 0, areaHa: 0, naturalHa: 0, canopyHa: 0, protectedHa: 0, degradedHa: 0, restoredHa: 0,
    };
    row.areas += 1;
    row.areaHa += toHectares(geometryAreaM2(feature.geometry));
    for (const key of ['naturalHa', 'canopyHa', 'protectedHa', 'degradedHa', 'restoredHa']) row[key] += one[key];
    byClass.set(props.namriaClass, row);
  }
  const rows = [...byClass.values()].sort((a, b) => b.areaHa - a.areaHa);
  const total = (key) => rows.reduce((sum, row) => sum + row[key], 0);
  return {
    key: 'index-areas',
    title: 'Land cover mapped, and what the index counts of it',
    note: 'Natural: Indicator 1 (natural classes not marked degraded, and any area marked restored). Canopy: Indicator 11, the crowns only. Protected: Indicator 8 (protected areas and forest land that are natural).',
    columns: [
      { key: 'name', label: 'Land cover (NAMRIA)', kind: 'text' },
      { key: 'areas', label: 'Areas', kind: 'number' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      { key: 'naturalHa', label: 'Natural (ha)', kind: 'ha' },
      { key: 'canopyHa', label: 'Tree canopy (ha)', kind: 'ha' },
      { key: 'protectedHa', label: 'Protected (ha)', kind: 'ha' },
      { key: 'degradedHa', label: 'Degraded (ha)', kind: 'ha' },
      { key: 'restoredHa', label: 'Restored (ha)', kind: 'ha' },
    ],
    rows,
    totals: rows.length
      ? { name: `${rows.length} ${rows.length === 1 ? 'class' : 'classes'}`, ...Object.fromEntries(['areas', 'areaHa', 'naturalHa', 'canopyHa', 'protectedHa', 'degradedHa', 'restoredHa'].map((k) => [k, total(k)])) }
      : null,
  };
}

/** One component's indicators: figure, points and where they come from. */
export function componentTable(cbi, component) {
  const indicators = cbi.indicators.filter((i) => i.no >= component.from && i.no <= component.to);
  const scored = cbi.components.find((c) => c.id === component.id);
  return {
    key: `index-${component.id}`,
    title: `${component.name} (indicators ${component.from}–${component.to})`,
    columns: [
      { key: 'name', label: 'Indicator', kind: 'text' },
      { key: 'shows', label: 'What it shows', kind: 'text' },
      { key: 'points', label: 'Points (0–4)', kind: 'text' },
      { key: 'source', label: 'Source', kind: 'text' },
    ],
    rows: indicators.map((i) => ({
      name: `${i.no}. ${i.name}`,
      shows: describeIndicator(i) + (i.note ? ` (${i.note})` : ''),
      points: i.points === null ? '' : String(i.points),
      source: SOURCE_LABEL[i.source] ?? 'Not yet scored',
    })),
    totals: {
      name: `${scored.scored} of ${indicators.length} scored`,
      points: `${scored.points} of ${scored.of}`,
      source: `${component.to - component.from + 1} × 4 = ${scored.max} in all`,
    },
  };
}

/** The scorecard: each component's points, of what was scored and of its maximum. */
export function scorecardTable(cbi) {
  return {
    key: 'index-scorecard',
    title: 'Scorecard',
    columns: [
      { key: 'name', label: 'Component', kind: 'text' },
      { key: 'scored', label: 'Indicators scored', kind: 'text' },
      { key: 'points', label: 'Points', kind: 'number' },
      { key: 'of', label: 'Of the indicators scored', kind: 'number' },
      { key: 'max', label: 'Of all its indicators', kind: 'number' },
    ],
    rows: cbi.components.map((c) => ({ name: c.name, scored: `${c.scored} of ${c.to - c.from + 1}`, points: c.points, of: c.of, max: c.max })),
    totals: { name: 'The index', scored: `${cbi.scored} of 28`, points: cbi.points, of: cbi.of, max: 112 },
  };
}

// ---- The narrative ----------------------------------------------------------------------

function scopeText({ where, report, scope, place }) {
  if (report === CBI_REPORT) {
    return `The ${CBI_REPORT.label} is measured on the whole of ${where}: about ${hectares(scope.areaHa)} ha and ${n(scope.population)} residents.`;
  }
  if (scope.noUrban) {
    return (
      `DENR-BMB Technical Bulletin 2018-02 applies the ${UBI_REPORT.label} to urban areas, as the NSCB defines them. None of the barangays of ` +
      `${where} is classed urban, so the index is measured here on the whole municipality — about ${hectares(scope.areaHa)} ha and ` +
      `${n(scope.population)} residents — and should be read as such.`
    );
  }
  return (
    `DENR-BMB Technical Bulletin 2018-02 applies the ${UBI_REPORT.label} to urban areas, as the NSCB defines them (Resolution No. 9, s. 2003). ` +
    `In ${place.label} that is ${n(scope.places.length)} urban ${scope.places.length === 1 ? 'barangay' : 'barangays'} — ` +
    `${listOf(scope.places.map((p) => p.name))} — about ${hectares(scope.areaHa)} ha and ${n(scope.population)} residents. The land, trees and ` +
    'residents counted are theirs; the governance indicators — plans, budget, partners, events — are the municipality’s.'
  );
}

function summaryText({ where, report, scope, place, cbi }) {
  const self = cbi.indicators.filter((i) => i.source === 'self').length;
  const system = cbi.indicators.filter((i) => i.source === 'system').length;
  const missing = 28 - cbi.scored;
  return (
    `This report applies the ${report.label} to ${where}. ${scopeText({ where, report, scope, place })}\n\n` +
    (cbi.scored
      ? `${n(cbi.scored)} of the index’s 28 indicators could be scored: ${n(cbi.points)} points of the ${n(cbi.of)} they carry ` +
        `(the full index is 112). ${n(system)} ${system === 1 ? 'was' : 'were'} measured by the system from the land cover, trees, events and ` +
        `residents it holds, and ${n(self)} self-assessed by the office. By component: ` +
        `${listOf(cbi.components.map((c) => `${c.name.toLowerCase()}, ${n(c.points)} of ${n(c.of)}`))}.`
      : 'None of the index’s 28 indicators could be scored yet: no land cover is mapped, no species of known origin is tagged, and the office has not self-assessed.') +
    (missing ? ` ${n(missing)} ${missing === 1 ? 'indicator is' : 'indicators are'} not yet scored, and are left out rather than counted as zero; they are listed in each chapter.` : '') +
    '\n\nThe index is a self-assessment tool, for the city or municipality to measure itself against its own baseline over time, not to rank it against others. ' +
    'Its results go into the biodiversity section of the Ecological Profile, the CLUP and zoning ordinance, and the LGU’s conservation plan (TB 2018-02, Steps 9–11).'
  );
}

function componentText({ cbi, component }) {
  const indicators = cbi.indicators.filter((i) => i.no >= component.from && i.no <= component.to);
  const scored = indicators.filter((i) => i.points !== null);
  const notYet = indicators.filter((i) => i.points === null);
  const c = cbi.components.find((x) => x.id === component.id);
  return (
    (scored.length
      ? `Of the ${indicators.length} indicators of ${component.name.toLowerCase()}, ${scored.length} ${scored.length === 1 ? 'is' : 'are'} scored, ` +
        `for ${n(c.points)} of the ${n(c.of)} points they carry. ` +
        scored.map((i) => `${i.name} (${i.no}): ${describeIndicator(i).replace(/^Self-assessed: /, 'self-assessed, ')} — ${i.points} ${i.points === 1 ? 'point' : 'points'}.`).join(' ')
      : `None of the ${indicators.length} indicators of ${component.name.toLowerCase()} is scored yet.`) +
    (notYet.length
      ? `\n\nNot yet scored: ${listOf(notYet.map((i) => `${i.name.charAt(0).toLowerCase()}${i.name.slice(1)} (${i.no})`))}. ` +
        (notYet.some((i) => i.self) ? 'The office can self-assess these under Settings, with the evidence for each.' : '')
      : '')
  );
}

function featuresText({ where, areas, connectivity, trees, change }) {
  return (
    (areas.mapped
      ? `The land cover mapped in ${where} counts ${hectares(areas.naturalHa)} ha of natural areas, ${hectares(areas.protectedHa)} ha of them ` +
        `protected or secured, and ${hectares(areas.canopyHa)} ha under tree crowns.` +
        (areas.restoredHa || areas.degradedHa ? ` ${hectares(areas.degradedHa)} ha are marked degraded and ${hectares(areas.restoredHa)} ha restored.` : '') +
        (connectivity
          ? ` Its natural areas fall into ${n(connectivity.groups.length)} ${connectivity.groups.length === 1 ? 'group' : 'groups'} of patches less than 100 m ` +
            `apart, the largest ${hectares(connectivity.groups[0])} ha; their effective mesh size is ${hectares(connectivity.meshHa)} ha.`
          : '')
      : `No land cover has been mapped in ${where} yet; mapping its forest, grassland and waters, and marking their condition, scores the area-based indicators.`) +
    `\n\n${n(trees.length)} trees have been tagged here.` +
    (change
      ? change.change === null
        ? ` ${n(change.now)} native and endemic tree species have been recorded since tagging began in ${change.baselineYear}, the baseline year; the change in species is counted from the next.`
        : ` ${n(change.now)} native and endemic tree species are recorded now, against ${n(change.baseline)} in the baseline year, ${change.baselineYear}.`
      : '')
  );
}

const indexSources = ({ report }) =>
  `${PREPARED_WITH}\n\n` +
  'Method: the Handbook on the Singapore Index on Cities’ Biodiversity (2021), its 28 indicators and their scoring ranges' +
  (report === UBI_REPORT ? ', as DENR-BMB Technical Bulletin 2018-02 adopts them for the Urban Biodiversity Index, on the urban barangays of the PSA’s classification. ' : '. ') +
  'Natural, protected and restored areas (indicators 1, 7A, 8, 12): the land cover the office mapped, in NAMRIA’s classes, with the condition it marked. ' +
  'Connectivity (2): natural patches less than 100 m apart joined, the coherence Σ(group area²) ÷ (natural area)² (Deslauriers et al. 2018); roads and ' +
  'other barriers are not known to the system, so it is an upper bound. Native plant species (4): native and endemic tree species tagged, the first year of ' +
  'tagging the baseline — trees only, of the vascular plants. Invasive species (9): tree species, invasive ÷ (native + invasive). Tree canopy (11): the ' +
  `crowns only — closed forest ${CROWN_SHARE['closed-forest'] * 100}% of its area and open forest ${CROWN_SHARE['open-forest'] * 100}% (the middles of NAMRIA’s ` +
  `definitions), mangrove ${CROWN_SHARE['mangrove-forest'] * 100}%, perennial crops ${CROWN_SHARE['perennial-crop'] * 100}% and brush ${CROWN_SHARE['brush-shrubs'] * 100}% ` +
  '(assumed). Climate plans (20): a plan verified by PGENRO is one developed; implemented plans are the office’s to self-assess. Partners (24): the ' +
  'organisations named on the year’s events, each once; projects, outreach events and residents taking part (25, 27, 28) per million residents ' +
  '(PSA 2024). Every other indicator: the office’s self-assessment, with its evidence, for the year.\n\n' +
  'Limitations: the index measures what has been mapped, tagged and posted so far; a place that has mapped little scores little, and the figures grow ' +
  'as it does. Self-assessed indicators are the office’s statement, not verified by the system. For planning purposes only.\n\n' +
  DISCLAIMER;

export const INDEX_REFERENCES = [
  'Chan, L., Hillel, O., Werner, P., Holman, N., Coetzee, I., Galt, R., and Elmqvist, T. (2021). Handbook on the Singapore Index on Cities’ Biodiversity (also known as the City Biodiversity Index). Montreal: Secretariat of the Convention on Biological Diversity; Singapore: National Parks Board. https://www.cbd.int/authorities/gettinginvolved/cbi.shtml',
  'DENR Biodiversity Management Bureau. (2018). Technical Bulletin No. 2018-02: Procedures in the conduct of assessment of urban biodiversity. https://bmb.gov.ph',
  'National Statistical Coordination Board. (2003). Resolution No. 9, Series of 2003: Adoption of the operational definition of urban areas in the Philippines. https://psa.gov.ph',
  'Deslauriers, M. R., Asgary, A., Nazarnia, N., and Jaeger, J. A. G. (2018). Implementing the connectivity of natural areas in cities as an indicator in the City Biodiversity Index (CBI). Ecological Indicators, 94, 99–113. https://doi.org/10.1016/j.ecolind.2017.02.028',
  'Philippine Statistics Authority. (2026). Philippine Standard Geographic Code (PSGC), 3rd quarter 2026; 2024 Census of Population. https://psa.gov.ph/classification/psgc',
  'National Mapping and Resource Information Authority (NAMRIA). Land cover classification. https://www.namria.gov.ph',
];

// ---- The report -----------------------------------------------------------------------

/**
 * `ctx`: what buildEcologicalReport() takes, and for the index —
 *   features             the place's saved areas (map features)
 *   newsPosts            News & Events, for the events and their partners
 *   communityScientists  residents tagging here (community_counts), or null
 *   climatePlans         the verified plans (lccap.js), or null
 *   self                 the office's self-assessment for the year (cbiSelf.js)
 *   year
 */
export function buildIndexReport(ctx) {
  const place = ctx.place;
  const report = indexReportFor(place);
  const year = ctx.year ?? new Date().getFullYear();
  const where = `the ${officialName(place)}`;
  const scope = indexScope({ place, places: ctx.places ?? [], urbanOf: ctx.urbanOf, populationOf: ctx.populationOf });
  const trees = (ctx.trees ?? []).filter((tree) => !scope.names || scope.names.has(tree.barangay));
  const areas = areaFigures(ctx.features ?? [], place?.name ?? '', { barangays: scope.names });
  const connectivity = connectivityOf(areas.natural);
  const change = nativeSpeciesChange(trees, { year });
  const cbi = cbiPoints({
    trees,
    areas,
    placeAreaHa: scope.areaHa,
    population: scope.population,
    events: ctx.newsPosts ? cbiEventCounts(ctx.newsPosts, { lgu: place?.psgc ?? null, year }) : null,
    communityScientists: ctx.communityScientists ?? null,
    climatePlan: place && Array.isArray(ctx.climatePlans) ? planBadges(ctx.climatePlans, place.psgc, year) : null,
    connectivity,
    nativeChange: change,
    self: ctx.self ?? {},
  });

  // The Ecological Profile, as the introduction: its chapter 2, as it stands.
  const ecological = buildEcologicalReport(ctx);
  const profile = ecological.chapters.find((chapter) => chapter.key === 'profile');
  const areasTable = indexAreasTable(ctx.features ?? [], { municipality: place?.name ?? '', barangays: scope.names });
  const part = (key, heading, maps, tables, sections) => ({ key, heading, maps, tables: tables.filter(Boolean), sections });
  const nextPart = profile.parts.length + 1;

  const chapters = [
    {
      key: 'summary',
      heading: '1. Executive Summary',
      parts: [
        part('summary', null, [], [scorecardTable(cbi)], [
          { key: 'summary', heading: 'Executive summary', text: summaryText({ where, report, scope, place, cbi }) },
        ]),
      ],
    },
    {
      ...profile,
      parts: [
        ...profile.parts,
        part('features', `2.${nextPart} Biodiversity Features`, ['index-areas'], [areasTable], [
          { key: 'features', heading: 'Biodiversity features', text: featuresText({ where, areas, connectivity, trees, change }) },
        ]),
      ],
    },
    ...CBI_COMPONENTS.map((component, i) => ({
      key: `component-${component.id}`,
      heading: `${i + 3}. ${component.name}`,
      parts: [
        part(`component-${component.id}`, null, [], [componentTable(cbi, component)], [
          { key: `component-${component.id}`, heading: component.name, text: componentText({ cbi, component }) },
        ]),
        ...(i === CBI_COMPONENTS.length - 1
          ? [
              part('sources', 'Data and Limitations', [], [], [{ key: 'sources', heading: 'Data and limitations', text: indexSources({ report }) }]),
              part('references', 'References', [], [], [{ key: 'references', heading: 'References', text: INDEX_REFERENCES.join('\n\n') }]),
            ]
          : []),
      ],
    })),
  ];

  const usedMaps = new Set(chapters.flatMap((chapter) => chapter.parts.flatMap((p) => p.maps)));
  const maps = [
    ...ecologicalMaps(ctx.placeLabel ?? 'Barangay'),
    { key: 'index-areas', survey: null, trees: false, sites: true, caption: 'Land cover and the areas the index counts' },
  ].filter((map) => usedMaps.has(map.key));
  const parts = chapters.flatMap((chapter) => chapter.parts);
  return {
    kind: report.id,
    title: report.title,
    maps,
    chapters,
    tables: parts.flatMap((p) => p.tables),
    sections: parts.flatMap((p) => p.sections),
    cbi,
    scope,
  };
}
