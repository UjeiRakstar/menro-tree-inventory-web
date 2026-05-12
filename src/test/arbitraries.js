import fc from 'fast-check';
import { TASK_STATUS_VALUES, SPECIES_TYPE_VALUES } from '../types.js';

/**
 * fast-check arbitrary for a finite latitude in [-90, 90].
 */
export const finiteLatArb = fc.double({
  min: -90,
  max: 90,
  noNaN: true,
  noDefaultInfinity: true,
});

/**
 * fast-check arbitrary for a finite longitude in [-180, 180].
 */
export const finiteLngArb = fc.double({
  min: -180,
  max: 180,
  noNaN: true,
  noDefaultInfinity: true,
});

/**
 * fast-check arbitrary that yields either a finite coord or a non-finite
 * value (NaN, Infinity, -Infinity, null, undefined). Used by Property 2 to
 * exercise the coordinate filter.
 */
export const possiblyNonFiniteCoordArb = fc.oneof(
  finiteLatArb,
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
  fc.constant(null),
  fc.constant(undefined)
);

/**
 * Shared Tree_Record fields (everything except latitude/longitude).
 */
const baseTreeFields = {
  id: fc.uuid(),
  tree_id: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  dbh: fc.string({ minLength: 1, maxLength: 8 }),
  species: fc.string({ minLength: 1, maxLength: 30 }),
  scientific_name: fc.string({ minLength: 1, maxLength: 40 }),
  species_type: fc.constantFrom(...SPECIES_TYPE_VALUES),
  is_leaning: fc.boolean(),
  has_powerline_conflict: fc.boolean(),
  is_decayed: fc.boolean(),
  is_root_problem: fc.boolean(),
  dateCaptured: fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
  assigned_to: fc.option(fc.uuid(), { nil: null }),
  has_cutting_permit: fc.boolean(),
  task_status: fc.constantFrom(...TASK_STATUS_VALUES),
  photo_url: fc.option(fc.webUrl(), { nil: null }),
};

/**
 * A Tree_Record whose latitude and longitude are always finite numbers.
 * Use for classifier and popup properties that assume valid geo data.
 */
export const treeRecordArb = fc.record({
  ...baseTreeFields,
  latitude: finiteLatArb,
  longitude: finiteLngArb,
});

/**
 * A Tree_Record whose latitude and longitude may be non-finite. Use for
 * Property 2 (coordinate filtering).
 */
export const treeRecordWithAnyCoordsArb = fc.record({
  ...baseTreeFields,
  latitude: possiblyNonFiniteCoordArb,
  longitude: possiblyNonFiniteCoordArb,
});

// ---------------------------------------------------------------------------
// Analytics-specific arbitraries
// ---------------------------------------------------------------------------

/**
 * Arbitrary for the optional `tree_category` field.
 * Produces one of 'Fruit', 'Timber', 'Ornamental', or undefined.
 */
const treeCategoryArb = fc.oneof(
  fc.constant('Fruit'),
  fc.constant('Timber'),
  fc.constant('Ornamental'),
  fc.constant(undefined)
);

/**
 * Arbitrary for the optional `barangay` field.
 * Produces a random non-empty string or undefined.
 */
const barangayArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 30 }),
  fc.constant(undefined)
);

/**
 * A Tree_Record with an optional `tree_category` field.
 * Used for testing countByTreeCategory (Property 2 in analytics design).
 */
export const treeRecordWithCategoryArb = fc.record({
  ...baseTreeFields,
  latitude: finiteLatArb,
  longitude: finiteLngArb,
  tree_category: treeCategoryArb,
});

/**
 * A Tree_Record with an optional `barangay` field.
 * Used for testing groupByBarangay (Property 5 in analytics design).
 */
export const treeRecordWithBarangayArb = fc.record({
  ...baseTreeFields,
  latitude: finiteLatArb,
  longitude: finiteLngArb,
  barangay: barangayArb,
});

/**
 * A Tree_Record with both optional `tree_category` and `barangay` fields.
 * Used for full analytics testing (Properties 5 & 6).
 */
export const treeRecordFullArb = fc.record({
  ...baseTreeFields,
  latitude: finiteLatArb,
  longitude: finiteLngArb,
  tree_category: treeCategoryArb,
  barangay: barangayArb,
});

/**
 * Generates valid numeric DBH strings that parseFloat can parse to a finite number.
 * Examples: "12.5", "3", "0.7", "100"
 */
export const numericDbhStringArb = fc
  .double({ min: 0, max: 9999, noNaN: true, noDefaultInfinity: true })
  .map((n) => String(n));

/**
 * Generates strings that parseFloat CANNOT parse to a finite number.
 * Includes alphabetic strings, empty string, and special non-numeric patterns.
 */
export const nonNumericDbhStringArb = fc.oneof(
  fc.constant(''),
  fc.constant('abc'),
  fc.constant('NaN'),
  fc.constant('Infinity'),
  fc.constant('-Infinity'),
  fc.constant('not a number'),
  // Strings starting with a non-digit, non-sign, non-dot character
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]*$/).filter(
    (s) => !Number.isFinite(parseFloat(s))
  )
);
