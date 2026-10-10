import { describe, it, expect, beforeAll } from 'vitest';
import {
  barangayAt,
  barangayForTree,
  barangayIndexReady,
  loadBarangayIndex,
} from './barangayLookup.js';
import { isBarangayOf } from './barangayNames.js';

describe('before the index arrives', () => {
  it('says nothing rather than guessing', () => {
    // Deliberately first: the module starts with no index, and a page that
    // renders before the fetch lands must not be handed a wrong answer.
    expect(barangayIndexReady()).toBe(false);
    expect(barangayAt([14.2823, 121.4163])).toBeNull();
  });

  it('falls back to the written name until then', () => {
    expect(barangayForTree({ latitude: 14.2823, longitude: 121.4163, barangay: 'Brgy. Bubukal' })).toBe(
      'Bubukal'
    );
  });
});

describe('barangayAt', () => {
  beforeAll(async () => {
    await loadBarangayIndex();
  });

  it('is ready once loaded, and loads only once', async () => {
    expect(barangayIndexReady()).toBe(true);
    const first = await loadBarangayIndex();
    const second = await loadBarangayIndex();
    expect(first).toBe(second);
  });

  it('places a point in the barangay it stands in', () => {
    // The Santa Cruz municipal hall.
    const found = barangayAt([14.2823, 121.4163]);
    expect(found).not.toBeNull();
    expect(found.municipality).toBe('Santa Cruz');
    expect(isBarangayOf(found.barangay, 'Santa Cruz')).toBe(true);
  });

  it('answers with a name the PSA recognises, never a subdivision', () => {
    for (const position of [
      [14.2823, 121.4163],
      [14.2795, 121.4121],
      [14.233, 121.367],
      [14.17, 121.24],
    ]) {
      const found = barangayAt(position);
      if (found) expect(isBarangayOf(found.barangay, found.municipality)).toBe(true);
    }
  });

  it('agrees with the municipality layer it narrowed the search with', () => {
    const found = barangayAt([14.2823, 121.4163]);
    expect(found.municipality).toBe('Santa Cruz');
  });

  it('has nothing to say about a point outside Laguna', () => {
    expect(barangayAt([14.5995, 120.9842])).toBeNull(); // Manila
    expect(barangayAt([0, 0])).toBeNull();
  });

  it('refuses coordinates that are not coordinates', () => {
    expect(barangayAt(null)).toBeNull();
    expect(barangayAt([NaN, 121.4])).toBeNull();
    expect(barangayAt(['x', 'y'])).toBeNull();
  });
});

describe('barangayForTree', () => {
  beforeAll(async () => {
    await loadBarangayIndex();
  });

  it('prefers where the tree stands over what was typed', () => {
    // The written name is a subdivision, which is not a barangay at all.
    const tree = {
      latitude: 14.2823,
      longitude: 121.4163,
      barangay: 'Villa Silangan Subdivision',
    };
    const name = barangayForTree(tree);
    expect(name).not.toBe('Villa Silangan Subdivision');
    expect(isBarangayOf(name, 'Santa Cruz')).toBe(true);
  });

  it('rescues a tree whose barangay was never recorded', () => {
    const name = barangayForTree({ latitude: 14.2823, longitude: 121.4163, barangay: 'Unknown Barangay' });
    expect(isBarangayOf(name, 'Santa Cruz')).toBe(true);
  });

  it('keeps the written name when there is no usable position', () => {
    expect(barangayForTree({ latitude: 0, longitude: 0, barangay: 'Brgy. Bubukal' })).toBe('Bubukal');
    expect(barangayForTree({ barangay: 'Barangay V' })).toBe('Barangay V');
    expect(barangayForTree({ barangay: 'Unknown Barangay' })).toBeNull();
  });
});
