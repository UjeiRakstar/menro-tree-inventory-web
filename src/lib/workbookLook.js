import { officialName } from './psgc.js';
import { PROVINCE_LOGO, logoFor } from './lguLogos.js';

/**
 * One look for every Excel download (decided 20 October: "for template, that
 * could be yes, but the info and details inside are different"). Each file
 * keeps its own contents; every sheet in it is laid out the same way:
 *
 *   the letterhead   Republic of the Philippines, the LGU or the province,
 *                    the office, and the LGU's seal at the left
 *   the title        and who prepared it, and when
 *   the table        a green heading row that stays in view as you scroll,
 *                    bordered rows, a totals row in bold
 *   the notes        where each figure comes from, under the table
 *   the page         A4, fitted to the page width, the heading row repeated
 *                    on every printed page, and "Page 1 of 3" at the foot
 *
 * The inventory template (treeInventory.js) is the one exception: it is a
 * form for an LGU to fill in and send back, and its first row has to be its
 * headings for the reader to find them again.
 */

export const LOOK = Object.freeze({
  green: 'FF15803D',
  paleGreen: 'FFDCFCE7',
  zebra: 'FFF8FAFC',
  rule: 'FFCBD5E1',
  ink: 'FF0F172A',
  muted: 'FF475569',
});

/** Excel number formats, by the column kinds the attribute tables use. */
const FORMATS = {
  number: '#,##0',
  decimal: '#,##0.0',
  rate: '#,##0.00',
  tonnes: '#,##0.00',
  ha: '#,##0.00',
  kg: '#,##0.0',
  percent: '0.0%',
  coord: '0.000000',
  date: 'yyyy-mm-dd',
};

/**
 * Who a file is from: the heading lines, the office, the seal.
 *
 *   lgu   { psgc, name, label, is_city } — the office's LGU; null for PGENRO
 */
export function officeOf(lgu) {
  if (!lgu) {
    return {
      heading: ['PROVINCE OF LAGUNA', 'REGION IV-A CALABARZON'],
      office: 'Provincial Government Environment and Natural Resources Office',
      place: 'Province of Laguna',
      logo: PROVINCE_LOGO,
    };
  }
  const name = officialName({ psgc: lgu.psgc, label: lgu.label, isCity: lgu.is_city ?? lgu.isCity });
  const city = /^City of /.test(name);
  return {
    heading: [name.toUpperCase(), 'PROVINCE OF LAGUNA', 'REGION IV-A CALABARZON'],
    office: `${city ? 'City' : 'Municipal'} Environment and Natural Resources Office`,
    place: `${name}, Laguna`,
    logo: logoFor(lgu.name) ?? PROVINCE_LOGO,
  };
}

/** A new, empty workbook. ExcelJS is large, so it arrives only when a file is made. */
export async function createWorkbook() {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Green Tag — Laguna Tree Inventory';
  workbook.created = new Date();
  return workbook;
}

