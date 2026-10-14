import { PIN_COLOR, classifyPinColor } from './pinColor.js';
import { lguOfTree } from '../hooks/useAttention.js';

/**
 * PGENRO's view of the Action Board: how much needs doing, LGU by LGU.
 *
 * Counts only. The work itself — dispatching, re-assigning, issuing permits —
 * stays with each MENRO/CENRO; the province sees where it is piling up and can
 * open the trees behind any number.
 *
 * Stem quality is the field app's: Code 1 straight with no defects, Code 2
 * little defects, Code 3 several defects (tree_details_screen.dart).
 */

const stemCode = (tree) => {
  const match = /code\s*([123])/i.exec(String(tree?.stem_quality ?? ''));
  return match ? Number(match[1]) : null;
};

/** What is counted, in the order the columns read. Each has a test for one row. */
export const BOARD_METRICS = Object.freeze([
  {
    key: 'undispatched',
    label: 'Hazards, nobody sent',
    short: 'Not sent',
    tone: 'red',
    of: 'trees',
    test: (tree) => classifyPinColor(tree) === PIN_COLOR.RED,
  },
  {
    key: 'dispatched',
    label: 'Hazards, arborist on it',
    short: 'Sent',
    tone: 'orange',
    of: 'trees',
    test: (tree) => classifyPinColor(tree) === PIN_COLOR.ORANGE,
  },
  {
    key: 'tags',
    label: 'Public tags awaiting a field check',
    short: 'Tags',
    tone: 'grey',
    of: 'tags',
    test: () => true,
  },
  {
    key: 'code3',
    label: 'Stem quality Code 3 — several defects',
    short: 'Code 3',
    tone: 'amber',
    of: 'trees',
    test: (tree) => stemCode(tree) === 3,
  },
  {
    key: 'code2',
    label: 'Stem quality Code 2 — little defects',
    short: 'Code 2',
    tone: 'yellow',
    of: 'trees',
    test: (tree) => stemCode(tree) === 2,
  },
  {
    key: 'code1',
    label: 'Stem quality Code 1 — no defects',
    short: 'Code 1',
    tone: 'green',
    of: 'trees',
    test: (tree) => stemCode(tree) === 1,
  },
  {
    key: 'permitted',
    label: 'Cutting permit issued',
    short: 'Permits',
    tone: 'yellow',
    of: 'trees',
    test: (tree) => Boolean(tree.has_cutting_permit || tree.hasCuttingPermit),
  },
]);

export const metricByKey = (key) => BOARD_METRICS.find((metric) => metric.key === key) ?? null;

/** A tag still waiting for somebody to check it in the field. */
export const isOpenTag = (tag) => !tag?.status || tag.status === 'pending' || tag.status === 'dispatched';

/** Which LGU a tag was routed to (tag_routing.sql), or null. */
export const lguOfTag = (tag) => {
  const code = Number(tag?.lgu_psgc);
  return Number.isFinite(code) && code > 0 ? code : null;
};

const emptyCounts = () => Object.fromEntries(BOARD_METRICS.map((metric) => [metric.key, 0]));

/**
 * Every count, per LGU and for the province.
 *
 * Trees already cut are left out — a stump needs nobody — as the office map
 * does. A tree or tag with no LGU is counted under `null`, so nothing quietly
 * disappears from the province total.
 *
 * Returns { byLgu: Map(lgu → { trees, counts }), totals: { trees, counts } }.
 */
export function tallyBoard(trees = [], tags = []) {
  const byLgu = new Map();
  const totals = { trees: 0, counts: emptyCounts() };
  const entry = (lgu) => {
    if (!byLgu.has(lgu)) byLgu.set(lgu, { trees: 0, counts: emptyCounts() });
    return byLgu.get(lgu);
  };

  for (const tree of Array.isArray(trees) ? trees : []) {
    if (!tree || tree.task_status === 'Cut') continue;
    const row = entry(lguOfTree(tree));
    row.trees += 1;
    totals.trees += 1;
    for (const metric of BOARD_METRICS) {
      if (metric.of === 'trees' && metric.test(tree)) {
        row.counts[metric.key] += 1;
        totals.counts[metric.key] += 1;
      }
    }
  }

  for (const tag of Array.isArray(tags) ? tags : []) {
    if (!tag || !isOpenTag(tag)) continue;
    entry(lguOfTag(tag)).counts.tags += 1;
    totals.counts.tags += 1;
  }

  return { byLgu, totals };
}

/**
 * The trees (or tags) behind one number: a metric, in one LGU or — with
 * lgu undefined — the whole province.
 */
export function rowsBehind(metricKey, lgu, trees = [], tags = []) {
  const metric = metricByKey(metricKey);
  if (!metric) return [];
  const inLgu = (code) => lgu === undefined || code === lgu;
  if (metric.of === 'tags') {
    return tags.filter((tag) => tag && isOpenTag(tag) && inLgu(lguOfTag(tag)));
  }
  return trees.filter(
    (tree) => tree && tree.task_status !== 'Cut' && metric.test(tree) && inLgu(lguOfTree(tree))
  );
}

/** Where "View on map" goes for one row: the office map opens it by id. */
export const mapLinkFor = (row, { tag = false } = {}) =>
  `/map?tree=${encodeURIComponent(tag ? `pending-${row.id}` : row.id)}`;
