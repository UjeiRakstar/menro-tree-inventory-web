import { describe, it, expect } from 'vitest';
import { BOARD_METRICS, mapLinkFor, officesByLgu, rowsBehind, tallyBoard } from './provinceBoard.js';

const SCZ = 403426000;
const PILA = 403422000;
const NOW = Date.parse('2026-10-15T12:00:00Z');
const DAYS_AGO = (n) => new Date(NOW - n * 86400000).toISOString();

const TREES = [
  // Santa Cruz: a hazard nobody is on, one somebody is on, a Code 3, a permit.
  { id: 'a', barangay_psgc: 403426001, isLeaning: true, stem_quality: 'Code 3 (Several Defects)', dateCaptured: DAYS_AGO(3) },
  { id: 'b', barangay_psgc: 403426002, is_decayed: true, assigned_to: 'ana@field.ph', stem_quality: 'Code 2 (Little Defects)', dateCaptured: DAYS_AGO(45) },
  { id: 'c', barangay_psgc: 403426002, stem_quality: 'Code 1 (Straight/No Defects)', has_cutting_permit: true },
  // Pila: one hazard, tagged last week.
  { id: 'd', barangay_psgc: 403422005, hasPowerlineConflict: true, dateCaptured: DAYS_AGO(7) },
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

const AREAS = [
  { id: 'f1', lgu_psgc: SCZ, kind: 'land-cover', cover_class: 'open-forest', area_m2: 25000 },
  { id: 'f2', lgu_psgc: SCZ, kind: 'land-cover', cover_class: 'built-up', area_m2: 9000 }, // not tree cover
  { id: 's1', lgu_psgc: PILA, kind: 'planting-site', planting_status: 'open', area_m2: 4000 },
  { id: 's2', lgu_psgc: PILA, kind: 'planting-site', planting_status: 'full', area_m2: 4000 },
];

describe('tallyBoard', () => {
  const { byLgu, totals } = tallyBoard(TREES, TAGS, AREAS, { now: NOW });

  it('counts each LGU’s hazards, by whether anybody has been sent', () => {
    expect(byLgu.get(SCZ).counts).toMatchObject({ undispatched: 1, dispatched: 1 });
    expect(byLgu.get(PILA).counts).toMatchObject({ undispatched: 1, dispatched: 0 });
  });

  it('keeps Code 3 stems as a watch list, and no longer counts Codes 1 and 2', () => {
    expect(byLgu.get(SCZ).counts.code3).toBe(1);
    expect(BOARD_METRICS.map((m) => m.key)).not.toContain('code1');
    expect(BOARD_METRICS.map((m) => m.key)).not.toContain('code2');
  });

  it('counts only the tags still waiting for a field check', () => {
    expect(byLgu.get(SCZ).counts.tags).toBe(2);
    expect(totals.counts.tags).toBe(3);
  });

  it('counts the trees tagged in the last 30 days', () => {
    expect(byLgu.get(SCZ).counts.recent).toBe(1); // 'b' was 45 days ago
    expect(byLgu.get(PILA).counts.recent).toBe(1);
  });

  it('counts land cover mapped, its tree-cover hectares, and planting sites still open', () => {
    expect(byLgu.get(SCZ).counts.mapped).toBe(2);
    expect(byLgu.get(SCZ).coverHa).toBeCloseTo(2.5, 5); // the built-up area is not tree cover
    expect(byLgu.get(PILA).counts.sitesOpen).toBe(1);
    expect(totals.coverHa).toBeCloseTo(2.5, 5);
  });

  it('leaves stumps out, and keeps what has no LGU in the province total', () => {
    expect(byLgu.get(SCZ).trees).toBe(3);
    expect(byLgu.get(null).counts.undispatched).toBe(1);
    expect(totals.counts.undispatched).toBe(3);
    expect(totals.trees).toBe(5);
  });
});

describe('officesByLgu', () => {
  it('counts each LGU’s active, real MENRO / CENRO accounts', () => {
    const offices = officesByLgu([
      { role: 'lgu_admin', status: 'active', lgu_psgc: SCZ },
      { role: 'lgu_admin', status: 'locked', lgu_psgc: SCZ },
      { role: 'lgu_admin', status: 'active', lgu_psgc: PILA, is_training: true }, // a trainee is not an office
      { role: 'field_officer', status: 'active', lgu_psgc: PILA },
    ]);
    expect(offices.get(SCZ)).toBe(1);
    expect(offices.has(PILA)).toBe(false);
  });
});

describe('rowsBehind', () => {
  it('opens the trees behind one number in one LGU', () => {
    expect(rowsBehind('undispatched', SCZ, TREES, TAGS, AREAS, { now: NOW }).map((t) => t.id)).toEqual(['a']);
  });

  it('opens the province’s when no LGU is given', () => {
    expect(rowsBehind('undispatched', undefined, TREES, TAGS, AREAS).map((t) => t.id)).toEqual(['a', 'd', 'lost']);
  });

  it('opens tags for the tag count, and areas for the area counts', () => {
    expect(rowsBehind('tags', SCZ, TREES, TAGS, AREAS).map((t) => t.id)).toEqual([1, 2]);
    expect(rowsBehind('sitesOpen', undefined, TREES, TAGS, AREAS).map((a) => a.id)).toEqual(['s1']);
  });
});

describe('mapLinkFor', () => {
  it('links a tree, a tag the way the office map names it, and an area', () => {
    expect(mapLinkFor({ id: 'a' })).toBe('/map?tree=a');
    expect(mapLinkFor({ id: 7 }, { of: 'tags' })).toBe('/map?tree=pending-7');
    expect(mapLinkFor({ id: 'f1' }, { of: 'areas' })).toBe('/map?area=f1');
  });
});
