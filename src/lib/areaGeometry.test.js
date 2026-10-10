import { describe, it, expect } from 'vitest';
import {
  centroidOf,
  formatArea,
  geometryAreaM2,
  ringAreaM2,
  toHectares,
  toLeafletPositions,
} from './areaGeometry.js';

/** A square of `side` degrees, with its south-west corner at [lng, lat]. */
const square = (lng, lat, side) => [
  [lng, lat],
  [lng + side, lat],
  [lng + side, lat + side],
  [lng, lat + side],
  [lng, lat],
];

describe('ringAreaM2', () => {
  it('measures a one-hectare square at Laguna latitudes', () => {
    // 100 m is 0.000898° of latitude, and at 14.25°N the same distance east is
    // 0.000927° of longitude.
    const ring = [
      [121.4, 14.25],
      [121.400927, 14.25],
      [121.400927, 14.250898],
      [121.4, 14.250898],
      [121.4, 14.25],
    ];
    const area = ringAreaM2(ring);
    expect(area).toBeGreaterThan(9900);
    expect(area).toBeLessThan(10100);
  });

  it('does not care which way round the ring was drawn', () => {
    const ring = square(121.4, 14.25, 0.001);
    expect(ringAreaM2([...ring].reverse())).toBeCloseTo(ringAreaM2(ring), 6);
  });

  it('is not the planar shoelace, which overstates an area at 14°N', () => {
    // A degree of longitude at 14.25°N is cos(14.25) of a degree of latitude.
    // Treating the two as equal inflates the figure by about three per cent,
    // which is the bug this formula exists to avoid.
    const ring = square(121.4, 14.25, 0.01);
    const metresPerDegree = 111320;
    const planar = (0.01 * metresPerDegree) ** 2;
    expect(ringAreaM2(ring)).toBeLessThan(planar * 0.99);
    expect(ringAreaM2(ring)).toBeGreaterThan(planar * 0.95);
  });

  it('has no area without three corners', () => {
    expect(ringAreaM2([])).toBe(0);
    expect(ringAreaM2([[121.4, 14.25], [121.5, 14.25]])).toBe(0);
    expect(ringAreaM2(null)).toBe(0);
    expect(ringAreaM2([[121.4, 14.25], [NaN, 14.25], [121.5, 14.3]])).toBe(0);
  });
});

describe('geometryAreaM2', () => {
  it('takes holes out of the outline', () => {
    const outline = square(121.4, 14.25, 0.01);
    const hole = square(121.402, 14.252, 0.002);
    const whole = geometryAreaM2({ type: 'Polygon', coordinates: [outline] });
    const withHole = geometryAreaM2({ type: 'Polygon', coordinates: [outline, hole] });

    // A forest with a quarry cut out of it is smaller than its outline, and
    // reporting the outline would overstate the biomass growing on it.
    expect(withHole).toBeLessThan(whole);
    expect(whole - withHole).toBeCloseTo(ringAreaM2(hole), 0);
  });

  it('adds the parts of a MultiPolygon', () => {
    const a = square(121.4, 14.25, 0.01);
    const b = square(121.5, 14.25, 0.01);
    const multi = geometryAreaM2({ type: 'MultiPolygon', coordinates: [[a], [b]] });
    expect(multi).toBeCloseTo(ringAreaM2(a) + ringAreaM2(b), 0);
  });

  it('reads nothing out of a geometry it does not understand', () => {
    expect(geometryAreaM2(null)).toBe(0);
    expect(geometryAreaM2({ type: 'Point', coordinates: [121.4, 14.25] })).toBe(0);
    expect(geometryAreaM2({ type: 'Polygon' })).toBe(0);
  });
});

describe('formatArea', () => {
  it('writes square metres without a false precision', () => {
    // "86,330.80 m²" claims centimetres from a traced boundary. It does not
    // have them.
    expect(formatArea(86330.8)).toBe('86,331 m²');
    expect(formatArea(1234567)).toBe('1,234,567 m²');
  });

  it('keeps the tenths below a hectare, where they mean something', () => {
    expect(formatArea(842.37)).toBe('842.4 m²');
  });

  it('switches to hectares when asked', () => {
    expect(formatArea(86330.8, 'ha')).toBe('8.63 ha');
    expect(formatArea(1234567, 'ha')).toBe('123.5 ha');
  });

  it('shows a dash rather than NaN', () => {
    expect(formatArea(null)).toBe('—');
    expect(formatArea(undefined)).toBe('—');
    expect(formatArea('wide')).toBe('—');
  });
});

describe('toHectares', () => {
  it('is ten thousand square metres', () => {
    expect(toHectares(10000)).toBe(1);
    expect(toHectares(86330.8)).toBeCloseTo(8.63308, 5);
    expect(toHectares(null)).toBe(0);
  });
});

describe('centroidOf and toLeafletPositions', () => {
  it('finds the middle of an outline', () => {
    const [lat, lng] = centroidOf({ type: 'Polygon', coordinates: [square(121.4, 14.25, 0.01)] });
    expect(lng).toBeCloseTo(121.405, 3);
    expect(lat).toBeCloseTo(14.255, 3);
    expect(centroidOf(null)).toBeNull();
  });

  it('flips GeoJSON order into Leaflet order', () => {
    // GeoJSON is [longitude, latitude]; Leaflet wants the other way round, and
    // getting this backwards puts Laguna in the Indian Ocean.
    const positions = toLeafletPositions({ type: 'Polygon', coordinates: [square(121.4, 14.25, 0.01)] });
    expect(positions[0][0][0]).toEqual([14.25, 121.4]);
  });
});
