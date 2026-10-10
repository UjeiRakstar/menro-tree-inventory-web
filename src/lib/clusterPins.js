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

/**
 * The inverse of projectAt: a pixel point at some zoom, back to lat/lng.
 *
 * Needed because fanning a group apart is worked out in screen pixels — "put
 * these eight 34 px out from the middle" — and the result has to be handed back
 * to Leaflet as positions on the ground.
 */
export function unprojectAt({ x, y }, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (x / scale - 0.5) * 360;
  const n = Math.PI * (1 - (2 * y) / scale);
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return [lat, lng];
}

/**
 * How far apart two pins must be drawn before each can be tapped on its own.
 *
 * A pin is 14 px across with a 2 px ring. At 28 px between centres there is a
 * clear gap between them and a fingertip can pick one; any closer and tapping
 * is a guess, whatever the pins look like.
 */
export const MIN_PIN_GAP_PX = 28;

/**
 * Group pins by whether they are actually drawn on top of each other.
 *
 * This is the grouping for the furthest zoom, where the grid above is the wrong
 * tool twice over. A cell is 64 px, so two pins can share one while sitting
 * ninety pixels apart — perfectly tappable, and fanning them out would pull
 * them CLOSER. And the grid cuts at fixed lines, so two pins twenty pixels
 * apart land in separate cells whenever a boundary happens to fall between
 * them, and get drawn one on top of the other with nothing done about it.
 *
 * Distance answers both. Pins nearer than `minGapPx` join the same group, by
 * single linkage — a chain of close pins is one group, because fanning out half
 * of a huddle leaves the other half huddled.
 *
 * Quadratic in the number of pins, which is what the furthest zoom affords: at
 * zoom 21 the screen holds a few hundred metres of ground.
 */
export function crowdGroups(pins, zoom, minGapPx = MIN_PIN_GAP_PX) {
  const list = (Array.isArray(pins) ? pins : []).filter((pin) => pin?.position);
  const points = list.map((pin) => projectAt(pin.position, zoom));

  const parent = list.map((_, i) => i);
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) [i, parent[i]] = [parent[i], root];
    return root;
  };

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const apart = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (apart >= minGapPx) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[b] = a;
    }
  }

  const groups = new Map();
  list.forEach((pin, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(pin);
  });

  return [...groups.values()].map((members) => {
    if (members.length === 1) {
      const [pin] = members;
      return { key: pin.id, position: pin.position, pins: members, count: 1 };
    }
    let lat = 0;
    let lng = 0;
    for (const pin of members) {
      lat += pin.position[0];
      lng += pin.position[1];
    }
    return {
      key: members.map((pin) => pin.id).join('+'),
      position: [lat / members.length, lng / members.length],
      pins: members,
      count: members.length,
    };
  });
}

/** Past this many pins a ring grows wider than the screen, and a spiral reads better. */
const SPIRAL_AFTER = 9;

/**
 * Where to draw each pin of a group that zooming cannot separate.
 *
 * The group is fanned out around the point it stood at — a ring for a handful,
 * a spiral once a ring would be too wide — with a line back to the middle, so
 * it is plain that the pins have been moved and where from. Leaflet.markercluster
 * calls this spiderfying; it is written here rather than taken from that
 * library because the grouping is already ours and ninety kilobytes of
 * dependency for one gesture is not a trade worth making.
 *
 * These positions are a DRAWING, not the trees' coordinates. Nothing is written
 * back, and the moment the fan closes every pin is where it was tagged.
 */
export function spiderPositions(cluster, zoom) {
  const pins = cluster?.pins ?? [];
  if (pins.length === 0) return [];
  if (pins.length === 1) {
    return [{ pin: pins[0], position: pins[0].position, anchor: pins[0].position }];
  }

  const centre = projectAt(cluster.position, zoom);
  const anchor = cluster.position;
  const place = (pin, dx, dy) => ({
    pin,
    position: unprojectAt({ x: centre.x + dx, y: centre.y + dy }, zoom),
    anchor,
  });

  if (pins.length <= SPIRAL_AFTER) {
    // Wide enough that the pins clear each other, and it grows with the count.
    const radius = Math.max(34, (pins.length * 22) / (2 * Math.PI));
    return pins.map((pin, i) => {
      // Starting at the top means a pair fans up and down rather than sideways
      // into whichever panel is open.
      const angle = (2 * Math.PI * i) / pins.length - Math.PI / 2;
      return place(pin, radius * Math.cos(angle), radius * Math.sin(angle));
    });
  }

  // An Archimedean spiral: the radius grows just fast enough that each turn
  // clears the one inside it.
  let angle = 0;
  return pins.map((pin) => {
    const radius = 28 + 5.2 * angle;
    const point = place(pin, radius * Math.cos(angle), radius * Math.sin(angle));
    angle += (2 * Math.PI) / Math.max(6, radius / 5);
    return point;
  });
}
