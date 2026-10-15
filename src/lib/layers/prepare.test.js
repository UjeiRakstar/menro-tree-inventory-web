import { describe, it, expect } from 'vitest';
import { findField, prepareElevation, prepareHazard, prepareSoil, readGeoJson } from './prepare.js';

// A block of about 1 km² in Santa Cruz.
const square = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const BLOCK = square(121.41, 14.27, 121.42, 14.28);
const collection = (features, crs = 'urn:ogc:def:crs:OGC:1.3:CRS84') => ({
  type: 'FeatureCollection',
  crs: { type: 'name', properties: { name: crs } },
  features,
});

describe('readGeoJson', () => {
  it('accepts polygons in degrees over Laguna', () => {
    const data = readGeoJson(JSON.stringify(collection([{ type: 'Feature', properties: {}, geometry: BLOCK }])));
    expect(data.features).toHaveLength(1);
  });

  it('says so when the file is not GeoJSON, empty, or not polygons', () => {
    expect(() => readGeoJson('not json')).toThrow(/not GeoJSON/);
    expect(() => readGeoJson(JSON.stringify(collection([])))).toThrow(/no features/);
    const point = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [121.41, 14.27] } };
    expect(() => readGeoJson(JSON.stringify(collection([point])))).toThrow(/no polygons/);
  });

  it('names the projection to export to when it is in metres', () => {
    const utm = collection([{ type: 'Feature', properties: {}, geometry: BLOCK }], 'urn:ogc:def:crs:EPSG::32651');
    expect(() => readGeoJson(JSON.stringify(utm))).toThrow(/WGS 84 \(EPSG:4326\)/);
    const metres = collection([{ type: 'Feature', properties: {}, geometry: square(300000, 1580000, 301000, 1581000) }], '');
    expect(() => readGeoJson(JSON.stringify(metres))).toThrow(/not over Laguna/);
  });
});

describe('findField', () => {
  it('finds the property every feature has that fits', () => {
    const features = [{ properties: { id: 1, Var: 2 } }, { properties: { id: 2, Var: 3 } }];
    expect(findField(features, ['level', 'Var'], (v) => [1, 2, 3].includes(Number(v)))).toBe('Var');
    expect(findField(features, ['level'])).toBeNull();
  });
});

describe('prepareHazard', () => {
  it('lays NOAH’s levels on the grid and draws them, with hectares by level', () => {
    const data = collection([
      { type: 'Feature', properties: { Var: 1 }, geometry: square(121.40, 14.27, 121.41, 14.28) },
      { type: 'Feature', properties: { Var: 3 }, geometry: BLOCK },
    ]);
    const layer = prepareHazard(data);
    expect(layer.meta.field).toBe('Var');
    // About 1.2 km² each: a hundred-odd hectares.
    expect(layer.meta.hectares.low).toBeGreaterThan(90);
    expect(layer.meta.hectares.high).toBeGreaterThan(90);
    expect(layer.meta.hectares.medium).toBe(0);
    expect(layer.picture.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
  });

  it('says which properties it found when none is a hazard level', () => {
    const data = collection([{ type: 'Feature', properties: { name: 'x' }, geometry: BLOCK }]);
    expect(() => prepareHazard(data)).toThrow(/Properties found: name/);
  });
});

describe('prepareSoil', () => {
  it('reads BSWM’s series, description and zone, and keeps a light copy for the map', () => {
    const data = collection([
      { type: 'Feature', properties: { SoilSeries: 'Lipa', SOILDESC: 'Lipa loam', AEZ: 'Uplands', Hectares: 1 }, geometry: BLOCK },
      { type: 'Feature', properties: { SoilSeries: null, SOILDESC: 'Hydrosol', AEZ: 'Lowlands', Hectares: 1 },
        geometry: square(121.40, 14.27, 121.41, 14.28) },
    ]);
    const layer = prepareSoil(data);
    expect(layer.meta.fields).toEqual({ series: 'SoilSeries', description: 'SOILDESC', zone: 'AEZ' });
    expect(layer.meta.classes.map((c) => [c.series, c.description, c.zone])).toEqual([
      ['Lipa', 'Lipa loam', 'Uplands'],
      ['Hydrosol', 'Hydrosol', 'Lowlands'],
    ]);
    expect(Object.keys(layer.shapes.features[0].properties)).not.toContain('Hectares');
    expect(layer.grid.reduce((m, v) => (v > m ? v : m), 0)).toBe(2);
  });
});

describe('prepareElevation', () => {
  it('refuses a model that does not cover Laguna', () => {
    expect(() => prepareElevation(new Float32Array(4), { width: 2, height: 2, bbox: [100, 0, 101, 1] })).toThrow(/does not cover Laguna/);
  });

  it('lays the heights on the grid and draws the bands', () => {
    // A coarse 4 × 4 model of the whole extent: 50 m in the west, 600 m in the east.
    const values = new Float32Array(16).map((_, i) => (i % 4 < 2 ? 50 : 600));
    const layer = prepareElevation(values, { width: 4, height: 4, bbox: [120.98833, 13.95222, 121.62222, 14.61111] });
    expect(layer.meta.range).toEqual({ min: 50, max: 600 });
    expect(layer.meta.legend).toHaveLength(5);
  });
});
