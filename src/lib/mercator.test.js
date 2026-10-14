import { describe, it, expect } from 'vitest';
import { projectAt } from './mercator.js';

describe('projectAt', () => {
  it('agrees with Web Mercator, which is what Leaflet draws with', () => {
    // The prime meridian at the equator is the middle of the world square.
    const origin = projectAt([0, 0], 0);
    expect(origin.x).toBeCloseTo(128);
    expect(origin.y).toBeCloseTo(128);

    // Each zoom level doubles the scale.
    expect(projectAt([0, 0], 1).x).toBeCloseTo(256);
    expect(projectAt([0, 180], 0).x).toBeCloseTo(256);
  });

  it('keeps the poles finite rather than letting them run to infinity', () => {
    expect(Number.isFinite(projectAt([90, 0], 10).y)).toBe(true);
    expect(Number.isFinite(projectAt([-90, 0], 10).y)).toBe(true);
  });
});
