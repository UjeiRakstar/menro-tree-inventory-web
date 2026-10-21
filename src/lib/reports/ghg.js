import { containsPoint } from '../lagunaBoundaries.js';
import { carbonContentOf } from '../landCover.js';
import { summariseMappedCover } from '../mappedCover.js';
import { maiCoverOf, namriaClassById } from '../namriaCover.js';
import { treesCovered } from '../permitLogs.js';
import { listOf } from '../reportWriter.js';
import {
  CARBON_FRACTION,
  CO2_PER_CARBON,
  ROOT_SHOOT_RATIO,
  annualBiomassKg,
  biomassKg,
  dbhOf,
  totalHeightOf,
  whyNoCarbon,
  woodDensityOf,
} from '../treeCarbon.js';

/**
 * The greenhouse gas inventory report (20 October): what the LGU's trees and
 * forest land take out of the air in a year, in the shape the Climate Change
 * Commission's Community-level GHG Inventory Tool (31 July 2024) asks for it,
 * so its figures can be carried into the tool's Forestlands sheet.
 *
 * Two ways of counting, kept apart and never added twice:
 *
 *   forest land    by AREA, as the CCC tool counts it: each mapped tree cover
 *                  area × its cover's published growth (MAI) × (1 + 0.37 for
 *                  the roots) × its carbon content × 44/12
 *   tagged trees   one by one, by Chave et al. 2014 on diameter and total
 *                  height, with the same 0.37 for the roots — for the trees
 *                  that stand OUTSIDE the mapped tree cover; a tree inside an
 *                  area is already in that area's figure
 *
 * Losses (21 October): the carbon held by trees cut under a permit this year
 * — each measured tree's stored CO₂, roots included, released the year it is
 * cut — so the bottom line is net. A cut tree no longer removes anything.
 * What it cannot count is said, not left out quietly: fuelwood and
 * disturbance (the CCC tool's rows 26–42), trees cut that were never
 * measured, and every other sector's emissions, from outside Green Tag.
 *
 * The CCC tool's own sheet applies the root-to-shoot ratio on its first row
 * only (H5); rows 6 to 13 leave it out, though the column is filled in for
 * every row. This report applies it to every row, and its notes say so.
 */

export const GHG_RELEVANCE_HEADING = 'What this means for the plans';

const WITH_ROOTS = 1 + ROOT_SHOOT_RATIO;
const toCo2 = (biomass) => biomass * CARBON_FRACTION * CO2_PER_CARBON;
const n = (value) => Number(value || 0).toLocaleString('en-US');
const t = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: Number(value) < 10 ? 2 : 1 });
const hectares = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });

/** The tree cover an office has mapped: saved land cover areas whose NAMRIA class is tree cover. */
export function treeCoverAreas(areas = []) {
  return (areas ?? []).filter(
    (area) => area?.properties?.saved && area.properties.kind === 'land-cover' && namriaClassById(area.properties.namriaClass)?.treeCover
  );
}

