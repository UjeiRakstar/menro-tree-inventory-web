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
export async function downloadPermitReport({ permits, lguOf, labelOf, from = '', to = '' }) {
  const [{ default: ExcelJS }, { saveAs }] = await Promise.all([import('exceljs'), import('file-saver')]);
  const chosen = permitsBetween(permits, from, to);
  const period = from || to ? `${from || 'the start'} to ${to || 'today'}` : 'all dates';

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Green Tag — PGENRO Laguna';

  const summary = workbook.addWorksheet('Summary');
  summary.addRow([`Tree cutting permits by LGU, ${period}`]).font = { bold: true, size: 13 };
  summary.addRow([]);
  summary.addRow(['City / municipality', 'Permits', 'Trees covered']).font = { bold: true };
  const rows = summarisePermits(chosen, lguOf, labelOf);
  for (const row of rows) summary.addRow([row.label, row.permits, row.trees]);
  summary.addRow([
    'Laguna',
    rows.reduce((sum, row) => sum + row.permits, 0),
    rows.reduce((sum, row) => sum + row.trees, 0),
  ]).font = { bold: true };
  summary.columns = [{ width: 32 }, { width: 12 }, { width: 16 }];

  const sheet = workbook.addWorksheet('Permits');
  sheet.columns = [
    { header: 'Issued', key: 'issued', width: 12 },
    { header: 'City / municipality', key: 'lgu', width: 24 },
    { header: 'Client', key: 'client', width: 24 },
    { header: 'Reason', key: 'reason', width: 40 },
    { header: 'Species', key: 'species', width: 18 },
    { header: 'Trees', key: 'trees', width: 8 },
    { header: 'Address', key: 'address', width: 32 },
    { header: 'Archived', key: 'archived', width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const permit of chosen) {
    sheet.addRow({
      issued: dayOf(permit.created_at),
      lgu: labelOf(lguOf(permit)),
      client: permit.client_name ?? '',
      reason: permit.reason ?? '',
      species: permit.species ?? '',
      trees: treesCovered(permit),
      address: permit.address ?? '',
      archived: permit.archived_at ? 'Yes' : '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `permits-by-lgu-${stamp}.xlsx`
  );
  return { permits: chosen.length };
}
