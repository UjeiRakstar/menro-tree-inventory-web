import { archiveReason, healthWarnings, placeOfTree, taggedBy, totalHeightText } from './treeRows.js';

const SCZ_TREE = { id: 't1', species: 'Narra', barangay: 'Labuin', barangay_psgc: 403426001 };

describe('a tree in the inventory table (22 October)', () => {
  it('is healthy with no warnings, or names each one', () => {
    expect(healthWarnings(SCZ_TREE)).toEqual([]);
    expect(healthWarnings({ isLeaning: true, has_powerline_conflict: true, stem_quality: 'Code 3 (Several Defects)' })).toEqual([
      'Leaning',
      'In conflict with power lines',
      'Stem Code 3 — several defects',
    ]);
  });

  it('says who tagged it: the community, the LGU’s file, or the field officer — by name for the office, by LGU for PGENRO', () => {
    const people = new Map([['u1', 'Ana Reyes']]);
    expect(taggedBy({ ...SCZ_TREE, source: 'crowdsource' }).label).toBe('Community');
    expect(taggedBy({ ...SCZ_TREE, source: 'import' }).label).toBe('LGU inventory file');
    expect(taggedBy({ ...SCZ_TREE, captured_by: 'u1' }, { people })).toMatchObject({ label: 'Ana Reyes', named: true });
    expect(taggedBy({ ...SCZ_TREE, captured_by: 'gone' }, { people })).toMatchObject({ label: 'Field officer', named: false });
    expect(taggedBy({ ...SCZ_TREE, captured_by: 'u1' }, { province: true, people }).label).toBe('Field officer · Santa Cruz');
  });

  it('stands in its barangay for the office, its city or municipality for PGENRO', () => {
    expect(placeOfTree(SCZ_TREE)).toBe('Labuin');
    expect(placeOfTree(SCZ_TREE, { province: true })).toBe('Santa Cruz');
    expect(placeOfTree({})).toBe('—');
  });

  it('gives the total height in metres, or the class written', () => {
    expect(totalHeightText({ total_height: '12.5' })).toBe('12.5 m');
    expect(totalHeightText({ heightClass: 'Medium' })).toBe('Medium');
    expect(totalHeightText({})).toBe('—');
  });

  it('is archived with a reason, and the note added to it', () => {
    expect(archiveReason('Cut under a permit', ' permit 2026-14 ')).toBe('Cut under a permit — permit 2026-14');
    expect(archiveReason('Died or fell')).toBe('Died or fell');
    expect(archiveReason('')).toBe('');
  });
});
