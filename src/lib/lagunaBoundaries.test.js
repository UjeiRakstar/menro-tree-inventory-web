import { describe, it, expect } from 'vitest';
import {
  LAGUNA_BOUNDS,
  LAGUNA_MUNICIPALITIES,
  MUNICIPALITY_LIST,
  OUTSIDE_LAGUNA_MASK,
  boundsOf,
  boundsOfMunicipality,
  containsPoint,
  municipalityAt,
  municipalityNamed,
} from './lagunaBoundaries.js';

const SANTA_CRUZ_PLAZA = [14.2823, 121.4163];
const MANILA = [14.5995, 120.9842];

describe('lagunaBoundaries', () => {
  it('carries all 30 Laguna cities and municipalities', () => {
    expect(LAGUNA_MUNICIPALITIES.features).toHaveLength(30);
    expect(MUNICIPALITY_LIST).toHaveLength(30);
    expect(MUNICIPALITY_LIST.map((l) => l.label)).toContain('Santa Cruz');
    expect(MUNICIPALITY_LIST.map((l) => l.label)).toContain('Calamba City');
  });

  it('lists the areas alphabetically by label', () => {
    const labels = MUNICIPALITY_LIST.map((l) => l.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it('bounds the province around Laguna', () => {
    const [[south, west], [north, east]] = LAGUNA_BOUNDS;
    expect(south).toBeGreaterThan(13.9);
    expect(north).toBeLessThan(14.7);
    expect(west).toBeGreaterThan(120.9);
    expect(east).toBeLessThan(121.7);
  });

  it('masks the whole globe except the province', () => {
    // First ring is the world; the rest are the holes Laguna shows through.
    expect(OUTSIDE_LAGUNA_MASK[0]).toEqual([
      [90, -180],
      [90, 180],
      [-90, 180],
      [-90, -180],
    ]);
    expect(OUTSIDE_LAGUNA_MASK.length).toBeGreaterThan(1);
    for (const [lat, lng] of OUTSIDE_LAGUNA_MASK[1]) {
      expect(lat).toBeGreaterThan(13.9);
      expect(lat).toBeLessThan(14.7);
      expect(lng).toBeGreaterThan(120.9);
      expect(lng).toBeLessThan(121.7);
    }
  });

  it('finds a municipality by its bare name and ignores unknown ones', () => {
    expect(municipalityNamed('Santa Cruz').properties.municipality_label).toBe('Santa Cruz');
    expect(municipalityNamed('Biñan').properties.is_city).toBe(true);
    expect(municipalityNamed('Quezon City')).toBeNull();
    expect(municipalityNamed('')).toBeNull();
  });

  it('bounds a single municipality more tightly than the province', () => {
    const [[south, west], [north, east]] = boundsOfMunicipality('Santa Cruz');
    const [[pSouth, pWest], [pNorth, pEast]] = LAGUNA_BOUNDS;
    expect(south).toBeGreaterThanOrEqual(pSouth);
    expect(west).toBeGreaterThanOrEqual(pWest);
    expect(north).toBeLessThanOrEqual(pNorth);
    expect(east).toBeLessThanOrEqual(pEast);
    expect(north - south).toBeLessThan(0.3);
    expect(boundsOfMunicipality('Nowhere')).toBeNull();
  });

  it('returns null bounds for an empty geometry', () => {
    expect(boundsOf({ type: 'MultiPolygon', coordinates: [] })).toBeNull();
  });

  it('places a point inside the municipality that contains it', () => {
    const santaCruz = municipalityNamed('Santa Cruz');
    expect(containsPoint(santaCruz.geometry, SANTA_CRUZ_PLAZA)).toBe(true);
    expect(containsPoint(santaCruz.geometry, MANILA)).toBe(false);
    expect(containsPoint(santaCruz.geometry, [NaN, 121.4])).toBe(false);
  });

  it('names the LGU a point falls in, and nothing outside Laguna', () => {
    expect(municipalityAt(SANTA_CRUZ_PLAZA)).toBe('Santa Cruz');
    expect(municipalityAt(MANILA)).toBeNull();
  });

  it('assigns each municipality centroid-ish point to exactly one LGU', () => {
    // A point can only belong to one area, or the dissolved polygons overlap.
    for (const feature of LAGUNA_MUNICIPALITIES.features) {
      const [[south, west], [north, east]] = boundsOf(feature.geometry);
      const mid = [(south + north) / 2, (west + east) / 2];
      const hits = LAGUNA_MUNICIPALITIES.features.filter((f) => containsPoint(f.geometry, mid));
      expect(hits.length).toBeLessThanOrEqual(1);
    }
  });
});
