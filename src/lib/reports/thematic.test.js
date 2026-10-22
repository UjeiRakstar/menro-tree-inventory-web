import { describe, it, expect } from 'vitest';
import { hazardTable } from '../attributeTables.js';
import {
  buildThemeReport,
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

  it('writes what the tables say, and what the soils mean for the plans', () => {
    const report = buildThemeReport('soil', { place: { label: 'Santa Cruz', isCity: false, psgc: 403426000 }, ...{ places: PLACES, measured: MEASURED } });
    expect(report.title).toBe('SOIL REPORT');
    expect(report.maps.map((m) => m.survey)).toEqual(['soil']);
    const text = Object.fromEntries(report.sections.map((s) => [s.key, s.text]));
    expect(text.soil).toMatch(/^2 soil series are mapped in the Municipality of Santa Cruz \(DA–BSWM\)/);
    expect(text['soil-relevance']).toMatch(/FLUP: .*Module 2, Table 1.*CLUP \/ CDP: .*eLCCAP: .*CBI: /);
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

  it('cites the 18% line in PD 705', () => {
    const report = buildThemeReport('terrain', { place: { label: 'Santa Cruz', psgc: 403426000 }, places: PLACES, measured: MEASURED });
    const text = Object.fromEntries(report.sections.map((s) => [s.key, s.text]));
    expect(text.elevation).toMatch(/rises from about 3 m to 640 m above sea level/);
    expect(text.slope).toMatch(/The largest shares of ground at 18% and over are in Alipit \(40%\)/);
    expect(text['terrain-relevance']).toMatch(/PD 705, section 15/);
    expect(report.maps.map((m) => m.survey)).toEqual(['elevation', 'slope']);
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

  it('says it is exposure, not risk, and where it goes in the LCCAP', () => {
    const report = buildThemeReport('hazards', {
      place: { label: 'Santa Cruz', psgc: 403426000 },
      tables: { hazards },
      populationOf: () => 1000,
      climate: { rainfall: { annualMm: 2765, projected: { period: '2036–2065', annualMm: 2900 } }, temperature: { meanC: 26.6 }, scenario: 'SSP2-4.5' },
    });
    const text = Object.fromEntries(report.sections.map((s) => [s.key, s.text]));
    expect(text.flood).toMatch(/^20 ha \(13%\) of Santa Cruz lies within the UP NOAH flood susceptibility extent: 10 ha at the low level, 5 ha medium and 5 ha high/);
    expect(text.landslide).toMatch(/has not been uploaded/);
    expect(text.climate).toMatch(/For 2036–2065 under SSP2-4\.5, annual rainfall is projected at about 2,900 mm/);
    expect(text['hazards-relevance']).toMatch(/exposure, not risk.*Task 3A\.4/);
    expect(report.maps.map((m) => m.survey)).toEqual(['flood', 'landslide']);
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

  it('says what it can give toward the CBI, and what is outside it', () => {
    const report = buildThemeReport('biodiversity', {
      place: { label: 'Santa Cruz', psgc: 403426000 },
      trees: TREES,
      tables: { landCover: { rows: [{ areaHa: 12, treeCover: true, natural: true }, { areaHa: 5, treeCover: false, natural: false }] } },
      placeAreaHa: 3718,
      communityTags: 4,
    });
    const cbi = report.tables.find((t) => t.key === 'cbi');
    expect(cbi.rows[0]).toMatchObject({ name: '1. Proportion of natural areas', value: '12 ha of natural land cover mapped (0% of the area)' });
    expect(cbi.rows.at(-2).value).toBe('Outside this system');
    // Points on the Handbook's bands where the system has the measure: 0.3% natural area is none.
    expect(cbi.rows[0].points).toBe('0');
    expect(cbi.rows.find((r) => r.name === '16. Budget allocated to biodiversity').points).toBe('');
    expect(cbi.rows.at(-1).value).toMatch(/^\d+ of 16, from 4 of the index’s 28 indicators$/);
    const text = Object.fromEntries(report.sections.map((s) => [s.key, s.text]));
    expect(text.composition).toMatch(/^6 trees of 4 species have been tagged in Santa Cruz/);
    expect(text.diversity).toMatch(/H′ = 1\.33/);
    expect(text.cbi).toMatch(/The 4 community tags show residents taking part/);
    expect(report.maps.map((m) => m.treeColour)).toEqual(['origin', 'use']);
  });

  it('counts the residents taking part in this LGU, for the CBI’s citizen-science indicator', () => {
    const report = buildThemeReport('biodiversity', {
      place: { label: 'Santa Cruz', psgc: 403426000 },
      trees: TREES,
      participation: { residents: 12, taggers: 12, tags: 40, verified_tags: 31 },
    });
    const row = report.tables.find((t) => t.key === 'cbi').rows.find((r) => r.name === '28. Community science');
    // Per million of Santa Cruz's people (PSA 2024), as Indicator 28 counts them.
    expect(row.value).toMatch(/^12 residents signed in with Google and tagged trees here; \d+ per million residents; 31 of their 40 tags verified in the field$/);
    expect(row.points).toMatch(/^[0-4]$/);
    expect(row.from).toMatch(/counted where they tagged/);
  });
});
