import endemicIcon from '../assets/optimised/endemic_icon.png';
import invasiveIcon from '../assets/optimised/invasive_icon.png';
import fruitIcon from '../assets/optimised/fruit_tree.png';
import ornamentalIcon from '../assets/optimised/ornamental_tree.png';
import timberIcon from '../assets/optimised/timber_tree.png';
import crowdsourceIcon from '../assets/optimised/crowdsource_icon.png';
import datagatherIcon from '../assets/optimised/datagather_icon.png';

/**
 * The three badges the public map's side panel shows for a tree: what it is to
 * the local ecosystem, what it is grown for, and who recorded it.
 *
 * Each returns null when the record does not say, so the panel shows two icons
 * rather than a wrong third. The values matched here are the ones the mobile
 * app actually writes — "Fruit Tree" and "Fruit" both occur, and
 * biodiversity_status carries "Endemic"/"Invasive" while species_type also
 * carries "Introduced" and "Unknown".
 */

const norm = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/**
 * The category of a tree, as a word both sides of the app can compare.
 *
 * The mobile app writes the same category more than one way — 48 trees are
 * "Fruit Tree" and 2 are plain "Fruit" — so the trailing noun is dropped and
 * "Fruit", "Fruit Tree" and "Fruit Trees" all come out as "fruit".
 */
export const normalizeCategory = (value) => norm(value).replace(/\s*trees?$/, '').trim();

/** Endemic or invasive, from biodiversity_status with species_type as backup. */
export function biodiversityTrait(tree) {
  const value = norm(tree?.biodiversity_status) || norm(tree?.species_type);
  if (value === 'endemic') {
    return {
      key: 'endemic',
      kind: 'biodiversity',
      icon: endemicIcon,
      label: 'Endemic species',
      description: 'Native to the Philippines and part of the local ecosystem.',
    };
  }
  if (value === 'invasive') {
    return {
      key: 'invasive',
      kind: 'biodiversity',
      icon: invasiveIcon,
      label: 'Invasive species',
      description: 'Introduced species that spreads and crowds out native trees.',
    };
  }
  return null;
}

/** Fruit, ornamental or timber, from tree_category. */
export function categoryTrait(tree) {
  const value = normalizeCategory(tree?.tree_category);
  if (value === 'fruit') {
    return {
      key: 'fruit',
      kind: 'category',
      icon: fruitIcon,
      label: 'Fruit tree',
      description: 'Grown for its edible fruit.',
    };
  }
  if (value === 'ornamental') {
    return {
      key: 'ornamental',
      kind: 'category',
      icon: ornamentalIcon,
      label: 'Ornamental tree',
      description: 'Planted for shade, form or flowers along streets and open spaces.',
    };
  }
  if (value === 'timber') {
    return {
      key: 'timber',
      kind: 'category',
      icon: timberIcon,
      label: 'Timber tree',
      description: 'Grown for wood used in construction and furniture.',
    };
  }
  return null;
}

/**
 * Who put this tree on the map.
 *
 * public.trees.source is set by supabase/species_profiles.sql; every row that
 * predates it came from the field officers' mobile app, so anything missing or
 * unrecognised reads as field-gathered rather than as nothing at all.
 *
 * The 'crowdsource' branch is the placeholder for the crowdsourcing feature:
 * nothing writes that value yet, and it starts showing up on the map the moment
 * approved public.pending_trees rows are promoted with source = 'crowdsource'.
 *
 * Field data is MENRO's today. Once the MENRO account work lands, the record
 * will name the user type that tagged the tree and this wording follows it.
 */
export function sourceTrait(tree) {
  const value = norm(tree?.source) || norm(tree?.data_source);
  if (value === 'crowdsource' || value === 'crowdsourced' || value === 'public') {
    return {
      key: 'crowdsource',
      kind: 'source',
      icon: crowdsourceIcon,
      label: 'Crowdsourced',
      description: 'Tagged by a resident through the Green Tag public map.',
    };
  }
  return {
    key: 'field',
    kind: 'source',
    icon: datagatherIcon,
    label: 'Field-gathered',
    description: 'Recorded on site by a MENRO field officer.',
  };
}

/**
 * Is this tree part of the set being picked out on the map?
 *
 * A highlight is {kind, value}: the species of the tree whose panel is open, or
 * the trait behind a badge the visitor pressed. No highlight means every tree
 * is drawn the same, which is the map at rest.
 */
export function matchesHighlight(tree, highlight) {
  if (!highlight?.kind) return true;
  const { kind, value } = highlight;
  if (kind === 'species') return norm(tree?.species) === norm(value);
  if (kind === 'biodiversity') return biodiversityTrait(tree)?.key === value;
  if (kind === 'category') return categoryTrait(tree)?.key === value;
  if (kind === 'source') return sourceTrait(tree)?.key === value;
  return true;
}

/** The set a badge stands for, in the shape matchesHighlight expects. */
export const highlightForTrait = (trait) => ({ kind: trait.kind, value: trait.key });

/** The badges to show, in panel order, skipping the ones the record cannot say. */
export function traitsOf(tree) {
  return [biodiversityTrait(tree), categoryTrait(tree), sourceTrait(tree)].filter(Boolean);
}
