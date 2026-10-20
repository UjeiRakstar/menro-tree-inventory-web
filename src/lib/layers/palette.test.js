import { describe, it, expect } from 'vitest';
import { HAZARD_HATCH, HAZARD_PALETTES, SOIL_PALETTE, hatchOf, layerKey, levelMask, pictureColour, repaintMap, repaintPixels, soilColourOf, soilColours } from './palette.js';

// The pins' colours (adminPins.js) and the areas' outlines: what a layer must not look like.
const RED = [220, 38, 38];
const ORANGE = [249, 115, 22];
const GREEN = [22, 163, 74];

const hue = ([r, g, b]) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return null;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const saturation = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b, 1);

describe('the layer palette', () => {
  it('keeps the hazards out of the pins’ red, orange and green', () => {
    for (const kind of ['flood', 'landslide']) {
      for (const value of [1, 2, 3]) {
        const h = hue(pictureColour(kind, value));
        for (const pin of [RED, ORANGE, GREEN]) {
          const apart = Math.min(Math.abs(h - hue(pin)), 360 - Math.abs(h - hue(pin)));
          expect(apart, `${kind} ${value}`).toBeGreaterThan(60);
        }
      }
    }
  });

  it('has no loud colour among the soils', () => {
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (const colour of SOIL_PALETTE) expect(saturation(rgb(colour)), colour).toBeLessThan(0.6);
  });

  it('gives the phases of one soil series one colour, and the lake none', () => {
    const classes = [
      { series: 'Lipa', description: 'Lipa loam' },
      { series: 'Lipa', description: 'Lipa loam (Deep phase)' },
      { series: 'Bay', description: 'Bay clay' },
      { series: 'Water body (includes no data)', description: 'Water body (includes no data)' },
    ];
    const colours = soilColours(classes);
    expect(colours.size).toBe(2);
    expect(soilColourOf(colours, classes[0])).toBe(soilColourOf(colours, classes[1]));
    expect(soilColourOf(colours, classes[2])).not.toBe(soilColourOf(colours, classes[0]));
    expect(soilColourOf(colours, classes[3])).toBeNull();

    expect(layerKey('soil', { classes })).toEqual([
      { label: 'Lipa', colour: SOIL_PALETTE[0], detail: 'Lipa loam · Lipa loam (Deep phase)' },
      { label: 'Bay', colour: SOIL_PALETTE[1], detail: 'Bay clay' },
    ]);
  });

  it('keys a picture layer in today’s colours, whatever it was published in', () => {
    const key = layerKey('flood', { legend: [{ value: 3, label: 'High', colour: [204, 0, 0, 180] }] });
    expect(key).toEqual([{ label: 'High', value: 3, colour: 'rgba(8,48,107,1)' }]);
  });
});

describe('repainting a picture published in older colours', () => {
  const OLD = [
    { value: 1, label: 'Low', colour: [255, 255, 0, 150] },
    { value: 2, label: 'Medium', colour: [255, 153, 0, 170] },
    { value: 3, label: 'High', colour: [204, 0, 0, 180] },
  ];

  it('has nothing to do for a picture already in this palette', () => {
    const now = [1, 2, 3].map((value) => ({ value, colour: [...HAZARD_PALETTES.flood[value]] }));
    expect(repaintMap('flood', now).size).toBe(0);
  });

  it('repaints each level, a step or two off included, and leaves the clear pixels clear', () => {
    const map = repaintMap('flood', OLD);
    const pixels = new Uint8ClampedArray([
      255, 255, 0, 150,
      254, 152, 1, 170, // read back off by one, as a canvas does
      204, 0, 0, 180,
      0, 0, 0, 0,
      10, 200, 10, 255, // something else entirely: left alone
    ]);
    repaintPixels(pixels, map);
    expect([...pixels.slice(0, 4)]).toEqual(HAZARD_PALETTES.flood[1]);
    expect([...pixels.slice(4, 8)]).toEqual(HAZARD_PALETTES.flood[2]);
    expect([...pixels.slice(8, 12)]).toEqual(HAZARD_PALETTES.flood[3]);
    expect([...pixels.slice(12, 16)]).toEqual([0, 0, 0, 0]);
    expect([...pixels.slice(16, 20)]).toEqual([10, 200, 10, 255]);
  });
});

describe('CDRA hatching (20 October)', () => {
  it('gives each level its own pattern, denser the worse, crosshatched when high', () => {
    expect(HAZARD_HATCH[1].spacing).toBeGreaterThan(HAZARD_HATCH[2].spacing);
    expect(HAZARD_HATCH[3].cross).toBe(true);
    expect(HAZARD_HATCH[1].cross || HAZARD_HATCH[2].cross).toBe(false);
    expect(HAZARD_HATCH[1].tint).toBeLessThan(HAZARD_HATCH[3].tint);
  });

  it('draws a level in its own colour, in full', () => {
    const [r, g, b] = HAZARD_PALETTES.flood[3];
    expect(hatchOf('flood', 3)).toMatchObject({ colour: `rgb(${r},${g},${b})`, cross: true });
    expect(hatchOf('elevation', 1)).toBeNull();
    expect(hatchOf('flood', 4)).toBeNull();
  });

  it('masks one level out of a picture, a canvas step or two off and all', () => {
    const [lowR, lowG, lowB, lowA] = HAZARD_PALETTES.landslide[1];
    const [highR, highG, highB, highA] = HAZARD_PALETTES.landslide[3];
    const pixels = new Uint8ClampedArray([
      lowR, lowG, lowB, lowA,
      highR + 2, highG - 1, highB, highA, // read back a step off
      0, 0, 0, 0, // nothing mapped
      10, 200, 10, 255, // not a hazard colour at all
    ]);
    expect([...levelMask(pixels, 'landslide', 1)]).toEqual([255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...levelMask(pixels, 'landslide', 3)]).toEqual([0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('carries each level’s value into the legend, for its swatch', () => {
    const key = layerKey('flood', { legend: [{ value: 1, label: 'Low', colour: [0, 0, 0] }] });
    expect(key[0]).toMatchObject({ label: 'Low', value: 1 });
  });
});
