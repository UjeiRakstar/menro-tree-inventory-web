import { describe, expect, it } from 'vitest';
import { addTableSheet, createWorkbook, LOOK, officeOf, sheetName } from './workbookLook.js';

const SANTA_CRUZ = { psgc: 403426000, name: 'Santa Cruz', label: 'Santa Cruz', is_city: false };

/** A workbook written and read back, as Excel would open it. */
async function reopened(workbook) {
  const { default: ExcelJS } = await import('exceljs');
  const again = new ExcelJS.Workbook();
  await again.xlsx.load(await workbook.xlsx.writeBuffer());
  return again;
}

/** Every cell's text on a sheet, row by row; a merged cell once. */
const textOf = (sheet) => {
  const lines = [];
  sheet.eachRow((row) => {
    const values = [];
    row.eachCell((cell) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      if (cell.value !== null && cell.value !== undefined) values.push(cell.value);
    });
    lines.push(values.join(' | '));
  });
  return lines;
};

describe('officeOf', () => {
  it('heads an LGU’s file with its official name and its office', () => {
    const office = officeOf(SANTA_CRUZ);
    expect(office.heading).toEqual(['MUNICIPALITY OF SANTA CRUZ', 'PROVINCE OF LAGUNA', 'REGION IV-A CALABARZON']);
    expect(office.office).toBe('Municipal Environment and Natural Resources Office');
    expect(office.place).toBe('Municipality of Santa Cruz, Laguna');
  });

  it('calls a city’s office a CENRO’s', () => {
    expect(officeOf({ psgc: 403428000, name: 'Santa Rosa', label: 'Santa Rosa City', is_city: true }).office).toBe(
      'City Environment and Natural Resources Office'
    );
  });

  it('heads PGENRO’s file with the province', () => {
    const office = officeOf(null);
    expect(office.heading[0]).toBe('PROVINCE OF LAGUNA');
    expect(office.office).toBe('Provincial Government Environment and Natural Resources Office');
  });
});

describe('addTableSheet', () => {
  it('lays a table out under the letterhead, with its totals and notes', async () => {
    const workbook = await createWorkbook();
    await addTableSheet(workbook, {
      name: 'Carbon by barangay',
      lgu: SANTA_CRUZ,
      title: 'CARBON IN THE TAGGED TREES',
      subtitle: 'By barangay',
      preparedBy: 'MENRO Santa Cruz',
      date: new Date(2026, 9, 20),
      columns: [{ label: 'Barangay' }, { label: 'Trees', kind: 'number' }, { label: 'CO₂ (t)', kind: 'tonnes' }],
      rows: [['Alipit', 12, 1.5], ['Bubukal', 3, null]],
      totals: ['2 barangays', 15, 1.5],
      notes: ['Carbon: Chave et al. 2014.'],
    });
    const sheet = (await reopened(workbook)).getWorksheet('Carbon by barangay');
    const lines = textOf(sheet);

    expect(lines.slice(0, 5)).toEqual([
      'Republic of the Philippines',
      'MUNICIPALITY OF SANTA CRUZ',
      'PROVINCE OF LAGUNA',
      'REGION IV-A CALABARZON',
      'Municipal Environment and Natural Resources Office',
    ]);
    expect(lines).toContain('CARBON IN THE TAGGED TREES');
    expect(lines).toContain('Prepared by MENRO Santa Cruz · October 20, 2026'.replace('October 20, 2026', new Date(2026, 9, 20).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })));
    expect(lines).toContain('Barangay | Trees | CO₂ (t)');
    expect(lines).toContain('Alipit | 12 | 1.5');
    expect(lines).toContain('2 barangays | 15 | 1.5');
    expect(lines.at(-1)).toBe('Carbon: Chave et al. 2014.');

    // The heading row: green, white, and frozen in view.
    const headingRow = Array.from({ length: 30 }, (_, i) => i + 1).find((n) => sheet.getCell(n, 1).value === 'Barangay');
    const head = sheet.getCell(headingRow, 1);
    expect(head.fill.fgColor.argb).toBe(LOOK.green);
    expect(head.font.color.argb).toBe('FFFFFFFF');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: headingRow });
    expect(sheet.getCell(headingRow + 1, 3).numFmt).toBe('#,##0.00');
    // The totals: bold, on pale green.
    expect(sheet.getCell(headingRow + 3, 2).font.bold).toBe(true);
    expect(sheet.pageSetup.paperSize).toBe(9);
    expect(sheet.headerFooter.oddFooter).toMatch(/Page &P of &N/);
  });

  it('says so when there is nothing to list', async () => {
    const workbook = await createWorkbook();
    await addTableSheet(workbook, { name: 'Permits', title: 'PERMITS', columns: [{ label: 'Client' }, { label: 'Trees' }], rows: [] });
    expect(textOf((await reopened(workbook)).getWorksheet('Permits'))).toContain('Nothing to list.');
  });

  it('names a sheet as Excel allows', () => {
    expect(sheetName('Carbon by barangay / city: 2026 [draft] and a very long tail')).toBe('Carbon by barangay - city- 2026');
    expect(sheetName('Carbon by barangay / city: 2026 [draft] and a very long tail')).toHaveLength(31);
  });
});
