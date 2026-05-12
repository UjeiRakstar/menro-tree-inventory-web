/**
 * Analytics aggregation engine — pure functions for biodiversity counts,
 * carbon sequestration calculations, and barangay grouping.
 *
 * All functions are side-effect-free and independently testable.
 */

/**
 * Count trees by species_type field.
 * Every tree is counted as either Endemic or Invasive.
 *
 * @param {import('../types.js').TreeRecord[]} trees
 * @returns {{ Endemic: number, Invasive: number }}
 */
export function countBySpeciesType(trees) {
  const counts = { Endemic: 0, Invasive: 0 };
  for (const tree of trees) {
    if (tree.species_type === 'Endemic') {
      counts.Endemic += 1;
    } else {
      counts.Invasive += 1;
    }
  }
  return counts;
}

/**
 * Count trees by tree_category field.
 * Categories: 'Fruit', 'Timber', 'Ornamental'.
 * Records with undefined/null/unrecognized tree_category are counted under 'Other'.
 *
 * @param {import('../types.js').TreeRecord[]} trees
 * @returns {{ Fruit: number, Timber: number, Ornamental: number, Other: number }}
 */
export function countByTreeCategory(trees) {
  const counts = { Fruit: 0, Timber: 0, Ornamental: 0, Other: 0 };
  const recognized = new Set(['Fruit', 'Timber', 'Ornamental']);
  for (const tree of trees) {
    const category = tree.tree_category;
    if (recognized.has(category)) {
      counts[category] += 1;
    } else {
      counts.Other += 1;
    }
  }
  return counts;
}

/**
 * Parse a DBH string to a float. Returns 0 for non-numeric/empty/null values.
 *
 * @param {string|null|undefined} dbhString
 * @returns {number}
 */
export function parseDbh(dbhString) {
  if (dbhString == null) return 0;
  const parsed = parseFloat(dbhString);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Compute carbon sequestration estimate from a parsed DBH value.
 * Formula: DBH_float × 1.5
 *
 * @param {number} dbhFloat - Non-negative parsed DBH value
 * @returns {number}
 */
export function computeCarbon(dbhFloat) {
  return dbhFloat * 1.5;
}

/**
 * Group tree records by barangay, computing per-group carbon totals.
 * Each record is augmented with its computed carbon value before grouping.
 * Records with undefined/null barangay are grouped under 'Unknown'.
 *
 * @param {import('../types.js').TreeRecord[]} trees
 * @returns {Array<{ barangay: string, totalCarbon: number, records: Array<{ species: string, dbh: string, carbon: number }> }>}
 */
export function groupByBarangay(trees) {
  const groupMap = new Map();

  for (const tree of trees) {
    const key = tree.barangay != null ? tree.barangay : 'Unknown';
    const dbhFloat = parseDbh(tree.dbh);
    const carbon = computeCarbon(dbhFloat);

    if (!groupMap.has(key)) {
      groupMap.set(key, { barangay: key, totalCarbon: 0, records: [] });
    }

    const group = groupMap.get(key);
    group.totalCarbon += carbon;
    group.records.push({
      species: tree.species,
      dbh: tree.dbh,
      carbon,
    });
  }

  return Array.from(groupMap.values());
}

/**
 * Compute percentage of a count relative to a total.
 * Returns 0 when total is 0 (avoids division by zero).
 *
 * @param {number} count
 * @param {number} total
 * @returns {number} Percentage value (0-100)
 */
export function computePercentage(count, total) {
  if (total === 0) return 0;
  return (count / total) * 100;
}
