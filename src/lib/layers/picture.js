import { columnsOf, rowsOf } from './grid.js';

/**
 * A layer drawn as a picture to lay over the map.
 *
 * The heavy layers — flood, elevation — are not drawn as shapes on the
 * public map: 4.8 million points is a page that never finishes loading. They
 * are drawn once, as an image, and the map stretches it over their extent.
 *
 * The map is Web Mercator, where a degree of latitude is taller the further
 * from the equator, and an image stretched over it is stretched evenly. So
 * the image's rows are spaced evenly in Mercator, not in latitude — each row
 * reading the grid at the latitude it will actually be shown at — or the
 * middle of a 70 km layer would sit tens of metres off.
 *
 * Returns { width, height, data } with RGBA bytes, ready for a canvas.
 */
const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latitudeOf = (y) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

export function drawPicture(grid, values, colourOf) {
  const width = columnsOf(grid);
  const height = rowsOf(grid);
  const south = grid.north - height * grid.cell;
  const top = mercatorY(grid.north);
  const bottom = mercatorY(south);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const lat = latitudeOf(top - ((y + 0.5) / height) * (top - bottom));
    const row = Math.min(height - 1, Math.max(0, Math.floor((grid.north - lat) / grid.cell)));
    for (let x = 0; x < width; x += 1) {
      const colour = colourOf(values[row * width + x]);
      if (!colour) continue;
      const at = (y * width + x) * 4;
      data[at] = colour[0];
      data[at + 1] = colour[1];
      data[at + 2] = colour[2];
      data[at + 3] = colour[3] ?? 255;
    }
  }
  return { width, height, data, bounds: [[south, grid.west], [grid.north, grid.west + width * grid.cell]] };
}

/** NOAH's flood hazard colours, as on its own maps. */
export const HAZARD_COLOURS = Object.freeze({
  1: [255, 255, 0, 150],
  2: [255, 153, 0, 170],
  3: [204, 0, 0, 180],
});

export const HAZARD_LEGEND = Object.freeze([
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
]);
