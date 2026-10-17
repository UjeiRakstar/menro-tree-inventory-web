import { PIN_COLOR, classifyPinColor } from './pinColor.js';
import { lguOfTree } from '../hooks/useAttention.js';
import { namriaClassById } from './namriaCover.js';

/**
 * PGENRO's view of the Action Board: the province at a glance, LGU by LGU.
 *
 * Counts only. The work itself — dispatching, re-assigning, issuing permits —
 * stays with each MENRO/CENRO; the province sees where it is piling up and
 * where it is moving, and can open the trees or areas behind any number.
 *
 * Three kinds of figure, in the order the columns read:
 *
 *   needs action   hazards nobody has been sent to; hazards an arborist is
 *                  on; public tags awaiting a field check; permits issued
 *   watch list     stems graded Code 3, several defects (the field app's
 *                  stem quality, tree_details_screen.dart) — the grade most
 *                  likely to become tomorrow's hazard. Codes 1 and 2 are
 *                  sound and mildly flawed stems: counted province-wide they
 *                  call for nothing, so they are not on the board.
 *   progress       trees tagged in the last 30 days — which LGUs are
 *                  actively inventorying; land cover areas mapped; tree
 *                  planting sites open for planting
 *
 * Whether each LGU has an active MENRO / CENRO account at all is its own
 * column (officesByLgu), not a count of trees.
 */

const stemCode = (tree) => {
  const match = /code\s*([123])/i.exec(String(tree?.stem_quality ?? ''));
  return match ? Number(match[1]) : null;
};

export const RECENT_DAYS = 30;
const DAY_MS = 86400000;

/** When a tree was tagged: the field app's capture date, or the row's. */
const taggedAt = (tree) => {
  const time = Date.parse(tree?.dateCaptured ?? tree?.created_at ?? '');
  return Number.isFinite(time) ? time : null;
};

/** What is counted, in the order the columns read. Each has a test for one row. */
export const BOARD_METRICS = Object.freeze([
  {
    key: 'undispatched',
    group: 'action',
    label: 'Hazards, nobody sent',
    short: 'Not sent',
    tone: 'red',
    of: 'trees',
    test: (tree) => classifyPinColor(tree) === PIN_COLOR.RED,
  },
  {
    key: 'dispatched',
    group: 'action',
    label: 'Hazards, arborist on it',
    short: 'Sent',
    tone: 'orange',
    of: 'trees',
    test: (tree) => classifyPinColor(tree) === PIN_COLOR.ORANGE,
  },
  {
    key: 'tags',
    group: 'action',
    label: 'Public tags awaiting a field check',
    short: 'Tags',
    tone: 'grey',
    of: 'tags',
    test: () => true,
  },
  {
    key: 'permitted',
    group: 'action',
    label: 'Cutting permit issued',
    short: 'Permits',
    tone: 'yellow',
    of: 'trees',
    test: (tree) => Boolean(tree.has_cutting_permit || tree.hasCuttingPermit),
  },
  {
    key: 'code3',
    group: 'watch',
    label: 'Stem Code 3 — several defects, to watch',
    short: 'Code 3',
    tone: 'amber',
    of: 'trees',
    test: (tree) => stemCode(tree) === 3,
  },
  {
    key: 'recent',
    group: 'progress',
    label: `Trees tagged in the last ${RECENT_DAYS} days`,
    short: `New (${RECENT_DAYS}d)`,
    tone: 'green',
    of: 'trees',
    test: (tree, { now = Date.now() } = {}) => {
      const at = taggedAt(tree);
      return at !== null && at <= now && now - at <= RECENT_DAYS * DAY_MS;
    },
  },
  {
    key: 'mapped',
    group: 'progress',
    label: 'Land cover areas mapped',
    short: 'Areas',
    tone: 'teal',
    of: 'areas',
    test: (area) => area.kind === 'land-cover',
  },
  {
    key: 'sitesOpen',
    group: 'progress',
    label: 'Tree planting sites open for planting',
    short: 'Sites open',
    tone: 'lime',
    of: 'areas',
    test: (area) => area.kind === 'planting-site' && (area.planting_status ?? 'open') === 'open',
  },
]);

export const metricByKey = (key) => BOARD_METRICS.find((metric) => metric.key === key) ?? null;

/** A tag still waiting for somebody to check it in the field. */
export const isOpenTag = (tag) => !tag?.status || tag.status === 'pending' || tag.status === 'dispatched';

/** Which LGU a tag or an area was filed under, or null. */
const lguOfRow = (row) => {
  const code = Number(row?.lgu_psgc);
  return Number.isFinite(code) && code > 0 ? code : null;
};
export const lguOfTag = lguOfRow;
export const lguOfArea = lguOfRow;

