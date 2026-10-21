import { addTableSheet, createWorkbook, workbookBlob } from './workbookLook.js';
import { treesCovered } from './permitLogs.js';

/**
 * The tree cutting permit report (21 October): the permits of a year, a
 * quarter, a month or a range of dates, summed by a group and listed in
 * full. There is no official form for it, so this is its template — the
 * letterhead and the standard look of every download (workbookLook.js), a
 * summary by the group chosen, then every permit.
 */

export const PERIOD_KINDS = Object.freeze([
  { id: 'year', label: 'A year' },
  { id: 'quarter', label: 'A quarter' },
  { id: 'month', label: 'A month' },
  { id: 'range', label: 'Dates of your choice' },
]);

export const MONTH_NAMES = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

/** What the report can be summed by; city or municipality only where there are several. */
export const GROUPINGS = Object.freeze([
  { id: 'lgu', label: 'City or municipality', provinceOnly: true },
  { id: 'species', label: 'Species' },
  { id: 'status', label: 'Status' },
  { id: 'month', label: 'Month issued' },
]);

const day = (date) => date.toISOString().slice(0, 10);

/**
 * The period as dates, start inclusive and end exclusive, and how to name it.
 *   { kind, year, quarter (1–4), month (1–12), from, to ('YYYY-MM-DD') }
 * Null when the period is not complete.
 */
export function periodOf({ kind, year, quarter, month, from, to }) {
  const y = Number(year);
  if (kind === 'year' && y) return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: `Calendar year ${y}` };
  if (kind === 'quarter' && y && quarter >= 1 && quarter <= 4) {
    const first = (quarter - 1) * 3;
    return {
      start: new Date(y, first, 1),
      end: new Date(y, first + 3, 1),
      label: `Quarter ${quarter} (${MONTH_NAMES[first]} to ${MONTH_NAMES[first + 2]}) ${y}`,
    };
  }
  if (kind === 'month' && y && month >= 1 && month <= 12) {
    return { start: new Date(y, month - 1, 1), end: new Date(y, month, 1), label: `${MONTH_NAMES[month - 1]} ${y}` };
  }
  if (kind === 'range' && from && to && from <= to) {
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    return { start: new Date(fy, fm - 1, fd), end: new Date(ty, tm - 1, td + 1), label: `${from} to ${to}` };
  }
  return null;
}

/** The permits issued in the period. */
export function permitsIn(permits, period) {
  if (!period) return [];
  return (Array.isArray(permits) ? permits : []).filter((permit) => {
    const issued = permit?.created_at ? new Date(permit.created_at) : null;
    return issued && !Number.isNaN(issued.getTime()) && issued >= period.start && issued < period.end;
  });
}

/**
 * The permits in groups, the largest first.
 *   by        a GROUPINGS id
 *   lguOf     the permit's LGU label (for 'lgu')
 */
export function groupPermits(permits, by, { lguOf = () => null } = {}) {
  const keyOf = {
    lgu: (p) => lguOf(p) ?? 'Not placed in an LGU',
    species: (p) => String(p.species ?? '').trim() || 'Species not given',
    status: (p) => p.status || 'Pending',
    month: (p) => {
      const date = new Date(p.created_at);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')} ${MONTH_NAMES[date.getMonth()]}`;
    },
  }[by] ?? (() => 'All permits');
  const groups = new Map();
  for (const permit of permits) {
    const name = keyOf(permit);
    const group = groups.get(name) ?? { name, permits: [], trees: 0 };
    group.permits.push(permit);
    group.trees += treesCovered(permit);
    groups.set(name, group);
  }
  const ordered = [...groups.values()];
  return by === 'month'
    ? ordered.sort((a, b) => a.name.localeCompare(b.name))
    : ordered.sort((a, b) => b.permits.length - a.permits.length || a.name.localeCompare(b.name));
}

/** "2026-03 March" → "March 2026", for a month group's name on paper. */
export const groupLabel = (by, name) => (by === 'month' ? `${name.slice(8)} ${name.slice(0, 4)}` : name);

/**
 * The report as an Excel workbook (a Blob): the summary, then every permit.
 *   lgu         the office's LGU ({ psgc, name, label, isCity }), or null for PGENRO
 *   lguOf       a permit's LGU label
 */
export async function permitReportWorkbook({ permits, period, by, lgu = null, lguOf = () => null, preparedBy = '' }) {
  const chosen = permitsIn(permits, period);
  const groups = groupPermits(chosen, by, { lguOf });
  const grouping = GROUPINGS.find((g) => g.id === by)?.label ?? 'Group';
  const workbook = await createWorkbook();
  const issued = (p) => (p.created_at ? day(new Date(p.created_at)) : '');

  await addTableSheet(workbook, {
    name: 'Summary',
    lgu,
    title: 'TREE CUTTING PERMIT REPORT',
    subtitle: `${period.label} · by ${grouping.toLowerCase()}`,
    preparedBy,
    columns: [
      { label: grouping, width: 30 },
      { label: 'Permits', kind: 'number', width: 11 },
      { label: 'Trees covered', kind: 'number', width: 14 },
      { label: 'Share of the permits', kind: 'percent', width: 14 },
    ],
    rows: groups.map((g) => [groupLabel(by, g.name), g.permits.length, g.trees, chosen.length ? g.permits.length / chosen.length : null]),
    totals: ['All', chosen.length, groups.reduce((sum, g) => sum + g.trees, 0), chosen.length ? 1 : null],
    notes: [
      'Permits counted by the day they were issued. A walk-in permit can cover several trees.',
      lgu ? '' : 'Each permit is in the LGU its tree stands in, or where a walk-in permit was issued for; one with neither is "Not placed in an LGU".',
    ].filter(Boolean),
  });

  await addTableSheet(workbook, {
    name: 'Permits',
    lgu,
    title: 'TREE CUTTING PERMITS',
    subtitle: period.label,
    preparedBy,
    landscape: true,
    columns: [
      { label: grouping, width: 20 },
      { label: 'Issued', width: 11 },
      { label: 'Client', width: 22 },
      { label: 'Address', width: 26 },
      ...(lgu ? [] : [{ label: 'City / municipality', width: 18 }]),
      { label: 'Species', width: 16 },
      { label: 'Trees', kind: 'number', width: 8 },
      { label: 'Reason', width: 30 },
      { label: 'Status', width: 10 },
    ],
    rows: groups.flatMap((g) =>
      g.permits.map((p) => [
        groupLabel(by, g.name),
        issued(p),
        p.client_name || '',
        p.address || '',
        ...(lgu ? [] : [lguOf(p) ?? 'Not placed']),
        p.species || '',
        treesCovered(p),
        p.reason || '',
        p.status || 'Pending',
      ])
    ),
  });

  return workbookBlob(workbook);
}
