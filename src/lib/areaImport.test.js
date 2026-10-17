// @vitest-environment node
// Node has File and Blob.arrayBuffer, which reading an upload needs.
import { describe, it, expect } from 'vitest';
import proj4 from 'proj4';
import JSZip from 'jszip';
import {
  areaCandidates,
  boundsOfShape,
  crsCodeOf,
  geoJsonFromText,
  readAreaFiles,
  shapeFromGeometry,
  withDatumShift,
} from './areaImport.js';

// A square about 110 m a side in Santa Cruz, longitude first.
const SQUARE = [[121.41, 14.28], [121.411, 14.28], [121.411, 14.281], [121.41, 14.281], [121.41, 14.28]];
const featureOf = (coordinates, properties = {}) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Polygon', coordinates: [coordinates] },
});
const collectionOf = (...features) => ({ type: 'FeatureCollection', features });
const fileOf = (content, name) => new File([content], name);

const UTM51 = '+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs';
const PRS92_III = '+proj=tmerc +lat_0=0 +lon_0=121 +k=0.99995 +x_0=500000 +y_0=0 +ellps=clrk66 +towgs84=-127.62,-67.24,-47.04,-3.068,4.903,1.578,-1.06 +units=m +no_defs';

describe('reading a GeoJSON', () => {
  it('takes one in longitude and latitude as it is', async () => {
    const collection = await geoJsonFromText(JSON.stringify(collectionOf(featureOf(SQUARE))));
    expect(collection.features[0].geometry.coordinates[0][0]).toEqual([121.41, 14.28]);
  });

  it('converts one in PRS92 zone III, the way Philippine survey files often are', async () => {
    const projected = SQUARE.map((point) => proj4('EPSG:4326', PRS92_III, point));
    const data = { ...collectionOf(featureOf(projected)), crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3123' } } };
    expect(crsCodeOf(data)).toBe(3123);
    const [lng, lat] = (await geoJsonFromText(JSON.stringify(data))).features[0].geometry.coordinates[0][0];
    expect(lng).toBeCloseTo(121.41, 6);
    expect(lat).toBeCloseTo(14.28, 6);
  });

  it('refuses a system it does not know, and metres that say nothing, with what to do', async () => {
    const odd = { ...collectionOf(featureOf(SQUARE)), crs: { type: 'name', properties: { name: 'EPSG:2000' } } };
    await expect(geoJsonFromText(JSON.stringify(odd), 'odd.geojson')).rejects.toThrow(/does not know.*WGS 84/);
    const metres = collectionOf(featureOf(SQUARE.map(([x, y]) => [x * 4000, y * 100000])));
    await expect(geoJsonFromText(JSON.stringify(metres), 'm.geojson')).rejects.toThrow(/in metres/);
    await expect(geoJsonFromText('not json', 'x.geojson')).rejects.toThrow(/not GeoJSON/);
  });
});

describe('areaCandidates', () => {
  it('lists the polygons near Laguna, largest first, named from their properties', () => {
    const big = SQUARE.map(([x, y]) => [121.41 + (x - 121.41) * 3, 14.28 + (y - 14.28) * 3]);
    const candidates = areaCandidates(
      collectionOf(
        featureOf(SQUARE, { NAME: 'Small plot' }),
        featureOf(big, { name: 'Riverbank' }),
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [121.41, 14.28] } }
      )
    );
    expect(candidates.map((c) => c.name)).toEqual(['Riverbank', 'Small plot']);
  });

  it('says why when nothing in the file can be an area', () => {
    const point = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [121.41, 14.28] } };
    expect(() => areaCandidates(collectionOf(point))).toThrow(/no area \(polygon\)/);
    // Latitude and longitude swapped puts it in the sea off Africa.
    expect(() => areaCandidates(collectionOf(featureOf(SQUARE.map(([x, y]) => [y, x]))))).toThrow(/not in Laguna/);
  });
});

