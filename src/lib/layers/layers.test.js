import { describe, it, expect } from 'vitest';
import { columnsOf, rowsOf } from './grid.js';
import { NO_ELEVATION, bandOf, elevationGrid, elevationTypeOf } from './elevation.js';
import { areaFacts } from './measure.js';
import { drawPicture } from './picture.js';
import { lguOfPlace, readCliram } from './cliram.js';

// 10 × 10 cells of 0.01°, about 1.1 km a side, near the equator.
const GRID = { west: 0, south: 0, east: 0.1, north: 0.1, cell: 0.01 };
const CELLS = columnsOf(GRID) * rowsOf(GRID);
const square = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });

describe('elevationGrid', () => {
  it('takes each cell’s height as the mean of the raster pixels in it', () => {
    // A 20 × 20 raster over the same extent: four pixels to a cell.
    const values = new Float32Array(400).map((_, i) => (i % 20 < 10 ? 10 : 30));
    const heights = elevationGrid(GRID, values, { width: 20, height: 20, bbox: [0, 0, 0.1, 0.1] });
    expect(heights[0]).toBe(10);
    expect(heights[9]).toBe(30);
  });

  it('leaves a cell with no usable pixel as no data', () => {
    const values = new Float32Array(400).fill(-9999);
    expect(elevationGrid(GRID, values, { width: 20, height: 20, bbox: [0, 0, 0.1, 0.1] })[0]).toBe(NO_ELEVATION);
  });

  it('names the ground and its band by height', () => {
    expect(elevationTypeOf(40)).toBe('Lowland');
    expect(elevationTypeOf(300)).toBe('Upland');
    expect(elevationTypeOf(900)).toBe('Highland');
    expect(bandOf(450)).toBe(3);
    expect(bandOf(NO_ELEVATION)).toBe(0);
  });
});

describe('areaFacts', () => {
  const flood = new Uint8Array(CELLS);
  // The western half of the grid floods: low in the south, high in the north.
  for (let row = 0; row < 10; row += 1) for (let col = 0; col < 5; col += 1) flood[row * 10 + col] = row < 5 ? 3 : 1;
  const elevation = new Int16Array(CELLS).map((_, i) => 100 + i);
  const soil = { cells: new Uint8Array(CELLS).fill(1).map((_, i) => (i % 10 < 3 ? 2 : 1)), classes: [
    { series: 'Lipa', description: 'Lipa loam', zone: 'Uplands' },
    { series: 'Marikina', description: 'Marikina silty clay loam', zone: 'Lowlands' },
  ] };

  it('measures the flood levels across the area, scaled to its drawn size', () => {
    // Columns 3–6, the northern half: 2 high cells and 2 dry cells per row.
    const facts = areaFacts(GRID, square(0.03, 0.05, 0.07, 0.1), { flood }, { areaM2: 1000 });
    expect(facts.sampled).toBe('cells');
    expect(facts.flood.high).toBe(500);
    expect(facts.flood.low).toBe(0);
    expect(facts.flood.total).toBe(500);
  });

  it('gives the elevation range and the soils by share, most first', () => {
    const facts = areaFacts(GRID, square(0, 0.08, 0.05, 0.1), { elevation, soil });
    expect(facts.elevation).toEqual({ min: 100, max: 114, mean: 107 });
    expect(facts.soil.map((s) => [s.series, s.share])).toEqual([['Marikina', 0.6], ['Lipa', 0.4]]);
  });

  it('measures a sliver smaller than a cell by the cell under its middle, and says so', () => {
    const facts = areaFacts(GRID, square(0.011, 0.091, 0.012, 0.092), { flood }, { areaM2: 50 });
    expect(facts.sampled).toBe('centre');
    expect(facts.flood.high).toBe(50);
  });
});

describe('drawPicture', () => {
  it('colours each pixel by its cell, leaving nothing transparent', () => {
    const values = new Uint8Array(CELLS);
    values[0] = 3;
    const picture = drawPicture(GRID, values, (v) => (v === 3 ? [204, 0, 0, 180] : null));
    expect(picture.width).toBe(10);
    expect(Array.from(picture.data.slice(0, 4))).toEqual([204, 0, 0, 180]);
    expect(picture.data[7]).toBe(0); // the next pixel: nothing there
    expect(picture.bounds).toEqual([[0, 0], [0.1, 0.1]]);
  });
});

describe('readCliram', () => {
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const sheet = (name, title, baseline, projected) => ({
    name,
    rows: [
      [null, `Projected Changes in ${title} for Pakil, Laguna  -  SSP2-4.5`],
      [null, 'Month', 'baseline', 'Range*', '2021-2050', '2031-2060'],
      ...MONTH_NAMES.flatMap((month, i) => [
        [null, month, '', 'Upper Bound', '99', '99'],
        [null, month, String(baseline[i]), 'Median', `${projected[i]} (+1.0 %)`, '0'],
        [null, month, '', 'Lower Bound', '0', '0'],
      ]),
    ],
  });
  const temps = [24, 25, 26, 27, 28, 28, 27, 27, 27, 27, 26, 25];
  const rain = [100, 80, 60, 50, 150, 250, 350, 400, 350, 300, 300, 300];
  const sheets = [
    sheet('Monthly projected Temperature', 'Temperature', temps, temps.map((t) => t + 1)),
    sheet('Monthly projected Rainfall', 'Rainfall', rain, rain.map((r) => r + 10)),
  ];

  it('reads the observed baseline: the mean temperature and the year’s rainfall', () => {
    const climate = readCliram(sheets);
    expect(climate).toMatchObject({ place: 'Pakil', scenario: 'SSP2-4.5' });
    expect(climate.temperature.meanC).toBe(26.4);
    expect(climate.rainfall.annualMm).toBe(2690);
  });

  it('keeps the nearest period’s median projection', () => {
    const climate = readCliram(sheets);
    expect(climate.temperature.projected).toEqual({ period: '2021-2050', meanC: 27.4 });
    expect(climate.rainfall.projected).toEqual({ period: '2021-2050', annualMm: 2810 });
  });

  it('says what is wrong with a workbook that is not CLIRAM’s', () => {
    expect(() => readCliram([{ name: 'Sheet1', rows: [] }])).toThrow(/not a CLIRAM workbook/);
  });

  it('matches CLIRAM’s names to the LGUs', () => {
    const lgus = [
      { name: 'Biñan', label: 'Biñan City' },
      { name: 'San Pablo', label: 'San Pablo City' },
      { name: 'Los Baños', label: 'Los Baños' },
    ];
    expect(lguOfPlace('City of Biñan', lgus)?.name).toBe('Biñan');
    expect(lguOfPlace('San Pablo City', lgus)?.name).toBe('San Pablo');
    expect(lguOfPlace('Los Banos', lgus)?.name).toBe('Los Baños');
    expect(lguOfPlace('Laguna', lgus)).toEqual({ province: true });
    expect(lguOfPlace('Quezon City', lgus)).toBeNull();
  });
});
