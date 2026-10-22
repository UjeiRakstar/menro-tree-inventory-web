vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { CBI_INDICATORS, areaFigures, cbiPoints, describeIndicator, invasiveShare, pointsOn } from './cbiPoints.js';
import { cbiEventCounts } from './news.js';

const byId = (id) => CBI_INDICATORS.find((i) => i.id === id);
const scores = (id, values) => values.map((v) => pointsOn(byId(id), v));

// A square of about 108 ha (0.009° × 0.009° near Calamba), as a saved area.
const square = (props) => ({
  type: 'Feature',
  properties: { saved: true, municipality: 'Calamba', ...props },
  geometry: { type: 'Polygon', coordinates: [[[121.15, 14.2], [121.16, 14.2], [121.16, 14.209], [121.15, 14.209], [121.15, 14.2]]] },
});

describe('the Handbook’s bands (Singapore Index, 2021)', () => {
  it('Indicator 1, natural areas: <1, 1–6.9, 7–13.9, 14–20, >20 %', () => {
    expect(scores('natural', [0.9, 1, 6.9, 7, 13.9, 14, 20, 20.1])).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it('Indicator 8, protected natural areas: <1, 1–6, 6.1–11, 11.1–17, >17 %', () => {
    expect(scores('protected', [0.9, 1, 6, 6.1, 11, 11.1, 17, 17.1])).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it('Indicator 9, invasive alien species: >30, 20.1–30, 11.1–20, 1–11, <1 % — fewer is better', () => {
    expect(scores('invasive', [31, 30, 20.1, 20, 11.1, 11, 1, 0.9])).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it('Indicator 11, tree canopy: <10, 10.1–24.9, 25–39.9, 40–54.9, ≥55 %', () => {
    expect(scores('canopy', [9.9, 10.1, 24.9, 25, 39.9, 40, 54.9, 55])).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it('Indicators 24, 25, 27 and 28: partners, and projects, events and community scientists per million residents', () => {
    expect(scores('partnership', [0, 1, 6, 7, 12, 13, 19, 20])).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(scores('project', [7.9, 8, 23.9, 24, 56.9, 57, 101.9, 102])).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(scores('outreach', [6, 7, 81, 82, 220, 221, 393, 394])).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(scores('community', [1, 2, 9, 10, 48, 49, 117, 118])).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
});

describe('what the system measures', () => {
  it('counts invasive species, not trees, against native ones; introduced ones are left out', () => {
    const trees = [
      { species: 'Narra', species_type: 'Native' },
      { species: 'Narra', species_type: 'Native' },
      { species: 'Molave', species_type: 'Endemic' },
      { species: 'Mahogany', species_type: 'Exotic' },
      { species: 'Ipil-ipil', biodiversity_status: 'Invasive' },
      { species: 'Ipil-ipil', biodiversity_status: 'Invasive' },
      { species: 'Ipil-ipil', biodiversity_status: 'Invasive' },
    ];
    // 1 invasive species of 1 + 2 native: a third, however many trees each has.
    expect(invasiveShare(trees)).toMatchObject({ invasive: 1, native: 2 });
    expect(invasiveShare(trees).share).toBeCloseTo(33.33, 2);
    expect(invasiveShare([])).toBeNull();
  });

  it('takes natural areas as natural ecosystems, and tree canopy as any tree cover', () => {
    const figures = areaFigures(
      [
        square({ kind: 'land-cover', namriaClass: 'closed-forest', designation: 'protected-area' }),
        square({ kind: 'land-cover', namriaClass: 'perennial-crop' }),
        square({ kind: 'land-cover', namriaClass: 'grassland' }),
        square({ kind: 'land-cover', namriaClass: 'closed-forest', municipality: 'Santa Rosa' }),
      ],
      'Calamba'
    );
    expect(figures.mapped).toBe(true);
    // Forest and grassland are natural; the plantation is not, though it has canopy.
    expect(figures.naturalHa / figures.protectedHa).toBeCloseTo(2, 5);
    expect(figures.canopyHa / figures.protectedHa).toBeCloseTo(2, 5);
  });
});

describe('a city’s points', () => {
  const year = new Date().getFullYear();
  const posts = [
    ...Array.from({ length: 6 }, () => ({ cbi_credit: 'outreach', event_date: `${year}-04-01`, lgu_psgc: 403405000 })),
    { cbi_credit: 'project', event_date: `${year}-03-01`, lgu_psgc: 403405000 },
    { cbi_credit: 'partnership', event_date: `${year}-03-01`, lgu_psgc: 403405000 },
    { cbi_credit: 'outreach', event_date: `${year}-04-01`, lgu_psgc: 403426000 },
  ];

  it('come from its land cover, trees, plan, residents and events — per million residents where the Handbook says', () => {
    const cbi = cbiPoints({
      trees: [{ species: 'Narra', species_type: 'Native' }],
      areas: { mapped: true, naturalHa: 150, canopyHa: 300, protectedHa: 20 },
      placeAreaHa: 1000,
      population: 500000,
      events: cbiEventCounts(posts, { lgu: 403405000 }),
      communityScientists: 12,
      climatePlan: { onFile: true },
    });
    const of = Object.fromEntries(cbi.indicators.map((i) => [i.id, i]));
    expect(of.natural).toMatchObject({ value: 15, points: 3 });
    expect(of.protected).toMatchObject({ value: 2, points: 1 });
    expect(of.invasive).toMatchObject({ value: 0, points: 4 });
    expect(of.canopy).toMatchObject({ value: 30, points: 2 });
    expect(of.climate.points).toBe(1);
    expect(of.partnership).toMatchObject({ value: 1, points: 1 });
    // 1 project for half a million people: 2 per million — under 8.
    expect(of.project).toMatchObject({ count: 1, value: 2, points: 0 });
    // 6 events: 12 per million.
    expect(of.outreach).toMatchObject({ count: 6, value: 12, points: 1 });
    // 12 residents tagging: 24 per million.
    expect(of.community).toMatchObject({ count: 12, value: 24, points: 2 });
    expect(describeIndicator(of.community)).toBe('12 residents tagging trees · 24 per million residents');
    expect(describeIndicator(of.natural)).toBe('15%');
    expect(cbi).toMatchObject({ scored: 9, of: 36, points: 3 + 1 + 4 + 2 + 1 + 1 + 0 + 1 + 2 });
  });

  it('leave out what the system has no measure for, rather than score it zero', () => {
    const cbi = cbiPoints({ trees: [], placeAreaHa: 1000, population: 0, events: null });
    expect(cbi).toMatchObject({ points: 0, of: 0, scored: 0 });
    expect(cbi.indicators.every((i) => i.points === null)).toBe(true);
    expect(describeIndicator(cbi.indicators.find((i) => i.id === 'climate'))).toBe('No climate plan verified by PGENRO');
  });
});