/** Whether a tree stands inside one of those areas. */
export function inMappedCover(tree, coverAreas) {
  const lat = Number(tree?.lat ?? tree?.latitude);
  const lng = Number(tree?.lng ?? tree?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return coverAreas.some((area) => area.geometry && containsPoint(area.geometry, [lat, lng]));
}

/**
 * One tree, in kilograms: above-ground biomass, biomass with the roots, the
 * CO₂ it holds and the CO₂ it removes in a year. Null when it is not measured.
 */
export function treeGhg(tree) {
  const agb = biomassKg(tree);
  if (agb === null) return null;
  const total = agb * WITH_ROOTS;
  return {
    agbKg: agb,
    biomassKg: total,
    co2Kg: toCo2(total),
    co2YearKg: toCo2((annualBiomassKg(tree) ?? 0) * WITH_ROOTS),
  };
}

/** Each tree with its figures, and whether its area already counts it. */
/** A tree cut under a permit, or marked cut in the field. */
export const isCut = (tree) => tree?.task_status === 'Cut';

function assess(trees, coverAreas) {
  return trees
    .filter((tree) => !isCut(tree))
    .map((tree) => ({ tree, ghg: treeGhg(tree), inCover: inMappedCover(tree, coverAreas) }));
}

/**
 * The trees cut under a permit in a year: how many, how many were measured,
 * and the CO₂ the measured ones held, roots included — lost that year.
 *   permits   the place's permits
 *   trees     every tree, cut ones included, to find a permit's tree by id
 */
export function cuttingLosses({ permits = [], trees = [], year = new Date().getFullYear() }) {
  const byId = new Map(trees.map((tree) => [String(tree.id), tree]));
  let count = 0;
  let measured = 0;
  let co2Kg = 0;
  for (const permit of permits) {
    const issued = permit?.created_at ? new Date(permit.created_at) : null;
    if (!issued || issued.getFullYear() !== Number(year)) continue;
    const tree = permit.tree_id ? byId.get(String(permit.tree_id)) : null;
    if (permit.status !== 'Cut' && !isCut(tree)) continue;
    count += treesCovered(permit);
    const ghg = tree ? treeGhg(tree) : null;
    if (ghg) {
      measured += 1;
      co2Kg += ghg.co2Kg;
    }
  }
  return { year: Number(year), trees: count, measured, co2T: measured ? co2Kg / 1000 : count ? 0 : null };
}

/** The tagged trees by place: what they hold and what they remove in a year. */
export function ghgTreeTable({ assessed, places = [], placeOf, placeLabel = 'Barangay' }) {
  const byPlace = new Map(places.map(({ name }) => [name, []]));
  for (const item of assessed) byPlace.get(placeOf(item.tree))?.push(item);
  const figures = (items) => {
    const measured = items.filter((item) => item.ghg);
    const sum = (key) => measured.reduce((total, item) => total + item.ghg[key], 0) / 1000;
    return {
      trees: items.length,
      measured: measured.length,
      meanDbh: measured.length ? measured.reduce((total, item) => total + dbhOf(item.tree), 0) / measured.length : null,
      biomassT: measured.length ? sum('biomassKg') : null,
      co2T: measured.length ? sum('co2Kg') : null,
      co2YearT: measured.length ? sum('co2YearKg') : null,
      inCover: measured.filter((item) => item.inCover).length,
    };
  };
  const rows = [...byPlace].map(([name, items]) => ({ name, ...figures(items) })).sort((a, b) => a.name.localeCompare(b.name));
  const words = placeLabel === 'Barangay' ? 'barangays' : 'cities and municipalities';
  return {
    key: 'ghg-trees',
    title: `Carbon in the tagged trees by ${placeLabel === 'Barangay' ? 'barangay' : 'city and municipality'}`,
    columns: [
      { key: 'name', label: placeLabel, kind: 'text' },
      { key: 'trees', label: 'Tagged trees', kind: 'number' },
      { key: 'measured', label: 'Measured (DBH and total height)', kind: 'number' },
      { key: 'meanDbh', label: 'Mean DBH (cm)', kind: 'decimal' },
      { key: 'biomassT', label: 'Biomass with roots (t)', kind: 'tonnes' },
      { key: 'co2T', label: 'CO₂ stored (t)', kind: 'tonnes' },
      { key: 'co2YearT', label: 'CO₂ removed a year (t)', kind: 'tonnes' },
      { key: 'inCover', label: 'Measured trees inside mapped tree cover', kind: 'number' },
    ],
    rows,
    totals: { name: `${rows.length} ${words}`, ...figures([...byPlace.values()].flat()) },
    notes: [
      'Chave et al. (2014): AGB = 0.0673 × (ρD²H)^0.976 on each tree’s diameter at breast height and total height, with the tropical Asian mean ' +
        'wood density of 0.57 g/cm³ (Reyes et al. 1992). Roots: × 1.37, the root-to-shoot ratio of 0.37 the CCC tool applies. Carbon 45% of ' +
        'biomass (Lasco & Pulhin 2000); CO₂ = C × 44/12. A year’s removal: the same after 1.19 cm of diameter growth (Schneider et al. 2013), ' +
        'the height held where it is.',
      'Palms, bamboo and bananas, and trees under 5 cm in diameter, are counted as tagged and left out of the carbon.',
    ],
  };
}

/** The mapped tree cover, row for row as the CCC tool's Forestlands sheet ("Carbon Gain") lays it out. */
export function ghgForestTable(coverAreas) {
  const cover = summariseMappedCover(coverAreas);
  const rows = cover.byClass.map((entry) => {
    const rate = maiCoverOf(entry.classId);
    const mai = rate?.maiTPerHaYear ?? null;
    const cc = rate ? carbonContentOf(rate.id) : null;
    return {
      name: entry.label,
      rate: rate ? `${rate.label} (${rate.location}${rate.source ? `; ${rate.source}` : ''})` : 'No published rate',
      areaHa: entry.hectares,
      mai,
      carbonContent: cc,
      rootShoot: rate ? ROOT_SHOOT_RATIO : null,
      co2YearT: rate ? entry.hectares * mai * WITH_ROOTS * cc * CO2_PER_CARBON : null,
    };
  });
  const rated = rows.filter((row) => row.co2YearT !== null);
  return {
    key: 'ghg-forest',
    title: 'Forest land and tree cover: carbon gain (CCC tool, Forestlands)',
    columns: [
      { key: 'name', label: 'Land cover (NAMRIA)', kind: 'text' },
      { key: 'rate', label: 'Rate used (CCC tool’s list)', kind: 'text' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      { key: 'mai', label: 'Biomass growth (t/ha/yr)', kind: 'decimal' },
      { key: 'carbonContent', label: 'Carbon content', kind: 'tonnes' },
      { key: 'rootShoot', label: 'Root-to-shoot ratio', kind: 'tonnes' },
      { key: 'co2YearT', label: 'CO₂ removed a year (t)', kind: 'tonnes' },
    ],
    rows,
    totals: {
      name: `${cover.areas} ${cover.areas === 1 ? 'area' : 'areas'}`,
      areaHa: cover.hectares,
      co2YearT: rated.length ? rated.reduce((total, row) => total + row.co2YearT, 0) : null,
    },
    notes: [
      'Carbon uptake = area × biomass growth × (1 + root-to-shoot ratio) × carbon content × 44/12, as the CCC Community-level GHG Inventory ' +
        'Tool (31 July 2024) computes it. The tool’s own sheet applies the root-to-shoot ratio on its first row only; it is applied to every row here.',
      'Areas are as the office drew and classified them on the map. Tree cover with no published rate (mangrove) is counted in hectares and given no figure.',
    ],
  };
}

/** The year's removals, and what is not counted: the CCC tool's "Net Carbon Uptake", as far as Green Tag can fill it. */
export function ghgSummaryTable({ forest, assessed, cutting = null }) {
  const forestYear = forest.totals.co2YearT;
  const outside = assessed.filter((item) => item.ghg && !item.inCover);
  const treesYear = outside.length ? outside.reduce((total, item) => total + item.ghg.co2YearKg, 0) / 1000 : null;
  const counted = [forestYear, treesYear].filter((value) => value !== null);
  const gains = counted.length ? counted.reduce((a, b) => a + b, 0) : null;
  const lost = cutting?.co2T ?? null;
  const unmeasured = cutting ? cutting.trees - cutting.measured : 0;
  return {
    key: 'ghg-summary',
    title: 'Removals and emissions: what this inventory counts',
    columns: [
      { key: 'name', label: 'Item', kind: 'text' },
      { key: 'co2YearT', label: 'CO₂ a year (t)', kind: 'tonnes' },
      { key: 'from', label: 'Where it comes from', kind: 'text' },
    ],
    rows: [
      { name: 'Removals: forest land and tree cover, by area', co2YearT: forestYear, from: 'The mapped land cover, by the CCC tool’s rates' },
      {
        name: 'Removals: tagged trees outside the mapped tree cover',
        co2YearT: treesYear,
        from: `${n(outside.length)} measured ${outside.length === 1 ? 'tree' : 'trees'}, by Chave et al. 2014 with roots`,
      },
      {
        name: `Losses: trees cut under a permit in ${cutting?.year ?? new Date().getFullYear()}`,
        co2YearT: lost,
        from: !cutting || cutting.trees === 0
          ? 'No tree recorded cut under a permit this year'
          : `${n(cutting.trees)} ${cutting.trees === 1 ? 'tree' : 'trees'} cut; the CO₂ the ${n(cutting.measured)} measured held, with roots` +
            (unmeasured > 0 ? `; ${n(unmeasured)} never measured, not counted` : ''),
      },
      { name: 'Losses: fuelwood and disturbance', co2YearT: null, from: 'Not recorded in Green Tag: the CCC tool, Forestlands rows 26–42' },
      { name: 'Emissions: energy, transport, waste, agriculture and the rest', co2YearT: null, from: 'Outside Green Tag: the CCC tool’s other sheets' },
    ],
    totals: {
      name: lost ? 'Net removals counted here' : 'Removals counted here',
      co2YearT: gains === null && lost === null ? null : (gains ?? 0) - (lost ?? 0),
      from: lost ? 'Removals less the trees cut; before fuelwood, disturbance and emissions' : 'Before losses and emissions',
    },
    // For the narrative.
    gains,
    lost,
  };
}

/** Every tagged tree with its figures — for the Excel file, not the printed report. */
export function ghgTreeList(assessed) {
  return {
    key: 'ghg-tree-list',
    title: 'Every tagged tree',
    columns: [
      { key: 'no', label: 'No.', kind: 'number' },
      { key: 'species', label: 'Species', kind: 'text' },
      { key: 'barangay', label: 'Barangay', kind: 'text' },
      { key: 'dbh', label: 'DBH (cm)', kind: 'decimal' },
      { key: 'height', label: 'Total height (m)', kind: 'decimal' },
      { key: 'density', label: 'Wood density (g/cm³)', kind: 'tonnes' },
      { key: 'agbKg', label: 'Above-ground biomass (kg)', kind: 'kg' },
      { key: 'biomassKg', label: 'Biomass with roots (kg)', kind: 'kg' },
      { key: 'co2Kg', label: 'CO₂ stored (kg)', kind: 'kg' },
      { key: 'co2YearKg', label: 'CO₂ removed a year (kg)', kind: 'kg' },
      { key: 'inCover', label: 'Inside mapped tree cover', kind: 'text' },
      { key: 'why', label: 'Not counted because', kind: 'text' },
    ],
    rows: assessed.map(({ tree, ghg, inCover }, i) => ({
      no: i + 1,
      species: tree.species || '',
      barangay: tree.barangay || '',
      dbh: dbhOf(tree),
      height: totalHeightOf(tree)?.metres ?? null,
      density: ghg ? woodDensityOf(tree) : null,
      agbKg: ghg?.agbKg ?? null,
      biomassKg: ghg?.biomassKg ?? null,
      co2Kg: ghg?.co2Kg ?? null,
      co2YearKg: ghg?.co2YearKg ?? null,
      inCover: ghg ? (inCover ? 'Yes — counted in its area' : 'No') : '',
      why: whyNoCarbon(tree) ?? '',
    })),
    totals: null,
    notes: ['A height class from an LGU’s inventory counts at its middle. A blank is a measurement not recorded, never a zero.'],
  };
}

/** The report's narrative, written from its tables. */
export function ghgSections({ short, trees: treeTable, forest, summary }) {
  const tt = treeTable.totals;
  const ft = forest.totals;
  const st = summary.totals;
  const top = [...treeTable.rows].filter((row) => row.co2YearT).sort((a, b) => b.co2YearT - a.co2YearT).slice(0, 3);
  const unrated = forest.rows.filter((row) => row.co2YearT === null);
  return [
    {
      key: 'ghg-scope',
      heading: 'What this inventory counts',
      text:
        `This is the Forestry and Other Land Use part of ${short}’s greenhouse gas inventory, as far as Green Tag holds the data for it: the ` +
        'carbon dioxide that its forest land, tree cover and tagged trees remove from the air in a year. It follows the Climate Change ' +
        'Commission’s Community-level GHG Inventory Tool (31 July 2024), so its figures can be carried into the tool’s Forestlands sheet. ' +
        'Carbon lost to wood removal, fuelwood and disturbance, and the emissions of every other sector, are outside it and are named below.',
    },
    {
      key: 'ghg-trees',
      heading: 'The tagged trees',
      text: !tt.trees
        ? `No tree has been tagged in ${short} yet.`
        : !tt.measured
          ? `${n(tt.trees)} trees have been tagged in ${short}, but none has a diameter and total height recorded, so their carbon cannot be estimated yet.`
          : `${n(tt.trees)} trees have been tagged in ${short}; ${n(tt.measured)} of them have a diameter and total height recorded, with a mean ` +
            `diameter of ${tt.meanDbh.toFixed(1)} cm. Roots included, they hold an estimated ${t(tt.co2T)} t of CO₂ and remove about ` +
            `${t(tt.co2YearT)} t a year.` +
            (top.length ? ` The most is removed in ${listOf(top.map((row) => `${row.name} (${t(row.co2YearT)} t)`))}.` : '') +
            (tt.inCover ? ` ${n(tt.inCover)} of the measured trees stand inside mapped tree cover, and are counted with their areas rather than twice.` : ''),
    },
    {
      key: 'ghg-forest',
      heading: 'Forest land and tree cover',
      text: !forest.rows.length
        ? `No tree cover has been mapped in ${short} yet. Drawing and classifying its forest, brushland and agroforest on the map adds them here, ` +
          'by area, as the CCC tool counts them.'
        : `${hectares(ft.areaHa)} ha of tree cover have been mapped in ${short}: ` +
          `${listOf(forest.rows.map((row) => `${hectares(row.areaHa)} ha of ${row.name.toLowerCase()}`))}. ` +
          (ft.co2YearT !== null ? `At the CCC tool’s published growth rates, roots included, they remove about ${t(ft.co2YearT)} t of CO₂ a year. ` : '') +
          (unrated.length ? `${listOf(unrated.map((row) => row.name.toLowerCase()))} ${unrated.length === 1 ? 'has' : 'have'} no published rate and ${unrated.length === 1 ? 'is' : 'are'} given no figure. ` : '') +
          'The rates were measured elsewhere in the Philippines (Leyte, Makiling, Cebu) and are applied here as the tool applies them.',
    },
    {
      key: 'ghg-total',
      heading: 'Removals, and what is not yet counted',
      text:
        (summary.gains !== null
          ? `Together, without counting a tree twice, the mapped cover and the tagged trees outside it remove about ${t(summary.gains)} t of CO₂ a year. `
          : 'Nothing has been measured or mapped yet that this inventory can count. ') +
        (summary.lost
          ? `The trees cut under a permit this year held about ${t(summary.lost)} t of CO₂, released as they were cut, which leaves a net removal of ${t(st.co2YearT)} t. `
          : 'No tree has been recorded cut under a permit this year. ') +
        'Carbon lost to fuelwood gathering and disturbance, and the other sectors’ emissions, are entered in the CCC tool from the LGU’s own ' +
        'records.',
    },
    {
      key: 'ghg-relevance',
      heading: GHG_RELEVANCE_HEADING,
      text:
        'eLCCAP: the GHG inventory is the baseline of the mitigation part of the Local Climate Change Action Plan, and the trees and forest ' +
        'land are its sink; planting and protecting them are mitigation actions the plan can count. FLUP: the forest land’s carbon is the ' +
        '"existing and potential carbon stock" the FLUP guidelines ask for (Module 3). CLUP / CDP: tree cover kept or added in the land use plan ' +
        'shows up here as removals. CBI: carbon storage is the City Biodiversity Index’s climate regulation indicator. The figures are ' +
        'estimates from published equations and rates, for planning; a plot survey would make them exact.',
    },
  ];
}

/**
 * The report's tables, its Excel-only tree list, and its narrative.
 *
 *   trees, areas, places, placeLabel, short — as the map sheet has them
 */
export function buildGhgReport({ trees = [], areas = [], places = [], placeLabel = 'Barangay', short = 'Laguna', permits = [], year = new Date().getFullYear() }) {
  const coverAreas = treeCoverAreas(areas);
  const cutting = cuttingLosses({ permits, trees, year });
  const assessed = assess(trees, coverAreas);
  const placeOf =
    placeLabel === 'Barangay' ? (tree) => tree.barangay : (tree) => places.find((place) => place.key === tree.municipality)?.name ?? null;
  const treeTable = ghgTreeTable({ assessed, places, placeOf, placeLabel });
  const forest = ghgForestTable(coverAreas);
  const summary = ghgSummaryTable({ forest, assessed, cutting });
  return {
    tables: [summary, forest, treeTable],
    annex: [ghgTreeList(assessed)],
    sections: ghgSections({ short, trees: treeTable, forest, summary }),
  };
}
