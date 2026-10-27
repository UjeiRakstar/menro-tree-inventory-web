import { connectivityOf, patchGap } from './connectivity.js';

// A square about 110 m a side (0.001°) with its west edge at `west`.
const square = (west, south = 14.2) => ({
  type: 'Polygon',
  coordinates: [[[west, south], [west + 0.001, south], [west + 0.001, south + 0.001], [west, south + 0.001], [west, south]]],
});

describe('connectivity (Indicator 2)', () => {
  it('joins patches less than 100 m apart into one group, and keeps farther ones apart', () => {
    // 0.0005° of longitude at 14°N is about 54 m; 0.002° about 216 m.
    const near = connectivityOf([square(121.0), square(121.0015)]);
    expect(near.groups).toHaveLength(1);
    expect(near.coherence).toBeCloseTo(100, 5);

    const far = connectivityOf([square(121.0), square(121.003)]);
    expect(far.groups).toHaveLength(2);
    // Two equal groups: (a² + a²) ÷ (2a)² = 50%.
    expect(far.coherence).toBeCloseTo(50, 1);
    expect(far.meshHa).toBeCloseTo(far.totalHa / 2, 5);
  });

  it('measures the gap between two patches in metres, nothing when one holds the other', () => {
    const ring = (g) => [g.coordinates[0].map(([lng, lat]) => [lng * 107_900, lat * 110_574])];
    expect(patchGap(ring(square(121.0)), ring(square(121.0015)))).toBeGreaterThan(40);
    expect(patchGap(ring(square(121.0)), ring(square(121.0015)))).toBeLessThan(70);
    expect(connectivityOf([])).toBeNull();
  });
});
