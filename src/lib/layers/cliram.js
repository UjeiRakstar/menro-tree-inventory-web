/**
 * Reading a DOST-PAGASA CLIRAM download.
 *
 * CLIRAM (climap.pagasa.dost.gov.ph) gives each province, city and
 * municipality a workbook of monthly figures: the OBSERVED baseline, and
 * projections for six 30-year periods to 2100 under one emissions scenario,
 * each with a lower bound, median and upper bound. PGENRO has one for every
 * LGU in Laguna (SSP1-1.9).
 *
 * The panel needs two figures — average temperature and yearly rainfall — so
 * this reads the observed baseline: the temperature is the mean of the twelve
 * months, the rainfall their sum. It also keeps the median projection for the
 * nearest period, so the panel can say where it is heading.
 *
 * The workbook arrives as rows (one array of cell values per row), so this
 * file does not depend on the spreadsheet library; src/lib/layers/files.js
 * turns a download into rows.
 */
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december'];

const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const number = (value) => {
  const n = Number.parseFloat(text(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * One sheet's monthly baseline and the median projection per period.
 * Rows look like: [_, month, baseline, range, 2021-2050, 2031-2060, …], with
 * the baseline only on the "Median" row of each month.
 */
function readMonthlySheet(rows) {
  const header = rows.find((row) => row.some((cell) => /^\d{4}-\d{4}$/.test(text(cell))));
  const periodColumns = header
    ? header.map((cell, i) => [text(cell), i]).filter(([cell]) => /^\d{4}-\d{4}$/.test(cell))
    : [];
  const baseline = new Array(12).fill(null);
  const projected = Object.fromEntries(periodColumns.map(([period]) => [period, new Array(12).fill(null)]));

  for (const row of rows) {
    const month = MONTHS.indexOf(text(row.find((cell) => MONTHS.includes(text(cell).toLowerCase()))).toLowerCase());
    if (month < 0) continue;
    if (!row.some((cell) => /^median$/i.test(text(cell)))) continue;
    const rangeAt = row.findIndex((cell) => /^median$/i.test(text(cell)));
    baseline[month] = number(row[rangeAt - 1]);
    for (const [period, i] of periodColumns) projected[period][month] = number(row[i]);
  }
  return { baseline, projected };
}

/** "Projected Changes in Temperature for Pakil, Laguna - SSP1-1.9" → { place, scenario }. */
function readTitle(sheets) {
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const cell of row) {
        const match = /for (.+?)\s+-\s+(SSP[\d.-]+)/i.exec(text(cell));
        if (match) return { place: match[1].replace(/,\s*Laguna$/i, '').trim(), scenario: match[2].toUpperCase() };
      }
    }
  }
  return { place: null, scenario: null };
}

const complete = (months) => months.length === 12 && months.every((m) => m !== null);
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * sheets: [{ name, rows }]. Returns
 *   { place, scenario, temperature: { meanC, monthly, projected }, rainfall: { annualMm, monthly, projected } }
 * or throws with a sentence saying what is missing.
 */
export function readCliram(sheets) {
  const temperatureSheet = sheets.find((sheet) => /temperature/i.test(sheet.name));
  const rainfallSheet = sheets.find((sheet) => /rainfall/i.test(sheet.name));
  if (!temperatureSheet || !rainfallSheet) {
    throw new Error('This is not a CLIRAM workbook: it needs a temperature sheet and a rainfall sheet.');
  }
  const temperature = readMonthlySheet(temperatureSheet.rows);
  const rainfall = readMonthlySheet(rainfallSheet.rows);
  if (!complete(temperature.baseline) || !complete(rainfall.baseline)) {
    throw new Error('The workbook’s observed baseline is missing months.');
  }
  const { place, scenario } = readTitle(sheets);

  const nearest = Object.keys(temperature.projected).sort()[0] ?? null;
  const meanOf = (months) => months.reduce((a, b) => a + b, 0) / months.length;
  const sumOf = (months) => months.reduce((a, b) => a + b, 0);

  return {
    place,
    scenario,
    temperature: {
      meanC: round(meanOf(temperature.baseline), 1),
      monthly: temperature.baseline,
      projected:
        nearest && complete(temperature.projected[nearest])
          ? { period: nearest, meanC: round(meanOf(temperature.projected[nearest]), 1) }
          : null,
    },
    rainfall: {
      annualMm: Math.round(sumOf(rainfall.baseline)),
      monthly: rainfall.baseline,
      projected:
        nearest && complete(rainfall.projected[nearest])
          ? { period: nearest, annualMm: Math.round(sumOf(rainfall.projected[nearest])) }
          : null,
    },
  };
}

/**
 * Which LGU a CLIRAM place name is. CLIRAM writes "City of Biñan",
 * "Cabuyao City", "San Pablo City", "Los Baños"; the boundaries call them
 * Biñan, Cabuyao, San Pablo, Los Baños. `lgus` is MUNICIPALITY_LIST.
 */
export function lguOfPlace(place, lgus) {
  const plain = (s) =>
    text(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/^city of\s+/, '')
      .replace(/\s+city$/, '')
      .replace(/,\s*laguna$/, '');
  const wanted = plain(place);
  if (!wanted) return null;
  if (wanted === 'laguna') return { province: true };
  return lgus.find((lgu) => plain(lgu.name) === wanted || plain(lgu.label) === wanted) ?? null;
}
