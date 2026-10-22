vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { CBI_INDICATORS, cbiPoints, pointsOn } from './cbiPoints.js';
import { cbiEventCounts } from './news.js';

const byId = (id) => CBI_INDICATORS.find((i) => i.id === id);

// A square of about 108 ha (0.009° × 0.009° near Calamba), as a saved area.
const square = (props) => ({
  type: 'Feature',
  properties: { saved: true, municipality: 'Calamba', ...props },
  geometry: { type: 'Polygon', coordinates: [[[121.15, 14.2], [121.16, 14.2], [121.16, 14.209], [121.15, 14.209], [121.15, 14.2]]] },
});

describe('the index’s bands', () => {
  it('score natural areas, invasive species and events as the User’s Manual does', () => {
    expect([0.5, 1, 6.9, 7, 14, 20, 21].map((v) => pointsOn(byId('natural'), v))).toEqual([0, 1, 1, 2, 3, 3, 4]);
    // Fewer invasive species, more points.
    expect([0.5, 5, 15, 25, 35].map((v) => pointsOn(byId('invasive'), v))).toEqual([4, 3, 2, 1, 0]);
    expect([0, 1, 59, 60, 150, 301].map((v) => pointsOn(byId('outreach'), v))).toEqual([0, 1, 1, 2, 3, 4]);
    expect([0, 12, 13, 39, 40].map((v) => pointsOn(byId('project'), v))).toEqual([0, 1, 2, 3, 4]);
    expect(pointsOn(byId('canopy'), null)).toBeNull();
  });
});

describe('a city’s points', () => {
  const trees = [
    { species_type: 'Native' },
    { species_type: 'Native' },
    { species_type: 'Endemic' },
    { biodiversity_status: 'Invasive' },
    { species_type: '' },
  ];

  it('come from its trees, its mapped land cover and its events, of the indicators scored', () => {
    const posts = [
      { cbi_credit: 'project', event_date: `${new Date().getFullYear()}-03-01`, lgu_psgc: 403405000 },
      { cbi_credit: 'outreach', event_date: `${new Date().getFullYear()}-04-01`, lgu_psgc: 403405000 },
      { cbi_credit: 'outreach', event_date: `${new Date().getFullYear()}-04-01`, lgu_psgc: 403426000 },
    ];
    const cbi = cbiPoints({
      trees,
      areas: [square({ kind: 'land-cover', namriaClass: 'closed-forest', designation: 'Protected landscape' })],
      municipality: 'Calamba',
      placeAreaHa: 1000,
      events: cbiEventCounts(posts, { lgu: 403405000 }),
    });
    const of = Object.fromEntries(cbi.indicators.map((i) => [i.id, i]));
    expect(of.natural.value).toBeCloseTo(10.8, 0);
    expect(of.natural.points).toBe(2);
    expect(of.protected.points).toBe(3);
    // One invasive of four trees of known origin: 25%.
    expect(of.invasive).toMatchObject({ value: 25, points: 1 });
    expect(of.project).toMatchObject({ value: 1, points: 1 });
    expect(of.outreach).toMatchObject({ value: 1, points: 1 });
    expect(of.partnership).toMatchObject({ value: 0, points: 0 });
    expect(cbi.scored).toBe(7);
    expect(cbi.of).toBe(28);
    expect(cbi.points).toBe(cbi.indicators.reduce((t, i) => t + i.points, 0));
  });

  it('leave out what the system has no measure for, rather than score it zero', () => {
    const cbi = cbiPoints({ trees: [], areas: [], municipality: 'Calamba', placeAreaHa: 1000, events: null });
    expect(cbi).toMatchObject({ points: 0, of: 0, scored: 0 });
    expect(cbi.indicators.every((i) => i.points === null)).toBe(true);
  });

  it('count only the city’s own areas', () => {
    const cbi = cbiPoints({
      trees,
      areas: [square({ kind: 'land-cover', namriaClass: 'closed-forest', municipality: 'Santa Rosa' })],
      municipality: 'Calamba',
      placeAreaHa: 1000,
    });
    expect(cbi.indicators.find((i) => i.id === 'natural').points).toBeNull();
  });
});
