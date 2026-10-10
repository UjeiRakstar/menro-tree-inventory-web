/**
 * Grouping pins that land on top of one another.
 *
 * All 112 tagged trees stand in Santa Cruz. Drawn at province scale they are
 * one green blob: a reader cannot tell twelve trees from eighty, and the pin
 * they tap is whichever happens to be on top. This groups them by how far
 * apart they are *on screen* rather than on the ground, so the grouping
 * loosens by itself as the map is zoomed in and disappears once the pins have
 * room to stand alone.
 */

/** How many pixels apart two pins must be to be drawn separately. */
export const DEFAULT_CELL_SIZE = 64;

/** Leaflet's own zoom-0 tile size; the scale everything below is built on. */
const TILE_SIZE = 256;

const MAX_LATITUDE = 85.0511287798;

/**
 * Where a latitude/longitude falls, in pixels, at a given zoom.
 *
 * This is Web Mercator — the same projection Leaflet's default CRS uses, so
 * the arithmetic here agrees with where the map actually draws the pin. Doing
 * it here rather than calling map.project keeps the grouping a plain function
 * of its inputs: no map instance, no Leaflet, nothing to stand up in a test.
 */
export function projectAt([lat, lng], zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const clamped = Math.max(Math.min(lat, MAX_LATITUDE), -MAX_LATITUDE);
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: scale * (lng / 360 + 0.5),
    y: scale * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)),
  };
}

/**
 * Group pins into clusters for one zoom level.
 *
 * Pins are dropped into a square grid of `cellSize` pixels and everything in
 * a cell becomes one cluster, sitting at the average of its members. A grid is
 * coarse — two pins either side of a boundary stay apart even when they are
 * close — but it is predictable and it costs one pass, which matters because
 * this runs on every zoom. A cluster of one is just that pin.
 *
 * Returns clusters in the order their first pin arrived, so the output does
 * not reshuffle between renders.
 */
export function clusterPins(pins, zoom, cellSize = DEFAULT_CELL_SIZE) {
  const cells = new Map();

  for (const pin of Array.isArray(pins) ? pins : []) {
    if (!pin?.position) continue;
    const point = projectAt(pin.position, zoom);
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    const cell = cells.get(key);
    if (cell) cell.push(pin);
    else cells.set(key, [pin]);
  }

  return [...cells.entries()].map(([key, members]) => {
    if (members.length === 1) {
      const [pin] = members;
      return { key: pin.id ?? key, position: pin.position, pins: members, count: 1 };
    }

    let lat = 0;
    let lng = 0;
    for (const pin of members) {
      lat += pin.position[0];
      lng += pin.position[1];
    }
    return {
      key,
      position: [lat / members.length, lng / members.length],
      pins: members,
      count: members.length,
    };
  });
}

/** The corners of everything in a cluster, for zooming into it. */
export function boundsOfCluster(cluster) {
  const positions = cluster?.pins?.map((pin) => pin.position) ?? [];
  if (positions.length === 0) return null;

  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const [lat, lng] of positions) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  }
  return [
    [south, west],
    [north, east],
  ];
}