describe('shapeFromGeometry', () => {
  it('turns a polygon into the map’s drawing, without the repeated last point', () => {
    const { shape, notes } = shapeFromGeometry({ type: 'Polygon', coordinates: [SQUARE] });
    expect(shape.points).toEqual([[14.28, 121.41], [14.28, 121.411], [14.281, 121.411], [14.281, 121.41]]);
    expect(shape.closed).toBe(true);
    expect(notes).toEqual([]);
    expect(boundsOfShape(shape)).toEqual([[14.28, 121.41], [14.281, 121.411]]);
  });

  it('keeps the largest part, leaves out holes, and says so', () => {
    const small = SQUARE.map(([x, y]) => [x + 0.01, y]);
    const big = SQUARE.map(([x, y]) => [121.41 + (x - 121.41) * 2, 14.28 + (y - 14.28) * 2]);
    const hole = [[121.4102, 14.2802], [121.4104, 14.2802], [121.4104, 14.2804], [121.4102, 14.2802]];
    const { shape, notes } = shapeFromGeometry({ type: 'MultiPolygon', coordinates: [[small], [big, hole]] });
    expect(shape.points[1]).toEqual([14.28, 121.412]);
    expect(notes).toEqual(['It has 2 separate parts; the largest is brought in.', '1 hole was left out.']);
  });

  it('simplifies a surveyed outline with thousands of points to one that can be moved by hand', () => {
    // A circle of 4,000 points, 300 m across: the simplified one keeps its shape.
    const circle = Array.from({ length: 4000 }, (_, i) => {
      const a = (i / 4000) * 2 * Math.PI;
      return [121.41 + (150 / 107900) * Math.cos(a), 14.28 + (150 / 110540) * Math.sin(a)];
    });
    const { shape, notes } = shapeFromGeometry({ type: 'Polygon', coordinates: [[...circle, circle[0]]] });
    expect(shape.points.length).toBeLessThanOrEqual(300);
    expect(shape.points.length).toBeGreaterThan(20);
    expect(notes[0]).toMatch(/simplified from 4,000 to \d+ points/);
  });
});

// ---- A real shapefile, built byte by byte -----------------------------------------------

/** A one-polygon .shp (type 5), x/y in whatever system the ring is in. */
function polygonShp(ring) {
  const content = 4 + 32 + 4 + 4 + 4 + ring.length * 16;
  const buffer = new ArrayBuffer(100 + 8 + content);
  const view = new DataView(buffer);
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  view.setInt32(0, 9994);
  view.setInt32(24, buffer.byteLength / 2);
  view.setInt32(28, 1000, true);
  view.setInt32(32, 5, true);
  box.forEach((v, i) => view.setFloat64(36 + i * 8, v, true));
  let at = 100;
  view.setInt32(at, 1);
  view.setInt32(at + 4, content / 2);
  at += 8;
  view.setInt32(at, 5, true);
  box.forEach((v, i) => view.setFloat64(at + 4 + i * 8, v, true));
  view.setInt32(at + 36, 1, true);
  view.setInt32(at + 40, ring.length, true);
  view.setInt32(at + 44, 0, true);
  ring.forEach(([x, y], i) => {
    view.setFloat64(at + 48 + i * 16, x, true);
    view.setFloat64(at + 56 + i * 16, y, true);
  });
  return buffer;
}

