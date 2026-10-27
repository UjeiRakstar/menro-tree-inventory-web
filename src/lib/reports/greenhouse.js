import { carbonContentOf } from '../landCover.js';
import { maiCoverOf } from '../namriaCover.js';
import { geometryAreaM2, toHectares } from '../areaGeometry.js';
import { CO2_PER_CARBON, ROOT_SHOOT_RATIO } from '../treeCarbon.js';
import { officialName } from '../psgc.js';
import { DISCLAIMER, PREPARED_WITH, buildEcologicalReport, ecologicalMaps } from './ecological.js';
import { buildGhgReport } from './ghg.js';

/**
 * The greenhouse gas report (27 October): what the LGU's trees and forest
 * land take out of the air, what more its planting sites and degraded land
 * could take once planted or restored, and what the place emits — from the
 * GHGI System of Laguna State Polytechnic University (ghgi.lspu.edu.ph), whose
 * figures are not in yet, so that chapter waits for them and says so.
 *
 * The removals are the GHG inventory tables of reports/ghg.js (the CCC's
 * Community-level GHG Inventory Tool, Forestlands); the place itself, its
 * location and climate, come first, from the Ecological Profile.
 */

export const GHG_REPORT = Object.freeze({ id: 'ghg', label: 'Greenhouse gas', title: 'GREENHOUSE GAS REPORT' });

/** Where the emissions will come from. */
export const GHGI_SYSTEM = Object.freeze({
  name: 'GHGI System of Laguna State Polytechnic University',
  url: 'https://ghgi.lspu.edu.ph',
});

/** The sectors of a community GHG inventory, as the CCC tool lays them out. */
export const EMISSION_SECTORS = Object.freeze([
  'Stationary energy (households, commerce, industry)',
  'Transportation',
  'Waste (solid waste and wastewater)',
  'Industrial processes and product use',
  'Agriculture (livestock and crops)',
]);

const n = (value) => Number(value || 0).toLocaleString('en-US');
const t = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: Number(value) < 10 ? 2 : 1 });
const hectares = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });

/**
 * A hectare planted or restored, grown into secondary (open) forest: the
 * CO₂ it would remove in a year, roots included, by the CCC tool's own rate
 * for that cover. The rate is the open forest class's (src/lib/namriaCover.js).
 */
export function potentialPerHa() {
  const rate = maiCoverOf('open-forest');
  if (!rate) return null;
  return {
    rate,
    co2PerHaYearT: rate.maiTPerHaYear * (1 + ROOT_SHOOT_RATIO) * carbonContentOf(rate.id) * CO2_PER_CARBON,
  };
}

/**
 * The sequestration potential: the planting sites PGENRO approved and still
 * open, and the land cover marked degraded, each as if grown into open forest.
 */
