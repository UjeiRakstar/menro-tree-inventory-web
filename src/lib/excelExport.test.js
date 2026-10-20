import { describe, expect, it } from 'vitest';
import { barangaySummary } from './excelExport.js';
import { carbonDioxideKg } from './treeCarbon.js';

describe('barangaySummary', () => {
  const trees = [
    { barangay: 'Alipit', species: 'Narra', biodiversity_status: 'Endemic', dbh: 37, total_height: 14 },
    { barangay: 'Alipit', species: 'Mahogany', species_type: 'Invasive', dbh: 20 },
    { barangay: 'Bubukal', species: 'Niyog', dbh: 25, total_height: 10 },
    { barangay: '', species: 'Mangga', dbh: 30, total_height: 8 },
  ];

  it('counts each barangay’s trees and the carbon of the measured ones, not a flat figure a tree', () => {
    const [alipit, unrecorded, bubukal] = barangaySummary(trees);
    expect(alipit).toMatchObject({ name: 'Alipit', trees: 2, native: 1, invasive: 1, measured: 1 });
    expect(alipit.co2).toBeCloseTo(carbonDioxideKg(trees[0]) / 1000, 9);
    expect(alipit.co2Year).toBeGreaterThan(0);
    // A coconut is a tree in the count and nothing in the carbon.
    expect(bubukal).toMatchObject({ name: 'Bubukal', trees: 1, measured: 0, co2: 0 });
    expect(unrecorded.name).toBe('Barangay not recorded');
  });
});
