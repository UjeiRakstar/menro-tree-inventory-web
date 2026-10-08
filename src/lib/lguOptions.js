import lguIndex from '../data/Laguna-LGUs.json';

/**
 * Laguna's 30 municipalities and cities, with their barangays.
 *
 * Generated alongside Laguna-Barangays.geojson by the mobile repo's
 * tools/build_boundaries.py, from the NAMRIA/PSA administrative boundaries.
 * This is the names-only index, so dropdowns do not pull in the 781 KB of
 * polygon geometry.
 *
 * `name` is the key to store in profiles.municipality — the mobile app's
 * geofence looks the LGU up by that exact string, so it must stay the bare
 * name ("Calamba"), not the label ("Calamba City").
 */
export const LGU_OPTIONS = lguIndex;

/** Barangays of one LGU, alphabetically. Empty for an unknown LGU. */
export function barangaysOf(municipality) {
  if (!municipality) return [];
  const lgu = lguIndex.find((entry) => entry.name === municipality);
  return lgu ? lgu.barangays : [];
}

/** How the LGU is written in the UI ("Calamba City", "Santa Cruz"). */
export function labelOf(municipality) {
  const lgu = lguIndex.find((entry) => entry.name === municipality);
  return lgu ? lgu.label : municipality || '';
}
