import { describe, it, expect } from 'vitest';
import { hazardTable } from '../attributeTables.js';
import {
  climateTable,
  compositionTable,
  diversityIndices,
  elevationTable,
  originOf,
  peopleExposedTable,
  slopeTable,
  soilSeriesTable,
} from './thematic.js';

const PLACES = [
  { name: 'Alipit', areaHa: 100 },
  { name: 'Gatid', areaHa: 50 },
];
const M = (ha) => ha * 10000;
const MEASURED = new Map([
  ['Alipit', {
    flood: { low: M(10), medium: M(5), high: M(5), total: M(20) },
    soil: [{ series: 'Lipa loam', description: 'Lipa loam', share: 0.75 }, { series: 'Guadalupe clay', share: 0.25 }],
    elevation: { min: 4, max: 640, mean: 120 },
    terrain: { elevation: { below500: M(90), from500: M(10), above1000: 0 }, slope: { below18: M(60), from18: M(20), from30: M(15), above50: M(5) }, meanSlope: 14.2 },
  }],
  ['Gatid', {
    flood: { low: 0, medium: 0, high: 0, total: 0 },
    soil: [{ series: 'Guadalupe clay', share: 1 }],
    elevation: { min: 3, max: 20, mean: 8 },
    terrain: { elevation: { below500: M(50), from500: 0, above1000: 0 }, slope: { below18: M(50), from18: 0, from30: 0, above50: 0 }, meanSlope: 2.1 },
  }],
]);
const TREES = [
  { species: 'Narra', scientific_name: 'Pterocarpus indicus', species_type: 'Endemic' },
  { species: 'Narra', species_type: 'Endemic' },
  { species: 'Molave', species_type: 'Native' },
  { species: 'Mahogany', species_type: 'Invasive' },
  { species: 'Mango', species_type: 'Introduced' },
  { species: 'Unknown' },
];

describe('the soil report', () => {
  it('gives each series its area and share, and where it is the main soil', () => {
    const table = soilSeriesTable({ places: PLACES, measured: MEASURED });
    expect(table.rows.map((r) => [r.name, r.areaHa, r.mainIn])).toEqual([
      ['Lipa loam', 75, 'Alipit'],
      ['Guadalupe clay', 75, 'Gatid'],
    ]);
    expect(table.totals.areaHa).toBe(150);
    expect(table.rows[0].share).toBeCloseTo(0.5, 5);
  });

});

describe('the elevation and slope report', () => {
  it('measures each place in the FLUP classes', () => {
    const elevation = elevationTable({ places: PLACES, measured: MEASURED });
    expect(elevation.rows[0]).toMatchObject({ name: 'Alipit', below500: 90, from500: 10, above1000: 0, min: 4, max: 640 });
    const slope = slopeTable({ places: PLACES, measured: MEASURED });
    expect(slope.rows[0].steep).toBeCloseTo(0.4, 5);
    expect(slope.totals.steep).toBeCloseTo(40 / 150, 5);
  });

});

describe('the hazard and climate report', () => {
  const hazards = hazardTable({ places: PLACES, measured: MEASURED });

  it('estimates the people in hazard areas, and says it is an estimate', () => {
    const people = peopleExposedTable({ hazards, populationOf: (name) => ({ Alipit: 1000, Gatid: 500 })[name] });
    expect(people.rows[0]).toMatchObject({ name: 'Alipit', floodPeople: 200, highFloodPeople: 50 });
    expect(people.totals).toMatchObject({ population: 1500, floodPeople: 200 });
    expect(people.note).toMatch(/estimate, not a count/);
  });

  it('lays the CLIRAM months out, and is left out without them', () => {
    const climate = { place: 'Santa Cruz', rainfall: { annualMm: 2765, monthly: Array(12).fill(230) }, temperature: { meanC: 26.6, monthly: Array(12).fill(26.6) } };
    const table = climateTable(climate);
    expect(table.rows).toHaveLength(12);
    expect(table.totals).toMatchObject({ rainfall: 2765, temperature: 26.6 });
    expect(climateTable(null)).toBeNull();
  });

});

describe('the biodiversity report', () => {
  it('sorts trees into the bulletin’s origins', () => {
    expect(TREES.map(originOf)).toEqual(['endemic', 'endemic', 'native', 'invasive', 'exotic', 'unrecorded']);
  });

  it('computes richness, Shannon, evenness and Simpson as TB 2018-02 gives them', () => {
    const d = diversityIndices(TREES);
    // Narra 2, Molave 1, Mahogany 1, Mango 1 — the unknown one left out.
    expect(d).toMatchObject({ S: 4, N: 5 });
    const p = [0.4, 0.2, 0.2, 0.2];
    expect(d.shannon).toBeCloseTo(-p.reduce((t, x) => t + x * Math.log(x), 0), 10);
    expect(d.evenness).toBeCloseTo(d.shannon / Math.log(4), 10);
    expect(d.simpson).toBeCloseTo(0.16 + 0.04 * 3, 10);
    expect(compositionTable(TREES).counts).toEqual({ endemic: 2, native: 1, exotic: 1, invasive: 1, unrecorded: 1 });
  });


});
