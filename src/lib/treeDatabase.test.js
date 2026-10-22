import { speciesInInventory } from './treeDatabase.js';

describe('the species an LGU has tagged', () => {
  const PROFILES = [
    { species: 'Narra', scientific_name: 'Pterocarpus indicus', description: 'A large tree.' },
    { species: 'Mahogany (large-leaf)', scientific_name: 'Swietenia macrophylla' },
  ];

  it('lists each species once, counting its trees, whatever the case it was typed in', () => {
    const list = speciesInInventory([{ species: 'Narra' }, { species: ' narra ' }, { species: 'Acacia' }], PROFILES);
    expect(list.map((s) => [s.name, s.count, Boolean(s.profile)])).toEqual([
      ['Acacia', 1, false],
      ['Narra', 2, true],
    ]);
  });

  it('finds the write-up by scientific name when the common name differs', () => {
    const [mahogany] = speciesInInventory([{ species: 'Mahogany', scientific_name: 'swietenia macrophylla' }], PROFILES);
    expect(mahogany.profile?.species).toBe('Mahogany (large-leaf)');
    expect(mahogany.scientific).toBe('Swietenia macrophylla');
  });

  it('leaves out trees with no species, and lists nothing the LGU has not tagged', () => {
    expect(speciesInInventory([{ species: '' }, { species: 'Unknown' }, { species: null }], PROFILES)).toEqual([]);
  });
});
