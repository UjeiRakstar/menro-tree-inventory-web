import { describe, it, expect } from 'vitest';
import { asRecommended, checkSpecies, recommendSpecies, siteOf, textureOf } from './speciesMatch.js';

// A lowland Santa Cruz site, as the layers and CLIRAM would describe it.
const FACTS = {
  soil: [
    { series: 'Marikina', description: 'Marikina silty clay loam', zone: 'Lowlands', share: 0.7 },
    { series: 'Lipa', description: 'Lipa loam', zone: 'Uplands', share: 0.3 },
  ],
  elevation: { min: 14, max: 23, mean: 19 },
  flood: { low: 1500, medium: 500, high: 0, total: 2000 },
};
const CLIMATE = { rainfall: { annualMm: 2765 }, temperature: { meanC: 26.6 } };
const SITE = siteOf(FACTS, CLIMATE, 10000);

const species = (name, needs) => ({ species: name, scientific_name: `${name} sp.`, ...needs });
const NARRA = species('Narra', {
  origin: 'native',
  elevation_min_m: 0, elevation_max_m: 600,
  rainfall_min_mm: 1500, rainfall_max_mm: 3500,
  soil_textures: ['clay-loam', 'loam'],
  flood_tolerance: 'brief',
});

describe('textureOf', () => {
  it('reads the texture out of a BSWM soil name', () => {
    expect(textureOf('Marikina silty clay loam')).toBe('clay-loam');
    expect(textureOf('Antipolo clay')).toBe('clay');
    expect(textureOf('Quingua silt loam')).toBe('silt-loam');
    expect(textureOf('Taal fine sandy loam')).toBe('sandy-loam');
    expect(textureOf('Lipa loam (Deep phase)')).toBe('loam');
    expect(textureOf('Mountain soil (undifferentiated)')).toBeNull();
  });
});

describe('checkSpecies', () => {
  it('says what fits, in words a planter can check', () => {
    const { fits, misses } = checkSpecies(NARRA, SITE);
    expect(misses).toEqual([]);
    expect(fits).toEqual([
      'grows at 0–600 m — the site is 14–23 m',
      'takes 1,500–3,500 mm of rain — the site gets 2,765 mm',
      'grows in clay loam — the site is Marikina silty clay loam',
      'takes brief flooding — 20% of the site floods',
    ]);
  });

  it('says what does not fit', () => {
    const highland = species('Benguet pine', { elevation_min_m: 800, elevation_max_m: 2700, flood_tolerance: 'none' });
    const { misses } = checkSpecies(highland, SITE);
    expect(misses).toEqual([
      'grows at 800–2,700 m — the site is 14–23 m',
      'does not take flooding — 20% of the site floods',
    ]);
  });

  it('asks for a tree that takes long floods where much of the site floods badly', () => {
    const wet = siteOf({ ...FACTS, flood: { low: 0, medium: 0, high: 3000, total: 3000 } }, CLIMATE, 10000);
    expect(checkSpecies(NARRA, wet).misses).toEqual(['takes only brief flooding — 30% of the site is at high flood hazard']);
  });

  it('leaves unchecked what either side has not said', () => {
    expect(checkSpecies(NARRA, siteOf(null, null, 10000)).unknown).toEqual(['elevation', 'rainfall', 'temperature', 'soil', 'flooding']);
  });
});

describe('recommendSpecies', () => {
  const profiles = [
    { ...NARRA, species: 'Mahogany', origin: 'introduced' },
    NARRA,
    species('Molave', { origin: 'endemic', elevation_min_m: 0, elevation_max_m: 900, soil_textures: ['clay-loam'] }),
    species('Benguet pine', { origin: 'native', elevation_min_m: 800, elevation_max_m: 2700 }),
    species('Ipil-ipil', { origin: 'invasive', elevation_min_m: 0, elevation_max_m: 500, soil_textures: ['loam'] }),
    species('Mango', {}),
    species('Banaba', { origin: 'native', elevation_min_m: 0, elevation_max_m: 500 }),
  ];

  it('recommends what fits, endemic and native first, and says why the rest are not', () => {
    const result = recommendSpecies(profiles, SITE);
    expect(result.suited.map((s) => s.profile.species)).toEqual(['Molave', 'Narra', 'Mahogany']);
    // Benguet pine misses; Banaba fits once only — too thin to recommend.
    expect(result.unsuited).toBe(2);
    expect(result.invasive).toBe(1);
    expect(result.noNeeds).toBe(1);
  });

  it('keeps a recommendation with its reasons, the way a planting site stores it', () => {
    const [first] = recommendSpecies([NARRA], SITE).suited;
    expect(asRecommended(first)).toMatchObject({ common: 'Narra', scientific: 'Narra sp.', matched: true });
    expect(asRecommended(first).why).toMatch(/^grows at 0–600 m/);
  });
});
