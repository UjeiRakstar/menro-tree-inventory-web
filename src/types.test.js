import PropTypes from 'prop-types';
import {
  TreeRecordPropType,
  TASK_STATUS_VALUES,
  SPECIES_TYPE_VALUES,
} from './types.js';

/**
 * Build a fully-populated, valid Tree_Record with every field set to a
 * non-null, schema-correct value. Tests clone this and tweak individual
 * fields to exercise validation edges.
 */
const buildValidTreeRecord = () => ({
  id: '11111111-1111-4111-8111-111111111111',
  tree_id: 'LOCAL-0001',
  latitude: 14.5995,
  longitude: 120.9842,
  dbh: '42.5',
  species: 'Narra',
  scientific_name: 'Pterocarpus indicus',
  species_type: 'Endemic',
  is_leaning: false,
  has_powerline_conflict: true,
  is_decayed: false,
  is_root_problem: false,
  dateCaptured: '2024-03-15T08:30:00.000Z',
  assigned_to: 'user-abc-123',
  has_cutting_permit: true,
  task_status: 'Pending',
  photo_url: 'https://res.cloudinary.com/example/image/upload/v1/tree.jpg',
});

/**
 * Validate a record against TreeRecordPropType. A unique componentName is
 * used per call because PropTypes dedupes warnings by (propName, message,
 * componentName); resetWarningCache handles older paths too.
 */
const validate = (record, componentName) => {
  if (typeof PropTypes.resetWarningCache === 'function') {
    PropTypes.resetWarningCache();
  }
  PropTypes.checkPropTypes(
    { tree: TreeRecordPropType },
    { tree: record },
    'prop',
    componentName
  );
};

describe('types.js', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('TreeRecordPropType', () => {
    it('accepts a fully-populated valid Tree_Record without emitting a console error', () => {
      const record = buildValidTreeRecord();

      validate(record, 'TestFullyPopulated');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('accepts null for nullable fields tree_id, assigned_to, and photo_url', () => {
      const record = {
        ...buildValidTreeRecord(),
        tree_id: null,
        assigned_to: null,
        photo_url: null,
      };

      validate(record, 'TestNullableFields');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('emits a console error when task_status is not one of the allowed values', () => {
      const record = { ...buildValidTreeRecord(), task_status: 'Bogus' };

      validate(record, 'TestBogusTaskStatus');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const messages = consoleErrorSpy.mock.calls.map((call) => call.join(' '));
      expect(messages.some((m) => m.includes('task_status'))).toBe(true);
    });

    it('emits a console error when species_type is not one of the allowed values', () => {
      const record = { ...buildValidTreeRecord(), species_type: 'Bogus' };

      validate(record, 'TestBogusSpeciesType');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const messages = consoleErrorSpy.mock.calls.map((call) => call.join(' '));
      expect(messages.some((m) => m.includes('species_type'))).toBe(true);
    });
  });

  describe('enum value exports', () => {
    it('TASK_STATUS_VALUES deep-equals the ordered list of task statuses', () => {
      expect(TASK_STATUS_VALUES).toEqual([
        'Pending',
        'Acknowledged',
        'Executed',
        'Cancelled',
      ]);
    });

    it('SPECIES_TYPE_VALUES deep-equals the ordered list of species types', () => {
      expect(SPECIES_TYPE_VALUES).toEqual(['Endemic', 'Invasive']);
    });
  });
});
