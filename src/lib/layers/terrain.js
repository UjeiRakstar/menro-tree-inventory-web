import { columnsOf, cellAreaM2, rowsOf } from './grid.js';
import { NO_ELEVATION } from './elevation.js';
import { cellsOfArea } from './measure.js';

/**
 * Elevation and slope in the classes the Forest Land Use Plan maps them in
 * (DENR, Draft Guidelines in the Formulation of FLUP for LGUs, Module 2,
 * Table 1: the Elevation Map and the Slope Map), from the elevation layer
 * PGENRO uploaded (Copernicus DEM, laid on the measuring grid, grid.js).
 *
 * Slope is not a layer of its own: it is worked out here, cell by cell, from
 * the heights of each cell's neighbours — the same DEM, so it lines up with
 * everything else measured on the grid.
 */

export const FLUP_ELEVATION_CLASSES = Object.freeze([
  { id: 'below500', label: 'Below 500 masl', upTo: 500 },
  { id: 'from500', label: '500–1,000 masl', upTo: 1000 },
  { id: 'above1000', label: 'Above 1,000 masl', upTo: Infinity },
]);

/**
 * The FLUP slope classes. 18% is the line the law draws: no land of the
 * public domain 18% in slope or over may be classified alienable and
 * disposable (PD 705, the Revised Forestry Code, section 15).
 */
export const FLUP_SLOPE_CLASSES = Object.freeze([
  { id: 'below18', label: 'Below 18%', upTo: 18, colour: [255, 247, 188] },
  { id: 'from18', label: '18–30%', upTo: 30, colour: [254, 196, 79] },
  { id: 'from30', label: '30–50%', upTo: 50, colour: [217, 95, 14] },
  { id: 'above50', label: 'Above 50%', upTo: Infinity, colour: [102, 37, 6] },
]);

const M_PER_DEGREE_LAT = 110574;
const M_PER_DEGREE_LNG = 111320;

/**
 * Slope at a cell, in percent (rise over run × 100), from the cells either
 * side of it east–west and north–south; one-sided at an edge or beside a cell
 * with no height. Null where the cell itself has none.
 */
export function slopePercentAt(grid, heights, index) {
  const cols = columnsOf(grid);
  const rows = rowsOf(grid);
  const row = Math.floor(index / cols);
  const col = index % cols;
  const here = heights[index];
  if (here === NO_ELEVATION || here === undefined) return null;
  const at = (r, c) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    const h = heights[r * cols + c];
    return h === NO_ELEVATION ? null : h;
  };
  const lat = grid.north - (row + 0.5) * grid.cell;
  const dx = grid.cell * M_PER_DEGREE_LNG * Math.cos((lat * Math.PI) / 180);
  const dy = grid.cell * M_PER_DEGREE_LAT;
  const gradient = (before, after, step) => {
    if (before !== null && after !== null) return (after - before) / (2 * step);
    if (after !== null) return (after - here) / step;
    if (before !== null) return (here - before) / step;
    return 0;
  };
  const dzdx = gradient(at(row, col - 1), at(row, col + 1), dx);
  const dzdy = gradient(at(row + 1, col), at(row - 1, col), dy);
  return Math.hypot(dzdx, dzdy) * 100;
}

const classOf = (classes, value) => classes.find((cls) => value < cls.upTo) ?? classes[classes.length - 1];

/**
 * An area's ground in each FLUP elevation and slope class, in m² scaled to the
 * area as drawn (as measure.js scales hazards), and its mean slope.
 * Null when the area has no cell with a height.
 */
export function terrainFacts(grid, geometry, heights, { areaM2 = null } = {}) {
  const { cells } = cellsOfArea(grid, geometry);
  const elevation = Object.fromEntries(FLUP_ELEVATION_CLASSES.map((cls) => [cls.id, 0]));
  const slope = Object.fromEntries(FLUP_SLOPE_CLASSES.map((cls) => [cls.id, 0]));
  let covered = 0;
  let slopeSum = 0;
  let measured = 0;
  for (const [index, row] of cells) {
    const h = heights[index];
    if (h === NO_ELEVATION || h === undefined) continue;
    const size = cellAreaM2(grid, row);
    covered += size;
    elevation[classOf(FLUP_ELEVATION_CLASSES, h).id] += size;
    const s = slopePercentAt(grid, heights, index);
    if (s !== null) {
      slope[classOf(FLUP_SLOPE_CLASSES, s).id] += size;
      slopeSum += s * size;
      measured += size;
    }
  }
  if (covered === 0) return null;
  const scale = Number.isFinite(areaM2) && areaM2 > 0 ? areaM2 / covered : 1;
  for (const key of Object.keys(elevation)) elevation[key] = Math.round(elevation[key] * scale);
  for (const key of Object.keys(slope)) slope[key] = Math.round(slope[key] * scale);
  return { elevation, slope, meanSlope: measured ? Math.round((slopeSum / measured) * 10) / 10 : null };
}

/**
 * The slope map as pixels, one per grid cell, over [[south, west], [north,
 * east]] snapped to the grid: { width, height, rgba, bounds } — the shape the
 * map sheet places a survey picture by. Cells with no height are clear.
 */
export function slopePixels(grid, heights, [[south, west], [north, east]]) {
  const cols = columnsOf(grid);
  const rows = rowsOf(grid);
  const c0 = Math.max(0, Math.floor((west - grid.west) / grid.cell));
  const c1 = Math.min(cols - 1, Math.ceil((east - grid.west) / grid.cell));
  const r0 = Math.max(0, Math.floor((grid.north - north) / grid.cell));
  const r1 = Math.min(rows - 1, Math.ceil((grid.north - south) / grid.cell));
  const width = c1 - c0 + 1;
  const height = r1 - r0 + 1;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const s = slopePercentAt(grid, heights, r * cols + c);
      if (s === null) continue;
      const [red, green, blue] = classOf(FLUP_SLOPE_CLASSES, s).colour;
      const at = ((r - r0) * width + (c - c0)) * 4;
      rgba[at] = red;
      rgba[at + 1] = green;
      rgba[at + 2] = blue;
      rgba[at + 3] = 210;
    }
  }
  return {
    width,
    height,
    rgba,
    bounds: [
      [grid.north - (r1 + 1) * grid.cell, grid.west + c0 * grid.cell],
      [grid.north - r0 * grid.cell, grid.west + (c1 + 1) * grid.cell],
    ],
  };
}

/** The same as a PNG data URL, in a browser. */
export function slopePicture(grid, heights, bounds) {
  const { width, height, rgba, bounds: snapped } = slopePixels(grid, heights, bounds);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  return { url: canvas.toDataURL('image/png'), bounds: snapped };
}

/** The slope map's legend, as the sheet draws one. */
export const slopeKey = () =>
  FLUP_SLOPE_CLASSES.map((cls) => ({ label: cls.label, colour: `rgb(${cls.colour.join(',')})` }));
