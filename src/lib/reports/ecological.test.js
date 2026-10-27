import { describe, expect, it } from 'vitest';
import {
  buildEcologicalReport,
  densityTable,
  heightTable,
  monthsLabel,
  originSpeciesTable,
  phenologyTable,
  treeExposureTable,
  treeSummaryTable,
  treesByPlaceTable,
} from './ecological.js';
import { LAGUNA_GRID, columnsOf, rowsOf } from '../layers/grid.js';

const SANTA_CRUZ = { name: 'Santa Cruz', label: 'Santa Cruz', psgc: 403426000, isCity: false };
const PLACES = [
  { name: 'Alipit', areaHa: 100 },
  { name: 'Bagumbayan', areaHa: 50 },
];
const TREES = [
  { id: 't1', barangay: 'Alipit', species: 'Narra', scientific_name: 'Pterocarpus indicus', species_type: 'Endemic', tree_category: 'Timber', dbh: 32, total_height: 12, latitude: 14.28, longitude: 121.41 },
  { id: 't2', barangay: 'Alipit', species: 'Mango', species_type: 'Introduced', tree_category: 'Fruit', dbh: 18, total_height: 7, latitude: 14.281, longitude: 121.411 },
  { id: 't3', barangay: 'Bagumbayan', species: 'Mahogany', species_type: 'Invasive', tree_category: 'Timber', dbh: 45, total_height: 21, latitude: 14.4, longitude: 121.3 },
];

/** A flood grid: high at t1's cell, none elsewhere. */
function floodGrid() {
  const values = new Uint8Array(columnsOf(LAGUNA_GRID) * rowsOf(LAGUNA_GRID));
  const row = Math.floor((LAGUNA_GRID.north - 14.28) / LAGUNA_GRID.cell);
  const col = Math.floor((121.41 - LAGUNA_GRID.west) / LAGUNA_GRID.cell);
  values[row * columnsOf(LAGUNA_GRID) + col] = 3;
  return values;
}

describe('the tables', () => {
  it('sums the trees by origin and by use', () => {
    const table = treeSummaryTable(TREES);
    expect(table.origin).toMatchObject({ endemic: 1, invasive: 1 });
    expect(table.use).toMatchObject({ fruit: 1, timber: 2 });
    expect(table.totals.count).toBe(3);
  });

  it('counts each place’s trees, every place listed, none left out', () => {
    const table = treesByPlaceTable({ trees: TREES, places: PLACES });
    expect(table.rows.map((row) => [row.name, row.trees, row.endemic, row.invasive, row.fruit])).toEqual([
      ['Alipit', 2, 1, 0, 1],
      ['Bagumbayan', 1, 0, 1, 0],
    ]);
    expect(table.totals.species).toBe(3);
  });

  it('lists the endemic, native and invasive species, endemic first', () => {
    const rows = originSpeciesTable({ trees: TREES }).rows;
    expect(rows.map((row) => [row.name, row.origin])).toEqual([['Narra', 'Endemic'], ['Mahogany', 'Invasive']]);
  });

  it('classes the heights, and the trees per hectare, densest first', () => {
    const height = heightTable(TREES);
    expect(height.rows.find((row) => row.name === '20 m and over').count).toBe(1);
    expect(height.mean).toBeCloseTo((12 + 7 + 21) / 3);
    const density = densityTable({ trees: TREES, places: [{ name: 'Alipit', areaHa: 100 }, { name: 'Bagumbayan', areaHa: 20 }] });
    expect(density.rows[0]).toMatchObject({ name: 'Bagumbayan', perHa: 0.05 });
    expect(density.totals.perHa).toBeCloseTo(3 / 120);
  });

  it('writes month runs, across December into January', () => {
    expect(monthsLabel([3, 4, 5])).toBe('March to May');
    expect(monthsLabel([11, 12, 1])).toBe('November to January');
    expect(monthsLabel([3, 6])).toBe('March, June');
    expect(monthsLabel([])).toBeNull();
  });

  it('gives each species its flowering and fruiting months, and what was last seen', () => {
    const table = phenologyTable({
      trees: TREES,
      profiles: [{ species: 'Mango', flowering_months: [12, 1, 2], fruiting_months: [4, 5, 6] }],
      records: [
        { tree_id: 't2', fruiting_status: 'None', flowering_status: 'Full Bloom', observed_at: '2026-01-10' },
        { tree_id: 't2', fruiting_status: 'Ripe / Mature', flowering_status: 'None', observed_at: '2026-05-10' },
      ],
    });
    const mango = table.rows.find((row) => row.name === 'Mango');
    expect(mango).toMatchObject({ use: 'Fruit', flowering: 'December to February', fruiting: 'April to June', inFruit: 1, inFlower: 0 });
    expect(table.rows.find((row) => row.name === 'Narra').fruiting).toBeNull();
  });

  it('reads each tree’s hazard level at its own point', () => {
    const table = treeExposureTable({ trees: TREES, places: PLACES, grids: { flood: floodGrid() } });
    expect(table.rows.find((row) => row.name === 'Alipit')).toMatchObject({ trees: 2, flood: 1, floodHigh: 1, landslide: null });
    expect(table.totals).toMatchObject({ trees: 3, flood: 1, floodHigh: 1 });
  });

  it('says an area’s exposure is not measured rather than 0 ha', () => {
    const unmeasured = buildEcologicalReport({
      places: PLACES,
      trees: TREES,
      tables: { landCover: { rows: [{ name: 'Forest', areaHa: 10, floodHa: null, landslideHa: null }] } },
    });
    const text = unmeasured.sections.find((s) => s.key === 'area-exposure').text;
    expect(text).toMatch(/the flood exposure is not measured, nor the landslide exposure/);
    expect(text).not.toMatch(/0 ha lie/);
  });

  it('says nothing of exposure without a hazard layer, rather than zero', () => {
    const table = treeExposureTable({ trees: TREES, places: PLACES, grids: null });
    expect(table.totals.flood).toBeNull();
    expect(table.totals.share).toBeNull();
    expect(table.rows.every((row) => row.share === null)).toBe(true);
  });
});

