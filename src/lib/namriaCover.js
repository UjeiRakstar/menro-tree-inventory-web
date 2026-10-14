import { landCoverById } from './landCover.js';

/**
 * NAMRIA's national land cover classes — what an office classifies a drawn
 * area as. Land COVER, what is on the ground, not land classification.
 *
 * Each class points at the published MAI row behind it (src/lib/landCover.js)
 * where one exists. The matching, and how good each match is, is argued in
 * ACCOUNTS_AND_MAPPING.md → "NAMRIA's classes, and the MAI behind each".
 *
 *   maiCoverId   the land cover row whose rate applies, or null
 *   rate         'published'       a rate applies
 *                'none'            tree cover with no published rate — never
 *                                  zero, and the page says so in amber
 *                'not-applicable'  not tree cover; no woody increment
 *   treeCover    whether it is a cover of trees at all
 *   match        for the classes with a rate: how good the borrowed rate is
 */
export const NAMRIA_CLASSES = Object.freeze([
  {
    id: 'closed-forest',
    label: 'Closed forest',
    maiCoverId: 'dipterocarps',
    rate: 'published',
    treeCover: true,
    match: 'Good, and local: dipterocarps measured on Makiling, in Laguna.',
  },
  {
    id: 'open-forest',
    label: 'Open forest',
    maiCoverId: 'secondary-forest',
    rate: 'published',
    treeCover: true,
    match: 'Good: open forest is mostly residual and regenerating secondary forest.',
  },
  {
    id: 'brush-shrubs',
    label: 'Brush / shrubs',
    maiCoverId: 'brushlands',
    rate: 'published',
    treeCover: true,
    match: 'Direct: the brushlands rate.',
  },
  {
    id: 'perennial-crop',
    label: 'Perennial crop (agroforest, orchard)',
    maiCoverId: 'fallow-agroforestry',
    rate: 'published',
    treeCover: true,
    match: 'Approximate: the only agroforestry rate published is an improved Leucaena fallow.',
  },
  { id: 'grassland', label: 'Grassland', maiCoverId: null, rate: 'none', treeCover: false },
  { id: 'mangrove-forest', label: 'Mangrove forest', maiCoverId: null, rate: 'none', treeCover: true },
  { id: 'annual-crop', label: 'Annual crop', maiCoverId: null, rate: 'not-applicable', treeCover: false },
  { id: 'open-barren', label: 'Open / barren', maiCoverId: null, rate: 'not-applicable', treeCover: false },
  { id: 'built-up', label: 'Built-up', maiCoverId: null, rate: 'not-applicable', treeCover: false },
  { id: 'marshland-swamp', label: 'Marshland / swamp', maiCoverId: null, rate: 'not-applicable', treeCover: false },
  { id: 'fishpond', label: 'Fishpond', maiCoverId: null, rate: 'not-applicable', treeCover: false },
  { id: 'inland-water', label: 'Inland water', maiCoverId: null, rate: 'not-applicable', treeCover: false },
]);

export const NAMRIA_CLASS_IDS = Object.freeze(NAMRIA_CLASSES.map((cls) => cls.id));

export const namriaClassById = (id) => NAMRIA_CLASSES.find((cls) => cls.id === id) ?? null;

/** The MAI row behind a class, or null when it has none. */
export const maiCoverOf = (classId) => landCoverById(namriaClassById(classId)?.maiCoverId);

/** Why a class shows no growth figure, in words for the panel. */
export function noRateReason(classId) {
  const cls = namriaClassById(classId);
  if (!cls || cls.rate === 'published') return '';
  return cls.rate === 'none'
    ? `No growth rate has been published for ${cls.label.toLowerCase()}, so none is applied. This is not a rate of zero.`
    : `${cls.label} is not tree cover, so no woody growth is counted.`;
}

/**
 * The legal designations an area may claim. Each one needs its document;
 * land cover alone needs none (decision 7).
 */
export const DESIGNATIONS = Object.freeze([
  { id: 'protected-area', label: 'Protected area (NIPAS / E-NIPAS)' },
  { id: 'forest-land', label: 'Forest land under a DENR land classification map' },
  { id: 'zoning', label: 'A zone in the LGU’s zoning ordinance' },
  { id: 'flup', label: 'A Forest Land Use Plan area' },
]);

export const designationById = (id) => DESIGNATIONS.find((d) => d.id === id) ?? null;

/** What goes everywhere an area is shown. */
export const PLANNING_ONLY = 'For planning purposes only. Not a land title, survey plan or proof of ownership.';
