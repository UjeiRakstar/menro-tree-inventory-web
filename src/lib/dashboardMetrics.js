import { canonicalBarangay } from './barangayNames.js';
import { annualBiomassKg, annualCo2Kg, carbonDioxideKg } from './treeCarbon.js';
import { volumeOf } from './treeVolume.js';

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
 * Carbon comes from src/lib/treeCarbon.js: Chave et al. 2014, on the diameter
 * and total height the field team records (decided 20 October). Timber volume
 * stays the DENR's (src/lib/treeVolume.js), which needs a merchantable height.
 *
 * It used to be a flat 2.5 kg of CO₂ per centimetre of diameter, which had no
 * source at all, then the DENR volume equation, which most trees lacked the
 * merchantable height for.
 */

/**
 * Carbon held by one tree, in kg CO₂, or null when it has not been measured
 * well enough to say.
 *
 * Null rather than zero: a tree nobody recorded a total height for has
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

/** And its counterpart: native to the Philippines, as the record has it. */
export function isEndemic(tree) {
  const status = (tree?.biodiversity_status || tree?.species_type || '').toString().toLowerCase();
  return status.trim() === 'endemic';
}

/** The species name as it should be counted, or null when unrecorded. */
function canonicalSpecies(tree) {
  const name = String(tree?.species ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!name || /^(unknown|unidentified|n\/?a|none|other)$/.test(name)) return null;
  return name;
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
 * figure speaks for; `volumeMeasured` the same for the timber volume, which
 * needs a merchantable height as well. A total built from a third of the inventory is not wrong,
 * but showing it without saying so would be, so every screen that shows the
 * figure shows the coverage beside it.
 */
export function summarise(trees) {
  const rows = Array.isArray(trees) ? trees : [];
  let carbon = 0;
  let carbonPerYear = 0;
  let volume = 0;
  let biomassPerYear = 0;
  let measured = 0;
  let volumeMeasured = 0;

  for (const tree of rows) {
    // Two equations, two tests: carbon wants a total height, volume a
    // merchantable one, and a tree may have either.
    const co2 = carbonDioxideKg(tree);
    if (co2 !== null) {
      carbon += co2;
      carbonPerYear += annualCo2Kg(tree) ?? 0;
      biomassPerYear += annualBiomassKg(tree) ?? 0;
      measured += 1;
    }
    const cubicMetres = volumeOf(tree);
    if (cubicMetres !== null) {
      volume += cubicMetres;
      volumeMeasured += 1;
    }
  }

  // Diversity and origin, counted here so that grouping by place gets them
  // for free — a chart of species per barangay is the same call as a chart of
  // trees per barangay.
  const species = new Set();
  let endemic = 0;
  for (const tree of rows) {
    const name = canonicalSpecies(tree);
    if (name) species.add(name);
    if (isEndemic(tree)) endemic += 1;
  }

  return {
    treeCount: rows.length,
    speciesCount: species.size,
    endemicCount: endemic,
    invasiveCount: rows.filter(isInvasive).length,
    carbonKg: Math.round(carbon),
    carbonPerYearKg: Math.round(carbonPerYear),
    timberVolumeM3: Math.round(volume * 100) / 100,
    // Kilograms to megagrams: a tonne of biomass is the unit MAI is written in.
    maiAgbMg: Math.round((biomassPerYear / 1000) * 1000) / 1000,
    carbonMeasured: measured,
    volumeMeasured,
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
    id: 'inventory',
    title: 'Trees and species',
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
        key: 'speciesCount',
        label: 'Species Recorded',
        unit: '',
        tone: 'green',
        available: true,
        hint: 'How many different species are tagged here — the diversity figure the Species tab breaks down.',
      },
    ],
  },
  {
    id: 'origin',
    title: 'Native and introduced',
    metrics: [
      {
        key: 'endemicCount',
        label: 'Endemic Trees',
        unit: '',
        tone: 'green',
        available: true,
        hint: 'Tagged trees recorded as endemic — native to the Philippines and part of the local ecosystem.',
      },
      {
        key: 'invasiveCount',
        label: 'Invasive Trees',
        unit: '',
        tone: 'red',
        available: true,
        hint: 'Tagged trees recorded as invasive — introduced species that spread at the expense of native ones.',
      },
    ],
  },
{
    id: 'carbon',
    title: 'Carbon',
    metrics: [
      {
        key: 'carbonKg',
        label: 'Total Estimated Carbon Stored',
        unit: 'kg CO₂',
        tone: 'green',
        available: true,
        hint:
          'How much carbon the trees hold above ground TODAY — a stock, not a rate. ' +
          'From Chave et al. (2014), the equation Pansit (2019) applies to Philippine city trees, ' +
          'using each tree’s diameter at breast height and total height. Trees with no recorded ' +
          'total height are left out rather than guessed at.' +
          ' Then the carbon content of Philippine wood (Lasco & Pulhin 2000).',
      },
      {
        key: 'carbonPerYearKg',
        label: 'Estimated Carbon Sequestered per Year',
        unit: 'kg CO₂ per year',
        tone: 'green',
        available: true,
        hint:
          'How much carbon the trees take up EACH YEAR — a rate, which is what climate ' +
          'commitments are written in. From a year of growth put through the same equation: ' +
          '1.19 cm of diameter a year, measured on Leyte (Schneider et al. 2013) and applied to ' +
          'city trees by Pansit (2019), with the height held where it is so the figure leans low.',
      },
    ],
  },
];

