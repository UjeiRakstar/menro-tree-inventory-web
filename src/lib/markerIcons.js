import L from 'leaflet';
import { PIN_COLOR } from './pinColor.js';

/**
 * Tailwind-derived hex values for each Pin_Color. Hex fallbacks are used
 * inside the divIcon HTML because Leaflet's marker pane is mounted outside
 * Tailwind's JIT content scan, so class-based backgrounds would not apply.
 *
 * Grey   #94a3b8  (slate-400)  crowdsourced / unverified
 * Red    #dc2626  (red-600)    unassigned hazard — life safety
 * Orange #ea580c  (orange-600) dispatched hazard
 * Yellow #eab308  (yellow-500) cutting permit
 * Green  #16a34a  (green-600)  healthy tree
 */
export const HEX_FOR_COLOR = Object.freeze({
  [PIN_COLOR.GREY]: '#94a3b8',
  [PIN_COLOR.RED]: '#dc2626',
  [PIN_COLOR.ORANGE]: '#ea580c',
  [PIN_COLOR.YELLOW]: '#eab308',
  [PIN_COLOR.GREEN]: '#16a34a',
});

const buildDivIcon = (hex, ariaColor) =>
  L.divIcon({
    className: 'tree-pin-icon',
    html:
      `<span role="img" aria-label="${ariaColor} pin" ` +
      `style="display:block;width:26px;height:26px;border-radius:9999px;` +
      `background:${hex};border:2px solid white;` +
      `box-shadow:0 2px 4px rgba(0,0,0,0.3);"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });

const ICONS = Object.freeze({
  [PIN_COLOR.GREY]: buildDivIcon(HEX_FOR_COLOR[PIN_COLOR.GREY], 'grey'),
  [PIN_COLOR.RED]: buildDivIcon(HEX_FOR_COLOR[PIN_COLOR.RED], 'red'),
  [PIN_COLOR.ORANGE]: buildDivIcon(HEX_FOR_COLOR[PIN_COLOR.ORANGE], 'orange'),
  [PIN_COLOR.YELLOW]: buildDivIcon(HEX_FOR_COLOR[PIN_COLOR.YELLOW], 'yellow'),
  [PIN_COLOR.GREEN]: buildDivIcon(HEX_FOR_COLOR[PIN_COLOR.GREEN], 'green'),
});

/**
 * Return the pre-built Leaflet divIcon for a given Pin_Color. Unknown colors
 * fall back to the Green icon so the map never renders Leaflet's default
 * blue teardrop (Requirement 5.5).
 *
 * @param {string} color
 * @returns {L.DivIcon}
 */
export function iconForPinColor(color) {
  return ICONS[color] ?? ICONS[PIN_COLOR.GREEN];
}


/**
 * Build a biodiversity divIcon — colored circle with an emoji icon.
 * Category determines background color, biodiversity_status determines icon.
 * Endemic = 🌳, Invasive = ⚠️
 */
export function buildBiodiversityIcon(hex, isInvasive = false) {
  const emoji = isInvasive ? '⚠️' : '🌳';
  return L.divIcon({
    className: 'tree-pin-icon',
    html:
      `<span role="img" aria-label="${isInvasive ? 'invasive' : 'endemic'} pin" ` +
      `style="display:flex;align-items:center;justify-content:center;` +
      `width:30px;height:30px;border-radius:9999px;` +
      `background:${hex};border:2px solid white;` +
      `box-shadow:0 2px 4px rgba(0,0,0,0.3);font-size:14px;">${emoji}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
}
