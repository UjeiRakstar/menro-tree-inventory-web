import { describe, expect, it } from 'vitest';
import { geometryAreaM2 } from '../areaGeometry.js';
import { biomassKg } from '../treeCarbon.js';
import { buildGhgReport, cuttingLosses, inMappedCover, treeCoverAreas, treeGhg } from './ghg.js';

// A square of open forest, about 1 km across, east of Santa Cruz's poblacion.
const FOREST = {
  properties: { saved: true, kind: 'land-cover', namriaClass: 'open-forest', name: 'Upland forest' },
  geometry: { type: 'Polygon', coordinates: [[[121.4, 14.27], [121.41, 14.27], [121.41, 14.28], [121.4, 14.28], [121.4, 14.27]]] },
};
const BUILT_UP = { ...FOREST, properties: { ...FOREST.properties, namriaClass: 'built-up' } };
const UNSAVED = { ...FOREST, properties: { ...FOREST.properties, saved: false } };

const TREES = [
  // Inside the forest: counted with the area, not again.
  { species: 'Narra', barangay: 'Alipit', dbh: 37, total_height: 14, lat: 14.275, lng: 121.405 },
  // Outside it.
  { species: 'Mangga', barangay: 'Alipit', dbh: 30, total_height: 8, lat: 14.3, lng: 121.42 },
  { species: 'Acacia', barangay: 'Bubukal', dbh: 50, total_height: 18, lat: 14.29, lng: 121.43 },
  // Not measured, and a palm.
  { species: 'Mahogany', barangay: 'Bubukal', dbh: 20, lat: 14.29, lng: 121.43 },
  { species: 'Niyog', barangay: 'Bubukal', dbh: 25, total_height: 10, lat: 14.29, lng: 121.43 },
];
const PLACES = [{ name: 'Alipit' }, { name: 'Bubukal' }];
const report = () => buildGhgReport({ trees: TREES, areas: [FOREST, BUILT_UP, UNSAVED], places: PLACES, short: 'Santa Cruz' });

describe('the mapped tree cover', () => {
  it('is saved land cover of a tree cover class, nothing else', () => {
    expect(treeCoverAreas([FOREST, BUILT_UP, UNSAVED])).toEqual([FOREST]);
  });

  it('knows which trees stand in it', () => {
    expect(inMappedCover(TREES[0], [FOREST])).toBe(true);
    expect(inMappedCover(TREES[1], [FOREST])).toBe(false);
    expect(inMappedCover({ species: 'Narra' }, [FOREST])).toBe(false);
  });
});

describe('a tree’s figures', () => {
  it('adds the roots at the CCC tool’s 0.37, and turns biomass into CO₂', () => {
    const ghg = treeGhg(TREES[0]);
    expect(ghg.agbKg).toBeCloseTo(biomassKg(TREES[0]), 9);
    expect(ghg.biomassKg).toBeCloseTo(ghg.agbKg * 1.37, 9);
    expect(ghg.co2Kg).toBeCloseTo(ghg.biomassKg * 0.45 * (44 / 12), 9);
    expect(ghg.co2YearKg).toBeGreaterThan(0);
    expect(treeGhg(TREES[3])).toBeNull();
  });
});

describe('the forest land table', () => {
  it('follows the CCC tool: area × growth × (1 + 0.37) × carbon content × 44/12', () => {
    const forest = report().tables.find((table) => table.key === 'ghg-forest');
    expect(forest.rows).toHaveLength(1);
    const [row] = forest.rows;
    const ha = geometryAreaM2(FOREST.geometry) / 10000;
    // Open forest takes the secondary forest rate: 3.5 t/ha/yr, carbon 0.446 (Lasco et al. 1999).
    expect(row).toMatchObject({ name: 'Open forest', mai: 3.5, carbonContent: 0.446, rootShoot: 0.37 });
    expect(row.areaHa).toBeCloseTo(ha, 6);
    expect(row.co2YearT).toBeCloseTo(ha * 3.5 * 1.37 * 0.446 * (44 / 12), 6);
    expect(forest.totals.co2YearT).toBeCloseTo(row.co2YearT, 9);
  });
});

describe('the tree table', () => {
  it('counts every tree, measures the ones it can, and marks the ones already in an area', () => {
    const trees = report().tables.find((table) => table.key === 'ghg-trees');
    const alipit = trees.rows.find((row) => row.name === 'Alipit');
    const bubukal = trees.rows.find((row) => row.name === 'Bubukal');
    expect(alipit).toMatchObject({ trees: 2, measured: 2, inCover: 1, meanDbh: 33.5 });
    expect(bubukal).toMatchObject({ trees: 3, measured: 1, inCover: 0 });
    expect(trees.totals).toMatchObject({ trees: 5, measured: 3, inCover: 1 });
  });
});

