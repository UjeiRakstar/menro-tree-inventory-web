import fc from 'fast-check';
import { classifyPinColor, hasHazard, PIN_COLOR } from './pinColor.js';
import { treeRecordArb } from '../test/arbitraries.js';

describe('classifyPinColor', () => {
  // Feature: command-center-map, Property 1: Pin Color Classification Correctness
  it('returns the precedence-correct color for any Tree_Record', () => {
    fc.assert(
      fc.property(treeRecordArb, (t) => {
        const color = classifyPinColor(t);
        const hazard = hasHazard(t);
        const unassigned = t.assigned_to == null;
        if (hazard && unassigned) return color === PIN_COLOR.RED;
        if (hazard) return color === PIN_COLOR.ORANGE;
        if (t.has_cutting_permit) return color === PIN_COLOR.YELLOW;
        return color === PIN_COLOR.GREEN;
      }),
      { numRuns: 100 }
    );
  });

  it('classifies a record with every hazard flag true and assigned_to null as Red', () => {
    const tree = {
      id: 'a',
      tree_id: 'T-1',
      latitude: 0,
      longitude: 0,
      dbh: '10',
      species: 'Narra',
      scientific_name: 'Pterocarpus indicus',
      species_type: 'Endemic',
      is_leaning: true,
      has_powerline_conflict: true,
      is_decayed: true,
      is_root_problem: true,
      dateCaptured: '2024-01-01T00:00:00.000Z',
      assigned_to: null,
      has_cutting_permit: false,
      task_status: 'Pending',
      photo_url: null,
    };
    expect(classifyPinColor(tree)).toBe('Red');
  });

  it('classifies a hazard with an assignee as Orange', () => {
    expect(
      classifyPinColor({
        is_leaning: true,
        has_powerline_conflict: false,
        is_decayed: false,
        is_root_problem: false,
        assigned_to: 'user-1',
        has_cutting_permit: true,
      })
    ).toBe('Orange');
  });

  it('classifies a healthy tree with a cutting permit as Yellow', () => {
    expect(
      classifyPinColor({
        is_leaning: false,
        has_powerline_conflict: false,
        is_decayed: false,
        is_root_problem: false,
        assigned_to: null,
        has_cutting_permit: true,
      })
    ).toBe('Yellow');
  });

  it('classifies a healthy tree without a permit as Green', () => {
    expect(
      classifyPinColor({
        is_leaning: false,
        has_powerline_conflict: false,
        is_decayed: false,
        is_root_problem: false,
        assigned_to: null,
        has_cutting_permit: false,
      })
    ).toBe('Green');
  });

  it('treats assigned_to === undefined the same as null (Red when hazard)', () => {
    expect(
      classifyPinColor({
        is_leaning: true,
        has_powerline_conflict: false,
        is_decayed: false,
        is_root_problem: false,
        // assigned_to omitted → undefined
        has_cutting_permit: false,
      })
    ).toBe('Red');
  });
});
