import { saveAs } from 'file-saver';
import { annualCo2Kg, carbonDioxideKg, whyNoCarbon } from './treeCarbon.js';
import { volumeOf } from './treeVolume.js';
import { addTableSheet, createWorkbook, workbookBlob } from './workbookLook.js';

/**
 * The office's tree inventory as an Excel workbook, in the standard look
 * (workbookLook.js): every tree with its measurements, its timber volume and
 * its carbon, then a summary by barangay.
 *
 * It used to be Santa Cruz's whatever the office, with a volume of π/4 × D² ×
 * H and a flat 62.47 kg of sequestration a tree. The volume is now the DENR's
 * (treeVolume.js) and the carbon Chave et al. 2014's (treeCarbon.js), the same
 * figures as the dashboard and the reports.
 */

const number = (value) => {
  const n = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round = (value, places) => (value === null ? null : Math.round(value * 10 ** places) / 10 ** places);
const dayOf = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
};
const originOf = (tree) => tree.biodiversity_status || tree.species_type || '';

/** The summary by barangay: trees, origin, and what the measured ones hold. */
export function barangaySummary(trees) {
  const byBarangay = new Map();
  for (const tree of trees) {
    const name = String(tree.barangay ?? '').trim() || 'Barangay not recorded';
    const row = byBarangay.get(name) ?? { name, trees: 0, native: 0, invasive: 0, measured: 0, co2: 0, co2Year: 0 };
    row.trees += 1;
    const origin = originOf(tree).toLowerCase();
    if (origin === 'endemic' || origin === 'native') row.native += 1;
    if (origin === 'invasive') row.invasive += 1;
    const co2 = carbonDioxideKg(tree);
    if (co2 !== null) {
      row.measured += 1;
      row.co2 += co2 / 1000;
      row.co2Year += (annualCo2Kg(tree) ?? 0) / 1000;
    }
    byBarangay.set(name, row);
  }
  return [...byBarangay.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Builds the workbook and saves it.
 *
 *   trees       the office's trees, as the inventory page has them
 *   lgu         the office's LGU ({ psgc, name, label, is_city }), or null for PGENRO
 *   preparedBy  who is downloading it
 */
export async function generateMenroExcel(trees, { lgu = null, preparedBy = '' } = {}) {
  const rows = Array.isArray(trees) ? trees : [];
  const workbook = await createWorkbook();

  await addTableSheet(workbook, {
    name: 'Tree inventory',
    lgu,
    title: 'TREE INVENTORY SHEET',
    subtitle: `${rows.length.toLocaleString('en-US')} ${rows.length === 1 ? 'tree' : 'trees'}`,
    preparedBy,
    landscape: true,
    columns: [
      { label: 'No.', kind: 'number', width: 6 },
      { label: 'Species', width: 18 },
      { label: 'Scientific name', width: 22 },
      { label: 'Barangay', width: 18 },
      { label: 'DBH (cm)', kind: 'decimal', width: 9 },
      { label: 'Merchantable height (m)', kind: 'decimal', width: 13 },
      { label: 'Total height (m)', width: 11 },
      { label: 'Timber volume (m³)', kind: 'tonnes', width: 12 },
      { label: 'CO₂ stored above ground (kg)', kind: 'kg', width: 15 },
      { label: 'Not counted for carbon because', width: 24 },
      { label: 'Latitude', kind: 'coord', width: 11 },
      { label: 'Longitude', kind: 'coord', width: 11 },
      { label: 'Category', width: 14 },
      { label: 'Origin', width: 11 },
      { label: 'Date tagged', width: 12 },
    ],
    rows: rows.map((tree, i) => [
      i + 1,
      tree.species || '',
      tree.scientific_name || '',
      tree.barangay || '',
      number(tree.dbh),
      number(tree.merchantable_height),
      tree.total_height ?? null,
      round(volumeOf(tree), 4),
      round(carbonDioxideKg(tree), 1),
      whyNoCarbon(tree) ?? '',
      number(tree.latitude),
      number(tree.longitude),
      tree.tree_category || '',
      originOf(tree),
      dayOf(tree.dateCaptured ?? tree.created_at),
    ]),
    notes: [
      'Timber volume: the DENR Regional Volume Equation for Southern Luzon, V = c × D² × H on the merchantable height (FMB Technical Bulletin No. 3, 2014).',
      'Carbon: Chave et al. (2014), AGB = 0.0673 × (ρD²H)^0.976 on the total height, with the tropical Asian mean wood density of 0.57 g/cm³ ' +
        '(Reyes et al. 1992); carbon 45% of biomass (Lasco & Pulhin 2000); CO₂ = C × 44/12. A height class from an LGU’s inventory counts at its middle.',
      'A blank is a measurement not recorded, never a zero.',
    ],
  });

  const summary = barangaySummary(rows);
  const total = (key) => summary.reduce((sum, row) => sum + row[key], 0);
  await addTableSheet(workbook, {
    name: 'Summary by barangay',
    lgu,
    title: 'TREES AND CARBON BY BARANGAY',
    preparedBy,
    columns: [
      { label: 'Barangay', width: 24 },
      { label: 'Trees', kind: 'number', width: 9 },
      { label: 'Endemic or native', kind: 'number', width: 11 },
      { label: 'Invasive', kind: 'number', width: 10 },
      { label: 'Measured for carbon', kind: 'number', width: 12 },
      { label: 'CO₂ stored above ground (t)', kind: 'tonnes', width: 14 },
      { label: 'CO₂ taken up a year (t)', kind: 'tonnes', width: 14 },
    ],
    rows: summary.map((row) => [row.name, row.trees, row.native, row.invasive, row.measured, row.measured ? row.co2 : null, row.measured ? row.co2Year : null]),
    totals: [`${summary.length} barangays`, total('trees'), total('native'), total('invasive'), total('measured'), total('co2'), total('co2Year')],
    notes: [
      'Only trees with a diameter and a total height are measured for carbon; the rest are counted as trees and left out of the carbon rather than guessed at.',
      'A year’s uptake: the carbon equation after 1.19 cm of diameter growth (Schneider et al. 2013, as applied to city trees by Pansit 2019).',
    ],
  });

  saveAs(await workbookBlob(workbook), `Tree_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
