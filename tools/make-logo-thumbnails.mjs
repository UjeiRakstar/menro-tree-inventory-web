/**
 * Shrinks the LGU and partner seals to something a web page can carry.
 *
 * The originals are print-resolution — 160 MB across the thirty LGUs, one of
 * them 8.4 MB on its own — and the dashboard shows all thirty at once. These
 * are never drawn larger than about 80 CSS pixels, so 192px square covers a
 * retina screen with room to spare.
 *
 *   node tools/make-logo-thumbnails.mjs
 *
 * Re-run it when a seal is added or replaced; the output is committed so a
 * normal build needs neither sharp nor the originals.
 */
import { readdir, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '..', 'src', 'assets');
const OUT = join(SOURCE, 'lgu-thumbs');
const SIZE = 192;

/**
 * The three partner seals are also shown large on the About page — 144 CSS
 * pixels, so 384 covers a retina screen there. They are the only ones drawn
 * that big; the other thirty never leave the dashboard's rail.
 */
const LARGE = ['PGL_LGU_logo.png', 'PGENRO_LGU_logo.png', 'LSPU_LGU_logo.png'];
const LARGE_SIZE = 384;

await mkdir(OUT, { recursive: true });
await mkdir(join(OUT, 'large'), { recursive: true });

const files = (await readdir(SOURCE)).filter((name) => /_LGU_logo\.(png|jpe?g)$/i.test(name));
let before = 0;
let after = 0;

for (const file of files) {
  const from = join(SOURCE, file);
  const to = join(OUT, file.replace(/\.(png|jpe?g)$/i, '.png'));

  await sharp(from)
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: true })
    .toFile(to);

  before += (await stat(from)).size;
  after += (await stat(to)).size;

  if (LARGE.includes(file)) {
    const bigger = join(OUT, 'large', file);
    await sharp(from)
      .resize(LARGE_SIZE, LARGE_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(bigger);
    after += (await stat(bigger)).size;
  }
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(`${files.length} seals: ${mb(before)} MB -> ${mb(after)} MB`);
