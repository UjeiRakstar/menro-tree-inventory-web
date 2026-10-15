import { MUNICIPALITY_LIST } from '../lagunaBoundaries.js';
import { lguOfPlace, readCliram } from './cliram.js';

/**
 * CLIRAM downloads, as PGENRO has them — the .zip straight from
 * climap.pagasa.dost.gov.ph, or the .xlsx inside it — read into one climate
 * record per LGU. The spreadsheet and zip libraries are large and only this
 * page needs them, so they arrive when a file is chosen.
 */
const cellValue = (value) => (value && typeof value === 'object' ? value.result ?? value.text ?? value.richText?.map((r) => r.text).join('') ?? '' : value);

async function workbookOf(file) {
  let bytes = await file.arrayBuffer();
  if (/\.zip$/i.test(file.name)) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const entry = Object.values(zip.files).find((f) => !f.dir && /\.xlsx$/i.test(f.name));
    if (!entry) throw new Error('This zip has no CLIRAM workbook (.xlsx) in it.');
    bytes = await entry.async('arraybuffer');
  }
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  return workbook.worksheets.map((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => rows.push(row.values.slice(1).map(cellValue)));
    return { name: sheet.name, rows };
  });
}

/**
 * Each file read: { fileName, climate, lgu } when it worked, { fileName,
 * error } when it did not. `lgu` is the boundaries' entry, or { province:
 * true } for a province-wide workbook.
 */
export async function readClimateFiles(files) {
  const results = [];
  for (const file of files) {
    try {
      const climate = readCliram(await workbookOf(file));
      const lgu = lguOfPlace(climate.place, MUNICIPALITY_LIST);
      results.push(
        lgu
          ? { fileName: file.name, climate, lgu }
          : { fileName: file.name, error: `"${climate.place}" is not a city or municipality of Laguna.` }
      );
    } catch (error) {
      results.push({ fileName: file.name, error: error.message });
    }
  }
  return results;
}
