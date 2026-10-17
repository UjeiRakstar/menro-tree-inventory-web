import { describe, it, expect } from 'vitest';
import { geometryAreaM2 } from './areaGeometry.js';
import { buildAreas, guessCover, mergeShapes, rowOfArea, sortingFields } from './areaBatch.js';

// Squares about 110 m a side, longitude first.
const square = (lng, lat, d = 0.001) => [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]];
const shape = (coordinates, properties) => ({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates } });
const barangay = (name, west, east) => ({
  type: 'Feature',
  properties: { barangay: name, barangay_psgc: name === 'San Antonio' ? 403409002 : 403409003, municipality: 'Kalayaan' },
  geometry: { type: 'Polygon', coordinates: [[[west, 14.3], [east, 14.3], [east, 14.4], [west, 14.4], [west, 14.3]]] },
});
const BARANGAYS = [barangay('San Antonio', 121.5, 121.55), barangay('San Juan', 121.55, 121.6)];

// Two forest parcels side by side in San Antonio, one across the line into San Juan, a house lot.
const FILE = {
  type: 'FeatureCollection',
  features: [
    shape(square(121.51, 14.33), { CLASSIFICA: 'PROTECTION FOREST' }),
    shape(square(121.511, 14.33), { CLASSIFICA: 'PROTECTION FOREST' }),
    shape(square(121.5495, 14.34), { CLASSIFICA: 'PROTECTION FOREST' }),
    shape(square(121.52, 14.35), { CLASSIFICA: 'RESIDENTIAL' }),
  ],
};

describe('sorting a file’s shapes', () => {
  it('offers the field that names forest first, with how much ground each value covers', () => {
    const [first] = sortingFields(FILE);
    expect(first.field).toBe('CLASSIFICA');
    expect(first.values.map((entry) => [entry.value, entry.count])).toEqual([['PROTECTION FOREST', 3], ['RESIDENTIAL', 1]]);
  });

  it('guesses the NAMRIA class from the value, and leaves alone what it cannot tell', () => {
    expect(guessCover('PROTECTION FOREST')).toBe('open-forest');
    expect(guessCover('Mangrove')).toBe('mangrove-forest');
    expect(guessCover('50 COCOS')).toBe('perennial-crop');
    expect(guessCover('RESIDENTIAL')).toBe('built-up');
    expect(guessCover('SPUD')).toBe('');
  });
});

describe('buildAreas', () => {
  const { areas, outsideM2 } = buildAreas({
    collection: FILE,
    field: 'CLASSIFICA',
    choices: new Map([['PROTECTION FOREST', 'open-forest']]),
    barangays: BARANGAYS,
    fileName: 'Fix_Protection_Forest.shp',
    dropped: [{ field: 'OWNER' }, { field: 'TAXDEC' }],
  });

  it('merges a value’s shapes and cuts them along the barangay boundaries', () => {
    expect(areas.map((area) => area.name)).toEqual(['Protection Forest — San Antonio', 'Protection Forest — San Juan']);
    const [antonio, juan] = areas;
    // The two neighbours made one, and the third's western half: three squares less half of one.
    expect(antonio.geometry.type).toBe('MultiPolygon');
    expect(antonio.geometry.coordinates).toHaveLength(2);
    expect(antonio.areaM2 / geometryAreaM2({ type: 'Polygon', coordinates: square(121.51, 14.33) })).toBeCloseTo(2.5, 1);
    expect(juan.areaM2).toBeCloseTo(antonio.areaM2 / 5, -2);
    expect(outsideM2).toBeLessThan(1);
  });

  it('keeps nothing of the parcels but their outline, and says where it came from', () => {
    const row = rowOfArea(areas[0]);
    expect(row).toMatchObject({ kind: 'land-cover', cover_class: 'open-forest', barangay: 'San Antonio', barangay_psgc: 403409002, municipality: 'Kalayaan' });
    expect(row.notes).toBe(
      'Imported from Fix_Protection_Forest.shp: 3 shapes where CLASSIFICA is “PROTECTION FOREST”, merged and cut along the PSA barangay boundary. ' +
        'Taken out for privacy before it was read: OWNER, TAXDEC.'
    );
    expect(Object.keys(row)).not.toContain('properties');
  });

  it('leaves out what falls outside the barangays it may save in', () => {
    const own = buildAreas({ collection: FILE, field: 'CLASSIFICA', choices: new Map([['PROTECTION FOREST', 'open-forest']]), barangays: [BARANGAYS[0]] });
    expect(own.areas.map((area) => area.barangay)).toEqual(['San Antonio']);
    expect(own.outsideM2).toBeCloseTo(areas[1].areaM2, -2);
  });

  it('sets aside a shape drawn too badly to merge, rather than lose the rest', () => {
    const { merged, skipped } = mergeShapes([square(121.51, 14.33), [[[121.52, 14.33], [121.52, 14.33]]]]);
    expect(merged.length).toBeGreaterThan(0);
    expect(skipped).toBeLessThanOrEqual(1);
  });
});
