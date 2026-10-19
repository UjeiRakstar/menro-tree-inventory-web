import { municipalityAt } from './lagunaBoundaries.js';
import { looksLikeAPerson, personalByName } from './privacyFields.js';

/**
 * An office's existing tree inventory, in one standard spreadsheet (Round D).
 *
 * Every LGU kept its inventory its own way. The template below is the one the
 * system reads; its trees come in as unverified tags (pending_trees, source
 * 'import', supabase/community.sql), grey on the map until a field officer
 * visits each, takes its photos and verifies it.
 *
 * PROVISIONAL: the standard template is the user's to make (PARKED.md). The
 * reader matches columns by name, aliases included, so a template with these
 * columns under slightly different headings reads the same.
 *
 * Only the columns below are read. Any other column is left behind, which is
 * how an owner's name in a column of its own never reaches the database
 * (RA 10173); a remark that may name someone is blanked as well.
 */
export const INVENTORY_COLUMNS = [
  { key: 'tree_no', header: 'Tree No.', width: 10, aliases: ['tree no', 'tree number', 'no', 'tree id', 'id', 'tag no', 'tag number'] },
  { key: 'common_name', header: 'Common name', width: 20, aliases: ['common name', 'species', 'local name', 'name of tree', 'tree name', 'pangalan ng puno'] },
  { key: 'scientific_name', header: 'Scientific name', width: 24, aliases: ['scientific name', 'botanical name', 'sci name'] },
  { key: 'latitude', header: 'Latitude', width: 12, aliases: ['latitude', 'lat', 'y', 'northing dd'] },
  { key: 'longitude', header: 'Longitude', width: 12, aliases: ['longitude', 'long', 'lon', 'lng', 'x', 'easting dd'] },
  { key: 'barangay', header: 'Barangay', width: 18, aliases: ['barangay', 'brgy', 'brgy name', 'barangay name'] },
  { key: 'dbh_cm', header: 'DBH (cm)', width: 10, aliases: ['dbh cm', 'dbh', 'diameter', 'diameter cm', 'diameter at breast height'] },
  { key: 'height_m', header: 'Total height (m)', width: 14, aliases: ['total height m', 'total height', 'height', 'height m', 'tree height'] },
  { key: 'merchantable_height_m', header: 'Merchantable height (m)', width: 18, aliases: ['merchantable height m', 'merchantable height', 'mh'] },
  { key: 'condition', header: 'Condition', width: 14, aliases: ['condition', 'health', 'status', 'tree condition'] },
  { key: 'date_inventoried', header: 'Date inventoried', width: 14, aliases: ['date inventoried', 'date', 'date surveyed', 'survey date'] },
  { key: 'remarks', header: 'Remarks', width: 28, aliases: ['remarks', 'notes', 'remark'] },
];

export const REQUIRED_KEYS = ['common_name', 'latitude', 'longitude'];

/** The most rows one file brings in: a municipal inventory, not a forest's. */
export const MAX_ROWS = 5000;

/**
 * Whether a remark may name somebody. Stricter than the map files' check, as
 * a remark is free text: "planted by Juan", "c/o Mrs. Reyes", or a bare
 * "Juan Dela Cruz" — two to five capitalised words and nothing else — are
 * all blanked. A remark about the tree is lost now and then; a name never
 * gets through.
 */
