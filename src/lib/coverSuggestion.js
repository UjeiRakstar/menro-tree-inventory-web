import { namriaClassById } from './namriaCover.js';

/**
 * Suggesting a land cover class from the trees tagged inside an area.
 *
 * The page suggests; the officer decides. The rules are the draft in
 * ACCOUNTS_AND_MAPPING.md → "The suggestion, as a draft for PGENRO", and say no
 * more than tagged trees can support:
 *
 *   - never anything from tree DENSITY: ten tags in a hectare is a survey that
 *     has barely started, not a sparse forest;
 *   - never brush, grassland, or anything defined by trees being ABSENT —
 *     those need eyes on the ground.
 *
 * The thresholds are here, in one object, so PGENRO can change them without
 * anyone touching the logic below.
 */
export const SUGGESTION_RULES = Object.freeze({
  /** Fewer trees than this and nothing is suggested. */
  minTrees: 10,
  /** At least this share fruit trees reads as a perennial crop (agroforest). */
  fruitShare: 0.5,
  /** A mixed stand: at least this many species… */
  mixedMinSpecies: 5,
  /** …and no single species above this share. */
  mixedMaxShare: 0.4,
  /** In a mixed stand, dipterocarps at least this share make it closed forest. */
  dipterocarpShare: 0.3,
  /** One species at least this share was most likely planted. */
  plantationShare: 0.6,
  /**
   * Bamboo clumps (22 October): at least this many tagged, and at least this
   * share of the points inside, read as a bamboo stand. A clump is tagged as
   * one point, so fewer are needed than trees.
   */
  bambooMinClumps: 3,
  bambooShare: 0.5,
});

/**
 * Dipterocarps by genus (from the scientific name) and by the Philippine
 * trade and common names the field app records.
 */
const DIPTEROCARP_GENERA = /^(shorea|dipterocarpus|hopea|parashorea|anisoptera|vatica|dryobalanops|cotylelobium)\b/i;
const DIPTEROCARP_NAMES =
  /\b(apitong|lauan|yakal|mayapis|tanguile|tangile|almon|bagtikan|guijo|narig|palosapis|manggachapui|malaanonang|dalingdingan|panau|hagakhak)\b/i;

export const isDipterocarp = (tree) =>
  DIPTEROCARP_GENERA.test(String(tree?.scientific_name ?? '').trim()) ||
  DIPTEROCARP_NAMES.test(String(tree?.species ?? ''));

export const isFruitTree = (tree) => /fruit/i.test(String(tree?.tree_category ?? ''));

/**
 * Bamboo, by genus and by the names it goes by here: kawayan tinik (Bambusa
 * blumeana), kawayan kiling (B. vulgaris), giant bamboo or botong
 * (Dendrocalamus asper), bolo (Gigantochloa levis), buho (Schizostachyum).
 */
const BAMBOO_GENERA = /^(bambusa|dendrocalamus|gigantochloa|schizostachyum|thyrsostachys|phyllostachys|dinochloa)\b/i;
const BAMBOO_NAMES = /\b(bamboos?|kawayan|botong|bolo|buho|anos|bayog|kayali)\b/i;

export const isBamboo = (tree) =>
  BAMBOO_GENERA.test(String(tree?.scientific_name ?? '').trim()) || BAMBOO_NAMES.test(String(tree?.species ?? ''));

const speciesKey = (tree) => String(tree?.species ?? '').trim().toLowerCase();

const percent = (share) => `${Math.round(share * 100)}%`;

/**
 * What the trees inside an area are, in the numbers the rules use.
 */
