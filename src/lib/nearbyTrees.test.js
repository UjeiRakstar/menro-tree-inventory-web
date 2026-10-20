import { describe, it, expect } from 'vitest';
import { treesNear } from './nearbyTrees.js';

describe('trees already tagged nearby', () => {
  const HERE = [14.2475, 121.3965];
  // About 3 m and 30 m north of HERE (1° of latitude is about 111 km).
  const NEAR = { id: 'a', species: 'Narra', latitude: 14.247527, longitude: 121.3965 };
  const FAR = { id: 'b', species: 'Mango', latitude: 14.24777, longitude: 121.3965 };

  it('finds those within a few metres, nearest first, and not the rest', () => {
    const found = treesNear(HERE, [FAR, NEAR, { ...NEAR, id: 'c', latitude: '14.2475', longitude: '121.3965' }]);
    expect(found.map((n) => n.tree.id)).toEqual(['c', 'a']);
    expect(found[1].metres).toBeCloseTo(3, 0);
  });

  it('skips trees with no position, and asks nothing without one', () => {
    expect(treesNear(HERE, [{ id: 'x' }, { id: 'zero', latitude: 0, longitude: 0 }])).toEqual([]);
    expect(treesNear([NaN, NaN], [NEAR])).toEqual([]);
  });
});
