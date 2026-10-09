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
 * Carbon proxy: 2.5 kg CO₂ per centimetre of diameter at breast height.
 *
 * A stand-in for a species-specific allometric equation, carried over from the
 * first version of this dashboard. Every figure derived from it is labelled an
 * estimate for that reason.
 */
export const CARBON_PER_DBH_CM = 2.5;

/** Carbon held by one tree, in kg CO₂. Zero when it has no usable DBH. */
export function carbonForTree(tree) {
  if (tree?.carbon != null) {
    const direct = parseFloat(tree.carbon);
    if (Number.isFinite(direct)) return direct;
  }
  const dbh = parseFloat(tree?.dbh);
  if (!Number.isFinite(dbh) || dbh <= 0) return 0;
  return dbh * CARBON_PER_DBH_CM;
}

/** Does the record call this tree invasive? */
export function isInvasive(tree) {
  const status = (tree?.biodiversity_status || tree?.species_type || '').toString().toLowerCase();
  return status.trim() === 'invasive';
}

/** Barangay name as it should be grouped and shown, or null when unrecorded. */
export function barangayOf(tree) {
  const raw = (tree?.barangay || '').replace(/^(brgy\.?|barangay)\s+/i, '').trim();
  if (!raw || /^unknown/i.test(raw)) return null;
  return raw;
}

/** Totals for a set of trees. */
export function summarise(trees) {
  const rows = Array.isArray(trees) ? trees : [];
  return {
    treeCount: rows.length,
    invasiveCount: rows.filter(isInvasive).length,
    carbonKg: Math.round(rows.reduce((sum, tree) => sum + carbonForTree(tree), 0)),
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
 * `available` says whether a figure has a source today. `source` is the
 * citation shown in the footnotes and in the ⓘ beside the figure.
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
        source: 'Tagged trees in the Green Tag inventory.',
      },
      {
        key: 'invasiveCount',
        label: 'Number of Invasive Trees',
        unit: '',
        tone: 'red',
        available: true,
        source: 'Tagged trees recorded as invasive by the field team.',
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
        source: 'Will come from the mapping feature, once tree cover is delineated.',
      },
      {
        key: 'maiAgb',
        label: 'MAI AGB',
        unit: 'Mg AGB yr⁻¹',
        tone: 'green',
        available: false,
        hint: 'Mean Annual Increment of Above Ground Biomass (Lasco, et al.)',
        source: 'Mean Annual Increment of Above Ground Biomass (Lasco, et al.). Awaiting the mapping feature.',
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
        hint: `Estimated from each tree's diameter at breast height, at ${CARBON_PER_DBH_CM} kg CO₂ per cm.`,
        source: `Estimated via DBH proxy (${CARBON_PER_DBH_CM} kg CO₂ per cm of diameter at breast height).`,
      },
      {
        key: 'carbonEmissionKg',
        label: 'Total Carbon Emission',
        unit: 'kg CO₂',
        tone: 'red',
        available: false,
        hint: 'Greenhouse Gases Quantification Sheet, Climate Change Commission (July 31, 2024)',
        source:
          'Greenhouse Gases Quantification Sheet, Climate Change Commission (July 31, 2024). Awaiting the emissions feed.',
      },
    ],
  },
];

/** Every metric, flattened — handy for footnotes and lookups. */
export const ALL_METRICS = METRIC_PAIRS.flatMap((pair) => pair.metrics);

/** The pair a metric belongs to. */
export const pairOfMetric = (key) => METRIC_PAIRS.find((pair) => pair.metrics.some((m) => m.key === key));

/** Thousands separators, or an em dash when there is nothing to show. */
export function formatFigure(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US');
}
