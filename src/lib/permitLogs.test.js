import { describe, it, expect } from 'vitest';
import { lguOfPermit, permitsBetween, summarisePermits, treesCovered } from './permitLogs.js';

const SCZ = 403426000;
const PILA = 403422000;

const context = {
  treesById: new Map([['t1', { id: 't1', barangay_psgc: 403426001 }]]),
  lguByName: new Map([
    ['santa cruz', SCZ],
    ['pila', PILA],
  ]),
};

describe('lguOfPermit', () => {
  it('takes a tagged tree’s LGU', () => {
    expect(lguOfPermit({ tree_id: 't1' }, context)).toBe(SCZ);
  });

  it('places a walk-in permit by the point it was issued for', () => {
    // Santa Cruz town proper.
    expect(lguOfPermit({ tree_id: null, latitude: 14.2794, longitude: 121.4157 }, context)).toBe(SCZ);
  });

  it('leaves a permit it cannot place as not placed', () => {
    expect(lguOfPermit({ tree_id: 'gone' }, context)).toBeNull();
    expect(lguOfPermit({ latitude: 0, longitude: 0 }, context)).toBeNull();
  });
});

describe('permitsBetween', () => {
  const permits = [
    { id: 1, created_at: '2026-09-30T23:00:00Z' },
    { id: 2, created_at: '2026-10-01T08:00:00Z' },
    { id: 3, created_at: '2026-10-14T08:00:00Z' },
  ];

  it('keeps both end days', () => {
    expect(permitsBetween(permits, '2026-10-01', '2026-10-14').map((p) => p.id)).toEqual([2, 3]);
  });

  it('leaves an end open when it is not given', () => {
    expect(permitsBetween(permits, '', '2026-10-01').map((p) => p.id)).toEqual([1, 2]);
    expect(permitsBetween(permits).map((p) => p.id)).toEqual([1, 2, 3]);
  });
});

describe('summarisePermits', () => {
  it('counts permits and the trees they cover per LGU, most first', () => {
    const permits = [
      { lgu: PILA },
      { lgu: SCZ, number_of_trees: 3 },
      { lgu: SCZ },
      { lgu: null },
    ];
    const labels = { [SCZ]: 'Santa Cruz', [PILA]: 'Pila' };
    const rows = summarisePermits(permits, (p) => p.lgu, (lgu) => labels[lgu] ?? 'Not placed');
    expect(rows).toEqual([
      { lgu: SCZ, label: 'Santa Cruz', permits: 2, trees: 4 },
      { lgu: null, label: 'Not placed', permits: 1, trees: 1 },
      { lgu: PILA, label: 'Pila', permits: 1, trees: 1 },
    ]);
  });

  it('counts a permit with no tree count as one tree', () => {
    expect(treesCovered({})).toBe(1);
    expect(treesCovered({ number_of_trees: 0 })).toBe(1);
  });
});