export function remarkMayNameSomeone(text) {
  const remark = String(text ?? '').trim();
  if (!remark) return false;
  if (looksLikeAPerson(remark)) return true;
  if (/\b(by|ni|kay|nina|owner|owned|may-?ari|c\/o|care of|donor|donated|sponsor(ed)?)\b[\s:]+(mr|mrs|ms|dr|engr|atty|hon|sps|g|gng)?\.?\s*[A-ZÑ]/i.test(remark)) return true;
  return /^(?:(?:[A-ZÑ][a-zñ'.-]+|[A-ZÑ]\.|de|del|dela|delos|de los|de la|ng|y)\s+){1,4}[A-ZÑ][a-zñ'.-]+$/.test(remark);
}

const squash = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();

/** Which template column a heading is, or null. */
export function columnOf(heading) {
  const name = squash(heading);
  if (!name) return null;
  return INVENTORY_COLUMNS.find((column) => column.aliases.includes(name) || squash(column.header) === name)?.key ?? null;
}

/** A cell's value as ExcelJS gives it — rich text, formulas and hyperlinks included — as plain text or number. */
export function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('result' in value) return cellValue(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return cellValue(value.text);
    return '';
  }
  return value;
}

const numberOf = (value) => {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Rows of cells — the first a heading row — to trees and problems:
 *
 *   { trees: [{ row, latitude, longitude, barangay, species, details }],
 *     problems: [{ row, text }], ignored: [heading], personal: [heading],
 *     missing: [required header] }
 *
 * `lguName` is the office's LGU: a tree outside it is a problem, as the
 * database would refuse it anyway. `barangayAt` names the barangay of a
 * position when the sheet leaves it blank.
 */
export function readInventory(rows, { lguName, barangayAt = () => null } = {}) {
  const [headings = [], ...body] = rows;
  const keyAt = headings.map((heading) => columnOf(cellValue(heading)));
  const seen = new Set();
  keyAt.forEach((key, i) => {
    if (key && seen.has(key)) keyAt[i] = null;
    else if (key) seen.add(key);
  });
  const ignored = [];
  const personal = [];
  headings.forEach((heading, i) => {
    const text = String(cellValue(heading)).trim();
    if (keyAt[i] || !text) return;
    (personalByName(text) ? personal : ignored).push(text);
  });
  const missing = REQUIRED_KEYS.filter((key) => !seen.has(key)).map((key) => INVENTORY_COLUMNS.find((c) => c.key === key).header);

  const trees = [];
  const problems = [];
  if (missing.length) return { trees, problems, ignored, personal, missing };

  body.forEach((cells, index) => {
    const row = index + 2;
    const record = {};
    keyAt.forEach((key, i) => {
      if (key) record[key] = cellValue(cells?.[i]);
    });
    if (Object.values(record).every((value) => String(value).trim() === '')) return;

    const latitude = numberOf(record.latitude);
    const longitude = numberOf(record.longitude);
    const species = String(record.common_name || record.scientific_name || '').trim();
    if (!species) return problems.push({ row, text: 'No species name.' });
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return problems.push({ row, text: 'Latitude and longitude must be numbers, in decimal degrees.' });
    }
    if (latitude < 13 || latitude > 15 || longitude < 120 || longitude > 122.5) {
      return problems.push({ row, text: `${latitude}, ${longitude} is not in Laguna. Are latitude and longitude swapped?` });
    }
    const town = municipalityAt([latitude, longitude]);
    if (lguName && town !== lguName) {
      return problems.push({ row, text: town ? `This point is in ${town}, not ${lguName}.` : 'This point is outside Laguna.' });
    }

    const measure = (key, low, high, label) => {
      const n = numberOf(record[key]);
      if (n === null) return null;
      if (!Number.isFinite(n) || n < low || n > high) {
        problems.push({ row, text: `${label} of ${record[key]} looks wrong; it was left out.` });
        return null;
      }
      return n;
    };
    const remarks = String(record.remarks ?? '').trim();
    const details = {
      tree_no: String(record.tree_no ?? '').trim() || null,
      scientific_name: String(record.scientific_name ?? '').trim() || null,
      dbh_cm: measure('dbh_cm', 1, 1000, 'A DBH'),
      height_m: measure('height_m', 0.5, 80, 'A height'),
      merchantable_height_m: measure('merchantable_height_m', 0.1, 80, 'A merchantable height'),
      condition: String(record.condition ?? '').trim() || null,
      date_inventoried: String(record.date_inventoried ?? '').trim() || null,
      remarks: remarks && !remarkMayNameSomeone(remarks) ? remarks : null,
    };
    const named = String(record.barangay ?? '').trim();
    trees.push({
      row,
      latitude,
      longitude,
      barangay: named || barangayAt([latitude, longitude])?.barangay || '',
      species,
      details: Object.fromEntries(Object.entries(details).filter(([, value]) => value !== null)),
    });
  });
  return { trees, problems, ignored, personal, missing };
}

/** One tree as the pending_trees row the import writes. */
export function inventoryRow(tree, { lguName, fileName }) {
  return {
    latitude: tree.latitude,
    longitude: tree.longitude,
    barangay: tree.barangay,
    species: tree.species,
    municipality: lguName,
    status: 'pending',
    source: 'import',
    details: { ...tree.details, file: fileName, row: tree.row },
    submitted_at: new Date().toISOString(),
  };
}

/** The rows of the first worksheet of an .xlsx, or of a .csv, as arrays of cells. */
export async function rowsOfFile(file) {
  if (/\.csv$/i.test(file.name)) return rowsOfCsv(await textOf(file));
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.worksheets.find((ws) => /tree/i.test(ws.name)) ?? book.worksheets[0];
  const rows = [];
  sheet?.eachRow({ includeEmpty: true }, (row) => {
    // ExcelJS counts cells from 1.
    rows.push((row.values ?? []).slice(1));
  });
  return rows;
}

/** A file's text: Blob.text() where the browser has it, FileReader where it does not. */
function textOf(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** A CSV, quoted fields and all, as arrays of cells. */
export function rowsOfCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** The template, as an .xlsx Blob: the Trees sheet to fill, and how to fill it. */
export async function inventoryTemplate(lguLabel = '') {
  return new Blob([await templateBuffer(lguLabel)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** The template's bytes. */
export async function templateBuffer(lguLabel = '') {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  book.creator = 'Green Tag';
  const sheet = book.addWorksheet('Trees', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = INVENTORY_COLUMNS.map((column) => ({ header: column.header, key: column.key, width: column.width }));
  const head = sheet.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15803D' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 30;
  sheet.getColumn('latitude').numFmt = '0.000000';
  sheet.getColumn('longitude').numFmt = '0.000000';

  const guide = book.addWorksheet('How to fill');
  guide.columns = [{ width: 26 }, { width: 90 }];
  const lines = [
    ['Green Tag tree inventory', lguLabel ? `For ${lguLabel}` : ''],
    [],
    ['One row per tree', 'Fill the Trees sheet. Leave the first row, the headings, as it is.'],
    ['Required', 'Common name (or Scientific name), Latitude and Longitude.'],
    ['Latitude, Longitude', 'Decimal degrees, WGS 84, as a phone or GPS shows them: e.g. 14.2794 and 121.4157.'],
    ['Barangay', 'Optional: left blank, it is worked out from the position.'],
    ['DBH (cm)', 'Diameter at breast height, 1.3 m above the ground, in centimetres.'],
    ['Heights (m)', 'Total height and, if measured, merchantable height, in metres.'],
    ['Condition', 'e.g. Healthy, Diseased, Damaged, Dead.'],
    ['Date inventoried', 'The day the tree was measured.'],
    [],
    ['Personal data', 'Do NOT add owners’ or anyone’s names, addresses or contact details (RA 10173). Columns other than the ones here are not read.'],
    ['What happens next', 'Each tree comes in unverified, grey on the map, until a field officer visits it, takes its photos and verifies it.'],
  ];
  lines.forEach((line) => guide.addRow(line));
  guide.getColumn(1).font = { bold: true };
  guide.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  guide.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF15803D' } };

  return book.xlsx.writeBuffer();
}