/** A one-record .dbf with a NAME field. */
function nameDbf(name) {
  const width = 30;
  const headerLength = 32 + 32 + 1;
  const recordLength = 1 + width;
  const bytes = new Uint8Array(headerLength + recordLength + 1);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x03;
  view.setUint32(4, 1, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  'NAME'.split('').forEach((c, i) => (bytes[32 + i] = c.charCodeAt(0)));
  bytes[32 + 11] = 'C'.charCodeAt(0);
  bytes[32 + 16] = width;
  bytes[64] = 0x0d;
  bytes[65] = 0x20;
  name.padEnd(width).split('').forEach((c, i) => (bytes[66 + i] = c.charCodeAt(0)));
  bytes[bytes.length - 1] = 0x1a;
  return bytes.buffer;
}

const UTM51_PRJ =
  'PROJCS["WGS_1984_UTM_Zone_51N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",123.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

describe('reading a shapefile', () => {
  // Clockwise, as a shapefile's outer ring is.
  const clockwise = [[121.41, 14.28], [121.41, 14.281], [121.411, 14.281], [121.411, 14.28], [121.41, 14.28]];
  const utm = clockwise.map((point) => proj4('EPSG:4326', UTM51, point));

  it('converts it from the system its .prj names, and keeps its attributes', async () => {
    const collection = await readAreaFiles([
      fileOf(polygonShp(utm), 'site.shp'),
      fileOf(nameDbf('Pagsawitan Riverbank'), 'site.dbf'),
      fileOf(UTM51_PRJ, 'site.prj'),
    ]);
    const [candidate] = areaCandidates(collection);
    expect(candidate.name).toBe('Pagsawitan Riverbank');
    const [lng, lat] = candidate.geometry.coordinates[0][0];
    expect(lng).toBeCloseTo(121.41, 5);
    expect(lat).toBeCloseTo(14.28, 5);
  });

  it('asks for the .prj rather than guess the system', async () => {
    await expect(readAreaFiles([fileOf(polygonShp(utm), 'site.shp')])).rejects.toThrow(/\.prj/);
  });

  // As the Kalayaan protection forest files were saved: Luzon 1911, its shift to WGS 84 left out.
  const LUZON_UTM51_PRJ =
    'PROJCS["Luzon_1911_UTM_Zone_51N",GEOGCS["GCS_Luzon_1911",DATUM["D_Luzon_1911",SPHEROID["Clarke_1866",6378206.4,294.9786982]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",123.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
  const LUZON_UTM51 = '+proj=utm +zone=51 +ellps=clrk66 +towgs84=-133,-77,-51,0,0,0,0 +units=m +no_defs';
  const luzon = clockwise.map((point) => proj4('EPSG:4326', LUZON_UTM51, point));

  it('shifts a Luzon 1911 file to WGS 84, so it is not 225 m off', async () => {
    const collection = await readAreaFiles([
      fileOf(polygonShp(luzon), 'forest.shp'),
      fileOf(nameDbf('Protection forest'), 'forest.dbf'),
      fileOf(LUZON_UTM51_PRJ, 'forest.prj'),
    ]);
    const [lng, lat] = areaCandidates(collection)[0].geometry.coordinates[0][0];
    expect(lng).toBeCloseTo(121.41, 5);
    expect(lat).toBeCloseTo(14.28, 5);
  });

  it('does the same for a zipped shapefile', async () => {
    const zip = new JSZip();
    zip.file('Forest/forest.shp', polygonShp(luzon));
    zip.file('Forest/forest.dbf', nameDbf('Protection forest'));
    zip.file('Forest/forest.prj', LUZON_UTM51_PRJ);
    const collection = await readAreaFiles([fileOf(await zip.generateAsync({ type: 'arraybuffer' }), 'forest.zip')]);
    const [candidate] = areaCandidates(collection);
    expect(candidate.name).toBe('Protection forest');
    expect(candidate.geometry.coordinates[0][0][0]).toBeCloseTo(121.41, 5);
    expect(candidate.geometry.coordinates[0][0][1]).toBeCloseTo(14.28, 5);
  });

  it('leaves a .prj that has its shift, or another datum, as it is', () => {
    const shifted = withDatumShift(LUZON_UTM51_PRJ);
    expect(shifted).toContain('SPHEROID["Clarke_1866",6378206.4,294.9786982],TOWGS84[-133,-77,-51,0,0,0,0]]');
    expect(withDatumShift(shifted)).toBe(shifted);
    expect(withDatumShift(UTM51_PRJ)).toBe(UTM51_PRJ);
  });
});
