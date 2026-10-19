import { describe, it, expect } from 'vitest';
import { INVENTORY_COLUMNS, columnOf, inventoryRow, readInventory, remarkMayNameSomeone, rowsOfCsv, templateBuffer } from './treeInventory.js';

// Santa Cruz's hall, and a point in Calamba.
const SCZ = [14.2794, 121.4157];
const CLB = [14.2117, 121.1653];

const read = (rows, options = {}) => readInventory(rows, { lguName: 'Santa Cruz', ...options });

describe('the tree inventory spreadsheet', () => {
  it('reads the template’s columns under the headings offices actually use', () => {
    expect(columnOf('Species')).toBe('common_name');
    expect(columnOf('LAT')).toBe('latitude');
    expect(columnOf('Lng')).toBe('longitude');
    expect(columnOf('Brgy.')).toBe('barangay');
    expect(columnOf('DBH (cm)')).toBe('dbh_cm');
    expect(columnOf('Total Height (m)')).toBe('height_m');
    expect(columnOf('Owner')).toBeNull();
  });

  it('turns rows into unverified trees with their measurements', () => {
    const { trees, problems, missing } = read([
      ['Tree No.', 'Common name', 'Scientific name', 'Latitude', 'Longitude', 'Barangay', 'DBH (cm)', 'Total height (m)'],
      ['T-1', 'Narra', 'Pterocarpus indicus', SCZ[0], SCZ[1], 'Poblacion I', 42, 12.5],
    ]);
    expect(missing).toEqual([]);
    expect(problems).toEqual([]);
    expect(trees).toEqual([
      expect.objectContaining({
        row: 2,
        species: 'Narra',
        latitude: SCZ[0],
        barangay: 'Poblacion I',
        details: { tree_no: 'T-1', scientific_name: 'Pterocarpus indicus', dbh_cm: 42, height_m: 12.5 },
      }),
    ]);
  });

  it('leaves owners and other columns behind, and blanks a remark naming a person', () => {
    const { trees, personal, ignored } = read([
      ['Species', 'Lat', 'Long', 'Owner', 'Plot', 'Remarks'],
      ['Mahogany', SCZ[0], SCZ[1], 'Juan dela Cruz', 'A', 'Juan Dela Cruz'],
      ['Narra', SCZ[0], SCZ[1], 'Maria Santos', 'B', 'Near the creek'],
    ]);
    expect(personal).toEqual(['Owner']);
    expect(ignored).toEqual(['Plot']);
    expect(JSON.stringify(trees)).not.toMatch(/Juan|Maria/i);
    expect(trees[1].details.remarks).toBe('Near the creek');
  });

  it('blanks a remark that may name someone, and keeps one about the tree', () => {
    for (const remark of ['Juan Dela Cruz', 'Planted by Juan', 'c/o Mrs. Reyes', 'DELA CRUZ, JUAN', 'Tinanim ni Mang Ando', 'Sps. Reyes']) {
      expect(remarkMayNameSomeone(remark), remark).toBe(true);
    }
    for (const remark of ['Near the creek', 'leaning toward the road', 'Hollow trunk, termites', 'Beside the chapel']) {
      expect(remarkMayNameSomeone(remark), remark).toBe(false);
    }
  });

  it('says which required column is missing', () => {
    expect(read([['Species', 'Barangay'], ['Narra', 'X']]).missing).toEqual(['Latitude', 'Longitude']);
  });

  it('flags rows it cannot place, outside the LGU or with swapped coordinates', () => {
    const { trees, problems } = read([
      ['Species', 'Latitude', 'Longitude', 'DBH'],
      ['Narra', CLB[0], CLB[1], ''],
      ['Narra', SCZ[1], SCZ[0], ''],
      ['', SCZ[0], SCZ[1], ''],
      ['Narra', 'north', SCZ[1], ''],
      ['Narra', SCZ[0], SCZ[1], 5000],
      [],
    ]);
    expect(problems.map((p) => p.row)).toEqual([2, 3, 4, 5, 6]);
    expect(problems[0].text).toMatch(/in Calamba, not Santa Cruz/);
    expect(problems[1].text).toMatch(/swapped/);
    // The tree with the impossible DBH still comes in, without it.
    expect(trees).toHaveLength(1);
    expect(trees[0].details.dbh_cm).toBeUndefined();
  });

  it('names a barangay left blank from the position', () => {
    const { trees } = read([['Species', 'Latitude', 'Longitude'], ['Narra', SCZ[0], SCZ[1]]], {
      barangayAt: () => ({ barangay: 'Poblacion II' }),
    });
    expect(trees[0].barangay).toBe('Poblacion II');
  });

  it('writes each tree as an import, for the database to stamp and route', () => {
    const [tree] = read([['Species', 'Latitude', 'Longitude'], ['Narra', SCZ[0], SCZ[1]]]).trees;
    expect(inventoryRow(tree, { lguName: 'Santa Cruz', fileName: 'trees.xlsx' })).toEqual(
      expect.objectContaining({ source: 'import', status: 'pending', municipality: 'Santa Cruz', details: { file: 'trees.xlsx', row: 2 } })
    );
  });

  it('reads its own template back, every heading a column', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await templateBuffer('Santa Cruz'));
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['Trees', 'How to fill']);
    const headings = book.getWorksheet('Trees').getRow(1).values.slice(1);
    expect(headings.map(columnOf)).toEqual(INVENTORY_COLUMNS.map((column) => column.key));
  });

  it('reads a CSV, quotes and all', () => {
    expect(rowsOfCsv('Species,Remarks\r\n"Narra, old","said ""big"""\nMango,\n')).toEqual([
      ['Species', 'Remarks'],
      ['Narra, old', 'said "big"'],
      ['Mango', ''],
    ]);
  });
});
