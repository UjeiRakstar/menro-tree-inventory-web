import { describe, it, expect } from 'vitest';
import { BOARD_METRICS, mapLinkFor, rowsBehind, tallyBoard } from './provinceBoard.js';

const SCZ = 403426000;
const PILA = 403424000;

const TREES = [
  // Santa Cruz: a hazard nobody is on, one somebody is on, a Code 2 and a Code 3.
  { id: 'a', barangay_psgc: 403426001, isLeaning: true, stem_quality: 'Code 3 (Several Defects)' },
  { id: 'b', barangay_psgc: 403426002, is_decayed: true, assigned_to: 'ana@field.ph', stem_quality: 'Code 2 (Little Defects)' },
  { id: 'c', barangay_psgc: 403426002, stem_quality: 'Code 1 (Straight/No Defects)', has_cutting_permit: true },
  // Pila: one hazard.
  { id: 'd', barangay_psgc: 403424005, hasPowerlineConflict: true, stem_quality: 'Code 2 (Little Defects)' },
  // A stump, which needs nobody.
  { id: 'cut', barangay_psgc: 403426001, isLeaning: true, task_status: 'Cut' },
  // Not placed in any LGU.
  { id: 'lost', isLeaning: true },
];

const TAGS = [
  { id: 1, lgu_psgc: SCZ, status: 'pending' },
  { id: 2, lgu_psgc: SCZ, status: 'dispatched' },
  { id: 3, lgu_psgc: SCZ, status: 'verified' }, // done: not waiting
  { id: 4, lgu_psgc: null, status: 'pending' }, // nobody's yet
];

describe('tallyBoard', () => {
  const { byLgu, totals } = tallyBoard(TREES, TAGS);

  it('counts each LGU’s hazards, by whether anybody has been sent', () => {
    expect(byLgu.get(SCZ).counts).toMatchObject({ undispatched: 1, dispatched: 1 });
    expect(byLgu.get(PILA).counts).toMatchObject({ undispatched: 1, dispatched: 0 });
  });

  it('counts stem quality by the field app’s codes', () => {
    expect(byLgu.get(SCZ).counts).toMatchObject({ code1: 1, code2: 1, code3: 1 });
    expect(totals.counts.code2).toBe(2);
  });

  it('counts only the tags still waiting for a field check', () => {
    expect(byLgu.get(SCZ).counts.tags).toBe(2);
    expect(totals.counts.tags).toBe(3);
  });

  it('leaves stumps out, and keeps what has no LGU in the province total', () => {
    expect(byLgu.get(SCZ).trees).toBe(3);
    expect(byLgu.get(null).counts.undispatched).toBe(1);
    expect(totals.counts.undispatched).toBe(3);
    expect(totals.trees).toBe(5);
  });

  it('has a column for every metric, even at zero', () => {
    expect(Object.keys(byLgu.get(PILA).counts)).toEqual(BOARD_METRICS.map((m) => m.key));
  });
});

describe('rowsBehind', () => {
  it('opens the trees behind one number in one LGU', () => {
    expect(rowsBehind('undispatched', SCZ, TREES, TAGS).map((t) => t.id)).toEqual(['a']);
  });

  it('opens the province’s when no LGU is given', () => {
    expect(rowsBehind('undispatched', undefined, TREES, TAGS).map((t) => t.id)).toEqual(['a', 'd', 'lost']);
  });

  it('opens tags for the tag count', () => {
    expect(rowsBehind('tags', SCZ, TREES, TAGS).map((t) => t.id)).toEqual([1, 2]);
  });
});

describe('mapLinkFor', () => {
  it('links a tree, and a tag the way the office map names it', () => {
    expect(mapLinkFor({ id: 'a' })).toBe('/map?tree=a');
    expect(mapLinkFor({ id: 7 }, { tag: true })).toBe('/map?tree=pending-7');
  });
});
