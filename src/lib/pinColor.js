/**
 * Pin color classification for the Command Center Map.
 *
 * Precedence: Grey > Red > Orange > Yellow > Green.
 *
 *   Grey   = Crowdsourced / unverified (pending field verification)
 *   Red    = Hazard detected AND unassigned (Action Required)
 *   Orange = Hazard detected AND assigned (Dispatched)
 *   Yellow = No hazard, has cutting permit
 *   Green  = Default healthy tree
 */

export const PIN_COLOR = Object.freeze({
  GREY: 'Grey',
  RED: 'Red',
  ORANGE: 'Orange',
  YELLOW: 'Yellow',
  GREEN: 'Green',
});

/**
 * Returns true when at least one hazard flag on a Tree_Record is true.
 * Supports both camelCase (from Supabase) and snake_case field names.
 * @param {object} tree
 * @returns {boolean}
 */
export function hasHazard(tree) {
  return Boolean(
    tree.isLeaning || tree.is_leaning ||
    tree.hasPowerlineConflict || tree.has_powerline_conflict ||
    tree.isDecayed || tree.is_decayed ||
    tree.isRootProblem || tree.is_root_problem
  );
}

/**
 * Classify a Tree_Record into exactly one Pin_Color using strict precedence
 * Grey > Red > Orange > Yellow > Green.
 *
 * @param {object} tree
 * @returns {'Grey' | 'Red' | 'Orange' | 'Yellow' | 'Green'}
 */
export function classifyPinColor(tree) {
  // 0. Crowdsourced / unverified trees get GREY
  if (tree.source === 'crowdsourced' && tree.task_status === 'Pending') {
    return PIN_COLOR.GREY;
  }

  // 1. Check if the tree is a hazard first
  const isHazard =
    tree.isLeaning || tree.is_leaning ||
    tree.hasPowerlineConflict || tree.has_powerline_conflict ||
    tree.isDecayed || tree.is_decayed ||
    tree.isRootProblem || tree.is_root_problem;

  // Get assigned_to value (support both field names)
  const assignedTo = tree.assigned_to ?? tree.assignedTo ?? null;

  // 2. Apply STRICT PRECEDENCE
  if (isHazard && !assignedTo) {
    // RED: Hazard exists AND it is unassigned (Action Required)
    return PIN_COLOR.RED;
  } else if (isHazard && assignedTo) {
    // ORANGE: Hazard exists AND an arborist is assigned (Dispatched)
    return PIN_COLOR.ORANGE;
  } else if (tree.has_cutting_permit || tree.hasCuttingPermit) {
    // YELLOW: No hazard, but it has a cutting permit
    return PIN_COLOR.YELLOW;
  } else {
    // GREEN: Default healthy tree
    return PIN_COLOR.GREEN;
  }
}
