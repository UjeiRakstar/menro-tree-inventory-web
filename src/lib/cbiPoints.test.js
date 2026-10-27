vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { CBI_INDICATORS, areaFigures, cbiPoints, describeIndicator, invasiveShare, nativeSpeciesChange, pointsOn } from './cbiPoints.js';
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
    // Canopy is the crowns, not the whole area: closed forest 70%, an orchard 50%.
    expect(figures.canopyHa / figures.protectedHa).toBeCloseTo(0.7 + 0.5, 5);
  });

  it('leaves a degraded forest out of the natural areas, and counts a restored area in (27 October)', () => {
    const figures = areaFigures(
      [
        square({ kind: 'land-cover', namriaClass: 'open-forest', condition: 'degraded' }),
        square({ kind: 'land-cover', namriaClass: 'perennial-crop', condition: 'restored' }),
        square({ kind: 'land-cover', namriaClass: 'grassland' }),
      ],
      'Calamba'
    );
    const one = figures.naturalHa / 2;
    expect(figures.natural).toHaveLength(2);
    expect(figures.restoredHa).toBeCloseTo(one, 5);
    expect(figures.degradedHa).toBeCloseTo(one, 5);
  });

  it('counts only protected areas and forest land as protected — not a zoning or FLUP zone', () => {
    const figures = areaFigures(
      [
        square({ kind: 'land-cover', namriaClass: 'closed-forest', designation: 'protected-area' }),
        square({ kind: 'land-cover', namriaClass: 'closed-forest', designation: 'zoning' }),
        square({ kind: 'land-cover', namriaClass: 'built-up', designation: 'forest-land' }),
      ],
      'Calamba'
    );
    // Only the first: the zoning zone is not protection, and built-up forest land is not natural.
    expect(figures.protectedHa * 2).toBeCloseTo(figures.naturalHa, 5);
    expect(figures.greenSpaceHa).toBeCloseTo(figures.naturalHa, 5);
  });

  it('keeps a UBI to the urban barangays', () => {
    const figures = areaFigures(
      [square({ kind: 'land-cover', namriaClass: 'grassland', barangay: 'Poblacion' }), square({ kind: 'land-cover', namriaClass: 'grassland', barangay: 'Bukid' })],
      'Calamba',
      { barangays: new Set(['Poblacion']) }
    );
    expect(figures.natural).toHaveLength(1);
  });

  it('counts the native tree species gained since the first year of tagging', () => {
    const trees = [
      { species: 'Narra', species_type: 'Native', dateCaptured: '2025-05-01' },
      { species: 'Molave', species_type: 'Endemic', dateCaptured: '2026-02-01' },
      { species: 'Banaba', species_type: 'Native', dateCaptured: '2026-03-01' },
      { species: 'Mahogany', species_type: 'Exotic', dateCaptured: '2026-03-01' },
    ];
    expect(nativeSpeciesChange(trees, { year: 2026 })).toEqual({ baselineYear: 2025, baseline: 1, now: 3, change: 2 });
    // The baseline year itself has nothing to compare.
    expect(nativeSpeciesChange(trees.slice(1), { year: 2026 }).change).toBeNull();
    expect(scores('plants', [-1, 0, 5, 6, 7, 8])).toEqual([0, 1, 1, 2, 3, 4]);
  });
});

