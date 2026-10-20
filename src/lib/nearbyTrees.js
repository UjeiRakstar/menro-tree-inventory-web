import { distanceM } from './drawing.js';

/**
 * How close a tree already tagged must be to a new tag for it to be asked
 * whether it is the same tree (asked 19 October: "to avoid tagging again").
 * A phone's GPS is good to about five metres; two trees in a row can stand
 * closer than that, so a tree this near is asked about, not refused.
 */
export const SAME_TREE_RADIUS_M = 5;

/**
 * The trees within `radius` metres of a position, nearest first:
 * [{ tree, metres }]. Verified trees and those tagged and not yet verified
 * alike — both are already on the map.
 */
export function treesNear(position, trees = [], radius = SAME_TREE_RADIUS_M) {
  const [lat, lng] = position ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const near = [];
  for (const tree of trees) {
    const at = [Number(tree?.latitude), Number(tree?.longitude)];
    if (!Number.isFinite(at[0]) || !Number.isFinite(at[1]) || (at[0] === 0 && at[1] === 0)) continue;
    const metres = distanceM([lat, lng], at);
    if (metres <= radius) near.push({ tree, metres });
  }
  return near.sort((a, b) => a.metres - b.metres);
}
