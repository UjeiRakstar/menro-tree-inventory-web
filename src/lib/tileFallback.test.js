import { describe, it, expect } from 'vitest';
import { parentTilePlan, parentTileOnError } from './tileFallback.js';

describe('parentTilePlan', () => {
  it('draws the parent twice as large, with this tile’s quarter in the square', () => {
    // (5, 7) is the right-hand, lower quarter of (2, 3) one zoom up.
    expect(parentTilePlan({ x: 5, y: 7, z: 19 }, 1)).toEqual({
      z: 18,
      x: 2,
      y: 3,
      width: 512,
      height: 512,
      marginLeft: -256,
      marginTop: -256,
      clip: 'inset(256px 0px 0px 256px)',
    });
  });

  it('goes further up when it has to', () => {
    const plan = parentTilePlan({ x: 9, y: 4, z: 19 }, 2);
    // 9 = 2×4 + 1, 4 = 1×4 + 0: column 1, row 0 of a 4 × 4 parent.
    expect(plan).toMatchObject({ z: 17, x: 2, y: 1, width: 1024, marginLeft: -256, marginTop: -0 });
  });
});

describe('the tile error handler', () => {
  const tileAt = () => {
    const tile = document.createElement('img');
    tile.style.width = '256px';
    return tile;
  };
  const handle = parentTileOnError('https://tiles.example/{z}/{y}/{x}?blankTile=false');

  it('swaps a missing tile for its parent', () => {
    const tile = tileAt();
    handle({ tile, coords: { x: 5, y: 7, z: 19 } });
    expect(tile.src).toBe('https://tiles.example/18/3/2?blankTile=false');
    expect(tile.style.width).toBe('512px');
  });

  it('climbs again if the parent is missing too, and gives up after four', () => {
    const tile = tileAt();
    for (let i = 0; i < 6; i += 1) handle({ tile, coords: { x: 5, y: 7, z: 19 } });
    expect(tile.dataset.fallbackLevels).toBe('4');
    expect(tile.src).toBe('https://tiles.example/15/0/0?blankTile=false');
    // Sixteen times the square, not sixteen times an already-enlarged image.
    expect(tile.style.width).toBe('4096px');
  });
});
