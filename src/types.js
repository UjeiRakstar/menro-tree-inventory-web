import PropTypes from 'prop-types';

/**
 * Allowed values for a Tree_Record's `task_status` field.
 * @readonly
 */
export const TASK_STATUS = Object.freeze({
  PENDING: 'Pending',
  ACKNOWLEDGED: 'Acknowledged',
  EXECUTED: 'Executed',
  CANCELLED: 'Cancelled',
});

/**
 * Allowed values for a Tree_Record's `species_type` field.
 * @readonly
 */
export const SPECIES_TYPE = Object.freeze({
  ENDEMIC: 'Endemic',
  INVASIVE: 'Invasive',
});

/**
 * Ordered list of every allowed `task_status` string.
 * @type {string[]}
 */
export const TASK_STATUS_VALUES = Object.values(TASK_STATUS);

/**
 * Ordered list of every allowed `species_type` string.
 * @type {string[]}
 */
export const SPECIES_TYPE_VALUES = Object.values(SPECIES_TYPE);

/**
 * A single row in the Supabase `trees` table, mirroring the strict schema used
 * by the offline-first mobile arborist app.
 *
 * @typedef {Object} TreeRecord
 * @property {string}  id                      Supabase row primary key (UUID string).
 * @property {?string} tree_id                 Mobile-assigned local identifier; may be null on older rows.
 * @property {number}  latitude                Decimal degrees.
 * @property {number}  longitude               Decimal degrees.
 * @property {string}  dbh                     Diameter at breast height, stored as a string by the mobile app.
 * @property {string}  species                 Common name.
 * @property {string}  scientific_name         Latin binomial.
 * @property {('Endemic'|'Invasive')} species_type
 * @property {boolean} is_leaning
 * @property {boolean} has_powerline_conflict
 * @property {boolean} is_decayed
 * @property {boolean} is_root_problem
 * @property {string}  dateCaptured            ISO-8601 timestamp.
 * @property {?string} assigned_to             User id of assigned arborist, or null.
 * @property {boolean} has_cutting_permit
 * @property {('Pending'|'Acknowledged'|'Executed'|'Cancelled')} task_status
 * @property {?string} photo_url               Cloudinary URL (not a Supabase Storage URL).
 */

/**
 * Runtime PropTypes contract for a {@link TreeRecord}. Nullable fields
 * (`tree_id`, `assigned_to`, `photo_url`) omit `.isRequired` so they accept
 * `null` or `undefined` values without emitting a PropTypes warning.
 */
export const TreeRecordPropType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  tree_id: PropTypes.string, // nullable
  latitude: PropTypes.number.isRequired,
  longitude: PropTypes.number.isRequired,
  dbh: PropTypes.string.isRequired,
  species: PropTypes.string.isRequired,
  scientific_name: PropTypes.string.isRequired,
  species_type: PropTypes.oneOf(SPECIES_TYPE_VALUES).isRequired,
  is_leaning: PropTypes.bool.isRequired,
  has_powerline_conflict: PropTypes.bool.isRequired,
  is_decayed: PropTypes.bool.isRequired,
  is_root_problem: PropTypes.bool.isRequired,
  dateCaptured: PropTypes.string.isRequired,
  assigned_to: PropTypes.string, // nullable
  has_cutting_permit: PropTypes.bool.isRequired,
  task_status: PropTypes.oneOf(TASK_STATUS_VALUES).isRequired,
  photo_url: PropTypes.string, // nullable Cloudinary URL (not Supabase Storage)
});
