// @vitest-environment node
// Node has the browser's Blob and CompressionStream, which this file uses;
// jsdom does not.
import { describe, it, expect, vi } from 'vitest';
import { gunzip, prepareFile, publishLayer } from './browser.js';

const square = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const SOIL = JSON.stringify({
  type: 'FeatureCollection',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
  features: [
    { type: 'Feature', properties: { SoilSeries: 'Lipa', SOILDESC: 'Lipa loam', AEZ: 'Uplands' }, geometry: square(121.41, 14.27, 121.42, 14.28) },
  ],
});
const fileOf = (text, name) => new File([text], name, { type: 'application/geo+json' });

describe('prepareFile', () => {
  it('turns a soil file into a gzipped grid that comes back the same, and light shapes', async () => {
    const prepared = await prepareFile('soil', fileOf(SOIL, 'Laguna-Soil-BSWM.geojson'));
    expect(prepared.meta).toMatchObject({ kind: 'soil', gridType: 'uint8' });
    expect(Object.keys(prepared.files).sort()).toEqual(['grid.bin.gz', 'shapes.geojson']);

    const grid = await gunzip(await prepared.files['grid.bin.gz'].arrayBuffer());
    expect(grid.length).toBe(1142 * 1187);
    expect(grid.some((v) => v === 1)).toBe(true);
    const shapes = JSON.parse(await prepared.files['shapes.geojson'].text());
    expect(shapes.features[0].properties).toMatchObject({ series: 'Lipa', zone: 'Uplands' });
  });

  it('passes on what is wrong with the file', async () => {
    await expect(prepareFile('flood', fileOf(SOIL, 'soil-by-mistake.geojson'))).rejects.toThrow(/hazard level/);
  });
});

describe('publishLayer', () => {
  it('stores each file in its own folder, then makes the layer live', async () => {
    const uploads = [];
    const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'l1' }, error: null }) }) }));
    const supabase = {
      storage: { from: () => ({ upload: async (path) => uploads.push(path) && { error: null } }) },
      from: () => ({ insert }),
    };
    const prepared = await prepareFile('soil', fileOf(SOIL, 'Laguna-Soil-BSWM.geojson'));
    const row = await publishLayer(supabase, 'soil', prepared, 'Laguna-Soil-BSWM.geojson');

    expect(row).toEqual({ id: 'l1' });
    expect(uploads).toHaveLength(2);
    expect(uploads.every((path) => /^soil\/\d+\/(grid\.bin\.gz|shapes\.geojson)$/.test(path))).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'soil',
      file_name: 'Laguna-Soil-BSWM.geojson',
      source: 'DA–BSWM soil series',
      grid_path: expect.stringMatching(/grid\.bin\.gz$/),
      shapes_path: expect.stringMatching(/shapes\.geojson$/),
      picture_path: null,
    }));
  });

  it('says what to run when the bucket is not there yet', async () => {
    const supabase = { storage: { from: () => ({ upload: async () => ({ error: { message: 'Bucket not found' } }) }) } };
    const prepared = await prepareFile('soil', fileOf(SOIL, 'x.geojson'));
    await expect(publishLayer(supabase, 'soil', prepared, 'x.geojson')).rejects.toThrow(/map_layers\.sql/);
  });
});
