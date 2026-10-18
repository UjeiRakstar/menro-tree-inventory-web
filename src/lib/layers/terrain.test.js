import { describe, it, expect } from 'vitest';
import { columnsOf, rowsOf } from './grid.js';
import { NO_ELEVATION } from './elevation.js';
import { slopePercentAt, slopePixels, terrainFacts } from './terrain.js';

// A small grid of 60 m cells: 10 × 10.
const GRID = { west: 121.4, south: 14.2, east: 121.4 + 10 * (2 / 3600), north: 14.2 + 10 * (2 / 3600), cell: 2 / 3600 };
const cols = columnsOf(GRID);
const rows = rowsOf(GRID);
const dy = GRID.cell * 110574;

/** Heights rising northward by `rise` metres a cell, `base` at the southern row. */
function ramp(rise, base = 0) {
  const heights = new Int16Array(cols * rows);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) heights[r * cols + c] = base + (rows - 1 - r) * rise;
  return heights;
}
const square = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });

describe('slope from the elevation grid', () => {
  it('is rise over run, in percent', () => {
    const heights = ramp(dy * 0.25); // 25 % slope northward
    expect(slopePercentAt(GRID, heights, 5 * cols + 5)).toBeCloseTo(25, 0);
    expect(slopePercentAt(GRID, ramp(0), 5 * cols + 5)).toBe(0);
  });

  it('has none where there is no height', () => {
    const heights = ramp(10);
    heights[5 * cols + 5] = NO_ELEVATION;
    expect(slopePercentAt(GRID, heights, 5 * cols + 5)).toBeNull();
  });
});

describe('an area in the FLUP classes', () => {
  it('measures its ground by elevation and by slope', () => {
    const facts = terrainFacts(GRID, square(GRID.west, GRID.south, GRID.east, GRID.north), ramp(dy * 0.4, 450));
    const total = Object.values(facts.elevation).reduce((t, v) => t + v, 0);
    // Heights from 450 m up, about 26.5 m a row: the lower rows below 500.
    expect(facts.elevation.below500).toBeGreaterThan(0);
    expect(facts.elevation.from500).toBeGreaterThan(0);
    expect(facts.elevation.above1000).toBe(0);
    // 40 % everywhere: all in 30–50 %.
    expect(facts.slope.from30).toBe(total);
    expect(facts.meanSlope).toBeCloseTo(40, 0);
  });

  it('is scaled to the area as drawn, and null with no heights', () => {
    const facts = terrainFacts(GRID, square(GRID.west, GRID.south, GRID.east, GRID.north), ramp(1), { areaM2: 1000000 });
    expect(Object.values(facts.slope).reduce((t, v) => t + v, 0)).toBeCloseTo(1000000, -1);
    expect(terrainFacts(GRID, square(GRID.west, GRID.south, GRID.east, GRID.north), new Int16Array(cols * rows).fill(NO_ELEVATION))).toBeNull();
  });
});

describe('the slope map', () => {
  it('colours each cell by its class, snapped to the grid', () => {
    const { width, height, rgba, bounds } = slopePixels(GRID, ramp(dy * 0.6), [[GRID.south, GRID.west], [GRID.north, GRID.east]]);
    expect(width).toBe(cols);
    expect(height).toBe(rows);
    expect([...rgba.slice(0, 4)]).toEqual([102, 37, 6, 210]); // above 50 %
    expect(bounds[1][0]).toBeCloseTo(GRID.north, 9);
  });
});
