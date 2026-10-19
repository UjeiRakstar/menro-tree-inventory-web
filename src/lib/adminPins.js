import { PIN_COLOR, classifyPinColor } from './pinColor.js';

/**
 * The Command Center's pin colours, on the LGU map.
 *
 * The public map draws every tree the same green, because to a resident a tree
 * is a tree. An LGU office reads the map for what needs doing, so its pins say
 * so — the colours the old Command Center used, kept as asked:
 *
 *   red     a hazard nobody has been sent to       → act
 *   orange  a hazard an arborist is on             → wait
 *   grey    unverified — a resident's tag, or a tree from the office's
 *           inventory spreadsheet — awaiting field checking  → verify
 *   yellow  a cutting permit has been issued
 *   green   nothing to do
 */
export const PIN_FILL = Object.freeze({
  [PIN_COLOR.RED]: '#dc2626',
  [PIN_COLOR.ORANGE]: '#f97316',
  [PIN_COLOR.GREY]: '#94a3b8',
  [PIN_COLOR.YELLOW]: '#eab308',
  [PIN_COLOR.GREEN]: '#16a34a',
});

export const PIN_MEANING = Object.freeze({
  [PIN_COLOR.RED]: 'Hazard — needs dispatching',
  [PIN_COLOR.ORANGE]: 'Hazard — arborist dispatched',
  [PIN_COLOR.GREY]: 'Unverified — awaiting field check',
  [PIN_COLOR.YELLOW]: 'Cutting permit issued',
  [PIN_COLOR.GREEN]: 'Healthy',
});

/** Most urgent first. */
export const URGENCY = Object.freeze([
  PIN_COLOR.RED,
  PIN_COLOR.ORANGE,
  PIN_COLOR.GREY,
  PIN_COLOR.YELLOW,
  PIN_COLOR.GREEN,
]);

/** A tree's colour; a crowdsourced tag awaiting its field check is always grey. */
export function pinColorOf(tree) {
  if (tree?.__pending) return PIN_COLOR.GREY;
  return classifyPinColor(tree);
}

/**
 * The colour a group of trees is drawn in: its most urgent member's.
 *
 * A bubble with one hazard among forty healthy trees is red, so a hazard is
 * never hidden inside a green group at province scale.
 */
export function mostUrgent(colors) {
  for (const color of URGENCY) {
    if (colors.includes(color)) return color;
  }
  return PIN_COLOR.GREEN;
}

/** How many trees need somebody sent to them — the badge on Action Board. */
export const needingAction = (trees) =>
  (Array.isArray(trees) ? trees : []).filter((tree) => classifyPinColor(tree) === PIN_COLOR.RED).length;
