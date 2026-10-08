/**
 * Draws the three flower-phenology icons the public map's Tree Details tab uses.
 *
 * The leaf and fruit sets came as artwork; the flower set did not, so these are
 * drawn to match that family — one flat colour per state, a white cut-out for
 * detail, the same tall canvas — and the colour carries the state the way the
 * fruit set does (green unripe, crimson ripe).
 *
 * Shapes are defined once and emitted twice: as the SVGs that ship, and as a
 * PNG contact sheet to look at before committing to them.
 *
 *   node tools/make-flower-icons.mjs src/assets preview.png
 *
 * Replace these freely — if real artwork arrives, drop the PNGs in and point
 * src/lib/treeDetails.js at them instead.
 */
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const W = 200, H = 300;

const petal = (angle, color, dist = 52, rx = 30, ry = 46, cx = 100, cy = 112) => ({
  type: 'ellipse',
  cx: cx + dist * Math.sin((angle * Math.PI) / 180),
  cy: cy - dist * Math.cos((angle * Math.PI) / 180),
  rx, ry, rot: angle, fill: color,
});

const stem = (color) => [
  { type: 'ellipse', cx: 100, cy: 240, rx: 7, ry: 62, rot: 0, fill: color },
  { type: 'ellipse', cx: 133, cy: 222, rx: 16, ry: 32, rot: 52, fill: color },
];

function bloom(color, angles) {
  return [
    ...stem(color),
    ...angles.map((a) => petal(a, color)),
    { type: 'ellipse', cx: 100, cy: 112, rx: 25, ry: 25, rot: 0, fill: '#ffffff' },
    { type: 'ellipse', cx: 100, cy: 112, rx: 11, ry: 11, rot: 0, fill: color },
  ];
}

const ICONS = {
  Flower_Budding: {
    color: '#E887B4',
    shapes: [
      ...stem('#E887B4'),
      // sepals cupping a closed bud
      { type: 'ellipse', cx: 82, cy: 168, rx: 15, ry: 34, rot: -28, fill: '#E887B4' },
      { type: 'ellipse', cx: 118, cy: 168, rx: 15, ry: 34, rot: 28, fill: '#E887B4' },
      { type: 'ellipse', cx: 100, cy: 116, rx: 30, ry: 54, rot: 0, fill: '#E887B4' },
      // the white cut-out the rest of the set uses to suggest a fold
      { type: 'ellipse', cx: 100, cy: 112, rx: 4, ry: 40, rot: 0, fill: '#ffffff' },
    ],
  },
  Flower_FullBloom: {
    color: '#D81E8C',
    shapes: bloom('#D81E8C', [0, 72, 144, 216, 288]),
  },
  Flower_Fading: {
    color: '#B98BA8',
    shapes: [
      ...stem('#B98BA8'),
      // the lower petals have gone; what is left sits on top
      petal(288, '#B98BA8'), petal(0, '#B98BA8'), petal(72, '#B98BA8'),
      { type: 'ellipse', cx: 100, cy: 112, rx: 25, ry: 25, rot: 0, fill: '#ffffff' },
      { type: 'ellipse', cx: 100, cy: 112, rx: 11, ry: 11, rot: 0, fill: '#B98BA8' },
      // one petal on its way down, clear of the leaf on the other side
      { type: 'ellipse', cx: 55, cy: 236, rx: 21, ry: 33, rot: 72, fill: '#B98BA8' },
    ],
  },
};

// ---- SVG ----
const svgOf = (shapes) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n` +
  shapes
    .map((s) =>
      `  <ellipse cx="${s.cx.toFixed(1)}" cy="${s.cy.toFixed(1)}" rx="${s.rx}" ry="${s.ry}" fill="${s.fill}"` +
      (s.rot ? ` transform="rotate(${s.rot} ${s.cx.toFixed(1)} ${s.cy.toFixed(1)})"` : '') + ' />'
    )
    .join('\n') + '\n</svg>\n';

const outDir = process.argv[2];
for (const [name, icon] of Object.entries(ICONS)) {
  writeFileSync(`${outDir}/${name}.svg`, svgOf(icon.shapes));
}

// ---- PNG preview of the same shapes, 3 up ----
const names = Object.keys(ICONS);
const PAD = 20, PW = names.length * (W + PAD) + PAD, PH = H + 2 * PAD;
const px = Buffer.alloc(PW * PH * 3, 255);
const SS = 3; // supersample for smooth edges

function hit(shape, x, y) {
  const a = (-(shape.rot || 0) * Math.PI) / 180;
  const dx = x - shape.cx, dy = y - shape.cy;
  const rx = dx * Math.cos(a) - dy * Math.sin(a);
  const ry = dx * Math.sin(a) + dy * Math.cos(a);
  return (rx * rx) / (shape.rx * shape.rx) + (ry * ry) / (shape.ry * shape.ry) <= 1;
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

names.forEach((name, i) => {
  const ox = PAD + i * (W + PAD);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
        let color = [255, 255, 255];
        for (const shape of ICONS[name].shapes) if (hit(shape, fx, fy)) color = rgb(shape.fill);
        r += color[0]; g += color[1]; b += color[2];
      }
      const n = SS * SS, idx = ((y + PAD) * PW + ox + x) * 3;
      px[idx] = r / n; px[idx + 1] = g / n; px[idx + 2] = b / n;
    }
  }
});

const raw = Buffer.alloc((PW * 3 + 1) * PH);
for (let y = 0; y < PH; y++) {
  raw[y * (PW * 3 + 1)] = 0;
  px.copy(raw, y * (PW * 3 + 1) + 1, y * PW * 3, (y + 1) * PW * 3);
}
let table = null;
function crc(buf) {
  if (!table) { table = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; } }
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc(body) >>> 0);
  return Buffer.concat([len, body, cb]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(PW, 0); ihdr.writeUInt32BE(PH, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(process.argv[3], Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]));
console.log('icons:', names.join(', '));
