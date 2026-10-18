import { describe, it, expect } from 'vitest';
import { barangayTable, carbonTable, formatCell, hazardTable, landCoverTable, plantingSiteTable } from './attributeTables.js';
import { carbonDioxideKg } from './treeVolume.js';
import { listOf, writeReport } from './reportWriter.js';

// About a hectare, in Santa Cruz.
const SQUARE = { type: 'Polygon', coordinates: [[[121.41, 14.28], [121.411, 14.28], [121.411, 14.281], [121.41, 14.281], [121.41, 14.28]]] };
const area = (properties) => ({ type: 'Feature', geometry: SQUARE, properties: { saved: true, approval: 'approved', ...properties } });

const BARANGAYS = [
  { properties: { barangay: 'Alipit', barangay_psgc: 403426001, area_km2: 1.9 } },
  { properties: { barangay: 'Gatid', barangay_psgc: 403426006, area_km2: 0.16 } },
];
const TREES = [
  { species: 'Narra', barangay: 'Alipit', biodiversity_status: 'Endemic', tree_category: 'Timber', origin: 'native', dbh: 30, merchantable_height: 8 },
  { species: 'Mahogany', barangay: 'Alipit', species_type: 'Invasive', tree_category: 'Timber', origin: 'invasive' },
  { species: 'Mango', barangay: 'Alipit', biodiversity_status: 'Endemic', tree_category: 'Fruit', origin: 'native' },
];
const AREAS = [
  area({ kind: 'land-cover', name: 'Alipit Forest', barangay: 'Alipit', coverLabel: 'Open forest', soilType: 'Lipa loam',
    elevationRange: { min: 10, max: 20 }, hazards: { flood: { areaM2: 3000 } } }),
  area({ kind: 'planting-site', name: 'Alipit Riverbank', barangay: 'Alipit', spacingM: 4, recommended: [{ common: 'Narra' }],
    hazards: { flood: { areaM2: 6000 }, landslide: { areaM2: 0 } } }),
  area({ kind: 'planting-site', name: 'Asked for only', approval: 'requested' }),
];

describe('barangayTable', () => {
  it('gives each barangay its area, people, land cover and trees by origin and use', () => {
    const table = barangayTable({
      barangays: BARANGAYS,
      stats: new Map([[403426001, { population: 1659, households: 414 }]]),
      trees: TREES,
      areas: AREAS,
    });
    const alipit = table.rows.find((row) => row.name === 'Alipit');
    expect(alipit).toMatchObject({
      areaHa: 190, population: 1659, households: 414, landCover: 'Open forest',
      trees: 3, species: 3, native: 2, invasive: 1, fruit: 1, timber: 2, ornamental: 0,
    });
    expect(alipit.landCoverHa).toBeCloseTo(1.2, 1);
    // The office's own count where it has one; PSA's 2024 count where it has not.
    expect(alipit.urban).toBe('Rural');
    expect(table.rows.find((row) => row.name === 'Gatid')).toMatchObject({ trees: 0, population: 10656, urban: 'Urban' });
    expect(table.note).toMatch(/PSA 2024 Census of Population/);
    expect(table.totals).toMatchObject({ trees: 3, invasive: 1, name: '2 barangays' });
  });
});

// What measure.js finds over each barangay whole, in m².
const MEASURED = new Map([
  ['Alipit', { flood: { low: 200000, medium: 300000, high: 100000, total: 600000 }, soil: [{ series: 'Lipa loam', share: 0.8 }], elevation: { min: 4, max: 31, mean: 9 } }],
  ['Gatid', { flood: { low: 0, medium: 0, high: 0, total: 0 } }],
]);
const PLACES = [{ name: 'Alipit', areaHa: 190 }, { name: 'Gatid', areaHa: 16 }];

describe('hazardTable', () => {
  it('gives each barangay its ground in flood by level, without any land cover drawn', () => {
    const table = hazardTable({ places: PLACES, measured: MEASURED });
    const [alipit, gatid] = table.rows;
    expect(alipit).toMatchObject({ name: 'Alipit', floodLow: 20, floodMedium: 30, floodHigh: 10, floodHa: 60, soil: 'Lipa loam', elevation: '4–31 m' });
    expect(alipit.floodShare).toBeCloseTo(60 / 190, 5);
    expect(gatid).toMatchObject({ floodHa: 0, floodShare: 0 });
    expect(table.totals).toMatchObject({ floodHa: 60, areaHa: 206, name: '2 barangays' });
  });

  it('leaves a hazard blank, not zero, when its layer is not uploaded — and everything while not measured', () => {
    expect(hazardTable({ places: PLACES, measured: MEASURED }).rows[0]).toMatchObject({ landslideHa: null, landslideShare: null });
    const unmeasured = hazardTable({ places: PLACES, measured: null });
    expect(unmeasured.rows[0]).toMatchObject({ floodHa: null, soil: null });
    expect(unmeasured.totals.floodHa).toBeNull();
  });
});

