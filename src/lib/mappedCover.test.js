import { describe, it, expect } from 'vitest';
import { summariseMappedCover } from './mappedCover.js';

// A square very close to one hectare (100 m × 100 m) near Santa Cruz.
const dLat = 100 / 111320;
const dLng = 100 / (111320 * Math.cos((14.28 * Math.PI) / 180));
const HECTARE = {
  type: 'Polygon',
  coordinates: [[[121.41, 14.28], [121.41 + dLng, 14.28], [121.41 + dLng, 14.28 + dLat], [121.41, 14.28 + dLat], [121.41, 14.28]]],
};

const area = (namriaClass, extra = {}) => ({
  type: 'Feature',
  geometry: HECTARE,
  properties: { saved: true, kind: 'land-cover', namriaClass, municipality: 'Santa Cruz', ...extra },
});

describe('summariseMappedCover', () => {
  it('adds up the tree cover the offices have mapped, by class', () => {
    const summary = summariseMappedCover([area('closed-forest'), area('open-forest'), area('open-forest')]);
    expect(summary.areas).toBe(3);
    expect(summary.hectares).toBeCloseTo(3, 1);
    expect(summary.byClass.map((c) => c.label)).toEqual(['Open forest', 'Closed forest']);
  });

  it('estimates growth from each class’s published rate', () => {
    const summary = summariseMappedCover([area('closed-forest'), area('open-forest')]);
    // ≈ 1 ha × 6.23 + 1 ha × 3.5
    expect(summary.biomassTPerYear).toBeCloseTo(6.23 + 3.5, 0);
  });

  it('counts tree cover with no rate in the hectares, not as zero growth', () => {
    const summary = summariseMappedCover([area('mangrove-forest')]);
    expect(summary.hectares).toBeCloseTo(1, 1);
    expect(summary.unratedHa).toBeCloseTo(1, 1);
    expect(summary.biomassTPerYear).toBe(0);
  });

  it('leaves out what is not tree cover, planting sites, and the samples', () => {
    const summary = summariseMappedCover([
      area('built-up'),
      area('grassland'),
      area(null, { kind: 'planting-site' }),
      { ...area('open-forest'), properties: { kind: 'land-cover', namriaClass: 'open-forest' } }, // a sample
    ]);
    expect(summary).toMatchObject({ areas: 0, hectares: 0, biomassTPerYear: null });
  });

  it('narrows to one town', () => {
    const summary = summariseMappedCover([area('open-forest'), area('open-forest', { municipality: 'Pila' })], {
      municipality: 'Pila',
    });
    expect(summary.areas).toBe(1);
  });
});
