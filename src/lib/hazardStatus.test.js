import fc from 'fast-check';
import { classifyHazard, HAZARD_STATUS } from './hazardStatus.js';
import { treeRecordArb } from '../test/arbitraries.js';

/**
 * Minimal, valid Tree_Record with every Hazard_Flag set to `false`. Individual
 * tests override only the flags they care about so the intent of each case is
 * legible at the assertion site.
 */
const baseSafeTree = {
  id: 'row-1',
  tree_id: 'T-1',
  latitude: 14.5995,
  longitude: 120.9842,
  dbh: '25',
  species: 'Narra',
  scientific_name: 'Pterocarpus indicus',
  species_type: 'Endemic',
  is_leaning: false,
  has_powerline_conflict: false,
  is_decayed: false,
  is_root_problem: false,
  dateCaptured: '2024-01-01T00:00:00.000Z',
  assigned_to: null,
  has_cutting_permit: false,
  task_status: 'Pending',
  photo_url: null,
};

describe('classifyHazard', () => {
  it('returns HAZARD when only is_leaning is true', () => {
    expect(classifyHazard({ ...baseSafeTree, is_leaning: true })).toBe(
      HAZARD_STATUS.HAZARD
    );
  });

  it('returns HAZARD when only has_powerline_conflict is true', () => {
    expect(
      classifyHazard({ ...baseSafeTree, has_powerline_conflict: true })
    ).toBe(HAZARD_STATUS.HAZARD);
  });

  it('returns HAZARD when only is_decayed is true', () => {
    expect(classifyHazard({ ...baseSafeTree, is_decayed: true })).toBe(
      HAZARD_STATUS.HAZARD
    );
  });

  it('returns HAZARD when only is_root_problem is true', () => {
    expect(classifyHazard({ ...baseSafeTree, is_root_problem: true })).toBe(
      HAZARD_STATUS.HAZARD
    );
  });

  it('returns HAZARD when all four Hazard_Flags are true', () => {
    expect(
      classifyHazard({
        ...baseSafeTree,
        is_leaning: true,
        has_powerline_conflict: true,
        is_decayed: true,
        is_root_problem: true,
      })
    ).toBe(HAZARD_STATUS.HAZARD);
  });

  it('returns SAFE when all four Hazard_Flags are false', () => {
    expect(classifyHazard(baseSafeTree)).toBe(HAZARD_STATUS.SAFE);
  });
});

// Feature: central-inventory, Property 1: classifyHazard is a pure boolean OR of the four Hazard_Flags
describe('classifyHazard (Property 1)', () => {
  it('returns Hazard iff any of the four Hazard_Flags is true, Safe otherwise', () => {
    fc.assert(
      fc.property(treeRecordArb, (t) => {
        const expected =
          t.is_leaning ||
          t.has_powerline_conflict ||
          t.is_decayed ||
          t.is_root_problem
            ? 'Hazard'
            : 'Safe';
        return classifyHazard(t) === expected;
      }),
      { numRuns: 100 }
    );
  });
});