/** An area's hectares if it is tree cover, else 0. */
export const treeCoverHa = (area) =>
  area?.kind === 'land-cover' && namriaClassById(area.cover_class)?.treeCover ? (Number(area.area_m2) || 0) / 10000 : 0;

const emptyCounts = () => Object.fromEntries(BOARD_METRICS.map((metric) => [metric.key, 0]));

/**
 * Every count, per LGU and for the province.
 *
 * Trees already cut are left out — a stump needs nobody — as the office map
 * does. Anything with no LGU is counted under `null`, so nothing quietly
 * disappears from the province total.
 *
 * Returns { byLgu: Map(lgu → { trees, coverHa, counts }), totals }.
 */
export function tallyBoard(trees = [], tags = [], areas = [], { now = Date.now() } = {}) {
  const byLgu = new Map();
  const totals = { trees: 0, coverHa: 0, counts: emptyCounts() };
  const entry = (lgu) => {
    if (!byLgu.has(lgu)) byLgu.set(lgu, { trees: 0, coverHa: 0, counts: emptyCounts() });
    return byLgu.get(lgu);
  };
  const count = (row, key) => {
    row.counts[key] += 1;
    totals.counts[key] += 1;
  };

  for (const tree of Array.isArray(trees) ? trees : []) {
    if (!tree || tree.task_status === 'Cut') continue;
    const row = entry(lguOfTree(tree));
    row.trees += 1;
    totals.trees += 1;
    for (const metric of BOARD_METRICS) {
      if (metric.of === 'trees' && metric.test(tree, { now })) count(row, metric.key);
    }
  }

  for (const tag of Array.isArray(tags) ? tags : []) {
    if (!tag || !isOpenTag(tag)) continue;
    count(entry(lguOfTag(tag)), 'tags');
  }

  for (const area of Array.isArray(areas) ? areas : []) {
    if (!area) continue;
    const row = entry(lguOfArea(area));
    for (const metric of BOARD_METRICS) {
      if (metric.of === 'areas' && metric.test(area)) count(row, metric.key);
    }
    const ha = treeCoverHa(area);
    row.coverHa += ha;
    totals.coverHa += ha;
  }

  return { byLgu, totals };
}

/**
 * Each LGU's active MENRO / CENRO accounts — real ones; a trainee is not an
 * office. `profiles` as PGENRO reads them.
 */
export function officesByLgu(profiles = []) {
  const offices = new Map();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (profile?.role !== 'lgu_admin' || profile.status !== 'active' || profile.is_training) continue;
    const lgu = Number(profile.lgu_psgc);
    offices.set(lgu, (offices.get(lgu) ?? 0) + 1);
  }
  return offices;
}

/**
 * The rows behind one number: a metric, in one LGU or — with lgu undefined —
 * the whole province.
 */
export function rowsBehind(metricKey, lgu, trees = [], tags = [], areas = [], { now = Date.now() } = {}) {
  const metric = metricByKey(metricKey);
  if (!metric) return [];
  const inLgu = (code) => lgu === undefined || code === lgu;
  if (metric.of === 'tags') {
    return tags.filter((tag) => tag && isOpenTag(tag) && inLgu(lguOfTag(tag)));
  }
  if (metric.of === 'areas') {
    return areas.filter((area) => area && metric.test(area) && inLgu(lguOfArea(area)));
  }
  return trees.filter(
    (tree) => tree && tree.task_status !== 'Cut' && metric.test(tree, { now }) && inLgu(lguOfTree(tree))
  );
}

/** Where "View on map" goes for one row: the office map opens it by id. */
export function mapLinkFor(row, { of = 'trees' } = {}) {
  if (of === 'areas') return `/map?area=${encodeURIComponent(row.id)}`;
  return `/map?tree=${encodeURIComponent(of === 'tags' ? `pending-${row.id}` : row.id)}`;
}

/**
 * The rows behind a province-wide number, by the city or municipality each is
 * in: [{ lgu, rows }], the LGU with most first, those placed nowhere last.
 */
export function rowsByLgu(rows, { of = 'trees' } = {}) {
  const lguOf = of === 'trees' ? lguOfTree : lguOfRow;
  const groups = new Map();
  for (const row of rows ?? []) {
    const lgu = lguOf(row);
    if (!groups.has(lgu)) groups.set(lgu, []);
    groups.get(lgu).push(row);
  }
  return [...groups]
    .map(([lgu, list]) => ({ lgu, rows: list }))
    .sort((a, b) => (a.lgu === null) - (b.lgu === null) || b.rows.length - a.rows.length);
}