export function describeTrees(trees) {
  const list = (Array.isArray(trees) ? trees : []).filter(Boolean);
  const counts = new Map();
  let fruit = 0;
  let dipterocarps = 0;
  let bamboo = 0;
  const bambooSpecies = new Map();
  for (const tree of list) {
    const key = speciesKey(tree) || '(unknown)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (isFruitTree(tree)) fruit += 1;
    if (isDipterocarp(tree)) dipterocarps += 1;
    if (isBamboo(tree)) {
      bamboo += 1;
      const name = String(tree.species ?? '').trim() || 'Bamboo';
      const scientific = String(tree.scientific_name ?? '').trim();
      if (!bambooSpecies.has(key)) bambooSpecies.set(key, scientific && !/^unknown$/i.test(scientific) ? `${name} (${scientific})` : name);
    }
  }
  let topSpecies = null;
  let topCount = 0;
  for (const [name, count] of counts) {
    if (count > topCount) {
      topSpecies = name;
      topCount = count;
    }
  }
  const total = list.length;
  return {
    total,
    species: counts.size,
    topSpecies,
    topShare: total ? topCount / total : 0,
    fruitShare: total ? fruit / total : 0,
    dipterocarpShare: total ? dipterocarps / total : 0,
    bamboo,
    bambooShare: total ? bamboo / total : 0,
    bambooSpecies: [...bambooSpecies.values()],
  };
}

/**
 * The suggestion: { classId, reason, plantation } — or { classId: null,
 * reason } when the trees cannot support one. `reason` is always words a
 * person can check against the map.
 */
export function suggestCover(trees, rules = SUGGESTION_RULES) {
  const d = describeTrees(trees);
  const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  const counted = `${n(d.total, 'tree', 'trees')}, ${n(d.species, 'species', 'species')}`;

  // Bamboo first: a few clumps are a stand, where a few trees say nothing.
  if (d.bamboo >= rules.bambooMinClumps && d.bambooShare >= rules.bambooShare) {
    return {
      classId: 'bamboo-stand',
      plantation: false,
      reason: `${n(d.bamboo, 'bamboo clump', 'bamboo clumps')} of ${n(d.total, 'tagged point', 'tagged points')} — a bamboo stand: ${d.bambooSpecies.join(', ')}.`,
      facts: d,
    };
  }

  if (d.total < rules.minTrees) {
    return {
      classId: null,
      plantation: false,
      reason:
        d.total === 0
          ? 'No tagged trees inside this area. Choose from what you see on the ground.'
          : `Only ${n(d.total, 'tagged tree', 'tagged trees')} inside — too few to say. Choose from what you see on the ground.`,
      facts: d,
    };
  }

  if (d.fruitShare >= rules.fruitShare) {
    return {
      classId: 'perennial-crop',
      plantation: false,
      reason: `${counted}; ${percent(d.fruitShare)} are fruit trees — a tree-based farm or orchard.`,
      facts: d,
    };
  }

  const mixed = d.species >= rules.mixedMinSpecies && d.topShare <= rules.mixedMaxShare;
  if (mixed && d.dipterocarpShare >= rules.dipterocarpShare) {
    return {
      classId: 'closed-forest',
      plantation: false,
      reason: `${counted}, none over ${percent(rules.mixedMaxShare)}; ${percent(d.dipterocarpShare)} dipterocarps — a mixed stand under a dipterocarp canopy.`,
      facts: d,
    };
  }
  if (mixed) {
    return {
      classId: 'open-forest',
      plantation: false,
      reason: `${counted}, none over ${percent(d.topShare)} — a mixed stand: secondary forest.`,
      facts: d,
    };
  }

  if (d.topShare >= rules.plantationShare) {
    return {
      classId: 'open-forest',
      plantation: true,
      reason: `${counted}; ${percent(d.topShare)} are ${d.topSpecies} — a stand that uniform was most likely planted. Closed or open forest, by its canopy.`,
      facts: d,
    };
  }

  return {
    classId: null,
    plantation: false,
    reason: `${counted} — no clear pattern. Choose from what you see on the ground.`,
    facts: d,
  };
}

/** The suggestion's class label, for the form. */
export const suggestionLabel = (suggestion) => namriaClassById(suggestion?.classId)?.label ?? null;
