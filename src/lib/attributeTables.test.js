import { describe, it, expect } from 'vitest';
import { barangayTable, formatCell, landCoverTable, plantingSiteTable } from './attributeTables.js';
import { listOf, writeReport } from './reportWriter.js';

// About a hectare, in Santa Cruz.
const SQUARE = { type: 'Polygon', coordinates: [[[121.41, 14.28], [121.411, 14.28], [121.411, 14.281], [121.41, 14.281], [121.41, 14.28]]] };
const area = (properties) => ({ type: 'Feature', geometry: SQUARE, properties: { saved: true, approval: 'approved', ...properties } });

const BARANGAYS = [
  { properties: { barangay: 'Alipit', barangay_psgc: 403426001, area_km2: 1.9 } },
  { properties: { barangay: 'Gatid', barangay_psgc: 403426007, area_km2: 0.16 } },
];
const TREES = [
  { species: 'Narra', barangay: 'Alipit', biodiversity_status: 'Endemic', tree_category: 'Timber', origin: 'native' },
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
    expect(table.rows.find((row) => row.name === 'Gatid')).toMatchObject({ trees: 0, population: null });
    expect(table.totals).toMatchObject({ trees: 3, invasive: 1, name: '2 barangays' });
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

  it('recommends what follows from the figures', () => {
    expect(section('recommendations')).toMatch(/Replace invasive Mahogany with endemic or native species/);
    expect(section('recommendations')).toMatch(/Extend the inventory to the 1 barangay not yet surveyed/);
    expect(section('recommendations')).toMatch(/Choose flood-tolerant species for Alipit Riverbank/);
  });

  it('lists names as people write them', () => {
    expect(listOf(['A'])).toBe('A');
    expect(listOf(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
