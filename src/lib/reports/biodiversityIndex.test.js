import { describe, expect, it } from 'vitest';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { buildIndexReport, indexScope } from './biodiversityIndex.js';
import { buildGreenhouseReport, emissionsTable, potentialTable } from './greenhouse.js';

const SANTA_CRUZ = { name: 'Santa Cruz', label: 'Santa Cruz', psgc: 403426000, isCity: false };
const CALAMBA = { name: 'Calamba', label: 'Calamba', psgc: 403405000, isCity: true };
const PLACES = [
  { name: 'Poblacion', areaHa: 100 },
  { name: 'Bukid', areaHa: 300 },
];
const urbanOf = (name) => (name === 'Poblacion' ? 'Urban' : 'Rural');
const populationOf = (name) => ({ Poblacion: 20000, Bukid: 5000 })[name];

// A square of about 108 ha, in a barangay of the place.
const square = (props, west = 121.4) => ({
  type: 'Feature',
  properties: { saved: true, municipality: 'Santa Cruz', ...props },
  geometry: { type: 'Polygon', coordinates: [[[west, 14.28], [west + 0.009, 14.28], [west + 0.009, 14.289], [west, 14.289], [west, 14.28]]] },
});

const TREES = [
  { id: 'a', species: 'Narra', species_type: 'Native', barangay: 'Poblacion', dateCaptured: '2025-03-01' },
  { id: 'b', species: 'Molave', species_type: 'Endemic', barangay: 'Poblacion', dateCaptured: '2026-03-01' },
  { id: 'c', species: 'Ipil-ipil', biodiversity_status: 'Invasive', barangay: 'Bukid', dateCaptured: '2026-03-01' },
];

describe('the index report', () => {
  it('is the UBI for a municipality, measured on its urban barangays', () => {
    const scope = indexScope({ place: SANTA_CRUZ, places: PLACES, urbanOf, populationOf });
    expect([...scope.names]).toEqual(['Poblacion']);
    expect(scope).toMatchObject({ areaHa: 100, population: 20000, whole: false });
    // A city is measured whole.
    expect(indexScope({ place: CALAMBA, places: PLACES, urbanOf, populationOf })).toMatchObject({ names: null, areaHa: 400, population: 25000 });
  });

  it('opens with the Ecological Profile, then the three components, each indicator with its source', () => {
    const report = buildIndexReport({
      place: SANTA_CRUZ,
      places: PLACES,
      urbanOf,
      populationOf,
      trees: TREES,
      features: [square({ kind: 'land-cover', namriaClass: 'grassland', barangay: 'Poblacion' }), square({ kind: 'land-cover', namriaClass: 'closed-forest', barangay: 'Bukid' }, 121.42)],
      newsPosts: [],
      self: { 17: { points: 2, note: 'LBSAP 2025' } },
      year: 2026,
    });
    expect(report.title).toBe('URBAN BIODIVERSITY INDEX REPORT');
    expect(report.chapters.map((c) => c.heading)).toEqual([
      '1. Executive Summary',
      '2. Ecological Profile',
      '3. Native Biodiversity in the City',
      '4. Ecosystem Services Provided by Biodiversity',
      '5. Governance and Management of Biodiversity',
    ]);
    expect(report.chapters[1].parts.map((p) => p.heading)).toEqual(['2.1 Location', '2.2 Elevation', '2.3 Slope', '2.4 Climate', '2.5 Biodiversity Features']);
    // Only the urban barangay's grassland and trees: the forest and the invasive tree are in Bukid.
    const native = report.tables.find((t) => t.key === 'index-native');
    expect(native.rows.find((r) => r.name.startsWith('1.')).points).not.toBe('');
    expect(native.rows.find((r) => r.name.startsWith('9.'))).toMatchObject({ points: '4', source: 'Measured by the system' });
    expect(native.rows.find((r) => r.name.startsWith('4.')).shows).toBe('+1 native species since the baseline year');
    const governance = report.tables.find((t) => t.key === 'index-governance');
    expect(governance.rows.find((r) => r.name.startsWith('17.'))).toMatchObject({ points: '2', source: 'Self-assessed by the office' });
    expect(governance.rows.find((r) => r.name.startsWith('16.'))).toMatchObject({ points: '', source: 'Not yet scored' });
    const keys = report.sections.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const section of report.sections) expect(section.text).not.toMatch(/\[object|undefined|NaN/);
    const text = (key) => report.sections.find((s) => s.key === key).text;
    expect(text('summary')).toMatch(/In Santa Cruz that is 1 urban barangay — Poblacion — about 100 ha and 20,000 residents/);
    expect(text('sources')).toMatch(/Green Tag Tree Inventory System/);
    expect(text('sources')).toMatch(/Disclaimer: this report is based on the data entered by its users/);
    expect(report.maps.map((m) => m.key)).toEqual(['location', 'elevation', 'slope', 'index-areas']);
  });

  it('is the CBI for a city', () => {
    expect(buildIndexReport({ place: CALAMBA, places: PLACES, trees: [], newsPosts: null }).title).toBe('CITY BIODIVERSITY INDEX REPORT');
  });
});

describe('the greenhouse gas report', () => {
  it('counts the potential of open planting sites and degraded land, and waits for the GHGI System’s emissions', () => {
    const potential = potentialTable([
      square({ kind: 'planting-site', approval: 'approved', status: 'open' }),
      square({ kind: 'planting-site', approval: 'requested', status: 'open' }),
      square({ kind: 'land-cover', namriaClass: 'open-forest', condition: 'degraded' }),
    ]);
    expect(potential.rows.map((r) => r.areas)).toEqual([1, 1]);
    expect(potential.totals.co2YearT).toBeGreaterThan(0);

    const waiting = emissionsTable(null);
    expect(waiting.rows.every((r) => r.co2eT === null && r.from === 'Awaiting the GHGI System')).toBe(true);
    expect(waiting.totals.co2eT).toBeNull();

    const report = buildGreenhouseReport({ place: SANTA_CRUZ, places: PLACES, trees: TREES, features: [], year: 2026 });
    expect(report.title).toBe('GREENHOUSE GAS REPORT');
    expect(report.chapters.map((c) => c.heading)).toEqual([
      '1. Executive Summary',
      '2. The Place',
      '3. Removals: Forest Land, Tree Cover and Trees',
      '4. Sequestration Potential',
      '5. Emissions',
    ]);
    expect(report.chapters[1].parts.map((p) => p.heading)).toEqual(['2.1 Location', '2.2 Climate']);
    const text = (key) => report.sections.find((s) => s.key === key).text;
    expect(text('ghg-emissions')).toMatch(/GHGI System of Laguna State Polytechnic University \(https:\/\/ghgi\.lspu\.edu\.ph\)/);
    expect(text('summary')).toMatch(/whose figures are not in yet/);
    const keys = report.sections.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const section of report.sections) expect(section.text).not.toMatch(/\[object|undefined|NaN/);
    // The Excel file carries every tree as well.
    expect(report.tables.map((t) => t.key)).toContain('ghg-tree-list');
  });
});
