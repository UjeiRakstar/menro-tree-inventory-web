import { geometryAreaM2, ringAreaM2 } from './areaGeometry.js';

/**
 * Bringing an area in from a file instead of drawing it: a GeoJSON, or a
 * shapefile — zipped, or its .shp with the .dbf and .prj chosen together.
 *
 * Whatever comes in is converted to longitude and latitude (WGS 84), the way
 * the map and the database keep it. A shapefile carries its projection in its
 * .prj and is converted from that; a GeoJSON in a Philippine projected system
 * names it in its "crs", and the ones offices are likely to have are known
 * here. Anything else is refused with what to do about it, never guessed.
 *
 * One area is brought in at a time: it opens in the save form like a drawn
 * one, its outline still movable, because each area needs its own class and
 * details anyway.
 */

/** Projected systems a Laguna file is likely to be in (definitions from EPSG). */
const KNOWN_SYSTEMS = {
  32651: '+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs',
  3122: '+proj=tmerc +lat_0=0 +lon_0=119 +k=0.99995 +x_0=500000 +y_0=0 +ellps=clrk66 +towgs84=-127.62,-67.24,-47.04,-3.068,4.903,1.578,-1.06 +units=m +no_defs',
  3123: '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.99995 +x_0=500000 +y_0=0 +ellps=clrk66 +towgs84=-127.62,-67.24,-47.04,-3.068,4.903,1.578,-1.06 +units=m +no_defs',
  3124: '+proj=tmerc +lat_0=0 +lon_0=123 +k=0.99995 +x_0=500000 +y_0=0 +ellps=clrk66 +towgs84=-127.62,-67.24,-47.04,-3.068,4.903,1.578,-1.06 +units=m +no_defs',
  25393: '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.99995 +x_0=500000 +y_0=0 +ellps=clrk66 +towgs84=-133,-77,-51,0,0,0,0 +units=m +no_defs',
  3857: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs',
};
const SYSTEM_NAMES = {
  32651: 'WGS 84 / UTM zone 51N',
  3122: 'PRS92 / Philippines zone II',
  3123: 'PRS92 / Philippines zone III',
  3124: 'PRS92 / Philippines zone IV',
  25393: 'Luzon 1911 / Philippines zone III',
  3857: 'Web Mercator',
};

/** Well round Laguna, so a file somewhere else — or with x and y swapped — is caught. */
const NEAR_LAGUNA = { west: 120.8, east: 121.8, south: 13.8, north: 14.8 };

export const ACCEPTED_FILES = '.geojson,.json,.zip,.shp,.dbf,.prj,.cpg,.shx';

/** The EPSG code a GeoJSON's "crs" names, or null for longitude and latitude. */
export function crsCodeOf(data) {
  const name = String(data?.crs?.properties?.name ?? '');
  if (!name || /CRS84|EPSG:+4326\b|EPSG::4326\b/i.test(name)) return null;
  const code = name.match(/EPSG:{1,2}(\d+)/i)?.[1];
  return code ? Number(code) : NaN;
}

const mapCoordinates = (coordinates, fn) =>
  typeof coordinates[0] === 'number' ? fn(coordinates) : coordinates.map((c) => mapCoordinates(c, fn));

// proj4 is fetched only when a file needs converting, not with the map.
async function reproject(collection, code) {
  const { default: proj4 } = await import('proj4');
  const convert = proj4(KNOWN_SYSTEMS[code], 'EPSG:4326');
  return {
    ...collection,
    crs: undefined,
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: feature.geometry && {
        ...feature.geometry,
        coordinates: mapCoordinates(feature.geometry.coordinates, ([x, y]) => convert.forward([x, y])),
      },
    })),
  };
}

function firstPoint(coordinates) {
  let c = coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) && typeof c[0] === 'number' ? c : null;
}

