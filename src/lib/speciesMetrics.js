import { normalizeCategory } from './treeTraits.js';

/**
 * What is actually growing out there.
 *
 * The page is called a Biodiversity dashboard and until now measured no
 * diversity: it counted trees, invasive trees and carbon. Diversity is a
 * different question — how many kinds, how evenly spread, how many belong
 * here — and every column it needs was already in the table.
 */

/** Trim and fold case for comparison, without losing the original spelling. */
const key = (value) => String(value ?? '').trim().toLowerCase();

/** A name that names nothing. */
const UNNAMED = /^(unknown|unidentified|n\/?a|none|other)$/i;

/** The species of a tree as it should be counted, or null when unrecorded. */
export function speciesOf(tree) {
  const name = String(tree?.species ?? '').replace(/\s+/g, ' ').trim();
  if (!name || UNNAMED.test(name)) return null;
  return name;
}

/**
 * The genus, from the first word of the scientific name.
 *
 * "Swietenia macrophylla" is the genus Swietenia. Binomial names put the genus
 * first by definition, so this needs no lookup table — but it does need a
 * scientific name, and a tree recorded only by its common name has no genus
 * here rather than a guessed one.
 */
export function genusOf(tree) {
  const scientific = String(tree?.scientific_name ?? '').trim();
  if (!scientific || UNNAMED.test(scientific)) return null;
  const first = scientific.split(/\s+/)[0];
  if (!first || first.length < 3) return null;
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * How many different species, and how many trees could not be named.
 *
 * `unnamed` is reported rather than hidden: richness counted over a set where
 * a fifth of the trees say "Unknown" is a different claim from richness over a
 * set where all of them are identified.
 */
export function speciesRichness(trees) {
  const rows = Array.isArray(trees) ? trees : [];
  const names = new Set();
  let unnamed = 0;
  for (const tree of rows) {
    const name = speciesOf(tree);
    if (name) names.add(key(name));
    else unnamed += 1;
  }
  return { species: names.size, unnamed, total: rows.length };
}

/**
 * The commonest species first, with each one's share of the whole.
 *
 * `share` is of every tree in the set, named or not, because that is the
 * share a reader means when they ask how much of the forest is Mango.
 */
export function speciesCounts(trees) {
  const rows = Array.isArray(trees) ? trees : [];
  const counts = new Map();

  for (const tree of rows) {
    const name = speciesOf(tree);
    if (!name) continue;
    const id = key(name);
    const found = counts.get(id);
    if (found) found.count += 1;
    else counts.set(id, { name, scientificName: tree?.scientific_name ?? '', count: 1 });
  }

  const total = rows.length || 1;
  return [...counts.values()]
    .map((row) => ({ ...row, share: row.count / total }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The same, by genus. */
export function genusCounts(trees) {
  const rows = Array.isArray(trees) ? trees : [];
  const counts = new Map();

  for (const tree of rows) {
    const name = genusOf(tree);
    if (!name) continue;
    const id = key(name);
    counts.set(id, { name, count: (counts.get(id)?.count ?? 0) + 1 });
  }

  const total = rows.length || 1;
  return [...counts.values()]
    .map((row) => ({ ...row, share: row.count / total }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Santamour's 10-20-30 rule.
 *
 * No more than 10% of an urban forest in any one species, 20% in any one
 * genus, 30% in any one family. The reason is disease: a stand that is a third
 * one thing can lose a third of its canopy to a single pest, which is how
 * cities elsewhere lost their elms and their ashes.
 *
 * Family is not checked. It needs a species-to-family lookup this system does
 * not have, and guessing one from a genus name would be inventing data. Two of
 * the three thresholds is honest; three with one made up is not.
 */
export const DIVERSITY_LIMITS = { species: 0.1, genus: 0.2 };

/**
 * Which species and genera are planted past the guideline.
 *
 * Returned worst first, so the first line is the one to act on. An empty list
 * is a real answer and the page says so — it means the mix is within the
 * guideline, which is worth telling a reader.
 */
export function overPlanted(trees) {
  const warnings = [];

  for (const row of speciesCounts(trees)) {
    if (row.share > DIVERSITY_LIMITS.species) {
      warnings.push({ rank: 'species', name: row.name, count: row.count, share: row.share, limit: DIVERSITY_LIMITS.species });
    }
  }
  for (const row of genusCounts(trees)) {
    if (row.share > DIVERSITY_LIMITS.genus) {
      warnings.push({ rank: 'genus', name: row.name, count: row.count, share: row.share, limit: DIVERSITY_LIMITS.genus });
    }
  }

  return warnings.sort((a, b) => b.share - a.share);
}

/**
 * Where the trees come from: endemic, invasive, or not recorded.
 *
 * Reads biodiversity_status with species_type as backup, the same way the
 * badges on the map panel do, so the two cannot disagree.
 */
export function originMix(trees) {
  const rows = Array.isArray(trees) ? trees : [];
  const mix = { endemic: 0, invasive: 0, unrecorded: 0 };
  for (const tree of rows) {
    const value = key(tree?.biodiversity_status) || key(tree?.species_type);
    if (value === 'endemic') mix.endemic += 1;
    else if (value === 'invasive') mix.invasive += 1;
    else mix.unrecorded += 1;
  }
  return mix;
}

/** Fruit, timber, ornamental, or not recorded. */
export function categoryMix(trees) {
  const rows = Array.isArray(trees) ? trees : [];
  const mix = { fruit: 0, timber: 0, ornamental: 0, unrecorded: 0 };
  for (const tree of rows) {
    const value = normalizeCategory(tree?.tree_category);
    if (value === 'fruit') mix.fruit += 1;
    else if (value === 'timber') mix.timber += 1;
    else if (value === 'ornamental') mix.ornamental += 1;
    else mix.unrecorded += 1;
  }
  return mix;
}

/** A share as a percentage, for a label. */
export const asPercent = (share) => `${Math.round(share * 1000) / 10}%`;
