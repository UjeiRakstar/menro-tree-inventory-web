import { officialName } from './psgc.js';

/**
 * A printed map sheet, laid out the way the LGU Comprehensive Development
 * and Risk Assessment (CDRA) maps are — Santa Cruz's as the template: the map
 * in a double-lined frame with its graticule written round the edge, and a
 * column on the right with the seal, the LGU, the map's title, the legend,
 * two locator maps, who prepared it, and its projection and sources. A north
 * arrow and a scale bar with the scale written out sit in the map.
 *
 * Everything here is arithmetic on millimetres of paper; the page
 * (pages/MapSheet.jsx) draws it as SVG at those millimetres, so a sheet
 * printed at 100% is at the scale it says.
 */

export const PAPERS = Object.freeze({
  a4: { id: 'a4', label: 'A4 landscape', width: 297, height: 210, side: 78, margin: 8 },
  a3: { id: 'a3', label: 'A3 landscape', width: 420, height: 297, side: 104, margin: 10 },
});

/** The map frame and the column beside it, in mm. */
export function sheetLayout(paper) {
  const { width, height, side, margin } = paper;
  const gap = 4;
  // Room round the frame for the graticule labels.
  const labels = 6;
  const frame = {
    x: margin + labels,
    y: margin + labels,
    width: width - margin * 2 - side - gap - labels * 2,
    height: height - margin * 2 - labels * 2,
  };
  const column = { x: width - margin - side, y: margin, width: side, height: height - margin * 2 };
  return { frame, column };
}

// ---- Web Mercator, as the base maps are drawn -------------------------------------

/** [lng, lat] → [x, y] in world units, 0…1 across and down. */
export function worldOf([lng, lat]) {
  const sin = Math.sin((lat * Math.PI) / 180);
  return [(lng + 180) / 360, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)];
}

/** [x, y] in world units → [lng, lat]. */
export function lngLatOf([x, y]) {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [x * 360 - 180, lat];
}

const EQUATOR_M = 40075016.686;

/** The standard map scales, smallest number (most detail) first. */
export const NICE_SCALES = Object.freeze([
  2500, 5000, 7500, 10000, 12500, 15000, 20000, 25000, 30000, 40000, 50000, 60000, 75000, 100000,
  125000, 150000, 200000, 250000, 300000, 400000, 500000, 750000, 1000000,
]);

/** Each part's points of a Polygon / MultiPolygon, outer rings only. */
const outerRings = (geometry) =>
  geometry.type === 'Polygon' ? [geometry.coordinates[0]] : geometry.coordinates.map((polygon) => polygon[0]);

/**
 * How the frame shows an area: the smallest standard scale at which all of
 * it fits with a little room, centred.
 *
 *   view.scale        N of 1:N
 *   view.toPaper      [lng, lat] → [x, y] mm on the sheet
 *   view.mmPerWorld   paper mm per world unit
 *   view.world        the frame's corners in world units
 */
export function fitView(geometry, frame, { room = 1.08 } = {}) {
  const points = outerRings(geometry).flat().map(worldOf);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const centre = [(minX + maxX) / 2, (minY + maxY) / 2];
  const latitude = lngLatOf(centre)[1];
  const groundPerWorld = EQUATOR_M * Math.cos((latitude * Math.PI) / 180);
  // 1:N means a millimetre of paper is N millimetres of ground.
  const needed = Math.max(
    ((maxX - minX) * groundPerWorld * 1000 * room) / frame.width,
    ((maxY - minY) * groundPerWorld * 1000 * room) / frame.height
  );
  const scale = NICE_SCALES.find((n) => n >= needed) ?? Math.ceil(needed / 100000) * 100000;
  const mmPerWorld = (groundPerWorld * 1000) / scale;
  const origin = [centre[0] - frame.width / 2 / mmPerWorld, centre[1] - frame.height / 2 / mmPerWorld];
  const toPaper = (lngLat) => {
    const [x, y] = worldOf(lngLat);
    return [frame.x + (x - origin[0]) * mmPerWorld, frame.y + (y - origin[1]) * mmPerWorld];
  };
  return {
    scale,
    mmPerWorld,
    toPaper,
    world: {
      west: origin[0],
      north: origin[1],
      east: origin[0] + frame.width / mmPerWorld,
      south: origin[1] + frame.height / mmPerWorld,
    },
  };
}

export const scaleLabel = (scale) => `1:${scale.toLocaleString('en-US')}`;

