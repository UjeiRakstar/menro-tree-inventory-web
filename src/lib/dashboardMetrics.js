import { canonicalBarangay } from './barangayNames.js';
import { carbonDioxideKg } from './treeVolume.js';

/**
 * The figures behind the public BioDashboard.
 *
 * Three pairs, read together: how many trees and how many of them are invasive;
 * how much ground they cover and how fast it is growing; how much carbon they
 * hold against what the area emits. Each pair can be charted per place.
 *
 * Only some of it exists yet. The tree counts and the carbon estimate come from
 * public.trees; forest cover, mean annual increment and carbon emission come
 * from work that has not been built — so they report themselves as unavailable
 * rather than showing a number nobody can stand behind. A dashboard that guesses
 * is worse than one that says it does not know.
 */

/**
 * Carbon comes from src/lib/treeVolume.js now: the DENR's own volume equation
 * for Southern Luzon, from FMB Technical Bulletin No. 3, applied to the
 * diameter and merchantable height the field team already records.
 *
 * It used to be a flat 2.5 kg of CO₂ per centimetre of diameter, which had no
 * source at all.
 */

/**
 * Carbon held by one tree, in kg CO₂, or null when it has not been measured
 * well enough to say.
 *
 * Null rather than zero: a tree nobody recorded a merchantable height for has
 * an unknown carbon figure, not a carbon figure of nothing, and adding those
 * two together would understate the province.
 */
export function carbonForTree(tree) {
  return carbonDioxideKg(tree);
}

/** Does the record call this tree invasive? */
export function isInvasive(tree) {
  const status = (tree?.biodiversity_status || tree?.species_type || '').toString().toLowerCase();
  return status.trim() === 'invasive';
}

/**
 * Barangay name as it should be grouped and shown, or null when unrecorded.
 *
 * The naming is not a regular expression here — "Barangay" is part of the real
 * name of 63 barangays in Laguna, so stripping it turns Barangay V into V.
 * See src/lib/barangayNames.js.
 */
export function barangayOf(tree) {
  return canonicalBarangay(tree?.barangay);
}

/**
 * Totals for a set of trees.
 *
 * `carbonMeasured` and `treeCount` together say how much of the set the carbon
 * figure speaks for. A total built from a third of the inventory is not wrong,
 * but showing it without saying so would be, so every screen that shows the
 * figure shows the coverage beside it.
 */
export function summarise(trees) {
  const rows = Array.isArray(trees) ? trees : [];
  let carbon = 0;
  let measured = 0;
  for (const tree of rows) {
    const co2 = carbonForTree(tree);
    if (co2 === null) continue;
    carbon += co2;
    measured += 1;
  }

  return {
    treeCount: rows.length,
    invasiveCount: rows.filter(isInvasive).length,
    carbonKg: Math.round(carbon),
    carbonMeasured: measured,
  };
}

/**
 * The same totals, grouped by a key — barangay within one LGU, or LGU across
 * the province.
 *
 * Places the records cannot name are left out rather than collected under
 * "Unknown": a bar labelled Unknown says nothing a reader can act on.
 */
export function groupBy(trees, keyOf) {
  const groups = new Map();
  for (const tree of Array.isArray(trees) ? trees : []) {
    const key = keyOf(tree);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tree);
  }

  return [...groups.entries()]
    .map(([name, rows]) => ({ name, ...summarise(rows) }))
    .sort((a, b) => b.treeCount - a.treeCount || a.name.localeCompare(b.name));
}

/**
 * The three pairs, in the order they are shown.
 *
 * Each pair is a column on the dashboard: the first metric above, the second
 * below it, always in this order.
 *
 * `available` says whether a figure has a source today. `hint` is the whole of
 * what the ⓘ beside the figure says — what it measures and where it comes from.
 * There is no footnote; the ⓘ is the only place this is explained, so it has to
 * be complete on its own.
 */
export const METRIC_PAIRS = [
  {
    id: 'trees',
    title: 'Trees and invasive species',
    metrics: [
      {
        key: 'treeCount',
        label: 'Total Number of Trees',
        unit: '',
        tone: 'green',
        available: true,
        hint: 'Every tree tagged in the Green Tag inventory, counted where it stands.',
      },
      {
        key: 'invasiveCount',
        label: 'Number of Invasive Trees',
        unit: '',
        tone: 'red',
        available: true,
        hint: 'Tagged trees the field team recorded as invasive — species that spread at the expense of native ones.',
      },
    ],
  },
  {
    id: 'cover',
    title: 'Cover and growth',
    metrics: [
      {
        key: 'forestCoverHa',
        label: 'Forest / Tree Cover Area',
        unit: 'ha',
        tone: 'green',
        available: false,
        hint: 'The ground covered by trees, in hectares. It arrives with the mapping feature, once tree cover is delineated.',
      },
      {
        key: 'maiAgb',
        label: 'Mean Annual Increment of Above Ground Biomass',
        unit: 'Mg yr⁻¹',
        tone: 'green',
        available: false,
        hint: 'How much standing biomass the trees add each year, after Lasco, et al. It arrives with the mapping feature.',
      },
    ],
  },
  {
    id: 'carbon',
    title: 'Carbon',
    metrics: [
      {
        key: 'carbonKg',
        label: 'Total Estimated Carbon Sequestered',
        unit: 'kg CO₂',
        tone: 'green',
        available: true,
        hint:
          'From the DENR volume equation for Southern Luzon (FMB Technical Bulletin No. 3), ' +
          'using each tree’s diameter at breast height and merchantable height, then wood ' +
          'density, biomass expansion and the IPCC carbon fraction. Trees with no recorded ' +
          'merchantable height are left out rather than guessed at.',
      },
      {
        key: 'carbonEmissionKg',
        label: 'Total Carbon Emission',
        unit: 'kg CO₂',
        tone: 'red',
        available: false,
        hint: 'From the Greenhouse Gases Quantification Sheet, Climate Change Commission (July 31, 2024). The feed is not connected yet.',
      },
    ],
  },
];

/** Every metric, flattened — handy for lookups. */
export const ALL_METRICS = METRIC_PAIRS.flatMap((pair) => pair.metrics);

/** The pair a metric belongs to. */
export const pairOfMetric = (key) => METRIC_PAIRS.find((pair) => pair.metrics.some((m) => m.key === key));

/** Thousands separators, or an em dash when there is nothing to show. */
export function formatFigure(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US');
}
