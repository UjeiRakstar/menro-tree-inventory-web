import { describe, it, expect } from 'vitest';
import {
  ANNUAL_DBH_GROWTH_CM,
  CARBON_FRACTION,
  CHAVE_2014,
  CO2_PER_CARBON,
  DEFAULT_WOOD_DENSITY,
  ROOT_SHOOT_RATIO,
  annualBiomassKg,
  annualCo2Kg,
  biomassKg,
  carbonCoverage,
  carbonDioxideKg,
  isPalmOrBamboo,
  totalHeightOf,
  whyNoCarbon,
  woodDensityOf,
} from './treeCarbon.js';

const narra = { species: 'Narra', dbh: 37, total_height: 14 };

describe('Chave et al. 2014', () => {
  it('is equation 4: 0.0673 × (ρD²H)^0.976, in kilograms', () => {
    expect(CHAVE_2014).toEqual({ a: 0.0673, b: 0.976 });
    expect(biomassKg(narra)).toBeCloseTo(0.0673 * (0.57 * 37 * 37 * 14) ** 0.976, 6);
  });

  it('gives a city tree of 37 cm and 14 m about 0.6 t above ground', () => {
    // A sanity check on the order of magnitude, not on the published equation.
    expect(biomassKg(narra)).toBeGreaterThan(550);
    expect(biomassKg(narra)).toBeLessThan(650);
  });

  it('takes the tropical Asian mean wood density until a tree has its own', () => {
    expect(DEFAULT_WOOD_DENSITY).toBe(0.57);
    expect(woodDensityOf(narra)).toBe(0.57);
    expect(woodDensityOf({ ...narra, wood_density: 0.65 })).toBe(0.65);
    // Not a wood density: kilograms per cubic metre, or nonsense.
    expect(woodDensityOf({ ...narra, wood_density: 650 })).toBe(0.57);
    expect(biomassKg({ ...narra, wood_density: 0.65 })).toBeGreaterThan(biomassKg(narra));
  });

  it('follows biomass → carbon → carbon dioxide, with the carbon of Philippine wood', () => {
    expect(CARBON_FRACTION).toBe(0.45);
    expect(CO2_PER_CARBON).toBeCloseTo(3.6667, 4);
    expect(carbonDioxideKg(narra)).toBeCloseTo(biomassKg(narra) * 0.45 * (44 / 12), 6);
  });

  it('keeps the CCC tool’s root-to-shoot ratio for the GHG report', () => {
    expect(ROOT_SHOOT_RATIO).toBe(0.37);
  });

  it('does not floor the diameter, as a timber volume does', () => {
    expect(biomassKg({ ...narra, dbh: 37.9 })).toBeGreaterThan(biomassKg(narra));
  });
});

describe('the height it needs', () => {
  it('is the total height, not the merchantable one', () => {
    expect(biomassKg({ species: 'Narra', dbh: 37, merchantable_height: 9 })).toBeNull();
    expect(totalHeightOf({ total_height: '14' })).toEqual({ metres: 14, fromClass: false });
  });

  it('counts a height class from an LGU’s inventory at its middle', () => {
    expect(totalHeightOf({ total_height: '11-15 m' })).toEqual({ metres: 13, fromClass: true });
    expect(totalHeightOf({ total_height: '6–10' })).toEqual({ metres: 8, fromClass: true });
  });
});

describe('whyNoCarbon', () => {
  it('says why a tree has no figure, in the order to fix it', () => {
    expect(whyNoCarbon(narra)).toBeNull();
    expect(whyNoCarbon({ species: 'Narra' })).toBe('No diameter recorded');
    expect(whyNoCarbon({ species: 'Narra', dbh: 3, total_height: 2 })).toBe('Diameter under 5 cm');
    expect(whyNoCarbon({ species: 'Narra', dbh: 20 })).toBe('No total height recorded');
    expect(whyNoCarbon({ species: 'Narra', dbh: 20, total_height: 1 })).toBe('Total height under 1.3 m');
  });

  it('leaves palms, bamboo and bananas out, by name', () => {
    for (const species of ['Niyog', 'Coconut', 'Royal palm', 'Kawayan', 'Saging']) {
      expect(isPalmOrBamboo({ species })).toBe(true);
      expect(biomassKg({ species, dbh: 30, total_height: 12 })).toBeNull();
    }
    expect(isPalmOrBamboo({ species: 'Tree', scientific_name: 'Cocos nucifera' })).toBe(true);
    // Not a palm for having "bunga" inside a longer word.
    expect(isPalmOrBamboo({ species: 'Narra' })).toBe(false);
    expect(isPalmOrBamboo({ species: 'Mangga', scientific_name: 'Mangifera indica' })).toBe(false);
  });

  it('has no figure rather than a figure of zero', () => {
    expect(carbonDioxideKg({ dbh: 37 })).toBeNull();
    expect(annualCo2Kg({})).toBeNull();
  });
});

describe('a year of growth', () => {
  it('is the equation run at today’s diameter and a year’s growth more, at the same height', () => {
    const grown = 0.0673 * (0.57 * (37 + ANNUAL_DBH_GROWTH_CM) ** 2 * 14) ** 0.976;
    const now = 0.0673 * (0.57 * 37 * 37 * 14) ** 0.976;
    expect(annualBiomassKg(narra)).toBeCloseTo(grown - now, 6);
    expect(annualCo2Kg(narra)).toBeCloseTo(annualBiomassKg(narra) * 0.45 * (44 / 12), 6);
  });

  it('grows a tree by the Philippine mean annual increment, and less than it holds', () => {
    expect(ANNUAL_DBH_GROWTH_CM).toBe(1.19);
    expect(annualCo2Kg(narra)).toBeGreaterThan(0);
    expect(annualCo2Kg(narra)).toBeLessThan(carbonDioxideKg(narra));
  });
});

describe('carbonCoverage', () => {
  it('says how much of the inventory the figure speaks for', () => {
    const trees = [narra, { species: 'Mango', dbh: 20, total_height: 6 }, { species: 'Acacia', dbh: 30 }, { species: 'Niyog', dbh: 25, total_height: 10 }];
    expect(carbonCoverage(trees)).toEqual({ measured: 2, total: 4 });
    expect(carbonCoverage(undefined)).toEqual({ measured: 0, total: 0 });
  });
});
