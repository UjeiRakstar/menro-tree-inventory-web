/**
 * The measuring grid every uploaded layer is laid on.
 *
 * PGENRO's layers are measured against the areas offices draw: how much of an
 * area a flood reaches, how high it stands, what soil it is on. Doing that
 * against the source files directly is out of reach in a browser — the NOAH
 * flood map is three shapes and 4.8 million points. So each layer is laid
 * once, as it is uploaded, on one fixed grid over Laguna, and every area is
 * then measured by the grid cells inside it.
 *
 * One grid for all layers, so their cells line up. Its extent is the
 * Copernicus DEM tile PGENRO has (120.98833–121.62222 E, 13.95222–14.61111 N,
 * which holds the whole province), and its cells are two DEM pixels a side —
 * 2 arc-seconds, about 60 m — fine enough for planning, small enough that the
 * whole province is 1.35 million cells.
 */
export const LAGUNA_GRID = Object.freeze({
  west: 120.98833,
  south: 13.95222,
  east: 121.62222,
  north: 14.61111,
  cell: 2 / 3600,
});

export const columnsOf = (grid) => Math.ceil((grid.east - grid.west) / grid.cell);
export const rowsOf = (grid) => Math.ceil((grid.north - grid.south) / grid.cell);

/** Row 0 is the northern edge, as in an image. */
export const cellCentre = (grid, col, row) => [
  grid.north - (row + 0.5) * grid.cell,
  grid.west + (col + 0.5) * grid.cell,
];

const M_PER_DEGREE_LAT = 110574;
const M_PER_DEGREE_LNG_AT_EQUATOR = 111320;

/** A cell's ground area in m², which shrinks with latitude. */
export const cellAreaM2 = (grid, row) => {
  const lat = grid.north - (row + 0.5) * grid.cell;
  return (
    grid.cell * M_PER_DEGREE_LAT * grid.cell * M_PER_DEGREE_LNG_AT_EQUATOR * Math.cos((lat * Math.PI) / 180)
  );
};

/** GeoJSON rings of a Polygon or MultiPolygon, as [polygon][ring][[lng, lat]]. */
export function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/**
 * Every cell whose centre lies inside a polygon, by scanline: for each row of
 * cell centres, where the polygon's edges cross it, and the spans between
 * crossings in pairs (even–odd, so holes are holes). One pass over the edges,
 * however large the polygon.
 *
 * Calls `visit(index, row)` for each cell inside.
 */
export function forEachCellIn(grid, polygon, visit) {
  const cols = columnsOf(grid);
  const rows = rowsOf(grid);
  const crossings = new Map(); // row → [x, …]

  for (const ring of polygon) {
    for (let i = 0, n = ring.length; i < n; i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % n];
      if (y1 === y2) continue;
      // Rows whose centre line lies between the two ends, half-open so a
      // vertex on a centre line counts once.
      const top = Math.max(y1, y2);
      const bottom = Math.min(y1, y2);
      const firstRow = Math.max(0, Math.ceil((grid.north - top) / grid.cell - 0.5));
      const lastRow = Math.min(rows - 1, Math.floor((grid.north - bottom) / grid.cell - 0.5));
      for (let row = firstRow; row <= lastRow; row += 1) {
        const lat = grid.north - (row + 0.5) * grid.cell;
        if (lat >= top || lat < bottom) continue;
        const x = x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1);
        let list = crossings.get(row);
        if (!list) crossings.set(row, (list = []));
        list.push(x);
      }
    }
  }

  for (const [row, xs] of crossings) {
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] - grid.west) / grid.cell - 0.5));
      const to = Math.min(cols - 1, Math.floor((xs[k + 1] - grid.west) / grid.cell - 0.5));
      for (let col = from; col <= to; col += 1) visit(row * cols + col, row);
    }
  }
}

/**
 * A layer of features laid on the grid: each cell takes the value of the
 * feature over its centre — the highest, where features overlap, so the
 * worse hazard level wins. 0 is "nothing here".
 */
export function rasterize(grid, features, valueOf) {
  const cells = new Uint8Array(columnsOf(grid) * rowsOf(grid));
  for (const feature of features) {
    const value = valueOf(feature);
    if (!value) continue;
    for (const polygon of polygonsOf(feature.geometry)) {
      forEachCellIn(grid, polygon, (index) => {
        if (value > cells[index]) cells[index] = value;
      });
    }
  }
  return cells;
}
