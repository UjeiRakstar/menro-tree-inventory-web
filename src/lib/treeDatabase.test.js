import { brochureOf, speciesInInventory } from './treeDatabase.js';

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

describe('a scientific name the record does not know', () => {
  it('is left blank rather than shown as "Unknown"', () => {
    const [coconut] = speciesInInventory([{ species: 'Coconut', scientific_name: 'Unknown' }], []);
    expect(coconut.scientific).toBe('');
  });
});

describe('where a species is tagged (22 October)', () => {
  it('counts its trees by the place each stands in, most first', () => {
    const trees = [
      { species: 'Narra', barangay: 'Labuin' },
      { species: 'Narra', barangay: 'Gatid' },
      { species: 'Narra', barangay: 'Gatid' },
      { species: 'Narra' },
    ];
    const [narra] = speciesInInventory(trees, [], { placeOf: (tree) => tree.barangay });
    expect(narra.count).toBe(4);
    expect(narra.places).toEqual([{ name: 'Gatid', count: 2 }, { name: 'Labuin', count: 1 }]);
  });
});

describe('the photos of a species (22 October)', () => {
  const at = (name) => `https://res.cloudinary.com/demo/image/upload/v1/${name}.jpg`;
  const trees = [
    { species: 'Narra', source: 'field', imageUrl: at('main-1'), leaves_url: at('leaf-1'), bark_url: at('bark-1') },
    { species: 'Narra', source: 'crowdsource', photo_url: at('resident'), leaves_url: at('resident-leaf') },
    { species: 'Narra', photo_url: at('main-2'), leaves_url: at('leaf-2'), fruits_url: at('fruit-2') },
    { species: 'Narra', leaves_url: at('leaf-3'), bark_url: at('bark-1') },
  ];

  it('gathers every officer’s photo once, never a resident’s', () => {
    const [narra] = speciesInInventory(trees, []);
    expect(narra.photos.map((p) => p.url)).toEqual(
      ['main-1', 'leaf-1', 'bark-1', 'main-2', 'leaf-2', 'fruit-2', 'leaf-3'].map(at)
    );
    expect(narra.photos.find((p) => p.url === at('fruit-2')).kind).toBe('Fruits');
  });

  it('shows a cover and a strip of up to two leaves, bark and fruits', () => {
    const [narra] = speciesInInventory(trees, []);
    const { cover, strip, hidden } = brochureOf(narra);
    expect(cover.url).toBe(at('main-1'));
    expect(strip.map((p) => p.url)).toEqual(['leaf-1', 'leaf-2', 'bark-1', 'fruit-2'].map(at));
    expect(hidden).toEqual([]);
  });

  it('takes PGENRO’s cover, and leaves out what PGENRO hid', () => {
    const [narra] = speciesInInventory(trees, []);
    const chosen = brochureOf(narra, { cover_url: at('leaf-3'), hidden_urls: [at('main-1'), at('leaf-1')] });
    expect(chosen.cover.url).toBe(at('leaf-3'));
    expect(chosen.strip.map((p) => p.url)).toEqual(['leaf-2', 'bark-1', 'fruit-2'].map(at));
    expect(chosen.hidden.map((p) => p.url)).toEqual(['main-1', 'leaf-1'].map(at));
    expect(chosen.shown).toHaveLength(5);
    // A hidden cover is no cover: the first main photo left stands in.
    expect(brochureOf(narra, { cover_url: at('main-1'), hidden_urls: [at('main-1')] }).cover.url).toBe(at('main-2'));
  });

  it('has nothing to show for a species without photos', () => {
    expect(brochureOf({ photos: [] })).toEqual({ cover: null, strip: [], shown: [], hidden: [] });
  });
});