/** The workbook as a file to save. */
export async function workbookBlob(workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** What Excel allows a sheet to be called: 31 characters, none of []:*?/\ */
export const sheetName = (name) => String(name).replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'Sheet';

const longDate = (date) => date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

// A seal is fetched once per workbook, however many sheets carry it.
const seals = new WeakMap();
async function sealOf(workbook, url) {
  if (!url) return null;
  const known = seals.get(workbook) ?? new Map();
  seals.set(workbook, known);
  if (!known.has(url)) {
    known.set(
      url,
      (async () => {
        try {
          const response = await fetch(url);
          if (!response.ok) return null;
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
          return workbook.addImage({ base64: btoa(binary), extension: 'png' });
        } catch {
          // A file without its seal is better than no file.
          return null;
        }
      })()
    );
  }
  return known.get(url);
}

/**
 * A sheet in the standard look, with one table on it.
 *
 *   name       the sheet's tab
 *   lgu        whose file it is (officeOf); null for PGENRO
 *   title      what the table is, in capitals as on a report
 *   subtitle   a line under it: the period, the place, the method — optional
 *   preparedBy who made it
 *   columns    [{ label, width?, kind? }] — kind as FORMATS
 *   rows       [[value, …]] in the columns' order; null leaves a cell blank
 *   totals     [value, …] or null
 *   notes      ['…', …] — where the figures come from
 *   landscape  for a wide table
 *
 * Returns the sheet, so a caller can add to it.
 */
export async function addTableSheet(
  workbook,
  { name, lgu = null, title, subtitle = '', preparedBy = '', date = new Date(), columns, rows = [], totals = null, notes = [], landscape = false }
) {
  const sheet = workbook.addWorksheet(sheetName(name));
  const width = Math.max(columns.length, 4);
  const office = officeOf(lgu);

  columns.forEach((column, i) => {
    sheet.getColumn(i + 1).width = column.width ?? Math.min(40, Math.max(11, String(column.label).length + 2));
  });

  // ---- the letterhead
  let r = 0;
  const line = (value, font, height = 15) => {
    r += 1;
    sheet.mergeCells(r, 1, r, width);
    const cell = sheet.getCell(r, 1);
    cell.value = value;
    cell.font = { name: 'Arial', ...font };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet.getRow(r).height = height;
  };
  line('Republic of the Philippines', { size: 9, color: { argb: LOOK.muted } });
  office.heading.forEach((text, i) => line(text, i === 0 ? { size: 11, bold: true } : { size: 9, color: { argb: LOOK.muted } }));
  line(office.office, { size: 10, bold: true, color: { argb: LOOK.green } });
  r += 1;
  line(title, { size: 13, bold: true, color: { argb: LOOK.ink } }, 20);
  if (subtitle) line(subtitle, { size: 9, color: { argb: LOOK.muted } });
  line(`Prepared by ${preparedBy || 'the office'} · ${longDate(date)}`, { size: 9, italic: true, color: { argb: LOOK.muted } });
  r += 1;

  const seal = await sealOf(workbook, office.logo);
  if (seal !== null && seal !== undefined) {
    sheet.addImage(seal, { tl: { col: 0.15, row: 0.15 }, ext: { width: 54, height: 54 }, editAs: 'oneCell' });
  }

  // ---- the table
  r += 1;
  const headingRow = r;
  const heading = sheet.getRow(r);
  columns.forEach((column, i) => {
    const cell = heading.getCell(i + 1);
    cell.value = column.label;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOOK.green } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  heading.height = Math.max(18, 12 * Math.ceil(Math.max(...columns.map((c, i) => String(c.label).length / ((sheet.getColumn(i + 1).width || 11) - 1)))));

  const thin = { style: 'thin', color: { argb: LOOK.rule } };
  const put = (values, { zebra = false, total = false } = {}) => {
    r += 1;
    const row = sheet.getRow(r);
    columns.forEach((column, i) => {
      const cell = row.getCell(i + 1);
      const value = values[i];
      cell.value = value === undefined ? null : value;
      cell.font = { name: 'Arial', size: 9, bold: total };
      if (FORMATS[column.kind]) cell.numFmt = FORMATS[column.kind];
      cell.alignment = { vertical: 'top', wrapText: column.kind === undefined || column.kind === 'text' || column.kind === 'entry' };
      cell.border = total
        ? { top: { style: 'medium', color: { argb: LOOK.green } }, bottom: thin, left: thin, right: thin }
        : { top: thin, bottom: thin, left: thin, right: thin };
      if (total) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOOK.paleGreen } };
      else if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LOOK.zebra } };
    });
  };
  rows.forEach((values, i) => put(values, { zebra: i % 2 === 1 }));
  if (rows.length === 0) {
    r += 1;
    if (columns.length > 1) sheet.mergeCells(r, 1, r, columns.length);
    const cell = sheet.getCell(r, 1);
    cell.value = 'Nothing to list.';
    cell.font = { name: 'Arial', size: 9, italic: true, color: { argb: LOOK.muted } };
  }
  if (totals) put(totals, { total: true });

  // ---- the notes
  if (notes.length) {
    r += 2;
    sheet.getCell(r, 1).value = 'Notes';
    sheet.getCell(r, 1).font = { name: 'Arial', size: 9, bold: true };
    const charsPerLine = Math.max(40, columns.reduce((sum, _, i) => sum + (sheet.getColumn(i + 1).width || 11), 0) * 1.1);
    for (const note of notes) {
      r += 1;
      sheet.mergeCells(r, 1, r, width);
      const cell = sheet.getCell(r, 1);
      cell.value = note;
      cell.font = { name: 'Arial', size: 8, italic: true, color: { argb: LOOK.muted } };
      cell.alignment = { wrapText: true, vertical: 'top' };
      sheet.getRow(r).height = 11 * Math.ceil(String(note).length / charsPerLine) + 2;
    }
  }

  // ---- the page
  sheet.views = [{ state: 'frozen', ySplit: headingRow, showGridLines: false }];
  sheet.pageSetup = {
    paperSize: 9,
    orientation: landscape ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    printTitlesRow: `${headingRow}:${headingRow}`,
  };
  sheet.headerFooter = { oddFooter: `&L&8Green Tag · ${office.place}&R&8Page &P of &N` };
  return sheet;
}
