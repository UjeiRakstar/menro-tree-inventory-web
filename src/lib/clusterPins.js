import { projectAt } from './mercator.js';

/**
 * Grouping pins that land on top of one another.
 *
 * At province scale every tree in a town is one green smudge: a reader cannot
 * tell twelve trees from eighty, and the pin they tap is whichever happens to
 * be on top. This groups them by how far apart they are *on screen* rather
 * than on the ground, so the grouping loosens by itself as the map is zoomed
 * in and disappears once the pins have room to stand alone.
 *
 * WHERE A GROUP IS DRAWN. Not at the average of its trees: that point is often
 * empty ground nobody tagged — a field between two streets — and a bubble
 * there was the "pins way too far from the actual location" complaint that
 * took grouping out the first time. A group is drawn ON ONE OF ITS OWN TREES,
 * the one nearest the middle of the group, so the bubble always stands where
 * a tagged tree actually stands.
 */

/** How many pixels apart two pins must be to be drawn separately. */
export const DEFAULT_CELL_SIZE = 64;

/**
 * Group pins into clusters for one zoom level.
 *
 * Pins are dropped into a square grid of `cellSize` pixels and everything in a
 * cell becomes one cluster. A grid is coarse — two pins either side of a
 * boundary stay apart even when they are close — but it is predictable and it
 * costs one pass, which matters because this runs on every zoom. A cluster of
 * one is just that pin.
 *
 * Returns clusters in the order their first pin arrived, so the output does not
 * reshuffle between renders.
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
    return { key, position: anchorOf(members), pins: members, count: members.length };
  });
}

/**
 * The member tree nearest the middle of the group — where the bubble stands.
 *
 * Distances are compared in degrees: within one 64-pixel cell the difference
 * between a degree of latitude and a degree of longitude cannot change which
 * tree is nearest in any way a reader would see.
 */
export function anchorOf(members) {
  let lat = 0;
  let lng = 0;
  for (const pin of members) {
    lat += pin.position[0];
    lng += pin.position[1];
  }
  lat /= members.length;
  lng /= members.length;

  let best = members[0];
  let bestDistance = Infinity;
  for (const pin of members) {
    const distance = (pin.position[0] - lat) ** 2 + (pin.position[1] - lng) ** 2;
    if (distance < bestDistance) {
      best = pin;
      bestDistance = distance;
    }
  }
  return best.position;
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