describe('carbonTable', () => {
  it('adds up the carbon of the measured trees by barangay, and says how many were measured', () => {
    const table = carbonTable({ places: PLACES, trees: TREES });
    const [alipit, gatid] = table.rows;
    expect(alipit).toMatchObject({ trees: 3, measured: 1 });
    expect(alipit.co2T).toBeCloseTo(carbonDioxideKg(TREES[0]) / 1000, 6);
    expect(alipit.carbonT).toBeCloseTo(alipit.co2T * (12 / 44), 6);
    expect(alipit.sequestrationT).toBeGreaterThan(0);
    expect(gatid).toMatchObject({ trees: 0, measured: 0, co2T: null });
    expect(table.totals).toMatchObject({ trees: 3, measured: 1 });
    expect(formatCell(alipit.co2T, 'tonnes')).toMatch(/^\d+(\.\d+)?$/);
  });
});

describe('the land cover and planting site tables', () => {
  it('give each area its exposure to flood and landslide, soil and elevation', () => {
    const [forest] = landCoverTable(AREAS).rows;
    expect(forest).toMatchObject({ name: 'Alipit Forest', cover: 'Open forest', soil: 'Lipa loam', elevation: '10–20 m', landslideHa: null });
    expect(forest.floodHa).toBeCloseTo(0.3, 2);
    expect(forest.floodShare).toBeGreaterThan(0.2);
  });

  it('list only the approved planting sites, with what to plant and how many fit', () => {
    const table = plantingSiteTable(AREAS);
    expect(table.rows.map((row) => row.name)).toEqual(['Alipit Riverbank']);
    expect(table.rows[0]).toMatchObject({ recommended: 'Narra', landslideHa: 0 });
    expect(table.rows[0].seedlings).toBeGreaterThan(500);
    expect(formatCell(table.rows[0].floodShare, 'percent')).toMatch(/^\d+%$/);
    expect(formatCell(null, 'number')).toBe('—');
  });
});

describe('writeReport', () => {
  const tables = {
    barangays: barangayTable({ barangays: BARANGAYS, trees: TREES, areas: AREAS }),
    hazards: hazardTable({ places: PLACES, measured: MEASURED }),
    carbon: carbonTable({ places: PLACES, trees: TREES }),
    landCover: landCoverTable(AREAS),
    plantingSites: plantingSiteTable(AREAS),
  };
  const report = writeReport({
    place: { label: 'Santa Cruz', isCity: false },
    tables,
    trees: TREES,
    climate: { place: 'Santa Cruz', rainfall: { annualMm: 2765 }, temperature: { meanC: 26.6 }, scenario: 'SSP2-4.5' },
    date: new Date('2026-10-17T00:00:00'),
  });
  const section = (key) => report.find((s) => s.key === key)?.text ?? '';

  it('says what the plans it supports are, and that it is for planning only', () => {
    expect(section('purpose')).toMatch(/Municipality of Santa Cruz, Laguna/);
    expect(section('purpose')).toMatch(/Forest Land Use Plan \(FLUP\).*Comprehensive Land Use Plan \(CLUP\).*Comprehensive Development Plan \(CDP\)/);
    expect(section('purpose')).toMatch(/not a land title/);
  });

  it('writes the figures the tables hold, and nothing else', () => {
    expect(section('inventory')).toMatch(/^3 trees of 3 species have been tagged in 1 of the 2 barangays/);
    expect(section('inventory')).toMatch(/2 \(67%\) are endemic or native and 1 \(33%\) invasive/);
    expect(section('inventory')).toMatch(/The invasive trees are mostly Mahogany \(1\)/);
    expect(section('barangays')).toMatch(/1 barangay has no tagged tree yet: Gatid/);
    expect(section('land-cover')).toMatch(/1 land cover area covering/);
    expect(section('planting')).toMatch(/1 tree planting site covers/);
    expect(section('climate')).toMatch(/about 2,765 mm .* about 26\.6 °C/);
  });

  it('says what the trees hold in carbon, and how many of them that speaks for', () => {
    expect(section('inventory')).toMatch(/1 of them have a diameter and merchantable height recorded: together they hold an estimated [\d.]+ t of carbon \([\d.]+ t CO₂\) and take up about [\d.]+ t of CO₂ a year/);
  });

  it('says how much of the place lies in each hazard, and where most', () => {
    expect(section('hazards')).toMatch(/^60 ha \(29%\) of Santa Cruz lies within the flood hazard extent, 10 ha of it at the high level\. The largest shares are in Alipit \(32%\)\./);
    expect(section('hazards')).not.toMatch(/landslide/);
  });

  it('recommends what follows from the figures', () => {
    expect(section('recommendations')).toMatch(/Replace invasive Mahogany with endemic or native species/);
    expect(section('recommendations')).toMatch(/Extend the inventory to the 1 barangay not yet surveyed/);
    expect(section('recommendations')).toMatch(/Choose flood-tolerant species for Alipit Riverbank/);
    expect(section('recommendations')).toMatch(/riverbank and flood-tolerant planting in Alipit, the most exposed to flooding/);
    expect(section('recommendations')).toMatch(/Record the merchantable height of the 2 trees without one/);
  });

  it('lists names as people write them', () => {
    expect(listOf(['A'])).toBe('A');
    expect(listOf(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
