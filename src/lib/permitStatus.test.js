import { classifyPermit, PERMIT_STATUS } from './permitStatus.js';

/**
 * Minimal, valid Tree_Record used as the base fixture. Each test overrides
 * only `has_cutting_permit` so the intent of each case is legible at the
 * assertion site.
 */
const baseTree = {
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

describe('classifyPermit', () => {
  it('returns APPROVED when has_cutting_permit is true', () => {
    expect(classifyPermit({ ...baseTree, has_cutting_permit: true })).toBe(
      PERMIT_STATUS.APPROVED
    );
  });

  it('returns NONE when has_cutting_permit is false', () => {
    expect(classifyPermit({ ...baseTree, has_cutting_permit: false })).toBe(
      PERMIT_STATUS.NONE
    );
  });
});
