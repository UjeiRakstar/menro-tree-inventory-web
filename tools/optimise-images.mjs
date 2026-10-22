/**
 * Shrinks the three heavy images the seal thumbnailer does not cover.
 *
 *   node tools/optimise-images.mjs
 *
 * Between them they were 8.1 MB of an 17 MB build, and none of them is ever
 * drawn anywhere near its own size:
 *
 *   NAMRIA_logo.svg        3.4 MB  a traced bitmap wrapped in SVG, drawn 64px
 *                                  tall. An SVG is only worth its weight when
 *                                  it is really vector; this one is a photo of
 *                                  a seal in a vector coat, so it becomes a PNG
 *                                  at the size it is actually shown.
 *   Mapping Feature SS.png 2.7 MB  a 1920x1668 screenshot shown inside a 500px
 *                                  laptop mock-up.
 *   forestcover.avif       2.0 MB  a 4032x3024 phone photo behind the About
 *                                  page's opening section, under a gradient.
 *
 * Each target is twice the largest size the layout ever gives it, which covers
 * a retina screen. The output is committed, so a normal build needs neither
 * sharp nor the originals — and the originals stay in the repo, because they
 * are the only copies at full resolution.
 *
 * Re-run it if one of the three is replaced.
 */
import { mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '..', 'src', 'assets');
const OUT = join(SOURCE, 'optimised');

/** A flat-coloured icon or seal: a palette PNG keeps its edges and its alpha. */
const flat = (image) => image.png({ compressionLevel: 9, palette: true });

/**
 * `width` or `height` is whichever one the layout fixes — the seals and icons
 * are sized by height in a row, the pictures by width.
 */
const JOBS = [
  {
    from: 'NAMRIA_logo.svg',
    to: 'NAMRIA_logo.png',
    height: 160,
    // Rasterised at 4x so the trace's edges survive being resized down.
    density: 288,
    encode: flat,
  },
  {
    from: 'Mapping Feature SS.png',
    to: 'Mapping-Feature.webp',
    width: 1000,
    encode: (image) => image.webp({ quality: 82 }),
  },
  {
    from: 'forestcover.avif',
    to: 'forestcover.avif',
    width: 2048,
    encode: (image) => image.avif({ quality: 50 }),
  },
  // The Community page's hero (22 October), and the Tree Database's: behind
  // a gradient, full width, as About's forest is.
  {
    from: 'community-hero.jpg',
    to: 'community-hero.avif',
    width: 2048,
    encode: (image) => image.avif({ quality: 50 }),
  },
  {
    from: 'Aerial.jpg',
    to: 'aerial.avif',
    width: 2048,
    encode: (image) => image.avif({ quality: 50 }),
  },

  // The one heavy seal in the row of data sources on the About page. The
  // others there are already small enough to leave alone.
  { from: 'BSWM_logo.png', to: 'BSWM_logo.png', height: 160, encode: flat },

  /*
   * The badges on the tree panel, and the phenology icons under them.
   *
   * Every one of these is drawn at 44 CSS pixels and several arrived at print
   * resolution — one of them at half a megabyte for a 44px circle. 128 square
   * covers a retina screen with room over.
   */
  ...[
    'endemic_icon.png',
    'invasive_icon.png',
    'fruit_tree.png',
    'ornamental_tree.png',
    'timber_tree.png',
    'crowdsource_icon.png',
    'datagather_icon.png',
    'Leaf_Peak.png',
    'Leaf_ColorChange.png',
    'Leaf_Shedding.png',
    'Leaf_Budding.png',
    'Fruiting_Unripe.png',
    'Fruiting_Ripe.png',
    'Fruiting_Splitting.png',
  ].map((file) => ({ from: file, to: file, width: 128, height: 128, encode: flat })),
];

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

await mkdir(OUT, { recursive: true });

let before = 0;
let after = 0;

for (const job of JOBS) {
  const from = join(SOURCE, job.from);
  const to = join(OUT, job.to);

  const image = sharp(from, job.density ? { density: job.density } : undefined).resize({
    width: job.width,
    height: job.height,
    fit: 'inside',
    withoutEnlargement: true,
  });

  await job.encode(image).toFile(to);

  const [source, result] = await Promise.all([stat(from), stat(to)]);
  before += source.size;
  after += result.size;
  const saved = (100 * (1 - result.size / source.size)).toFixed(0);
  console.log(`${job.from}  ${kb(source.size)} -> ${job.to}  ${kb(result.size)}  (-${saved}%)`);
}

console.log(`\n${kb(before)} -> ${kb(after)} across ${JOBS.length} images.`);
