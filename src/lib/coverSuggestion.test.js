import { describe, it, expect } from 'vitest';
import { SUGGESTION_RULES, describeTrees, isDipterocarp, suggestCover } from './coverSuggestion.js';
import { NAMRIA_CLASSES, maiCoverOf, noRateReason } from './namriaCover.js';

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
    expect(NAMRIA_CLASSES).toHaveLength(12);
  });
});
