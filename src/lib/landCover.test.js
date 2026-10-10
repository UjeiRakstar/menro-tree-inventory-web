import { describe, it, expect } from 'vitest';
import {
  LAND_COVER_TYPES,
  PUBLIC_LAND_COVER,
  annualBiomassTonnes,
  formatTonnesPerYear,
  landCoverById,
  maiSourceNote,
} from './landCover.js';

describe('the land cover table', () => {
  it('gives every row an id of its own', () => {
    // Swietenia macrophylla appears four times, measured in four places, so
    // the species name alone cannot identify a row.
    const ids = LAND_COVER_TYPES.map((cover) => cover.id);
    expect(new Set(ids).size).toBe(ids.length);

    const swietenia = LAND_COVER_TYPES.filter((c) => c.label === 'Swietenia macrophylla');
    expect(swietenia.length).toBe(4);
    expect(new Set(swietenia.map((c) => c.location)).size).toBeGreaterThan(1);
  });

  it('shows the public only what grows in Laguna', () => {
    expect(PUBLIC_LAND_COVER.map((cover) => cover.id).sort()).toEqual([
      'brushlands',
      'dipterocarps',
      'fallow-agroforestry',
      'secondary-forest',
    ]);
  });

  it('carries a rate and a place for every row', () => {
    for (const cover of LAND_COVER_TYPES) {
      expect(cover.maiTPerHaYear).toBeGreaterThan(0);
      expect(cover.location.length).toBeGreaterThan(0);
      expect(typeof cover.source).toBe('string');
    }
  });

  it('keeps the published figures exactly as published', () => {
    expect(landCoverById('secondary-forest').maiTPerHaYear).toBe(3.5);
    expect(landCoverById('brushlands').maiTPerHaYear).toBe(9.5);
    expect(landCoverById('dipterocarps').maiTPerHaYear).toBe(6.2326755);
    expect(landCoverById('fallow-agroforestry').maiTPerHaYear).toBe(10.6);
    expect(landCoverById('nothing')).toBeNull();
  });
});

describe('annualBiomassTonnes', () => {
  it('multiplies the rate by the area, leaving tonnes a year', () => {
    // t/ha/yr × ha = t/yr. The hectares cancel — which is why a TOTAL can
    // never carry the unit "t/ha", however the source table writes the rate.
    expect(annualBiomassTonnes('secondary-forest', 8.633)).toBeCloseTo(30.2155, 3);
    expect(annualBiomassTonnes('brushlands', 10)).toBeCloseTo(95, 6);
  });

  it('says nothing for an area nobody has classified', () => {
    // Zero would read as "this forest grows nothing".
    expect(annualBiomassTonnes(undefined, 8.6)).toBeNull();
    expect(annualBiomassTonnes('secondary-forest', undefined)).toBeNull();
    expect(annualBiomassTonnes('secondary-forest', -1)).toBeNull();
  });

  it('is zero only for no ground at all', () => {
    expect(annualBiomassTonnes('secondary-forest', 0)).toBe(0);
  });
});

describe('maiSourceNote', () => {
  it('names the study, the place and the assumption', () => {
    const note = maiSourceNote('secondary-forest');
    expect(note).toContain('3.5');
    expect(note).toContain('Lasco et al., 1999');
    expect(note).toContain('Leyte');
    // The rate was measured somewhere else and applied here. That is a real
    // assumption and it is said out loud rather than buried.
    expect(note).toContain('Laguna');
  });

  it('admits when the table records no citation', () => {
    const note = maiSourceNote('tectona-necija');
    expect(note).toContain('no citation');
  });

  it('has something to say about an unclassified area', () => {
    expect(maiSourceNote('nothing')).toContain('No land cover');
  });
});

describe('formatTonnesPerYear', () => {
  it('keeps a tenth of a tonne while the total is small', () => {
    expect(formatTonnesPerYear(30.2155)).toBe('30.2');
    expect(formatTonnesPerYear(1234.5)).toBe('1,235');
  });

  it('shows a dash where there is no figure', () => {
    expect(formatTonnesPerYear(null)).toBe('—');
    expect(formatTonnesPerYear(undefined)).toBe('—');
  });
});
