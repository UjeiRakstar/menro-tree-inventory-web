/**
 * CSV_String builder for the Central_Inventory Master_Data_Table export.
 *
 * Pure string-building module: no DOM, no Blob, no network. The DOM-side
 * download wiring (Blob, object URL, hidden anchor click) lives inline in
 * `src/pages/InventoryView.jsx` per the Phase 4 design so this module stays
 * trivially unit-testable.
 */

import { classifyHazard } from './hazardStatus.js';
import { classifyPermit } from './permitStatus.js';

/**
 * Column names for the CSV header row, in output order. Exported as a named
 * constant so tests can pin the exact header contract without hard-coding
 * the string in two places.
 *
 * @readonly
 * @type {readonly string[]}
 */
export const CSV_HEADER = [
  'tree_id',
  'species',
  'dbh',
  'hazard_status',
  'permit_status',
  'assigned_to',
];

/**
 * RFC 4180 quoting of a single CSV field.
 *
 * Rules:
 *   - `null` or `undefined`               → empty string
 *   - contains `,`, `"`, `\r`, or `\n`    → wrap in `"..."`, doubling `"` → `""`
 *   - anything else                       → `String(value)` unchanged
 *
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
export function quoteCsvField(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build the full CSV_String for a Tree_Record_List. Pure function; reads no
 * state outside `records` and performs no I/O.
 *
 * Row order matches `records`. Rows are joined with `\r\n` per RFC 4180 and a
 * trailing `\r\n` is emitted so editors that require a final newline (Excel,
 * LibreOffice) parse the last row correctly.
 *
 * Data rows use `classifyHazard` for the `hazard_status` column and
 * `classifyPermit` for the `permit_status` column.
 *
 * @param {import('../types.js').TreeRecord[]} records
 * @returns {string}
 */
export function buildTreeInventoryCsv(records) {
  const lines = [CSV_HEADER.map(quoteCsvField).join(',')];
  for (const r of records) {
    lines.push(
      [
        quoteCsvField(r.tree_id),
        quoteCsvField(r.species),
        quoteCsvField(r.dbh),
        quoteCsvField(classifyHazard(r)),
        quoteCsvField(classifyPermit(r)),
        quoteCsvField(r.assigned_to),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
