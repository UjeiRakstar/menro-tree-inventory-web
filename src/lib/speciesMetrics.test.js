import { describe, it, expect } from 'vitest';
import {
  DIVERSITY_LIMITS,
  asPercent,
  categoryMix,
  genusCounts,
  genusOf,
  originMix,
  overPlanted,
  speciesCounts,
  speciesOf,
  speciesRichness,
} from './speciesMetrics.js';

const tree = (species, over = {}) => ({ species, ...over });

/** n trees of one species, for building a mix with known shares. */
const many = (n, species, over = {}) => Array.from({ length: n }, () => tree(species, over));

describe('speciesOf', () => {
  it('tidies the name without changing it', () => {
    expect(speciesOf({ species: '  Narra ' })).toBe('Narra');
    expect(speciesOf({ species: 'Red  Lauan' })).toBe('Red Lauan');
  });

  it('treats a name that names nothing as no name', () => {
    for (const value of ['Unknown', 'unidentified', 'N/A', 'none', 'Other', '', '   ']) {
      expect(speciesOf({ species: value })).toBeNull();
    }
    expect(speciesOf({})).toBeNull();
  });
});

describe('genusOf', () => {
  it('takes the genus from the binomial, which puts it first by definition', () => {
    expect(genusOf({ scientific_name: 'Swietenia macrophylla' })).toBe('Swietenia');
    expect(genusOf({ scientific_name: 'mangifera indica' })).toBe('Mangifera');
    expect(genusOf({ scientific_name: 'Pterocarpus indicus Willd.' })).toBe('Pterocarpus');
  });

  it('has no genus for a tree recorded only by its common name', () => {
    // Guessing a genus from "Mango" would be inventing data.
    expect(genusOf({ species: 'Mango' })).toBeNull();
    expect(genusOf({ scientific_name: 'Unknown' })).toBeNull();
    expect(genusOf({ scientific_name: '' })).toBeNull();
  });
});

describe('speciesRichness', () => {
  it('counts the kinds, not the trees', () => {
    const trees = [...many(10, 'Narra'), ...many(5, 'Mango'), tree('Acacia')];
    expect(speciesRichness(trees)).toEqual({ species: 3, unnamed: 0, total: 16 });
  });

  it('counts one species once, however it was typed', () => {
    const trees = [tree('Narra'), tree('narra'), tree(' NARRA ')];
    expect(speciesRichness(trees).species).toBe(1);
  });

  it('reports the unidentified rather than hiding them', () => {
    // Richness over a set where a third say "Unknown" is a different claim
    // from richness over a set where every tree is identified.
    const trees = [tree('Narra'), tree('Mango'), tree('Unknown')];
    expect(speciesRichness(trees)).toEqual({ species: 2, unnamed: 1, total: 3 });
  });

  it('survives an empty or missing set', () => {
    expect(speciesRichness([])).toEqual({ species: 0, unnamed: 0, total: 0 });
    expect(speciesRichness(undefined)).toEqual({ species: 0, unnamed: 0, total: 0 });
  });
});

describe('speciesCounts', () => {
  it('puts the commonest first, with its share of every tree', () => {
    const trees = [...many(6, 'Narra'), ...many(3, 'Mango'), tree('Acacia')];
    const counts = speciesCounts(trees);

    expect(counts.map((c) => c.name)).toEqual(['Narra', 'Mango', 'Acacia']);
    expect(counts[0].count).toBe(6);
    expect(counts[0].share).toBeCloseTo(0.6, 5);
  });

  it('keeps the spelling the record used', () => {
    const counts = speciesCounts([tree('Red Lauan'), tree('red lauan')]);
    expect(counts).toHaveLength(1);
    expect(counts[0].name).toBe('Red Lauan');
    expect(counts[0].count).toBe(2);
  });

  it('shares are of the whole set, including the unidentified', () => {
    // Half the trees are Narra. Dropping the unknown ones from the
    // denominator would report 100% and alarm somebody for no reason.
    const trees = [...many(5, 'Narra'), ...many(5, 'Unknown')];
    expect(speciesCounts(trees)[0].share).toBeCloseTo(0.5, 5);
  });
});

