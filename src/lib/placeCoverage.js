/**
 * How far the inventory has reached, and where it has not.
 *
 * Counting trees per barangay only ever shows the barangays that have one. The
 * interesting ones are the places with none — and those cannot come out of a
 * grouping over the trees, because there is nothing there to group. They have
 * to come from the list of places that exist.
 *
 * ON WHAT "NONE" MEANS
 * A barangay with no tagged trees has not been surveyed yet. It does NOT mean
 * there are no trees there, and the page must not imply it does: 112 trees
 * across two municipalities is a survey that has barely started, not a
 * province that is nearly bare. Once coverage is reasonably complete the same
 * view becomes a planting gap. Until then it is a survey gap, and that is what
 * it says.
 */

/**
 * Every place, with how many trees are tagged in it.
 *
 * `places` holds all of them including the empty ones, commonest first and
 * alphabetical within a tie, so one call serves both orderings.
 *
 * @param trees      the trees in scope
 * @param keyOf      the place a tree belongs to, or null if it cannot be said
 * @param allPlaces  every place that exists, as {name, label}
 */
export function coverage(trees, keyOf, allPlaces) {
  const counts = new Map();
  let unplaced = 0;

  for (const tree of Array.isArray(trees) ? trees : []) {
    const name = keyOf(tree);
    if (!name) {
      unplaced += 1;
      continue;
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const known = Array.isArray(allPlaces) ? allPlaces : [];
  const places = known
    .map(({ name, label }) => ({ name, label: label ?? name, count: counts.get(name) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // A place the records name but the official list does not — a misspelling,
  // or a subdivision written into the barangay box. Counted so the figures add
  // up, and kept out of the "not yet tagged" list where it would read as a
  // real place nobody has visited.
  const unlisted = [...counts.entries()]
    .filter(([name]) => !known.some((place) => place.name === name))
    .map(([name, count]) => ({ name, label: name, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const tagged = places.filter((place) => place.count > 0).length;

  return { places, unlisted, unplaced, tagged, total: places.length };
}

/** The places with trees, commonest first. */
export const tagged = (result) => result.places.filter((place) => place.count > 0);

/** The places with none, alphabetically — nothing to rank them by. */
export const untagged = (result) =>
  result.places.filter((place) => place.count === 0).sort((a, b) => a.label.localeCompare(b.label));

/** "9 of 26", for a sentence. */
export function coverageLine(result, singular, plural) {
  const { tagged: count, total } = result;
  const noun = total === 1 ? singular : plural;
  return `${count} of ${total} ${noun}`;
}
