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
 * Built on the City of San Pedro's inventory (2,308 trees, 2020–2022), the
 * one this system was first planned around, with its headings made plain:
 * what San Pedro wrote as "C 1, 2, 3" under one merged heading is
 * "Circumference, stem 1 (cm)" and so on; "SPECIES" next to "GENUS" is the
 * species epithet; height was recorded in classes (<10, 11-15 … 26-30 m).
 * The reader still takes San Pedro's own sheet as it is — two heading rows,
 * merged group headings and all — and sheets like it.
 *
 * Only the columns below are read. Any other column is left behind, which is
 * how an owner's name in a column of its own never reaches the database
 * (RA 10173); a remark that may name someone is blanked as well.
 */
export const INVENTORY_COLUMNS = [
  { key: 'tree_no', header: 'Tree No.', width: 9, note: 'Your own number or tag for the tree. Optional.',
    aliases: ['tree no', 'tree number', 'no', 'tree id', 'id', 'tag no', 'tag number'] },
  { key: 'date_inventoried', header: 'Date inventoried', width: 14, numFmt: 'yyyy-mm-dd', note: 'The day the tree was measured.',
    aliases: ['date inventoried', 'date', 'date surveyed', 'survey date', 'petsa'] },
  { key: 'common_name', header: 'Common name', width: 18, note: 'Required, unless the scientific name is given. E.g. Narra, Mahogany, Mangga.',
    aliases: ['common name', 'local name', 'name of tree', 'tree name', 'pangalan ng puno', 'species name'] },
  { key: 'family', header: 'Family', width: 15, note: 'E.g. Fabaceae, Meliaceae. Optional.', aliases: ['family', 'pamilya'] },
  { key: 'genus', header: 'Genus', width: 14, note: 'E.g. Pterocarpus. With the species epithet beside it, it makes the scientific name.', aliases: ['genus'] },
  { key: 'epithet', header: 'Species (epithet)', width: 15, note: 'The second word of the scientific name, e.g. indicus in Pterocarpus indicus.',
    aliases: ['species epithet', 'epithet', 'specific epithet'] },
  { key: 'latitude', header: 'Latitude (decimal degrees)', width: 14, numFmt: '0.000000', note: 'Required. As a phone or GPS shows it, WGS 84: e.g. 14.359180.',
    aliases: ['latitude', 'lat', 'y', 'location lat', 'latitude decimal degrees', 'northing dd'] },
  { key: 'longitude', header: 'Longitude (decimal degrees)', width: 14, numFmt: '0.000000', note: 'Required. E.g. 121.044260.',
    aliases: ['longitude', 'long', 'lon', 'lng', 'x', 'location long', 'longitude decimal degrees', 'easting dd'] },
  { key: 'location', header: 'Location or landmark', width: 24, note: 'The street, park or landmark, e.g. Magsaysay Road. Not anyone’s name or house.',
    aliases: ['location', 'loc', 'location loc', 'landmark', 'street', 'site', 'kinaroroonan'] },
  { key: 'barangay', header: 'Barangay', width: 18, note: 'Choose from the list. Left blank, it is worked out from the position.',
    aliases: ['barangay', 'brgy', 'brgy name', 'barangay name'] },
  { key: 'height', header: 'Total height (m)', width: 12, note: 'Measured, in metres (e.g. 12.5) — or a height class: <10, 11-15, 16-20, 21-25, 26-30.',
    aliases: ['total height m', 'total height', 'height', 'height m', 'tree height', 'taas'] },
  { key: 'merchantable_height_m', header: 'Merchantable height (m)', width: 14, note: 'From the ground to the first big branch or defect, in metres. Optional.',
    aliases: ['merchantable height m', 'merchantable height', 'mh', 'bole height', 'clear bole'] },
  { key: 'circumference_1', header: 'Circumference, stem 1 (cm)', width: 14, note: 'Around the trunk at 1.3 m, with a tape, in cm. The DBH is worked out from it (circumference ÷ 3.1416).',
    aliases: ['circumference stem 1 cm', 'circumference', 'circumference cm', 'circumference 1', 'c 1', 'c1', 'cbh', 'girth'] },
  { key: 'circumference_2', header: 'Circumference, stem 2 (cm)', width: 14, note: 'A second stem forking below 1.3 m. Optional.',
    aliases: ['circumference stem 2 cm', 'circumference 2', 'c 2', 'c2'] },
  { key: 'circumference_3', header: 'Circumference, stem 3 (cm)', width: 14, note: 'A third stem. Optional.',
    aliases: ['circumference stem 3 cm', 'circumference 3', 'c 3', 'c3'] },
  { key: 'dbh_1', header: 'DBH (cm)', width: 10, note: 'Only if the diameter was measured directly (caliper or D-tape). Otherwise leave it blank.',
    aliases: ['dbh cm', 'dbh', 'diameter', 'diameter cm', 'diameter at breast height', 'dbh 1', 'dbh1'] },
  { key: 'condition', header: 'Condition', width: 13, note: 'Choose from the list.', aliases: ['condition', 'health', 'status', 'tree condition', 'kalagayan'] },
  { key: 'remarks', header: 'Remarks', width: 26, note: 'About the tree only — never anyone’s name.', aliases: ['remarks', 'notes', 'remark', 'puna'] },
];

