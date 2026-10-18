import { centroidOf } from '../areaGeometry.js';
import { cellAreaM2, columnsOf, forEachCellIn, polygonsOf, rowsOf } from './grid.js';
import { NO_ELEVATION } from './elevation.js';

/**
 * What PGENRO's layers say about one drawn area.
 *
 * Each layer is a grid of cells (grid.js); the area is the cells whose
 * centres lie inside it. An area smaller than a cell, or thin enough to miss
 * every centre, is measured by the one cell under its middle instead —
 * stated as such, so a sliver is never reported as having no flood risk
 * just because no cell centre landed in it.
 *
 * `layers` holds whichever of these exist:
 *   flood      Uint8Array, 0 none · 1 low · 2 medium · 3 high (NOAH "Var")
 *   landslide  the same, when a landslide layer is uploaded
 *   elevation  Int16Array of metres, NO_ELEVATION where unknown
 *   soil       { cells: Uint8Array of 1-based class, classes: [{ series, description, zone }] }
 *
 * Returns a plain object, stored with the area as `layer_facts`.
 */
export const HAZARD_LEVELS = Object.freeze(['low', 'medium', 'high']);

export function cellsOfArea(grid, geometry) {
  const cells = [];
  for (const polygon of polygonsOf(geometry)) {
    forEachCellIn(grid, polygon, (index, row) => cells.push([index, row]));
  }
  if (cells.length > 0) return { cells, sampled: 'cells' };

  const middle = centroidOf(geometry);
  if (!middle) return { cells: [], sampled: 'none' };
  const [lat, lng] = middle;
  const row = Math.floor((grid.north - lat) / grid.cell);
  const col = Math.floor((lng - grid.west) / grid.cell);
  if (row < 0 || col < 0 || row >= rowsOf(grid) || col >= columnsOf(grid)) return { cells: [], sampled: 'none' };
  return { cells: [[row * columnsOf(grid) + col, row]], sampled: 'centre' };
}

function hazardFacts(cells, values, grid, areaM2) {
  const byLevel = [0, 0, 0, 0];
  let covered = 0;
  for (const [index, row] of cells) {
    const size = cellAreaM2(grid, row);
    covered += size;
    byLevel[values[index]] += size;
  }
  // Scaled to the area as drawn: the cells only approximate its outline.
  const scale = covered > 0 && Number.isFinite(areaM2) && areaM2 > 0 ? areaM2 / covered : 1;
  const result = {};
  HAZARD_LEVELS.forEach((level, i) => {
    result[level] = Math.round(byLevel[i + 1] * scale);
  });
  result.total = result.low + result.medium + result.high;
  return result;
}

function elevationFacts(cells, heights) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (const [index] of cells) {
    const h = heights[index];
    if (h === NO_ELEVATION) continue;
    if (h < min) min = h;
    if (h > max) max = h;
    sum += h;
    n += 1;
  }
  return n === 0 ? null : { min, max, mean: Math.round(sum / n) };
}

function soilFacts(cells, soil) {
  const counts = new Map();
  let n = 0;
  for (const [index] of cells) {
    const cls = soil.cells[index];
    if (!cls) continue;
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
    n += 1;
  }
  if (n === 0) return null;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cls, count]) => ({ ...soil.classes[cls - 1], share: Math.round((count / n) * 100) / 100 }));
}

export function areaFacts(grid, geometry, layers, { areaM2 = null } = {}) {
  const { cells, sampled } = cellsOfArea(grid, geometry);
  const facts = { sampled, cells: cells.length };
  if (layers.flood) facts.flood = hazardFacts(cells, layers.flood, grid, areaM2);
  if (layers.landslide) facts.landslide = hazardFacts(cells, layers.landslide, grid, areaM2);
  if (layers.elevation) facts.elevation = elevationFacts(cells, layers.elevation);
  if (layers.soil) facts.soil = soilFacts(cells, layers.soil);
  return facts;
}