export function potentialTable(features = [], { municipality = '' } = {}) {
  const per = potentialPerHa();
  const inPlace = features.filter((f) => f?.properties?.saved && (!municipality || f.properties.municipality === municipality));
  const sites = inPlace.filter(
    (f) => f.properties.kind === 'planting-site' && (f.properties.approval ?? 'approved') === 'approved' && f.properties.status !== 'full'
  );
  const degraded = inPlace.filter((f) => f.properties.kind === 'land-cover' && f.properties.condition === 'degraded');
  const row = (name, list, from) => {
    const ha = list.reduce((sum, f) => sum + toHectares(geometryAreaM2(f.geometry)), 0);
    return { name, areas: list.length, areaHa: ha, co2YearT: per && ha ? ha * per.co2PerHaYearT : list.length ? 0 : null, from };
  };
  const rows = [
    row('Tree planting sites, approved and open', sites, 'Planting sites on the map, approved by PGENRO'),
    row('Land cover marked degraded, if restored', degraded, 'Land cover the office marked degraded'),
  ];
  const counted = rows.filter((r) => r.co2YearT !== null);
  return {
    key: 'ghg-potential',
    title: 'Sequestration potential: land that could be planted or restored',
    columns: [
      { key: 'name', label: 'Land', kind: 'text' },
      { key: 'areas', label: 'Areas', kind: 'number' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      { key: 'co2YearT', label: 'CO₂ it could remove a year (t)', kind: 'tonnes' },
      { key: 'from', label: 'From', kind: 'text' },
    ],
    rows,
    totals: {
      name: 'Potential',
      areas: rows.reduce((s, r) => s + r.areas, 0),
      areaHa: rows.reduce((s, r) => s + r.areaHa, 0),
      co2YearT: counted.length ? counted.reduce((s, r) => s + r.co2YearT, 0) : null,
    },
    notes: per
      ? [
          `Each hectare as if grown into secondary forest: ${per.rate.maiTPerHaYear} t of biomass a hectare a year (${per.rate.label}, ${per.rate.location}; ` +
            `${per.rate.source}), × ${1 + ROOT_SHOOT_RATIO} for the roots, × ${carbonContentOf(per.rate.id)} carbon, × 44/12 — about ` +
            `${t(per.co2PerHaYearT)} t of CO₂ a hectare a year, once the trees are growing.`,
        ]
      : [],
  };
}

/**
 * The place's emissions, by sector — from the GHGI System when its figures
 * come in (`emissions`: { year, sectors: { [sector]: tCO2e } }), and until
 * then each sector waiting for them.
 */
export function emissionsTable(emissions = null) {
  const rows = EMISSION_SECTORS.map((name) => {
    const value = emissions?.sectors?.[name];
    return { name, co2eT: Number.isFinite(value) ? value : null, from: Number.isFinite(value) ? GHGI_SYSTEM.name : 'Awaiting the GHGI System' };
  });
  const known = rows.filter((r) => r.co2eT !== null);
  return {
    key: 'ghg-emissions',
    title: 'Emissions by sector',
    note: `From the ${GHGI_SYSTEM.name} (${GHGI_SYSTEM.url}).`,
    columns: [
      { key: 'name', label: 'Sector', kind: 'text' },
      { key: 'co2eT', label: 'CO₂-equivalent a year (t)', kind: 'tonnes' },
      { key: 'from', label: 'From', kind: 'text' },
    ],
    rows,
    totals: { name: 'Emissions', co2eT: known.length === rows.length ? known.reduce((s, r) => s + r.co2eT, 0) : null, from: known.length === rows.length ? '' : 'Not complete yet' },
  };
}

// ---- The narrative ----------------------------------------------------------------------

function summaryText({ where, summary, potential, emissions }) {
  const removals = summary.totals.co2YearT;
  const emitted = emissions.totals.co2eT;
  return (
    `This report sets out the greenhouse gas picture of ${where} as far as the data reach: the carbon dioxide its forest land, tree cover and ` +
    'tagged trees remove from the air in a year; what more its tree planting sites and degraded land could remove once planted or restored; ' +
    'and what the place emits.\n\n' +
    (removals !== null && removals !== undefined
      ? `The mapped tree cover and the measured trees remove about ${t(removals)} t of CO₂ a year${summary.lost ? ', net of the trees cut under a permit this year' : ''}. `
      : 'Nothing has yet been mapped or measured that the inventory can count as removals. ') +
    (potential.totals.co2YearT
      ? `Planted and restored, ${hectares(potential.totals.areaHa)} ha more could remove about ${t(potential.totals.co2YearT)} t a year once the trees are growing. `
      : '') +
    (emitted !== null
      ? `The place emits about ${t(emitted)} t of CO₂-equivalent a year (${GHGI_SYSTEM.name}).`
      : `Its emissions will come from the ${GHGI_SYSTEM.name}, whose figures are not in yet; the balance between what the place emits and what its trees remove is worked out once they are.`)
  );
}

function potentialText({ where, potential }) {
  const [sites, degraded] = potential.rows;
  if (!potential.totals.areas) {
    return (
      `No approved tree planting site is open in ${where}, and no land cover is marked degraded, so there is no potential to count yet. ` +
      'Planting sites PGENRO approves, and land cover the office marks degraded, are counted here as they are mapped.'
    );
  }
  return (
    `${n(sites.areas)} approved tree planting ${sites.areas === 1 ? 'site' : 'sites'} still open cover ${hectares(sites.areaHa)} ha, and ` +
    `${n(degraded.areas)} ${degraded.areas === 1 ? 'area' : 'areas'} of land cover marked degraded cover ${hectares(degraded.areaHa)} ha. ` +
    (potential.totals.co2YearT
      ? `Grown into secondary forest, they could remove about ${t(potential.totals.co2YearT)} t of CO₂ a year — a potential, not a removal: it ` +
        'counts once the trees are planted, survive and grow, and the inventory picks them up as they are tagged and the cover is mapped again.'
      : '')
  );
}

function emissionsText({ where, emissions }) {
  return emissions.totals.co2eT !== null
    ? `The ${GHGI_SYSTEM.name} puts the emissions of ${where} at about ${t(emissions.totals.co2eT)} t of CO₂-equivalent a year, by sector as the table shows.`
    : `The emissions of ${where} — energy, transport, waste, industry and agriculture — are inventoried by the ${GHGI_SYSTEM.name} ` +
        `(${GHGI_SYSTEM.url}), developed with the LGUs of Laguna. Its figures are not in Green Tag yet; this chapter shows each sector as waiting for ` +
        'them, and the report fills them in once they are shared. Until then, the removals in Chapter 3 stand on their own and are not a net balance.';
}

const ghgSources = () =>
  `${PREPARED_WITH}\n\n` +
  'Removals: the Climate Change Commission’s Community-level GHG Inventory Tool (31 July 2024), Forestlands — each mapped tree cover area × its ' +
  `published biomass growth × (1 + ${ROOT_SHOOT_RATIO}) for the roots × its carbon content × 44/12; tagged trees outside the mapped cover one by one, by ` +
  'Chave et al. (2014) on diameter and total height, carbon 45% of biomass (Lasco & Pulhin 2000), growth 1.19 cm of diameter a year (Schneider et al. ' +
  '2013). Losses: the trees cut under a permit this year, the CO₂ they held released as they were cut. Potential: approved planting sites still open ' +
  'and land cover marked degraded, as if grown into secondary forest at the tool’s rate. Emissions: the GHGI System of Laguna State Polytechnic ' +
  'University, when its figures are shared.\n\n' +
  'Limitations: the rates were measured elsewhere in the Philippines and are applied as the CCC tool applies them; fuelwood gathering and disturbance ' +
  'are not recorded; the potential assumes the trees are planted and survive. Estimates for planning, not a measured inventory.\n\n' +
  DISCLAIMER;

export const GHG_REFERENCES = [
  'Climate Change Commission. (2024). Community-level Greenhouse Gas Inventory Tool (31 July 2024). https://climate.gov.ph',
  `Laguna State Polytechnic University. GHGI System: greenhouse gas inventory of the LGUs of Laguna. ${GHGI_SYSTEM.url}`,
  'Chave, J., Réjou-Méchain, M., Búrquez, A., et al. (2014). Improved allometric models to estimate the aboveground biomass of tropical trees. Global Change Biology, 20(10), 3177–3190. https://doi.org/10.1111/gcb.12629',
  'Lasco, R. D., and Pulhin, F. B. (2000). Forest land use change in the Philippines and climate change mitigation. Mitigation and Adaptation Strategies for Global Change, 5, 81–97.',
  'Schneider, T., Ashton, M. S., Montagnini, F., and Milan, P. P. (2013). Growth performance of sixty tree species in smallholder reforestation trials on Leyte, Philippines. New Forests, 45, 83–96.',
  'Reyes, G., Brown, S., Chapman, J., and Lugo, A. E. (1992). Wood densities of tropical tree species. USDA Forest Service, General Technical Report SO-88.',
  'IPCC. (2006). 2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 4: Agriculture, Forestry and Other Land Use. https://www.ipcc-nggip.iges.or.jp/public/2006gl',
];

// ---- The report -----------------------------------------------------------------------

/**
 * `ctx`: what buildEcologicalReport() takes, and
 *   features    the place's saved areas (map features)
 *   permits     its permits, for the trees cut this year
 *   emissions   the GHGI System's figures, or null until they are shared
 */
export function buildGreenhouseReport(ctx) {
  const where = `the ${officialName(ctx.place)}`;
  const short = ctx.place ? ctx.place.label : 'Laguna';
  const features = (ctx.features ?? []).filter((f) => !ctx.place || f.properties?.municipality === ctx.place.name);
  const ghg = buildGhgReport({
    trees: ctx.trees ?? [],
    areas: features,
    places: ctx.places ?? [],
    placeLabel: ctx.placeLabel ?? 'Barangay',
    short,
    permits: ctx.permits ?? [],
    year: ctx.year ?? new Date().getFullYear(),
  });
  const [summary, forest, treeTable] = ghg.tables;
  const text = Object.fromEntries(ghg.sections.map((s) => [s.key, s]));
  const potential = potentialTable(features);
  const emissions = emissionsTable(ctx.emissions ?? null);

  const ecological = buildEcologicalReport(ctx);
  const profile = ecological.chapters.find((chapter) => chapter.key === 'profile');
  const place = profile.parts.filter((p) => p.key === 'location' || p.key === 'climate').map((p, i) => ({ ...p, heading: p.heading.replace(/^2\.\d/, `2.${i + 1}`) }));
  const part = (key, heading, maps, tables, sections) => ({ key, heading, maps, tables: tables.filter(Boolean), sections });

  const chapters = [
    {
      key: 'summary',
      heading: '1. Executive Summary',
      parts: [
        part('summary', null, [], [summary], [{ key: 'summary', heading: 'Executive summary', text: summaryText({ where, summary, potential, emissions }) }]),
      ],
    },
    { key: 'place', heading: '2. The Place', parts: place },
    {
      key: 'removals',
      heading: '3. Removals: Forest Land, Tree Cover and Trees',
      parts: [
        part('ghg-forest', '3.1 Forest Land and Tree Cover', ['ghg-cover'], [forest], [text['ghg-forest']]),
        part('ghg-trees', '3.2 The Tagged Trees', ['ghg-carbon'], [treeTable], [text['ghg-trees']]),
        part('ghg-total', '3.3 Removals, and What Is Not Yet Counted', [], [], [text['ghg-total'], text['ghg-relevance']]),
      ],
    },
    {
      key: 'potential',
      heading: '4. Sequestration Potential',
      parts: [part('ghg-potential', null, ['ghg-potential'], [potential], [{ key: 'ghg-potential', heading: 'Sequestration potential', text: potentialText({ where, potential }) }])],
    },
    {
      key: 'emissions',
      heading: '5. Emissions',
      parts: [
        part('ghg-emissions', null, [], [emissions], [{ key: 'ghg-emissions', heading: 'Emissions', text: emissionsText({ where, emissions }) }]),
        part('sources', 'Data and Limitations', [], [], [{ key: 'sources', heading: 'Data and limitations', text: ghgSources() }]),
        part('references', 'References', [], [], [{ key: 'references', heading: 'References', text: GHG_REFERENCES.join('\n\n') }]),
      ],
    },
  ];

  const usedMaps = new Set(chapters.flatMap((chapter) => chapter.parts.flatMap((p) => p.maps)));
  const maps = [
    ...ecologicalMaps(ctx.placeLabel ?? 'Barangay'),
    { key: 'ghg-cover', survey: null, trees: false, sites: true, caption: 'Mapped land cover and tree planting sites' },
    { key: 'ghg-carbon', survey: null, treeColour: 'carbon', sites: false, caption: 'Tagged trees by the CO₂ they store above ground' },
    { key: 'ghg-potential', survey: null, trees: false, sites: true, caption: 'Tree planting sites and land cover that could be planted or restored' },
  ].filter((map) => usedMaps.has(map.key));
  const parts = chapters.flatMap((chapter) => chapter.parts);
  return {
    kind: GHG_REPORT.id,
    title: GHG_REPORT.title,
    maps,
    chapters,
    // The printed tables, and for the Excel file every tagged tree too.
    tables: [...parts.flatMap((p) => p.tables), ...ghg.annex],
    sections: parts.flatMap((p) => p.sections),
  };
}