describe('the report', () => {
  const report = buildEcologicalReport({
    place: SANTA_CRUZ,
    places: PLACES,
    trees: TREES,
    grids: { flood: floodGrid() },
    populationOf: (name) => ({ Alipit: 1000, Bagumbayan: 500 })[name],
    urbanOf: (name) => (name === 'Alipit' ? 'Urban' : 'Rural'),
  });

  it('follows the outline: summary, profile, biodiversity, exposure', () => {
    expect(report.title).toBe('ECOLOGICAL PROFILE AND TREE INVENTORY REPORT');
    expect(report.chapters.map((c) => c.heading)).toEqual([
      '1. Executive Summary',
      '2. Ecological Profile',
      '3. Biodiversity of Trees',
      '4. Exposure of Natural Resources to Hazards',
    ]);
    expect(report.chapters[1].parts.map((p) => p.heading)).toEqual(['2.1 Location', '2.2 Elevation', '2.3 Slope', '2.4 Climate']);
    expect(report.chapters[2].parts.map((p) => p.heading)).toEqual([
      '3.1 Overview of the Biodiversity',
      '3.2 Endemic, Native and Invasive Trees',
      '3.3 Vegetation Structure and Density',
      '3.4 Phenology and Economic Value',
    ]);
  });

  it('keeps each part’s maps with it, every map drawable', () => {
    const keys = new Set(report.maps.map((m) => m.key));
    for (const p of report.chapters.flatMap((c) => c.parts)) for (const key of p.maps) expect(keys.has(key)).toBe(true);
    expect(report.chapters[2].parts[0].maps).toEqual(['trees']);
    expect(report.maps.find((m) => m.key === 'location')).toMatchObject({ trees: false, sites: false, survey: null });
  });

  it('writes every section from the figures, each with its own key', () => {
    const keys = report.sections.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const text = (key) => report.sections.find((s) => s.key === key).text;
    // Nothing half-written: no object, no undefined, no NaN in the prose.
    for (const section of report.sections) expect(section.text).not.toMatch(/\[object|undefined|NaN/);
    expect(text('structure')).toMatch(/^(A mix of ages|Mostly young trees|Mostly mature trees):/);
    expect(text('summary')).toMatch(/the ecology of the Municipality of Santa Cruz/);
    expect(text('location')).toMatch(/^The Municipality of Santa Cruz is a municipality/);
    // Green Tag is named in Data and limitations only; the references carry their links.
    for (const section of report.sections.filter((s) => s.key !== 'sources')) expect(section.text).not.toMatch(/Green Tag/);
    expect(text('sources')).toMatch(/prepared with the Green Tag Tree Inventory System/);
    // The figures are the users' own: where they differ from the CBMS or another plan, the latest, validated, is used.
    expect(text('sources')).toMatch(/Disclaimer: this report is based on the data entered by its users[\s\S]*CBMS[\s\S]*the latest data should be used, as validated by the user\./);
    expect(text('references')).toMatch(/https:\/\/noah\.up\.edu\.ph/);
    expect(text('references').split('\n\n').length).toBeGreaterThan(10);
    expect(report.chapters.at(-1).parts.map((p) => p.heading).slice(-2)).toEqual(['Data and Limitations', 'References']);
    expect(text('summary')).toMatch(/3 trees of 3 species/);
    expect(text('location')).toMatch(/1 of them urban and 1 rural/);
    expect(text('location')).toMatch(/about 1,500 residents/);
    expect(text('origin')).toMatch(/Narra \(1\)/);
    expect(text('origin')).toMatch(/Mahogany \(1\)/);
    expect(text('tree-exposure')).toMatch(/1 of the 3 tagged trees \(33%\) stand in UP NOAH’s flood/);
    expect(text('elevation')).toMatch(/elevation layer has not been uploaded/);
    expect(text('climate')).toMatch(/No CLIRAM figures/);
  });

  it('gathers every table, for the Excel file', () => {
    expect(report.tables.map((t) => t.key)).toEqual(
      expect.arrayContaining(['location', 'elevation', 'slope', 'tree-summary', 'species', 'trees-by-place', 'origin-by-place', 'diameter-classes', 'height-classes', 'density', 'diversity', 'phenology', 'tree-exposure'])
    );
  });
});