describe('genusCounts', () => {
  it('gathers species of one genus together', () => {
    const trees = [
      tree('Red Lauan', { scientific_name: 'Shorea negrosensis' }),
      tree('White Lauan', { scientific_name: 'Shorea contorta' }),
      tree('Mango', { scientific_name: 'Mangifera indica' }),
    ];
    const counts = genusCounts(trees);
    expect(counts[0]).toMatchObject({ name: 'Shorea', count: 2 });
    expect(counts[1]).toMatchObject({ name: 'Mangifera', count: 1 });
  });
});

describe('overPlanted — the 10-20-30 rule', () => {
  it('holds the thresholds Santamour set', () => {
    expect(DIVERSITY_LIMITS.species).toBe(0.1);
    expect(DIVERSITY_LIMITS.genus).toBe(0.2);
  });

  it('says nothing when the mix is within the guideline', () => {
    // Twenty species of five trees each: 5% apiece.
    const trees = Array.from({ length: 20 }, (_, i) => many(5, `Species ${i}`)).flat();
    expect(overPlanted(trees)).toEqual([]);
  });

  it('names a species planted past a tenth of the forest', () => {
    const trees = [...many(14, 'Mango'), ...many(86, 'Assorted')];
    const warnings = overPlanted(trees);

    const mango = warnings.find((w) => w.name === 'Mango');
    expect(mango).toMatchObject({ rank: 'species', count: 14, limit: 0.1 });
    expect(mango.share).toBeCloseTo(0.14, 5);
  });

  it('names a genus planted past a fifth, even where no single species is', () => {
    // Three lauans at 9% each: every species is inside the guideline, and the
    // genus is 27% of the forest. This is the case the genus rule exists for.
    // The rest spread thinly, so nothing else trips either threshold.
    const rest = Array.from({ length: 73 }, (_, i) =>
      tree(`Species ${i}`, { scientific_name: `Genus${i} species` })
    );
    const trees = [
      ...many(9, 'Red Lauan', { scientific_name: 'Shorea negrosensis' }),
      ...many(9, 'White Lauan', { scientific_name: 'Shorea contorta' }),
      ...many(9, 'Tangile', { scientific_name: 'Shorea polysperma' }),
      ...rest,
    ];
    const warnings = overPlanted(trees);

    expect(warnings.some((w) => w.rank === 'species')).toBe(false);
    expect(warnings.find((w) => w.rank === 'genus')).toMatchObject({ name: 'Shorea', count: 27 });
  });

  it('puts the worst first, because that is the one to act on', () => {
    const trees = [
      ...many(40, 'Mahogany', { scientific_name: 'Swietenia macrophylla' }),
      ...many(15, 'Mango', { scientific_name: 'Mangifera indica' }),
      ...many(45, 'Assorted', { scientific_name: 'Mixed various' }),
    ];
    const shares = overPlanted(trees).map((w) => w.share);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
  });
});

describe('originMix and categoryMix', () => {
  it('reads origin the way the map badges do', () => {
    const trees = [
      tree('Narra', { biodiversity_status: 'Endemic' }),
      tree('Mango', { species_type: 'Invasive' }),
      tree('Acacia'),
    ];
    expect(originMix(trees)).toEqual({ endemic: 1, invasive: 1, unrecorded: 1 });
  });

  it('reads both spellings of the fruit category as one', () => {
    const trees = [
      tree('Mango', { tree_category: 'Fruit Tree' }),
      tree('Santol', { tree_category: 'Fruit' }),
      tree('Narra', { tree_category: 'Timber' }),
      tree('Palm', { tree_category: 'Ornamental' }),
      tree('Nothing', {}),
    ];
    expect(categoryMix(trees)).toEqual({ fruit: 2, timber: 1, ornamental: 1, unrecorded: 1 });
  });

  it('survives an empty set', () => {
    expect(originMix([])).toEqual({ endemic: 0, invasive: 0, unrecorded: 0 });
    expect(categoryMix(undefined)).toEqual({ fruit: 0, timber: 0, ornamental: 0, unrecorded: 0 });
  });
});

describe('asPercent', () => {
  it('reads to one decimal place', () => {
    expect(asPercent(0.1)).toBe('10%');
    expect(asPercent(0.1428)).toBe('14.3%');
    expect(asPercent(0)).toBe('0%');
  });
});
