import L from 'leaflet';
import { iconForPinColor, HEX_FOR_COLOR } from './markerIcons.js';
import { PIN_COLOR } from './pinColor.js';

describe('markerIcons', () => {
  const allColors = [
    PIN_COLOR.RED,
    PIN_COLOR.ORANGE,
    PIN_COLOR.YELLOW,
    PIN_COLOR.GREEN,
  ];

  it.each(allColors)('returns a Leaflet DivIcon for %s', (color) => {
    const icon = iconForPinColor(color);
    expect(icon).toBeTruthy();
    expect(icon).toBeInstanceOf(L.DivIcon);
  });

  it('gives every pin colour its own hex, with none shared', () => {
    // Counted from PIN_COLOR rather than hard-coded: a new pin colour should
    // fail this test for the right reason — a missing or duplicated hex.
    const hexes = Object.values(HEX_FOR_COLOR);
    expect(hexes).toHaveLength(Object.keys(PIN_COLOR).length);
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it('falls back to the Green icon for an unknown color without throwing', () => {
    const unknown = iconForPinColor('bogus');
    const green = iconForPinColor(PIN_COLOR.GREEN);
    expect(unknown).toBe(green);
  });

  it('returns the same singleton instance for repeated calls with the same color', () => {
    expect(iconForPinColor(PIN_COLOR.RED)).toBe(iconForPinColor(PIN_COLOR.RED));
    expect(iconForPinColor(PIN_COLOR.ORANGE)).toBe(
      iconForPinColor(PIN_COLOR.ORANGE)
    );
  });

  it('each icon HTML embeds its hex color', () => {
    allColors.forEach((color) => {
      const icon = iconForPinColor(color);
      // L.DivIcon exposes its options via .options
      expect(icon.options.html).toContain(HEX_FOR_COLOR[color]);
    });
  });
});
