import { columnsOf, rowsOf } from './grid.js';

/**
 * The Copernicus DEM, laid on the measuring grid.
 *
 * The DEM PGENRO has is 1 arc-second (about 30 m), 2,282 × 2,372 pixels of
 * metres above sea level, in plain longitude/latitude. The grid's cells are
 * two pixels a side, so each takes the mean of the pixels whose centres fall
 * in it — the same height a forester reads off a 60 m square, not one pixel
 * picked from it. Whole metres, as 16-bit integers.
 */
export const NO_ELEVATION = -32768;

/**
 * `values`: the raster's single band, row by row from the north edge.
 * `raster`: { width, height, bbox: [west, south, east, north] }.
 */
export function elevationGrid(grid, values, raster) {
  const cols = columnsOf(grid);
  const rows = rowsOf(grid);
  const sums = new Float64Array(cols * rows);
  const counts = new Uint16Array(cols * rows);
  const [west, south, east, north] = raster.bbox;
  const dx = (east - west) / raster.width;
  const dy = (north - south) / raster.height;

  for (let r = 0; r < raster.height; r += 1) {
    const lat = north - (r + 0.5) * dy;
    const row = Math.floor((grid.north - lat) / grid.cell);
    if (row < 0 || row >= rows) continue;
    for (let c = 0; c < raster.width; c += 1) {
      const value = values[r * raster.width + c];
      // Far below the sea or impossibly high is the raster's "no data".
      if (!Number.isFinite(value) || value < -500 || value > 9000) continue;
      const lng = west + (c + 0.5) * dx;
      const col = Math.floor((lng - grid.west) / grid.cell);
      if (col < 0 || col >= cols) continue;
      const index = row * cols + col;
      sums[index] += value;
      counts[index] += 1;
    }
  }

  const heights = new Int16Array(cols * rows).fill(NO_ELEVATION);
  for (let i = 0; i < heights.length; i += 1) {
    if (counts[i] > 0) heights[i] = Math.round(sums[i] / counts[i]);
  }
  return heights;
}

/**
 * Elevation classes for the map picture and the legend: the bands a forester
 * would name, lowland to mountain.
 */
export const ELEVATION_BANDS = Object.freeze([
  { upTo: 100, label: 'Below 100 m' },
  { upTo: 300, label: '100–300 m' },
  { upTo: 500, label: '300–500 m' },
  { upTo: 1000, label: '500–1,000 m' },
  { upTo: Infinity, label: 'Above 1,000 m' },
]);

/** 1-based band of a height, 0 for no data. */
export function bandOf(metres) {
  if (metres === NO_ELEVATION || !Number.isFinite(metres)) return 0;
  return ELEVATION_BANDS.findIndex((band) => metres < band.upTo) + 1;
}

/** How BSWM names the ground, by height — when no soil layer says. */
export function elevationTypeOf(metres) {
  if (!Number.isFinite(metres)) return null;
  if (metres < 100) return 'Lowland';
  if (metres < 500) return 'Upland';
  return 'Highland';
}