describe('the other bands', () => {
  it('Indicator 2, connectivity: <20, 20–39.9, 40–59.9, 60–79, >79 % coherence', () => {
    expect(scores('connectivity', [19.9, 20, 39.9, 40, 59.9, 60, 79, 79.1])).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it('Indicator 12, recreation: <0.1, 0.1–0.3, 0.4–0.6, 0.7–0.9, >0.9 ha per 1,000, read to one decimal', () => {
    expect(scores('recreation', [0.04, 0.1, 0.34, 0.36, 0.64, 0.66, 0.94, 0.96])).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it('Indicators 16 and 22: budget share and agencies', () => {
    expect(scores('budget', [0.3, 0.4, 2.2, 2.3, 2.7, 2.8, 3.7, 3.8])).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(scores('agencies', [2, 3, 4, 5, 6])).toEqual([0, 1, 2, 3, 4]);
  });
  it('has all 28, 112 points in three components of 36, 20 and 56', () => {
    expect(CBI_INDICATORS.map((i) => i.no)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    expect(cbiPoints({}).components.map((c) => c.max)).toEqual([36, 20, 56]);
    for (const i of CBI_INDICATORS.filter((x) => x.self === 'level')) expect(i.levels).toHaveLength(5);
  });
});

describe('the office’s self-assessment', () => {
  it('scores a level on the Handbook’s scale, and a figure on the bands', () => {
    const cbi = cbiPoints({
      population: 250000,
      self: { 17: { points: 2, note: 'LBSAP 2025' }, 16: { value: 2.9 }, 25: { value: 5 } },
    });
    const of = Object.fromEntries(cbi.indicators.map((i) => [i.no, i]));
    expect(of[17]).toMatchObject({ points: 2, source: 'self', note: 'LBSAP 2025' });
    expect(of[16]).toMatchObject({ value: 2.9, points: 3, source: 'self' });
    // 5 projects for a quarter of a million people: 20 per million.
    expect(of[25]).toMatchObject({ count: 5, value: 20, points: 1 });
    expect(describeIndicator(of[17])).toMatch(/^Self-assessed: An LBSAP that incorporates elements of the NBSAP and includes at least one CBD/);
    expect(cbi.components.find((c) => c.id === 'governance')).toMatchObject({ points: 6, of: 12, scored: 3 });
  });

  it('stands in front of the system’s stand-in: an implemented plan over a verified one', () => {
    const cbi = cbiPoints({ climatePlan: { onFile: true }, self: { 20: { points: 3 } } });
    expect(cbi.indicators.find((i) => i.no === 20)).toMatchObject({ points: 3, source: 'self' });
  });

  it('counts named partners, each once, and says when only partnership events stand in', () => {
    const year = new Date().getFullYear();
    const posts = [
      { cbi_credit: 'partnership', event_date: `${year}-03-01`, lgu_psgc: 1, partners: ['LSPU', 'Haribon'] },
      { cbi_credit: 'outreach', event_date: `${year}-04-01`, lgu_psgc: 1, partners: ['l.s.p.u.', 'NGCP'] },
    ];
    const named = cbiPoints({ events: cbiEventCounts(posts, { lgu: 1 }) }).indicators.find((i) => i.no === 24);
    expect(named).toMatchObject({ value: 3, points: 1 });
    expect(describeIndicator(named)).toBe("3 partner organisations named on this year's events");
    const bare = cbiPoints({ events: cbiEventCounts([{ ...posts[0], partners: [] }], { lgu: 1 }) }).indicators.find((i) => i.no === 24);
    expect(describeIndicator(bare)).toBe('1 partnership events this year — no partner named on them yet');
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
      areas: { mapped: true, naturalHa: 150, canopyHa: 300, protectedHa: 20, greenSpaceHa: 170 },
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
    // 170 ha of green space for half a million people: 0.34 ha per 1,000 — 0.3, 1 point.
    expect(of.recreation).toMatchObject({ points: 1 });
    expect(cbi).toMatchObject({ scored: 10, of: 40, points: 3 + 1 + 4 + 2 + 1 + 1 + 0 + 1 + 2 + 1 });
  });

  it('leave out what the system has no measure for, rather than score it zero', () => {
    const cbi = cbiPoints({ trees: [], placeAreaHa: 1000, population: 0, events: null });
    expect(cbi).toMatchObject({ points: 0, of: 0, scored: 0 });
    expect(cbi.indicators.every((i) => i.points === null)).toBe(true);
    expect(describeIndicator(cbi.indicators.find((i) => i.id === 'climate'))).toBe('No climate plan verified by PGENRO');
  });
});