/** Read but not in the template: a second and third measured DBH, and the full scientific name in one column. */
const EXTRA_COLUMNS = [
  { key: 'dbh_2', aliases: ['dbh 2', 'dbh2'] },
  { key: 'dbh_3', aliases: ['dbh 3', 'dbh3'] },
  { key: 'scientific_name', aliases: ['scientific name', 'botanical name', 'sci name'] },
];

export const CONDITIONS = ['Healthy', 'Leaning', 'Diseased', 'Damaged', 'Dying', 'Dead'];
export const HEIGHT_CLASSES = ['<10', '11-15', '16-20', '21-25', '26-30', '>30'];

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

/**
 * Whether a location may name somebody. Places are capitalised words too
 * ("Rosario Main Road"), so only a person's marks or a house that is theirs
 * ("house of", "bahay ni") count here.
 */
export function locationMayNameSomeone(text) {
  const place = String(text ?? '').trim();
  if (!place) return false;
  if (/\b(house|home|residence|bahay|lote|property|compound) (of|ni|nina)\b/i.test(place)) return true;
  if (/\b[A-ZÑ][a-zñ]+(?:'s)? (house|home|residence|lot|yard|property|compound)\b/.test(place)) return true;
  // "Magsaysay Road, Puregold" reads like "Surname, Firstname" to the map
  // files' check; a street or place word says it is a place.
  return !PLACE_WORDS.test(place) && looksLikeAPerson(place);
}

const PLACE_WORDS =
  /\b(road|rd|st|street|ave|avenue|drive|dr|blvd|boulevard|highway|hwy|lane|ln|ext|extension|park|plaza|school|church|chapel|market|center|centre|hall|phase|block|blk|subd|subdivision|village|homes|farm|space|creek|river|bridge|station|gate|court|corner|cor|purok|sitio|zone|daan|kalye)\b/i;

/**
 * A latitude or longitude as written: 14.35918, "14.34659°", or degrees,
 * minutes and seconds (14°21'33"N, 14 21 33). Null when blank, NaN when
 * unreadable.
 */
export function coordinateOf(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const plain = text.replace(/\s*[°º]?\s*[NE]?$/i, '');
  if (/^-?\d+(\.\d+)?$/.test(plain)) return Number(plain);
  const dms = text.match(/^(\d+(?:\.\d+)?)\s*[°º:\s]\s*(\d+(?:\.\d+)?)\s*['′:\s]\s*(?:(\d+(?:\.\d+)?)\s*(?:"|″|'')?)?\s*([NSEW])?$/i);
  if (!dms) return NaN;
  const degrees = Number(dms[1]) + Number(dms[2]) / 60 + Number(dms[3] ?? 0) / 3600;
  return /[SW]/i.test(dms[4] ?? '') ? -degrees : degrees;
}

const squash = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();
const ALL_COLUMNS = [...INVENTORY_COLUMNS, ...EXTRA_COLUMNS];

/** Which column a heading is, or null. */
export function columnOf(heading) {
  const name = squash(heading);
  if (!name) return null;
  return ALL_COLUMNS.find((column) => column.aliases.includes(name) || (column.header && squash(column.header) === name))?.key ?? null;
}

/**
 * A heading under a group heading, as San Pedro's sheet has them: "DBH" over
 * "1, 2, 3"; "C" over the stems; "LOCATION" over "LAT, LONG, LOC".
 */
function columnUnder(group, heading) {
  const top = squash(group);
  const name = squash(heading);
  const stem = /^[1-3]/.test(name) ? name[0] : null;
  if (stem && ['c', 'circumference', 'girth', 'cbh', 'circumference cm'].includes(top)) return `circumference_${stem}`;
  if (stem && ['dbh', 'diameter', 'dbh cm', 'diameter cm'].includes(top)) return `dbh_${stem}`;
  return (top && columnOf(`${top} ${name}`)) || columnOf(heading);
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

/** "11-15", "11 – 15 m", "<10", "> 30" as a height class, or null. */
export function heightClassOf(value) {
  const text = String(value ?? '').trim().replace(/\s*m$/i, '');
  const range = text.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)$/i);
  if (range) return `${Number(range[1])}-${Number(range[2])}`;
  const open = text.match(/^(<|>|≤|≥|below|above|under|over)\s*(\d+(?:\.\d+)?)$/i);
  if (open) return `${/^(<|≤|below|under)/i.test(open[1]) ? '<' : '>'}${Number(open[2])}`;
  return null;
}

/**
 * Where the headings are, in the first few rows: the row that names the most
 * columns, each heading read with the group heading above it, if any.
 */
function findHeadings(rows) {
  let best = { index: 0, keys: [], found: -1 };
  for (let i = 0; i < Math.min(6, rows.length); i += 1) {
    const cells = rows[i] ?? [];
    const above = i > 0 ? rows[i - 1] ?? [] : [];
    const keys = cells.map((cell, j) => columnUnder(i > 0 ? cellValue(above[j]) : '', cellValue(cell)));
    // "SPECIES" beside "GENUS" is the epithet, not the tree's name.
    if (keys.includes('genus')) {
      cells.forEach((cell, j) => {
        if (squash(cellValue(cell)) === 'species') keys[j] = 'epithet';
      });
    } else {
      cells.forEach((cell, j) => {
        if (!keys[j] && squash(cellValue(cell)) === 'species') keys[j] = 'common_name';
      });
    }
    const seen = new Set();
    keys.forEach((key, j) => {
      if (key && seen.has(key)) keys[j] = null;
      else if (key) seen.add(key);
    });
    if (seen.size > best.found) best = { index: i, keys, found: seen.size };
  }
  return best;
}

/**
 * Rows of cells to trees and problems:
 *
 *   { trees: [{ row, latitude, longitude, barangay, species, details }],
 *     problems: [{ row, text }], ignored: [heading], personal: [heading],
 *     missing: [required header], headingRow }
 *
 * `lguName` is the office's LGU: a tree outside it is a problem, as the
 * database would refuse it anyway. `barangayAt` names the barangay of a
 * position when the sheet leaves it blank.
 */
export function readInventory(rows, { lguName, barangayAt = () => null } = {}) {
  const { index, keys: keyAt } = findHeadings(rows);
  const headings = rows[index] ?? [];
  const body = rows.slice(index + 1);
  const seen = new Set(keyAt.filter(Boolean));

  const ignored = [];
  const personal = [];
  headings.forEach((heading, i) => {
    const text = String(cellValue(heading)).trim();
    if (keyAt[i] || !text) return;
    (personalByName(text) ? personal : ignored).push(text);
  });
  const missing = [];
  if (!['common_name', 'scientific_name', 'genus'].some((key) => seen.has(key))) missing.push('Common name');
  if (!seen.has('latitude')) missing.push('Latitude');
  if (!seen.has('longitude')) missing.push('Longitude');

  const trees = [];
  const problems = [];
  if (missing.length) return { trees, problems, ignored, personal, missing, headingRow: index + 1 };

  body.forEach((cells, offset) => {
    const row = index + 2 + offset;
    const record = {};
    keyAt.forEach((key, i) => {
      if (key) record[key] = cellValue(cells?.[i]);
    });
    if (Object.values(record).every((value) => String(value).trim() === '')) return;
    const text = (key) => String(record[key] ?? '').trim();

    const genus = text('genus');
    const epithet = text('epithet');
    const scientific = text('scientific_name') || (genus ? `${genus[0].toUpperCase()}${genus.slice(1).toLowerCase()}${epithet ? ` ${epithet.toLowerCase()}` : ''}` : '');
    const species = text('common_name') || scientific;
    if (!species) return problems.push({ row, text: 'No species name.' });

    const latitude = coordinateOf(record.latitude);
    const longitude = coordinateOf(record.longitude);
    if (latitude === null || longitude === null) return problems.push({ row, text: 'No latitude and longitude: it cannot be placed on the map.' });
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

    const measure = (value, low, high, label) => {
      const n = numberOf(value);
      if (n === null) return null;
      if (!Number.isFinite(n) || n < low || n > high) {
        problems.push({ row, text: `${label} of ${value} looks wrong; it was left out.` });
        return null;
      }
      return n;
    };

    // Each stem's diameter: measured, or from its circumference.
    let clustered = false;
    const stems = [1, 2, 3].map((stem) => {
      if (/cluster/i.test(String(record[`dbh_${stem}`] ?? ''))) {
        clustered = true;
        return null;
      }
      const measured = measure(record[`dbh_${stem}`], 1, 1000, `A DBH (stem ${stem})`);
      if (measured !== null) return measured;
      const around = record[`circumference_${stem}`];
      if (/cluster/i.test(String(around ?? ''))) {
        clustered = true;
        return null;
      }
      const circumference = measure(around, 3, 3000, `A circumference (stem ${stem})`);
      return circumference === null ? null : circumference / Math.PI;
    }).filter((d) => d !== null);
    // Several stems: the one diameter with the same basal area.
    const dbh = stems.length ? Math.round(Math.sqrt(stems.reduce((sum, d) => sum + d * d, 0)) * 10) / 10 : null;

    const heightText = text('height');
    const heightClass = heightClassOf(heightText);
    const heightM = heightClass ? null : measure(record.height, 0.5, 80, 'A height');
    const remarks = text('remarks');
    const location = text('location');
    const details = {
      tree_no: text('tree_no') || null,
      date_inventoried: text('date_inventoried') || null,
      scientific_name: scientific || null,
      family: text('family') || null,
      location: location && !locationMayNameSomeone(location) ? location : null,
      dbh_cm: dbh,
      stems: stems.length > 1 ? stems.length : null,
      stem_dbh_cm: stems.length > 1 ? stems.map((d) => Math.round(d * 10) / 10) : null,
      clustered: clustered || null,
      height_m: heightM,
      height_class: heightClass,
      merchantable_height_m: measure(record.merchantable_height_m, 0.1, 80, 'A merchantable height'),
      condition: text('condition') || null,
      remarks: remarks && !remarkMayNameSomeone(remarks) ? remarks : null,
    };
    trees.push({
      row,
      latitude,
      longitude,
      barangay: text('barangay') || barangayAt([latitude, longitude])?.barangay || '',
      species,
      details: Object.fromEntries(Object.entries(details).filter(([, value]) => value !== null)),
    });
  });
  return { trees, problems, ignored, personal, missing, headingRow: index + 1 };
}

/** Problems with the same wording, together: [{ text, rows: [row numbers] }], the most common first. */
export function groupProblems(problems) {
  const groups = new Map();
  for (const { row, text } of problems) {
    if (!groups.has(text)) groups.set(text, []);
    groups.get(text).push(row);
  }
  return [...groups].map(([text, rows]) => ({ text, rows })).sort((a, b) => b.rows.length - a.rows.length);
}

/** What makes a tree the same tree in two uploads: its number, species and position to about 10 cm. */
const sameTreeKey = (tree) =>
  [tree.details?.tree_no ?? '', String(tree.species ?? '').trim().toLowerCase(), Number(tree.latitude).toFixed(6), Number(tree.longitude).toFixed(6)].join('|');

/**
 * The trees not brought in before: { fresh, repeated }. `existing` are the
 * LGU's earlier imports (pending_trees rows). Counted, not just matched: two
 * trees of one species at one GPS point — San Pedro's sheet has them — are
 * two trees, and only as many as were already in are left out.
 */
export function notYetImported(trees, existing = []) {
  const seen = new Map();
  for (const row of existing) {
    const key = sameTreeKey(row);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const fresh = [];
  let repeated = 0;
  for (const tree of trees) {
    const key = sameTreeKey(tree);
    if ((seen.get(key) ?? 0) > 0) {
      seen.set(key, seen.get(key) - 1);
      repeated += 1;
    } else fresh.push(tree);
  }
  return { fresh, repeated };
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

/** The rows of the inventory's worksheet in an .xlsx, or of a .csv, as arrays of cells. */
export async function rowsOfFile(file) {
  if (/\.csv$/i.test(file.name)) return rowsOfCsv(await textOf(file));
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  return rowsOfBook(book);
}

/** The rows of a workbook's inventory sheet: the one called Trees, else the first. */
export function rowsOfBook(book) {
  const sheet = book.worksheets.find((ws) => /^trees?$/i.test(ws.name.trim())) ?? book.worksheets[0];
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
export async function inventoryTemplate(lguLabel = '', barangays = []) {
  return new Blob([await templateBuffer(lguLabel, barangays)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const ROWS_PREPARED = 5000;
const GREEN = 'FF15803D';

/**
 * The template's bytes: the Trees sheet — one heading row, each heading with
 * its unit and a note on how to fill it, lists for the barangay, condition
 * and height class — a sheet on how to fill it, with San Pedro's first trees
 * as the example, and the lists.
 */
export async function templateBuffer(lguLabel = '', barangays = []) {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  book.creator = 'Green Tag';
  book.title = 'Green Tag tree inventory';

  const sheet = book.addWorksheet('Trees', { views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }] });
  sheet.columns = INVENTORY_COLUMNS.map((column) => ({ header: column.header, key: column.key, width: column.width }));
  const head = sheet.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  head.height = 42;
  INVENTORY_COLUMNS.forEach((column, i) => {
    const cell = head.getCell(i + 1);
    cell.note = column.note;
    if (['common_name', 'latitude', 'longitude'].includes(column.key)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
    if (column.numFmt) sheet.getColumn(column.key).numFmt = column.numFmt;
  });

  // The lists the drop-downs read from.
  const lists = book.addWorksheet('Lists', { state: 'hidden' });
  lists.getColumn(1).values = ['Barangay', ...barangays];
  lists.getColumn(2).values = ['Condition', ...CONDITIONS];
  lists.getColumn(3).values = ['Height class', ...HEIGHT_CLASSES];
  const letter = (key) => sheet.getColumn(key).letter;
  const range = (key) => `${letter(key)}2:${letter(key)}${ROWS_PREPARED + 1}`;
  if (barangays.length) {
    sheet.dataValidations.add(range('barangay'), {
      type: 'list', allowBlank: true, formulae: [`Lists!$A$2:$A$${barangays.length + 1}`],
      showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Barangay', error: `Not a barangay of ${lguLabel || 'this LGU'}. Choose from the list.`,
    });
  }
  sheet.dataValidations.add(range('condition'), {
    type: 'list', allowBlank: true, formulae: [`Lists!$B$2:$B$${CONDITIONS.length + 1}`],
    showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Condition', error: 'Choose from the list.',
  });
  for (const key of ['latitude', 'longitude']) {
    const [low, high] = key === 'latitude' ? [13.9, 14.6] : [120.9, 121.7];
    sheet.dataValidations.add(range(key), {
      type: 'decimal', operator: 'between', allowBlank: true, formulae: [low, high],
      showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Not in Laguna',
      error: `Decimal degrees, between ${low} and ${high}. Are latitude and longitude swapped?`,
    });
  }

  const guide = book.addWorksheet('How to fill');
  guide.columns = [{ width: 28 }, { width: 96 }];
  const lines = [
    ['Green Tag tree inventory', lguLabel ? `For ${lguLabel}` : ''],
    ['', 'One row per tree, on the Trees sheet. Keep the first row, the headings, as it is. Hover over a heading for what goes in it.'],
    [],
    ['Required', 'Common name (or Genus and Species), Latitude and Longitude. A tree without a position cannot be placed on the map, and is left out.'],
    ['Latitude, Longitude', 'Decimal degrees, WGS 84, as a phone or GPS shows them: 14.359180 and 121.044260 — not degrees, minutes and seconds.'],
    ['Circumference', 'Around the trunk at breast height, 1.3 m above the ground, with a tape, in centimetres. The DBH is worked out from it.'],
    ['Several stems', 'A tree forking below 1.3 m: each stem’s circumference in stem 1, 2 and 3. They count as one tree.'],
    ['DBH (cm)', 'Only if the diameter itself was measured, with a caliper or diameter tape.'],
    ['Total height', 'In metres if measured; if estimated, a class: <10, 11-15, 16-20, 21-25, 26-30, >30.'],
    ['Barangay', 'From the list. Left blank, it is worked out from the position.'],
    [],
    ['Personal data', 'Do NOT write owners’ or anyone’s names, addresses or contact details, here or in Location and Remarks (RA 10173). Columns other than these are not read.'],
    ['What happens next', 'Bring the file in from Settings → Tree inventory. Each tree comes in unverified, grey on the map, until a field officer visits it, takes its photos and verifies it.'],
    [],
    ['Example', 'Two trees from the City of San Pedro’s inventory, written in this template:'],
  ];
  lines.forEach((line) => guide.addRow(line));
  guide.getColumn(1).font = { bold: true };
  guide.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  guide.getRow(1).font = { bold: true, size: 14, color: { argb: GREEN } };

  const example = guide.addRow([]);
  const exampleHead = guide.getRow(example.number + 1);
  INVENTORY_COLUMNS.forEach((column, i) => {
    exampleHead.getCell(i + 1).value = column.header;
  });
  exampleHead.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  exampleHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  exampleHead.alignment = { wrapText: true, vertical: 'middle' };
  const samples = [
    { tree_no: 1, date_inventoried: '2022-02-24', common_name: 'Ilang-ilang', family: 'Annonaceae', genus: 'Cananga', epithet: 'odorata', latitude: 14.35918, longitude: 121.04426, location: 'Magsaysay Road', barangay: 'San Antonio', height: '11-15', circumference_1: 45, condition: 'Healthy' },
    { tree_no: 2, date_inventoried: '2022-02-24', common_name: 'Mangga', family: 'Anacardiaceae', genus: 'Mangifera', epithet: 'indica', latitude: 14.34443, longitude: 121.05941, location: 'San Vicente Road', barangay: 'San Vicente', height: 8.5, circumference_1: 65, circumference_2: 47, condition: 'Leaning', remarks: 'Forks at 1 m' },
  ];
  samples.forEach((sample, k) => {
    const row = guide.getRow(example.number + 2 + k);
    INVENTORY_COLUMNS.forEach((column, i) => {
      row.getCell(i + 1).value = sample[column.key] ?? null;
    });
    row.font = { italic: true, color: { argb: 'FF475569' } };
  });

  return book.xlsx.writeBuffer();
}
