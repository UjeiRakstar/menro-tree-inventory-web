import { describe, it, expect } from 'vitest';
import { HAZARD_PALETTES, SOIL_PALETTE, layerKey, pictureColour, repaintMap, repaintPixels, soilColourOf, soilColours } from './palette.js';

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
    expect(key).toEqual([{ label: 'High', colour: 'rgba(8,48,107,1)' }]);
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
