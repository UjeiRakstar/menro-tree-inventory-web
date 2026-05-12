/**
 * Hazard status classification for the Central_Inventory Master_Data_Table.
 *
 * Collapses the four independent Hazard_Flags on a Tree_Record into a single
 * status string rendered as a red "Hazard" pill or a green "Safe" pill.
 *
 * Hazard_Flags (Requirement 5.1): is_leaning, has_powerline_conflict,
 * is_decayed, is_root_problem.
 */

/**
 * The two possible hazard classifications.
 * @readonly
 */
export const HAZARD_STATUS = Object.freeze({
  HAZARD: 'Hazard',
  SAFE: 'Safe',
});

/**
 * Collapse the four Hazard_Flags on a Tree_Record into a single status
 * string. Pure function; reads no state outside `tree`.
 *
 * Returns `HAZARD_STATUS.HAZARD` when any of `is_leaning`,
 * `has_powerline_conflict`, `is_decayed`, or `is_root_problem` is `true`,
 * and `HAZARD_STATUS.SAFE` when all four are `false`.
 *
 * @param {import('../types.js').TreeRecord} tree
 * @returns {'Hazard' | 'Safe'}
 */
export function classifyHazard(tree) {
  return tree.isLeaning || tree.is_leaning ||
    tree.hasPowerlineConflict || tree.has_powerline_conflict ||
    tree.isDecayed || tree.is_decayed ||
    tree.isRootProblem || tree.is_root_problem
    ? HAZARD_STATUS.HAZARD
    : HAZARD_STATUS.SAFE;
}
