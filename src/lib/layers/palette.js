/**
 * How PGENRO's layers are coloured on the map — decided here, not when the
 * file was uploaded.
 *
 *   flood, landslide   DHSUD's CDRA colours (decided 20 October): yellow
 *                      low, purple moderate, red high — the standard for
 *                      hazard, exposure and risk maps in the Philippines,
 *                      so a map reads the way every CDRA plate reads
 *   elevation          sand to brown, the way a topographic map shades height
 *   soil               muted earth and slate tones, one per soil series
 *
 * The hazards used to keep out of the tree pins' red, orange and green (blues
 * for flood, purples for landslide). The standard comes first now; a red pin
 * on a high hazard is told apart by its white outline.
 *
 * Pictures published before this palette are repainted in the browser
 * (browser.js repaintPicture), so nobody has to upload them again.
 */

/**
 * DHSUD's Climate and Disaster Risk Assessment colours, as the risk matrix
 * gives them (Low, Moderate, High, Very High). NOAH's hazard maps have three
 * levels, low to high; very high is kept for a map, or a risk score, that
 * has four.
 */
export const CDRA_COLOURS = Object.freeze({
  low: Object.freeze([255, 255, 0]),
  moderate: Object.freeze([112, 48, 160]),
  high: Object.freeze([255, 0, 0]),
  veryHigh: Object.freeze([192, 0, 0]),
});

const cdraLevels = () =>
  Object.freeze({
    1: [...CDRA_COLOURS.low, 170],
    2: [...CDRA_COLOURS.moderate, 170],
    3: [...CDRA_COLOURS.high, 180],
  });

export const HAZARD_PALETTES = Object.freeze({
  flood: cdraLevels(),
  landslide: cdraLevels(),
});

/** Elevation bands 1–5 (elevation.js ELEVATION_BANDS), low to high. */
export const ELEVATION_PALETTE = Object.freeze([
  [252, 243, 214, 140],
  [236, 211, 160, 150],
  [210, 168, 112, 160],
  [160, 112, 70, 170],
  [98, 64, 42, 180],
]);

/** One colour per soil series, in the order the series first appear. */
export const SOIL_PALETTE = Object.freeze([
  '#9aa5b1', '#b07aa1', '#4e79a7', '#c9b37e', '#8f7fbf', '#76b7b2', '#9c755f', '#d4a6c8',
  '#5f8fb8', '#e0c78c', '#6b6b8f', '#bab0ac', '#86bcb6', '#c7a27c', '#b5a3d1', '#7aa6c2',
  '#8c6d5a', '#a5a58d', '#7d8597', '#cdb4db',
]);

/** The lake, and BSWM's "no data" with it: nothing to colour. */
export const isWaterBody = (soil) => /water body/i.test(`${soil?.description ?? ''} ${soil?.series ?? ''}`);

/** The colour of a value in a picture layer, as [r, g, b, a], or null. */
export function pictureColour(kind, value) {
  if (kind === 'elevation') return ELEVATION_PALETTE[value - 1] ?? null;
  return HAZARD_PALETTES[kind]?.[value] ?? null;
}

const css = ([r, g, b, a = 255]) => `rgba(${r},${g},${b},${Math.round((a / 255) * 100) / 100})`;

/**
 * Soil series → colour, from the classes a soil layer was published with.
 * Phases of one series ("Lipa loam", "Lipa loam (Deep phase)") share it.
 */
export function soilColours(classes = []) {
  const bySeries = new Map();
  for (const soil of classes) {
    if (isWaterBody(soil)) continue;
    const key = soil.series || soil.description;
    if (!bySeries.has(key)) bySeries.set(key, SOIL_PALETTE[bySeries.size % SOIL_PALETTE.length]);
  }
  return bySeries;
}

/** The colour one soil shape is filled with, or null for the lake. */
export function soilColourOf(colours, soil) {
  if (isWaterBody(soil)) return null;
  return colours.get(soil.series || soil.description) ?? SOIL_PALETTE[0];
}

/**
 * A layer's key, in this palette: [{ label, colour, detail? }].
 * Soil is listed by series, with its soils under it.
 */
export function layerKey(kind, meta) {
  if (!meta) return [];
  if (kind === 'soil') {
    const colours = soilColours(meta.classes);
    const soils = new Map();
    for (const soil of meta.classes ?? []) {
      if (isWaterBody(soil)) continue;
      const key = soil.series || soil.description;
      if (!soils.has(key)) soils.set(key, []);
      if (soil.description && !soils.get(key).includes(soil.description)) soils.get(key).push(soil.description);
    }
    return [...soils].map(([series, descriptions]) => ({
      label: series,
      colour: colours.get(series),
      detail: descriptions.length > 1 || descriptions[0] !== series ? descriptions.join(' · ') : undefined,
    }));
  }
  return (meta.legend ?? []).map((item) => {
    const colour = pictureColour(kind, item.value);
    return { label: item.label, colour: colour ? css([...colour.slice(0, 3), 255]) : css(item.colour) };
  });
}

/**
 * How to repaint a picture published in older colours: "r,g,b" of each
 * legend colour it was drawn in → the colour that value has now. Empty when
 * the picture is already in this palette.
 */
export function repaintMap(kind, legend = []) {
  const map = new Map();
  for (const item of legend) {
    const now = pictureColour(kind, item.value);
    const then = item.colour;
    if (!now || !Array.isArray(then)) continue;
    if (now.every((v, i) => v === (then[i] ?? 255))) continue;
    map.set(`${then[0]},${then[1]},${then[2]}`, now);
  }
  return map;
}

/**
 * Repaints RGBA bytes in place with a repaintMap. A canvas keeps
 * semi-transparent pixels premultiplied, so what it reads back can be a step
 * off what was drawn: a pixel takes the nearest old colour within a few steps.
 */
export function repaintPixels(data, map) {
  if (map.size === 0) return data;
  const olds = [...map].map(([key, now]) => ({ rgb: key.split(',').map(Number), now }));
  const seen = new Map();
  const match = (r, g, b) => {
    let best = null;
    let bestDistance = 7;
    for (const old of olds) {
      const distance = Math.abs(old.rgb[0] - r) + Math.abs(old.rgb[1] - g) + Math.abs(old.rgb[2] - b);
      if (distance < bestDistance) {
        best = old.now;
        bestDistance = distance;
      }
    }
    return best;
  };
  let lastKey = -1;
  let last = null;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    if (key !== lastKey) {
      lastKey = key;
      if (!seen.has(key)) seen.set(key, match(data[i], data[i + 1], data[i + 2]));
      last = seen.get(key);
    }
    if (!last) continue;
    data[i] = last[0];
    data[i + 1] = last[1];
    data[i + 2] = last[2];
    data[i + 3] = last[3];
  }
  return data;
}
