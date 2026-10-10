import { describe, it, expect } from 'vitest';
import { coverage, coverageLine, tagged, untagged } from './placeCoverage.js';

const BARANGAYS = [
  { name: 'Bubukal', label: 'Bubukal' },
  { name: 'Calios', label: 'Calios' },
  { name: 'Gatid', label: 'Gatid' },
  { name: 'Alipit', label: 'Alipit' },
];

const tree = (barangay) => ({ barangay });
const many = (n, barangay) => Array.from({ length: n }, () => tree(barangay));
const barangayOf = (t) => t.barangay ?? null;

const run = (trees) => coverage(trees, barangayOf, BARANGAYS);

describe('coverage', () => {
  it('counts the trees in each place, commonest first', () => {
    const result = run([...many(5, 'Bubukal'), ...many(2, 'Calios')]);

    expect(result.places.map((p) => [p.label, p.count])).toEqual([
      ['Bubukal', 5],
      ['Calios', 2],
      ['Alipit', 0],
      ['Gatid', 0],
    ]);
  });

  it('keeps the places with nothing in them', () => {
    // The whole point: a grouping over the trees can never produce these,
    // because there is nothing there to group.
    const result = run(many(3, 'Bubukal'));

    expect(untagged(result).map((p) => p.label)).toEqual(['Alipit', 'Calios', 'Gatid']);
  });

  it('says how much of the place has been reached', () => {
    const result = run([...many(3, 'Bubukal'), ...many(1, 'Gatid')]);

    expect(result.tagged).toBe(2);
    expect(result.total).toBe(4);
    expect(coverageLine(result, 'barangay', 'barangays')).toBe('2 of 4 barangays');
  });

  it('orders the untagged alphabetically, having nothing to rank them by', () => {
    const result = run([]);
    expect(untagged(result).map((p) => p.label)).toEqual([
      'Alipit',
      'Bubukal',
      'Calios',
      'Gatid',
    ]);
  });

  it('counts a tree whose place cannot be named, without inventing a place', () => {
    const result = run([...many(2, 'Bubukal'), tree(null), tree(undefined)]);

    expect(result.unplaced).toBe(2);
    expect(result.places.find((p) => p.label === 'Bubukal').count).toBe(2);
    expect(result.total).toBe(4);
  });

  it('separates a name the official list does not have', () => {
    // "Villa Silangan Subdivision" is in the records but is not a barangay.
    // It must not appear among the places nobody has surveyed.
    const result = run([...many(2, 'Bubukal'), tree('Villa Silangan Subdivision')]);

    expect(result.unlisted).toEqual([
      { name: 'Villa Silangan Subdivision', label: 'Villa Silangan Subdivision', count: 1 },
    ]);
    expect(untagged(result).map((p) => p.label)).not.toContain('Villa Silangan Subdivision');
    expect(result.tagged).toBe(1);
  });

  it('survives an empty or missing set', () => {
    expect(coverage([], barangayOf, BARANGAYS).tagged).toBe(0);
    expect(coverage(undefined, barangayOf, BARANGAYS).total).toBe(4);
    expect(coverage([], barangayOf, undefined).places).toEqual([]);
  });
});

describe('tagged', () => {
  it('is only the places that have something', () => {
    const result = run([...many(5, 'Bubukal'), ...many(2, 'Calios')]);
    expect(tagged(result).map((p) => p.label)).toEqual(['Bubukal', 'Calios']);
  });
});

describe('coverageLine', () => {
  it('reads as a sentence in either number', () => {
    const one = coverage(many(1, 'Bubukal'), barangayOf, [BARANGAYS[0]]);
    expect(coverageLine(one, 'barangay', 'barangays')).toBe('1 of 1 barangay');
  });
});
