import { describe, it, expect } from 'vitest';
import {
  INVENTORY_COLUMNS,
  columnOf,
  coordinateOf,
  groupProblems,
  heightClassOf,
  inventoryRow,
  locationMayNameSomeone,
  readInventory,
  remarkMayNameSomeone,
  rowsOfCsv,
  templateBuffer,
} from './treeInventory.js';

// Santa Cruz's hall, and a point in Calamba.
const SCZ = [14.2794, 121.4157];
const CLB = [14.2117, 121.1653];

const read = (rows, options = {}) => readInventory(rows, { lguName: 'Santa Cruz', ...options });

describe('the tree inventory spreadsheet', () => {
  it('reads the template’s columns under the headings offices actually use', () => {
    expect(columnOf('LAT')).toBe('latitude');
    expect(columnOf('Lng')).toBe('longitude');
    expect(columnOf('Brgy.')).toBe('barangay');
    expect(columnOf('DBH (cm)')).toBe('dbh_1');
    expect(columnOf('Total Height (m)')).toBe('height');
    expect(columnOf('Circumference')).toBe('circumference_1');
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

  it('reads San Pedro’s sheet as it is: two heading rows, circumferences, stems and height classes', () => {
    // The first rows of the City of San Pedro's inventory, headings as written.
    const { trees, problems, missing, headingRow } = readInventory(
      [
        ['', '', '', '', '', '', 'LOCATION', 'LOCATION', 'LOCATION', '', '', 'DBH', 'DBH', 'DBH', 'C', 'C', 'C', ''],
        ['NO.', 'DATE', 'COMMON NAME', 'FAMILY', 'GENUS', 'SPECIES', 'LAT', 'LONG', 'LOC', 'BARANGAY', 'HEIGHT', '1', '2', '3', '12', '22', '32', 'REMARKS'],
        [1, '', 'Ilang-ilang', 'Annonaceae', 'Cananga', 'odorata', 14.35918, 121.04426, 'Magsaysay Road', 'San Antonio', '11-15', { formula: 'O3/3.1416', result: 14.32 }, null, null, 45],
        [65, new Date('2020-02-20'), 'Kaimito', 'Sapotaceae', 'Chrysopyllum', 'cainito', '14.34585°', '121.03526°', 'Sampaguita Avenue', 'Sampaguita', '16-20', null, null, null, 90, 59],
        [36, '', 'Indian Lanutan', 'Annonaceae', 'Polyathia', 'longifolio', 14.35285, 121.0398, 'Near Cataquiz property', 'GSIS', '26-30', null, null, null, 'clustered'],
        [99, '', 'Mahogany', 'Meliaceae', 'Swietenia', 'macrophylla', '', '', '18th St.', 'Pacita 1', '<10', null, null, null, 120],
      ],
      { lguName: 'San Pedro' }
    );
    expect(missing).toEqual([]);
    expect(headingRow).toBe(2);
    expect(trees.map((t) => t.species)).toEqual(['Ilang-ilang', 'Kaimito', 'Indian Lanutan']);
    expect(trees[0].details).toEqual({
      tree_no: '1', scientific_name: 'Cananga odorata', family: 'Annonaceae', location: 'Magsaysay Road', dbh_cm: 14.3, height_class: '11-15',
    });
    // Two stems: one diameter with the same basal area, from the circumferences.
    expect(trees[1].details).toEqual(
      expect.objectContaining({ date_inventoried: '2020-02-20', stems: 2, stem_dbh_cm: [28.6, 18.8], dbh_cm: 34.3, height_class: '16-20' })
    );
    expect(trees[1].latitude).toBe(14.34585);
    expect(trees[2].details).toEqual(expect.objectContaining({ clustered: true, height_class: '26-30' }));
    expect(trees[2].details.location).toBeUndefined();
    expect(groupProblems(problems)).toEqual([{ text: 'No latitude and longitude: it cannot be placed on the map.', rows: [6] }]);
  });

  it('reads coordinates written with a degree sign, or in degrees, minutes and seconds', () => {
    expect(coordinateOf('14.34659°')).toBe(14.34659);
    expect(coordinateOf('121.03733 E')).toBe(121.03733);
    expect(coordinateOf(`14°21'33"N`)).toBeCloseTo(14.359167, 5);
    expect(coordinateOf('121 2 39.3')).toBeCloseTo(121.04425, 5);
    expect(coordinateOf('north')).toBeNaN();
    expect(coordinateOf('')).toBeNull();
  });

  it('knows a height class from a height', () => {
    expect(heightClassOf('11-15')).toBe('11-15');
    expect(heightClassOf('11 – 15 m')).toBe('11-15');
    expect(heightClassOf('<10')).toBe('<10');
    expect(heightClassOf('12.5')).toBeNull();
  });

  it('keeps a street, and blanks a place that is someone’s', () => {
    for (const place of ['Magsaysay Road, Puregold', 'HOJ, San Augustin St.', "King's Farm, Narra Road", 'Phase 6 open space']) {
      expect(locationMayNameSomeone(place), place).toBe(false);
    }
    for (const place of ['Near Cataquiz property', 'House of Mr. Reyes', 'Bahay ni Aling Nena', 'DELA CRUZ, JUAN']) {
      expect(locationMayNameSomeone(place), place).toBe(true);
    }
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

  it('reads its own template back: every heading a column, explained, with the LGU’s barangays to choose from', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await templateBuffer('Santa Cruz', ['Labuin', 'Poblacion I']));
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['Trees', 'Lists', 'How to fill']);
    const trees = book.getWorksheet('Trees');
    const headings = trees.getRow(1).values.slice(1);
    expect(headings.map(columnOf)).toEqual(INVENTORY_COLUMNS.map((column) => column.key));
    expect(trees.getRow(1).getCell(1).note).toBeTruthy();
    expect(book.getWorksheet('Lists').getColumn(1).values.slice(1, 4)).toEqual(['Barangay', 'Labuin', 'Poblacion I']);
    const letter = trees.getColumn(INVENTORY_COLUMNS.findIndex((column) => column.key === 'barangay') + 1).letter;
    for (const row of [2, 5001]) {
      expect(trees.getCell(`${letter}${row}`).dataValidation).toEqual(expect.objectContaining({ type: 'list', formulae: ['Lists!$A$2:$A$3'] }));
    }
  });

  it('reads a CSV, quotes and all', () => {
    expect(rowsOfCsv('Species,Remarks\r\n"Narra, old","said ""big"""\nMango,\n')).toEqual([
      ['Species', 'Remarks'],
      ['Narra, old', 'said "big"'],
      ['Mango', ''],
    ]);
  });
});