/**
 * An SVG path for a Polygon / MultiPolygon, holes kept (fill-rule evenodd).
 * `rings`: 'all', or 'outer' or 'holes' alone — a boundary is drawn heavy
 * on the outside and light round its lakes, whose shores at a small scale
 * would otherwise fill in solid.
 */
export function pathOf(geometry, toPaper, { rings: which = 'all' } = {}) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons
    .flatMap((rings) =>
      (which === 'outer' ? rings.slice(0, 1) : which === 'holes' ? rings.slice(1) : rings).map(
        (ring) =>
          ring
            .map((point, i) => {
              const [x, y] = toPaper(point);
              return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join('') + 'Z'
      )
    )
    .join('');
}

// ---- The graticule written round the frame --------------------------------------------

/** 121.3528 → 121°21′10″E */
export function dmsLabel(degrees, positive, negative) {
  const hemisphere = degrees < 0 ? negative : positive;
  let total = Math.round(Math.abs(degrees) * 3600);
  const d = Math.floor(total / 3600);
  total -= d * 3600;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″${hemisphere}`;
}

const STEPS_SECONDS = [15, 30, 60, 120, 180, 300, 600, 900, 1200, 1800, 3600, 7200];

/**
 * Where to write longitudes along the top and bottom, and latitudes up the
 * side: round values, two to four of them, as CDRA sheets do.
 */
export function graticule(view, frame) {
  const [west, north] = lngLatOf([view.world.west, view.world.north]);
  const [east, south] = lngLatOf([view.world.east, view.world.south]);
  const ticks = (from, to) => {
    const span = (to - from) * 3600;
    const step = STEPS_SECONDS.find((s) => span / s <= 4) ?? 7200;
    const values = [];
    for (let v = Math.ceil((from * 3600) / step) * step; v <= to * 3600; v += step) values.push(v / 3600);
    return values;
  };
  return {
    longitudes: ticks(west, east).map((lng) => ({ value: lng, label: dmsLabel(lng, 'E', 'W'), at: view.toPaper([lng, (north + south) / 2])[0] })),
    latitudes: ticks(south, north).map((lat) => ({ value: lat, label: dmsLabel(lat, 'N', 'S'), at: view.toPaper([(west + east) / 2, lat])[1] })),
    frame,
  };
}

// ---- The scale bar ----------------------------------------------------------------------

const BAR_KM = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50];

/** A bar in two halves, as long as fits in maxMm: { km, mm, label }. */
export function scaleBar(scale, maxMm = 40) {
  const mmPerKm = 1e6 / scale;
  const km = [...BAR_KM].reverse().find((k) => k * mmPerKm <= maxMm) ?? BAR_KM[0];
  const unit = km < 1 ? 'm' : 'km';
  const value = (v) => (km < 1 ? Math.round(v * 1000) : v);
  return { km, mm: km * mmPerKm, ticks: [0, km / 2, km].map((v) => value(v)), unit };
}

// ---- Words --------------------------------------------------------------------------------

export const SURVEY_TITLES = Object.freeze({
  landslide: { title: 'RAIN-INDUCED LANDSLIDE SUSCEPTIBILITY MAP', legend: 'Landslide susceptibility', source: 'UP NOAH' },
  flood: { title: 'FLOOD SUSCEPTIBILITY MAP', legend: 'Flood susceptibility', source: 'UP NOAH' },
  soil: { title: 'SOIL MAP', legend: 'Soil series', source: 'DA–BSWM' },
  elevation: { title: 'ELEVATION MAP', legend: 'Elevation (m above sea level)', source: 'Copernicus DEM' },
  // Worked out from the elevation layer (layers/terrain.js), not uploaded.
  slope: { title: 'SLOPE MAP', legend: 'Slope (FLUP classes)', source: 'Copernicus DEM' },
});

/**
 * How the trees are coloured on a sheet (17 October): one colour; by origin —
 * endemic or native against invasive; or by what they are grown for.
 */
export const TREE_COLOURINGS = Object.freeze({
  one: { label: 'One colour', classes: [{ id: 'all', label: 'Tagged tree', fill: '#16a34a' }] },
  origin: {
    label: 'Origin — native or invasive',
    title: 'NATIVE AND INVASIVE TREES MAP',
    classes: [
      { id: 'native', label: 'Endemic / native', fill: '#16a34a' },
      { id: 'invasive', label: 'Invasive', fill: '#dc2626' },
      { id: 'unrecorded', label: 'Origin not recorded', fill: '#94a3b8' },
    ],
  },
  use: {
    label: 'Use — fruit, timber, ornamental',
    title: 'FRUIT, TIMBER AND ORNAMENTAL TREES MAP',
    classes: [
      { id: 'fruit', label: 'Fruit', fill: '#ea580c' },
      { id: 'timber', label: 'Timber', fill: '#a16207' },
      { id: 'ornamental', label: 'Ornamental', fill: '#7c3aed' },
      { id: 'unrecorded', label: 'Use not recorded', fill: '#94a3b8' },
    ],
  },
});

/** Which class of a colouring a tree falls in. */
export function treeClassOf(tree, colouring) {
  const word = (value) => String(value ?? '').trim().toLowerCase();
  if (colouring === 'origin') {
    const status = word(tree?.biodiversity_status) || word(tree?.species_type);
    if (status.includes('invasive')) return 'invasive';
    return status ? 'native' : 'unrecorded';
  }
  if (colouring === 'use') {
    const use = word(tree?.tree_category);
    return ['fruit', 'timber', 'ornamental'].find((kind) => use.includes(kind)) ?? 'unrecorded';
  }
  return 'all';
}

/** The title the sheet starts with; the office may change it. */
export function defaultTitle({ survey, trees, sites, treeColour = 'one' }) {
  if (survey && SURVEY_TITLES[survey]) return SURVEY_TITLES[survey].title;
  if (trees && TREE_COLOURINGS[treeColour]?.title) return TREE_COLOURINGS[treeColour].title;
  if (trees) return 'TREE INVENTORY MAP';
  if (sites) return 'LAND COVER AND TREE PLANTING SITES MAP';
  return 'BASE MAP';
}

/** The LGU's heading lines, as the seal block writes them: its official PSGC name. */
export function headingOf(lgu) {
  if (!lgu) return ['PROVINCE OF LAGUNA', 'REGION IV-A CALABARZON'];
  return [
    officialName(lgu).toUpperCase(),
    'PROVINCE OF LAGUNA',
    'REGION IV-A CALABARZON',
  ];
}

/** The data sources line, for what is on the sheet. */
export function sourcesOf({ survey, trees, sites, basemap }) {
  const sources = ['PSA / NAMRIA boundaries'];
  if (survey && SURVEY_TITLES[survey]) sources.push(SURVEY_TITLES[survey].source);
  if (trees || sites) sources.push('Green Tag tree inventory');
  if (basemap === 'light') sources.push('Esri World Light Gray');
  if (basemap === 'street') sources.push('© OpenStreetMap contributors');
  if (basemap === 'satellite') sources.push('Esri World Imagery');
  return sources.join(', ');
}

// ---- Base map tiles -----------------------------------------------------------------------

export const SHEET_BASEMAPS = Object.freeze([
  { id: 'light', label: 'Light grey (as CDRA maps)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', maxZoom: 16 },
  { id: 'street', label: 'Street map', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19 },
  { id: 'satellite', label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 18 },
  { id: 'none', label: 'None', url: null, maxZoom: 0 },
]);

/**
 * The tiles that cover the frame, each placed in mm: fine enough for print
 * (about 0.2 mm a tile pixel), never more than `maxTiles`.
 */
export function tilesFor(view, frame, basemap, { maxTiles = 160 } = {}) {
  if (!basemap?.url) return [];
  let zoom = Math.min(basemap.maxZoom, Math.ceil(Math.log2(view.mmPerWorld / (256 * 0.2))));
  for (; zoom > 0; zoom -= 1) {
    const n = 2 ** zoom;
    const cols = Math.floor(view.world.east * n) - Math.floor(view.world.west * n) + 1;
    const rows = Math.floor(view.world.south * n) - Math.floor(view.world.north * n) + 1;
    if (cols * rows <= maxTiles) break;
  }
  const n = 2 ** zoom;
  const size = view.mmPerWorld / n;
  const tiles = [];
  for (let tx = Math.floor(view.world.west * n); tx <= Math.floor(view.world.east * n); tx += 1) {
    for (let ty = Math.floor(view.world.north * n); ty <= Math.floor(view.world.south * n); ty += 1) {
      tiles.push({
        key: `${zoom}/${tx}/${ty}`,
        url: basemap.url.replace('{z}', zoom).replace('{x}', tx).replace('{y}', ty),
        x: frame.x + (tx / n - view.world.west) * view.mmPerWorld,
        y: frame.y + (ty / n - view.world.north) * view.mmPerWorld,
        size,
      });
    }
  }
  return tiles;
}