describe('the summary', () => {
  it('adds the area and the trees outside it, and never a tree twice', () => {
    const { tables } = report();
    const summary = tables.find((table) => table.key === 'ghg-summary');
    const forest = tables.find((table) => table.key === 'ghg-forest');
    const outside = (treeGhg(TREES[1]).co2YearKg + treeGhg(TREES[2]).co2YearKg) / 1000;
    expect(summary.rows[0].co2YearT).toBeCloseTo(forest.totals.co2YearT, 9);
    expect(summary.rows[1].co2YearT).toBeCloseTo(outside, 9);
    expect(summary.totals.co2YearT).toBeCloseTo(forest.totals.co2YearT + outside, 9);
    // No tree cut, so no loss; fuelwood and the other sectors are named, with no number.
    const row = (start) => summary.rows.find((r) => r.name.startsWith(start));
    expect(row('Losses: trees cut')).toMatchObject({ co2YearT: null, from: 'No tree recorded cut under a permit this year' });
    expect(row('Losses: fuelwood')).toMatchObject({ co2YearT: null });
    expect(row('Emissions').from).toMatch(/Outside Green Tag/);
  });

  it('says nothing is counted when nothing is measured or mapped', () => {
    const empty = buildGhgReport({ trees: [], areas: [], places: PLACES, short: 'Pila' });
    expect(empty.tables.find((table) => table.key === 'ghg-summary').totals.co2YearT).toBeNull();
    expect(empty.sections.find((s) => s.key === 'ghg-trees').text).toBe('No tree has been tagged in Pila yet.');
    expect(empty.sections.find((s) => s.key === 'ghg-forest').text).toMatch(/No tree cover has been mapped in Pila yet/);
  });
});

describe('the Excel tree list', () => {
  it('lists every tree, and why one is not counted', () => {
    const [list] = report().annex;
    expect(list.rows).toHaveLength(5);
    expect(list.rows[0]).toMatchObject({ species: 'Narra', inCover: 'Yes — counted in its area', why: '' });
    expect(list.rows[3]).toMatchObject({ species: 'Mahogany', co2Kg: null, why: 'No total height recorded' });
    expect(list.rows[4].why).toMatch(/palm/);
  });
});

describe('trees cut under a permit (21 October)', () => {
  const year = 2026;
  const CUT = { id: 'cut', species: 'Gmelina', dbh: 50, total_height: 18, lat: 14.3, lng: 121.42, task_status: 'Cut' };
  const PERMITS = [
    { id: 'p1', tree_id: 'cut', created_at: '2026-03-01T00:00:00Z', status: 'Pending' },
    { id: 'p2', tree_id: null, created_at: '2026-04-01T00:00:00Z', status: 'Cut', number_of_trees: 2 },
    { id: 'p3', tree_id: null, created_at: '2025-04-01T00:00:00Z', status: 'Cut' },
    { id: 'p4', tree_id: null, created_at: '2026-05-01T00:00:00Z', status: 'Pending' },
  ];

  it('counts the trees cut this year, and the CO₂ the measured ones held, with roots', () => {
    const losses = cuttingLosses({ permits: PERMITS, trees: [CUT], year });
    expect(losses).toMatchObject({ year, trees: 3, measured: 1 });
    expect(losses.co2T).toBeCloseTo(treeGhg(CUT).co2Kg / 1000, 9);
  });

  it('takes the loss from the removals, and counts a cut tree in neither', () => {
    const report = buildGhgReport({ trees: [...TREES, CUT], areas: [FOREST], places: PLACES, short: 'Santa Cruz', permits: PERMITS, year });
    const summary = report.tables.find((table) => table.key === 'ghg-summary');
    const row = (start) => summary.rows.find((r) => r.name.startsWith(start));
    const lost = row('Losses: trees cut').co2YearT;
    expect(row('Losses: trees cut').from).toBe('3 trees cut; the CO₂ the 1 measured held, with roots; 2 never measured, not counted');
    expect(summary.totals.name).toBe('Net removals counted here');
    expect(summary.totals.co2YearT).toBeCloseTo(summary.gains - lost, 9);
    // The cut gmelina is not among the trees that remove CO₂.
    expect(report.annex[0].rows.map((r) => r.species)).not.toContain('Gmelina');
    expect(report.sections.find((s) => s.key === 'ghg-total').text).toMatch(/cut under a permit this year held about/);
  });
});
