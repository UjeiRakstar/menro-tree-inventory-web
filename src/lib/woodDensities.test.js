import { describe, expect, it } from 'vitest';
import { biomassKg } from './treeCarbon.js';
import { withWoodDensities, woodDensityForm, woodDensityIndex, woodDensityProblem, woodDensityRow } from './woodDensities.js';

const narra = { species: 'Narra', dbh: 37, total_height: 14 };

describe('a species’ own wood density', () => {
  const index = woodDensityIndex([
    { species: 'Narra', scientific_name: 'Pterocarpus indicus', wood_density: 0.55 },
    { species: 'Mahogany', wood_density: null },
    { species: 'Typo', wood_density: 550 },
  ]);

  it('is found by common name, or by scientific name', () => {
    expect(index.get('narra')).toBe(0.55);
    expect(index.get('pterocarpus indicus')).toBe(0.55);
    expect(index.has('mahogany')).toBe(false);
    expect(index.has('typo')).toBe(false);
  });

  it('is given to the species’ trees, and changes their carbon', () => {
    const [own, other, byScience] = withWoodDensities(
      [narra, { species: 'Mangga', dbh: 30, total_height: 8 }, { species: 'Unknown', scientific_name: 'Pterocarpus indicus', dbh: 20, total_height: 9 }],
      index
    );
    expect(own.wood_density).toBe(0.55);
    expect(other.wood_density).toBeUndefined();
    expect(byScience.wood_density).toBe(0.55);
    expect(biomassKg(own)).toBeLessThan(biomassKg(narra));
  });

  it('leaves the trees alone when the library has none', () => {
    const trees = [narra];
    expect(withWoodDensities(trees, new Map())).toBe(trees);
  });
});

describe('the species form’s wood density', () => {
  it('reads back what was saved, and knows the database has the columns', () => {
    expect(woodDensityForm({ species: 'Narra', wood_density: 0.55, wood_density_source: 'GWDD' })).toEqual({
      wood_density: '0.55',
      wood_density_source: 'GWDD',
      woodDensityStored: true,
    });
    expect(woodDensityForm({ species: 'Narra' }).woodDensityStored).toBe(false);
  });

  it('saves nothing of it before the database has the columns and nothing was typed', () => {
    expect(woodDensityRow({ wood_density: '', woodDensityStored: false })).toEqual({});
    expect(woodDensityRow({ wood_density: '', woodDensityStored: true })).toEqual({ wood_density: null, wood_density_source: null });
    expect(woodDensityRow({ wood_density: '0,55', wood_density_source: ' GWDD ' })).toEqual({ wood_density: 0.55, wood_density_source: 'GWDD' });
  });

  it('catches kg/m³, a figure out of range, and a figure with no source', () => {
    expect(woodDensityProblem({ wood_density: '' })).toBe('');
    expect(woodDensityProblem({ wood_density: '550', wood_density_source: 'GWDD' })).toMatch(/kg\/m³/);
    expect(woodDensityProblem({ wood_density: '2', wood_density_source: 'GWDD' })).toMatch(/between 0.1 and 1.5/);
    expect(woodDensityProblem({ wood_density: '0.55', wood_density_source: '' })).toBe('Say where the figure comes from.');
    expect(woodDensityProblem({ wood_density: '0.55', wood_density_source: 'GWDD' })).toBe('');
  });
});
