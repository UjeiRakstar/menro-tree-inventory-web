import { describe, it, expect } from 'vitest';
import { SUGGESTION_RULES, describeTrees, isBamboo, isDipterocarp, suggestCover } from './coverSuggestion.js';
import { NAMRIA_CLASSES, maiCoverOf, noRateReason } from './namriaCover.js';
import { guessCover } from './areaBatch.js';

const tree = (species, extra = {}) => ({ species, ...extra });
const many = (count, make) => Array.from({ length: count }, (_, i) => make(i));

describe('suggestCover', () => {
  it('says nothing about fewer than ten trees', () => {
    const result = suggestCover(many(9, (i) => tree(`Species ${i}`)));
    expect(result.classId).toBeNull();
    expect(result.reason).toMatch(/too few/);
    expect(suggestCover([]).reason).toMatch(/No tagged trees/);
  });

  it('reads a stand that is half fruit trees as a perennial crop', () => {
    const trees = [
      ...many(6, () => tree('Mango', { tree_category: 'Fruit' })),
      ...many(4, (i) => tree(`Timber ${i}`, { tree_category: 'Timber' })),
    ];
    expect(suggestCover(trees)).toMatchObject({ classId: 'perennial-crop' });
  });

  it('reads a mix of different trees as secondary (open) forest', () => {
    const species = ['Narra', 'Molave', 'Banaba', 'Balete', 'Duhat', 'Santol'];
    const result = suggestCover(many(12, (i) => tree(species[i % species.length])));
    expect(result.classId).toBe('open-forest');
    expect(result.reason).toMatch(/12 trees, 6 species/);
  });

  it('reads a mixed stand under dipterocarps as closed forest', () => {
    const species = ['Apitong', 'White Lauan', 'Yakal', 'Narra', 'Molave', 'Banaba', 'Balete', 'Duhat', 'Santol', 'Kalumpit'];
    expect(suggestCover(species.map((s) => tree(s))).classId).toBe('closed-forest');
  });

  it('notes a stand of one species as a likely plantation', () => {
    const trees = [...many(8, () => tree('Mahogany')), tree('Narra'), tree('Molave')];
    expect(suggestCover(trees)).toMatchObject({ classId: 'open-forest', plantation: true });
  });

  it('never suggests a class defined by trees being absent', () => {
    const absent = NAMRIA_CLASSES.filter((cls) => !cls.treeCover).map((cls) => cls.id);
    // Every shape of stand the rules know, and a few they do not.
    const stands = [
      many(10, () => tree('Mahogany')),
      many(10, (i) => tree(`S${i % 2}`)),
      many(10, (i) => tree(`S${i % 3}`, { tree_category: i % 2 ? 'Fruit' : 'Timber' })),
    ];
    for (const stand of stands) expect(absent).not.toContain(suggestCover(stand).classId);
  });

  it('reads its thresholds from one place', () => {
    const trees = many(9, (i) => tree(`S${i}`));
    expect(suggestCover(trees, { ...SUGGESTION_RULES, minTrees: 5 }).classId).toBe('open-forest');
  });
});

describe('isDipterocarp', () => {
  it('knows them by genus and by local name', () => {
    expect(isDipterocarp({ scientific_name: 'Shorea contorta' })).toBe(true);
    expect(isDipterocarp({ species: 'Red Lauan' })).toBe(true);
    expect(isDipterocarp({ species: 'Narra', scientific_name: 'Pterocarpus indicus' })).toBe(false);
  });
});

describe('describeTrees', () => {
  it('counts species case-blind', () => {
    expect(describeTrees([tree('Narra'), tree('narra '), tree('Molave')])).toMatchObject({ total: 3, species: 2 });
  });
});

describe('NAMRIA classes', () => {
  it('match the MAI table where a rate exists, and say why where none does', () => {
    expect(maiCoverOf('closed-forest').maiTPerHaYear).toBeCloseTo(6.23, 2);
    expect(maiCoverOf('open-forest').maiTPerHaYear).toBe(3.5);
    expect(maiCoverOf('grassland')).toBeNull();
    expect(noRateReason('grassland')).toMatch(/not a rate of zero/);
    expect(noRateReason('built-up')).toMatch(/not tree cover/);
    expect(noRateReason('open-forest')).toBe('');
    // NAMRIA's twelve, and Green Tag's bamboo stand (22 October).
    expect(NAMRIA_CLASSES).toHaveLength(13);
    expect(NAMRIA_CLASSES.filter((cls) => cls.namria !== false)).toHaveLength(12);
    expect(noRateReason('bamboo-stand')).toMatch(/Bamboo stand is not tree cover/);
  });
});

describe('a bamboo stand (22 October)', () => {
  const kawayan = (i) => tree('Kawayan tinik', { scientific_name: 'Bambusa blumeana', id: i });
  it('is suggested from a few clumps, which say more than a few trees', () => {
    const result = suggestCover([...many(3, kawayan), tree('Giant bamboo', { scientific_name: 'Dendrocalamus asper' }), tree('Narra')]);
    expect(result.classId).toBe('bamboo-stand');
    expect(result.reason).toBe(
      '4 bamboo clumps of 5 tagged points — a bamboo stand: Kawayan tinik (Bambusa blumeana), Giant bamboo (Dendrocalamus asper).'
    );
  });

  it('knows bamboo by its local names and its genus', () => {
    expect(isBamboo(tree('Bolo'))).toBe(true);
    expect(isBamboo(tree('Kawayan kiling'))).toBe(true);
    expect(isBamboo(tree('Unknown', { scientific_name: 'Gigantochloa levis' }))).toBe(true);
    expect(isBamboo(tree('Narra', { scientific_name: 'Pterocarpus indicus' }))).toBe(false);
  });

  it('is not suggested from two clumps, nor where bamboo is a minority', () => {
    expect(suggestCover([...many(2, kawayan)]).classId).toBeNull();
    expect(suggestCover([...many(3, kawayan), ...many(12, (i) => tree(`Species ${i % 6}`))]).classId).not.toBe('bamboo-stand');
  });

  it('comes in from a spreadsheet as bamboo', () => {
    expect(guessCover('Kawayan / bamboo stand')).toBe('bamboo-stand');
  });
});