/** A GeoJSON's text, in longitude and latitude. */
export async function geoJsonFromText(text, fileName = 'the file') {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${fileName} is not GeoJSON the page can read.`);
  }
  const collection =
    data?.type === 'FeatureCollection'
      ? data
      : data?.type === 'Feature'
        ? { type: 'FeatureCollection', features: [data] }
        : data?.type && data.coordinates
          ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: data }] }
          : null;
  if (!collection || !Array.isArray(collection.features)) {
    throw new Error(`${fileName} is not GeoJSON: it has no features.`);
  }

  const code = crsCodeOf(collection);
  if (Number.isNaN(code) || (code && !KNOWN_SYSTEMS[code])) {
    throw new Error(
      `${fileName} is in a coordinate system the page does not know (${collection.crs.properties.name}). Export it from QGIS as GeoJSON in WGS 84 (EPSG:4326), or as a zipped shapefile.`
    );
  }
  if (code) return reproject(collection, code);

  // No "crs", yet metres rather than degrees: say so rather than draw nonsense.
  const sample = firstPoint(collection.features.find((f) => f?.geometry)?.geometry?.coordinates ?? []);
  if (sample && (Math.abs(sample[0]) > 180 || Math.abs(sample[1]) > 90)) {
    throw new Error(
      `${fileName} is in metres, not longitude and latitude, and does not say which system. Export it from QGIS as GeoJSON in WGS 84 (EPSG:4326), or as a zipped shapefile (its .prj says the system).`
    );
  }
  return collection;
}

/** A shapefile, zipped or as its parts, in longitude and latitude (shpjs reads the .prj). */
async function shapefileFrom(files) {
  const { default: shp } = await import('shpjs');
  const zip = files.find((file) => /\.zip$/i.test(file.name));
  let result;
  if (zip) {
    result = await shp(await zip.arrayBuffer());
  } else {
    const part = (ext) => files.find((file) => file.name.toLowerCase().endsWith(ext));
    const shpFile = part('.shp');
    if (!shpFile) throw new Error('A shapefile needs its .shp — choose the .shp, .dbf and .prj together, or zip them.');
    const prj = part('.prj');
    if (!prj) {
      throw new Error('Choose the .prj with the .shp: it says which coordinate system the shapefile is in.');
    }
    const dbf = part('.dbf');
    const cpg = part('.cpg');
    result = await shp({
      shp: await shpFile.arrayBuffer(),
      dbf: dbf ? await dbf.arrayBuffer() : undefined,
      prj: await prj.text(),
      cpg: cpg ? await cpg.text() : undefined,
    });
  }
  const collections = Array.isArray(result) ? result : [result];
  return { type: 'FeatureCollection', features: collections.flatMap((c) => c?.features ?? []) };
}

/** The chosen files, as one FeatureCollection in longitude and latitude. */
export async function readAreaFiles(fileList) {
  const files = Array.from(fileList ?? []);
  if (files.length === 0) throw new Error('No file was chosen.');
  const json = files.find((file) => /\.(geo)?json$/i.test(file.name));
  try {
    return json ? await geoJsonFromText(await json.text(), json.name) : await shapefileFrom(files);
  } catch (error) {
    if (error instanceof Error && !/shapefile|GeoJSON|\.prj|\.shp/.test(error.message)) {
      throw new Error(`The file could not be read as a shapefile or GeoJSON (${error.message}).`);
    }
    throw error;
  }
}

const NAME_FIELDS = ['name', 'Name', 'NAME', 'site_name', 'SITE_NAME', 'SiteName', 'LABEL', 'label', 'Label', 'title', 'TITLE'];

/**
 * The areas in a collection that could be saved — polygons, inside or near
 * Laguna — each with a name if its properties give one, largest first.
 */
export function areaCandidates(collection) {
  const candidates = [];
  let outside = 0;
  (collection?.features ?? []).forEach((feature, index) => {
    const geometry = feature?.geometry;
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return;
    const point = firstPoint(geometry.coordinates);
    if (!point || point[0] < NEAR_LAGUNA.west || point[0] > NEAR_LAGUNA.east || point[1] < NEAR_LAGUNA.south || point[1] > NEAR_LAGUNA.north) {
      outside += 1;
      return;
    }
    const props = feature.properties ?? {};
    const nameField = NAME_FIELDS.find((field) => typeof props[field] === 'string' && props[field].trim());
    candidates.push({
      index,
      name: nameField ? props[nameField].trim() : '',
      geometry,
      areaM2: geometryAreaM2(geometry),
      properties: props,
    });
  });
  if (candidates.length === 0) {
    throw new Error(
      outside > 0
        ? 'The shapes in this file are not in Laguna. If it is in a projected system, export it from QGIS in WGS 84 (EPSG:4326), or zip the shapefile with its .prj.'
        : 'There is no area (polygon) in this file. Points and lines cannot be saved as areas.'
    );
  }
  return candidates.sort((a, b) => b.areaM2 - a.areaM2);
}

/** Douglas–Peucker on [lat, lng] points, in metres. */
function simplify(points, tolerance) {
  if (points.length < 4) return points;
  const lat0 = (points[0][0] * Math.PI) / 180;
  const xy = points.map(([lat, lng]) => [lng * 111320 * Math.cos(lat0), lat * 110540]);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let worstAt = -1;
    for (let i = a + 1; i < b; i += 1) {
      const distance = Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx * ay - by * ax) / length;
      if (distance > worst) {
        worst = distance;
        worstAt = i;
      }
    }
    if (worst > tolerance) {
      keep[worstAt] = 1;
      stack.push([a, worstAt], [worstAt, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * A closed outline simplified: split at the point farthest from the first,
 * so neither half starts and ends on the same point (where every distance
 * would be zero and the whole outline would fold away).
 */
function simplifyRing(ring, tolerance) {
  let far = 0;
  let farthest = -1;
  for (let i = 1; i < ring.length; i += 1) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d > farthest) {
      farthest = d;
      far = i;
    }
  }
  const first = simplify(ring.slice(0, far + 1), tolerance);
  const second = simplify([...ring.slice(far), ring[0]], tolerance);
  return [...first, ...second.slice(1, -1)];
}

/** Most points an outline brought in keeps: each is a handle to drag on the map. */
export const MAX_IMPORT_POINTS = 300;

/**
 * A polygon as the map's drawing — one outline of [lat, lng] points — and
 * what was changed to make it one, in words for the office:
 * the largest part of a multi-part area, without its holes, and simplified
 * to at most MAX_IMPORT_POINTS points, a metre or so at a time.
 */
export function shapeFromGeometry(geometry, { maxPoints = MAX_IMPORT_POINTS } = {}) {
  const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  const notes = [];
  let polygon = polygons[0];
  if (polygons.length > 1) {
    polygon = polygons.reduce((best, part) => (ringAreaM2(part[0]) > ringAreaM2(best[0]) ? part : best));
    notes.push(`It has ${polygons.length} separate parts; the largest is brought in.`);
  }
  if (polygon.length > 1) notes.push(`${polygon.length - 1} ${polygon.length === 2 ? 'hole was' : 'holes were'} left out.`);

  let ring = polygon[0].map(([lng, lat]) => [lat, lng]);
  const last = ring[ring.length - 1];
  if (ring.length > 1 && last[0] === ring[0][0] && last[1] === ring[0][1]) ring = ring.slice(0, -1);
  const original = ring.length;
  let points = ring;
  for (let tolerance = 0.5; points.length > maxPoints && tolerance < 2000; tolerance *= 1.5) {
    points = simplifyRing(ring, tolerance);
  }
  if (points.length < original) {
    notes.push(`Its outline was simplified from ${original.toLocaleString('en-US')} to ${points.length} points, so it can still be adjusted by hand.`);
  }
  return { shape: { points, closed: points.length >= 3 }, notes };
}

/** The south-west and north-east corners of a drawing, for the map to frame it. */
export function boundsOfShape(shape) {
  const lats = shape.points.map((p) => p[0]);
  const lngs = shape.points.map((p) => p[1]);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

export const systemName = (code) => SYSTEM_NAMES[code] ?? `EPSG:${code}`;
