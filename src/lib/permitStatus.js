/**
 * Permit status classification for the Central_Inventory Master_Data_Table.
 *
 * Collapses the `has_cutting_permit` boolean on a Tree_Record into a single
 * status string rendered as an amber/yellow "Approved" pill or the plain
 * text "None".
 */

/**
 * The two possible permit classifications.
 * @readonly
 */
export const PERMIT_STATUS = Object.freeze({
  APPROVED: 'Approved',
  NONE: 'None',
});

/**
 * Map a Tree_Record to its Permit_Status. Pure function; reads no state
 * outside `tree`.
 *
 * Returns `PERMIT_STATUS.APPROVED` when `tree.has_cutting_permit` is `true`,
 * and `PERMIT_STATUS.NONE` otherwise.
 *
 * @param {import('../types.js').TreeRecord} tree
 * @returns {'Approved' | 'None'}
 */
export function classifyPermit(tree) {
  return tree.has_cutting_permit ? PERMIT_STATUS.APPROVED : PERMIT_STATUS.NONE;
}
