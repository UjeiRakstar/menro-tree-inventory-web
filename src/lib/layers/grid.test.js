import { describe, it, expect } from 'vitest';
import { LAGUNA_GRID, cellAreaM2, columnsOf, forEachCellIn, rasterize, rowsOf } from './grid.js';

// A small grid of 10 × 10 cells, 0.1° a side, for checking the arithmetic.
const GRID = { west: 0, south: 0, east: 1, north: 1, cell: 0.1 };
const square = (w, s, e, n) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const cellsIn = (polygon) => {
  const found = [];
  forEachCellIn(GRID, polygon, (index) => found.push(index));
  return found.sort((a, b) => a - b);
};

describe('the Laguna grid', () => {
  it('covers the province in about 60 m cells, 1.36 million of them', () => {
    expect(columnsOf(LAGUNA_GRID)).toBe(1142);
    expect(rowsOf(LAGUNA_GRID)).toBe(1187);
    // About 60 m × 60 m at Laguna's latitude.
    expect(cellAreaM2(LAGUNA_GRID, 600)).toBeGreaterThan(3300);
    expect(cellAreaM2(LAGUNA_GRID, 600)).toBeLessThan(3700);
  });
});

describe('forEachCellIn', () => {
  it('finds the cells whose centres a polygon covers', () => {
    // 0.2 to 0.4 east, 0.6 to 0.8 north: centres at 0.25, 0.35 and 0.65, 0.75.
    // Rows count down from the north edge: 0.75 is row 2, 0.65 row 3.
    expect(cellsIn(square(0.2, 0.6, 0.4, 0.8))).toEqual([22, 23, 32, 33]);
  });

  it('treats a hole as a hole', () => {
    const outer = square(0, 0, 0.5, 0.5)[0];
    const hole = square(0.2, 0.2, 0.3, 0.3)[0];
    const withHole = cellsIn([outer, hole]);
    expect(withHole).toHaveLength(24);
    expect(withHole).not.toContain(7 * 10 + 2); // the cell centred at (0.25, 0.25)
  });

  it('finds nothing for a polygon smaller than a cell between centres', () => {
    expect(cellsIn(square(0.01, 0.01, 0.04, 0.04))).toEqual([]);
  });
});

describe('rasterize', () => {
  it('lays features on the grid, the higher value winning where they overlap', () => {
    const features = [
      { geometry: { type: 'Polygon', coordinates: square(0, 0, 0.3, 0.3) }, properties: { Var: 1 } },
      { geometry: { type: 'MultiPolygon', coordinates: [square(0.1, 0.1, 0.2, 0.2)] }, properties: { Var: 3 } },
    ];
    const cells = rasterize(GRID, features, (f) => f.properties.Var);
    expect(cells[8 * 10 + 1]).toBe(3); // centre (0.15, 0.15): both, the higher wins
    expect(cells[9 * 10 + 0]).toBe(1);
    expect(cells[0]).toBe(0);
  });
});
