import { lguOfTree } from '../hooks/useAttention.js';
import { municipalityAt } from './lagunaBoundaries.js';

/**
 * Which LGU a permit belongs to.
 *
 * public.permits carries no LGU of its own. A permit for a tagged tree takes
 * the tree's; a walk-in permit for an untagged tree has the point it was
 * issued for, and the town boundaries say where that is. Failing both, null:
 * the permit is listed as not placed rather than left out.
 */
export function lguOfPermit(permit, { treesById, lguByName }) {
  const tree = permit?.tree_id != null ? treesById.get(String(permit.tree_id)) : null;
  const fromTree = tree ? lguOfTree(tree) : null;
  if (fromTree) return fromTree;

  const lat = Number(permit?.latitude);
  const lng = Number(permit?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    const name = municipalityAt([lat, lng]);
    if (name) return lguByName.get(name.toLowerCase()) ?? null;
  }
  return null;
}

/**
 * The same, from a permit alone — for a list that has not loaded the trees:
 * the LGU the database stamped on it (permits_fence.sql), or failing that,
 * the town its point falls in.
 */
export function lguOfPermitRow(permit, lguByName) {
  if (permit?.lgu_psgc != null) return Number(permit.lgu_psgc);
  const lat = Number(permit?.latitude);
  const lng = Number(permit?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  const name = municipalityAt([lat, lng]);
  return name ? lguByName.get(name.toLowerCase()) ?? null : null;
}

/** How many trees a permit covers: a walk-in permit can cover several. */
export const treesCovered = (permit) => {
  const n = Number(permit?.number_of_trees);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const dayOf = (value) => (value ? String(value).slice(0, 10) : '');

/** Permits issued between two days, inclusive; either end may be open. */
export function permitsBetween(permits, from = '', to = '') {
  return permits.filter((permit) => {
    const day = dayOf(permit.created_at);
    if (from && (!day || day < from)) return false;
    if (to && (!day || day > to)) return false;
    return true;
  });
}

/**
 * The report's summary: per LGU, permits and the trees they cover, most first.
 * `lguOf` gives a permit's LGU code; `labelOf` turns a code into a name.
 */
export function summarisePermits(permits, lguOf, labelOf) {
  const rows = new Map();
  for (const permit of permits) {
    const lgu = lguOf(permit);
    const row = rows.get(lgu) ?? { lgu, label: labelOf(lgu), permits: 0, trees: 0 };
    row.permits += 1;
    row.trees += treesCovered(permit);
    rows.set(lgu, row);
  }
  return [...rows.values()].sort((a, b) => b.permits - a.permits || a.label.localeCompare(b.label));
}

/**
 * The report as a workbook: a summary sheet, then every permit with its LGU.
 * ExcelJS is large, so it arrives only when a report is asked for.
 */
export async function downloadPermitReport({ permits, lguOf, labelOf, from = '', to = '', preparedBy = 'PGENRO Laguna' }) {
  const [{ addTableSheet, createWorkbook, workbookBlob }, { saveAs }] = await Promise.all([import('./workbookLook.js'), import('file-saver')]);
  const chosen = permitsBetween(permits, from, to);
  const period = from || to ? `${from || 'the start'} to ${to || 'today'}` : 'all dates';

  const workbook = await createWorkbook();
  const rows = summarisePermits(chosen, lguOf, labelOf);
  await addTableSheet(workbook, {
    name: 'Summary',
    title: 'TREE CUTTING PERMITS BY CITY AND MUNICIPALITY',
    subtitle: `Issued ${period === 'all dates' ? 'on all dates' : period}`,
    preparedBy,
    columns: [{ label: 'City / municipality', width: 32 }, { label: 'Permits', kind: 'number', width: 12 }, { label: 'Trees covered', kind: 'number', width: 16 }],
    rows: rows.map((row) => [row.label, row.permits, row.trees]),
    totals: ['Laguna', rows.reduce((sum, row) => sum + row.permits, 0), rows.reduce((sum, row) => sum + row.trees, 0)],
    notes: ['Each permit is counted in the LGU its tree stands in, or where a walk-in permit was issued for; one with neither is "Not placed".'],
  });
  await addTableSheet(workbook, {
    name: 'Permits',
    title: 'TREE CUTTING PERMITS',
    subtitle: `Issued ${period === 'all dates' ? 'on all dates' : period}`,
    preparedBy,
    landscape: true,
    columns: [
      { label: 'Issued', width: 12 },
      { label: 'City / municipality', width: 22 },
      { label: 'Client', width: 24 },
      { label: 'Reason', width: 38 },
      { label: 'Species', width: 18 },
      { label: 'Trees', kind: 'number', width: 8 },
      { label: 'Address', width: 30 },
      { label: 'Archived', width: 10 },
    ],
    rows: chosen.map((permit) => [
      dayOf(permit.created_at),
      labelOf(lguOf(permit)),
      permit.client_name ?? '',
      permit.reason ?? '',
      permit.species ?? '',
      treesCovered(permit),
      permit.address ?? '',
      permit.archived_at ? 'Yes' : '',
    ]),
  });

  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(await workbookBlob(workbook), `permits-by-lgu-${stamp}.xlsx`);
  return { permits: chosen.length };
}
