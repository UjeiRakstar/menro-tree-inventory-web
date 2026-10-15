import L from 'leaflet';

/**
 * When a satellite tile does not exist, show the tile above it, enlarged.
 *
 * Esri's imagery is not equally deep everywhere: Santa Cruz goes to zoom 19,
 * Siniloan stops at 18. Past the last real level Esri used to send a picture
 * saying "Map data not yet available", which tiled across the map. Asked with
 * `blankTile=false`, it answers 404 instead, and this draws the nearest lower
 * level's tile in that square — softer, but the actual ground. (Checked on
 * 15 October: a Siniloan tile at zoom 19 is the placeholder; zoom 18 is real.)
 *
 * A tile at (x, y, z) is one quarter of its parent at z−1, so the parent is
 * drawn twice as large, shifted to put the right quarter in the square, and
 * clipped to it. If the parent is missing too, the next one up is tried.
 */
export const MAX_FALLBACK_LEVELS = 4;

/**
 * Where to find a missing tile's stand-in `levels` zooms up, and how to place
 * it in a square `size` pixels across.
 */
export function parentTilePlan({ x, y, z }, levels, size = 256) {
  const scale = 2 ** levels;
  const px = Math.floor(x / scale);
  const py = Math.floor(y / scale);
  // Which of the scale × scale cells of the parent this tile is.
  const col = x - px * scale;
  const row = y - py * scale;
  const drawn = size * scale;
  return {
    z: z - levels,
    x: px,
    y: py,
    width: drawn,
    height: drawn,
    marginLeft: -col * size,
    marginTop: -row * size,
    // Show only this square of the enlarged parent.
    clip: `inset(${row * size}px ${(scale - 1 - col) * size}px ${(scale - 1 - row) * size}px ${col * size}px)`,
  };
}

/**
 * The tile layer's `tileerror` handler. `urlTemplate` is the layer's URL with
 * {z}/{y}/{x}, as in src/lib/basemaps.js.
 */
export function parentTileOnError(urlTemplate) {
  return (event) => {
    const tile = event?.tile;
    const coords = event?.coords;
    if (!tile || !coords) return;
    const levels = Number(tile.dataset.fallbackLevels ?? 0) + 1;
    if (levels > MAX_FALLBACK_LEVELS || coords.z - levels < 0) return;

    // The square's own size, remembered: after the first step up the image is
    // already drawn larger than the square it fills.
    const size = Number(tile.dataset.fallbackSize) || parseFloat(tile.style.width) || 256;
    tile.dataset.fallbackSize = String(size);
    const plan = parentTilePlan(coords, levels, size);
    tile.dataset.fallbackLevels = String(levels);
    Object.assign(tile.style, {
      width: `${plan.width}px`,
      height: `${plan.height}px`,
      marginLeft: `${plan.marginLeft}px`,
      marginTop: `${plan.marginTop}px`,
      clipPath: plan.clip,
    });
    // Leaflet shows a tile only once it is marked loaded, which it does not
    // do for one that failed; the stand-in marks itself.
    tile.addEventListener('load', () => tile.classList.add('leaflet-tile-loaded'), { once: true });
    tile.src = L.Util.template(urlTemplate, { x: plan.x, y: plan.y, z: plan.z });
  };
}