/**
 * The two figures a forester wants and a resident does not.
 *
 * Standing volume and mean annual increment are inventory terms: they are how
 * a stand is reported to the DENR, and neither means much to someone asking
 * what is growing near them. They are kept, because MENRO and the DSS need
 * them, but behind a tab rather than in a headline a public page owes its
 * public.
 *
 * Carbon deliberately did NOT come down here with them. "These trees hold
 * 371,786 kg of CO2" is the most publicly legible figure on the page and the
 * one a city reports against; filing it under forestry would bury the single
 * number connecting a tree to something a reader already cares about.
 */
export const FORESTRY_PAIR = {
  id: 'wood',
  title: 'Wood and growth',
  metrics: [
      {
        key: 'timberVolumeM3',
        label: 'Standing Timber Volume',
        unit: 'm³',
        tone: 'green',
        available: true,
        hint:
          'From the DENR volume equation for Southern Luzon (FMB Technical Bulletin No. 3), ' +
          'using each tree’s diameter at breast height and merchantable height. Trees with no ' +
          'recorded merchantable height are left out rather than guessed at.' +
          ' Nothing is assumed beyond the equation itself.',
      },
      {
        key: 'maiAgbMg',
        label: 'Mean Annual Increment of Above Ground Biomass',
        unit: 'Mg per year',
        tone: 'green',
        available: true,
        hint:
          'How much biomass the tagged trees add above ground in a year: Chave et al. (2014) ' +
          'applied twice, to each tree as it is and after a year of growth (1.19 cm of diameter, ' +
          'Schneider et al. 2013). For the TAGGED TREES, not per hectare — a per-hectare figure ' +
          'needs a plot survey.',
      },
    ],
};

/**
 * Figures the page is asked for and cannot yet give.
 *
 * They are shown, because the public looks for them and a dashboard that
 * silently omitted them would look as though nobody had thought of it. They
 * are shown SMALL, at the foot, because an empty figure should not hold a
 * quarter of the headline.
 *
 * Unlike the six above, neither of these is waiting on arithmetic. They are
 * waiting on another system entirely.
 */
export const PENDING_METRICS = [
  {
    key: 'forestCoverHa',
    label: 'Forest / Tree Cover Area',
    unit: 'ha',
    // Shown here only until an office saves a tree cover area on its map;
    // then the page shows the mapped figure instead (src/lib/mappedCover.js).
    waitingOn:
      'the LGU offices mapping their tree cover on the office map. None has been saved yet — the areas on the public map are samples until then, and samples are not counted',
  },
  {
    key: 'carbonEmissionKg',
    label: 'Total Carbon Emission',
    unit: 'kg CO₂',
    waitingOn:
      'the Greenhouse Gases Quantification Sheet (Climate Change Commission, 31 July 2024), which comes from outside this system',
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
