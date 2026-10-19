/**
 * A picture made small enough to keep, in the browser, before it is uploaded
 * (decided 19 October): a logo, a seal or an officer's photo may be any size;
 * what is stored — and what anyone downloads later — is the resized one.
 *
 *   shrinkImage(file, { maxSide, maxBytes })
 *
 * A picture already within both limits goes up as it is. Otherwise it is
 * scaled so its longer side is at most `maxSide` pixels, in its own format
 * (PNG and WebP keep their transparency — seals have it), and scaled again,
 * a fifth smaller each time, until it is under `maxBytes`.
 */
export const LIMITS = Object.freeze({
  logo: { maxSide: 1024, maxBytes: 2 * 1024 * 1024 },
  photo: { maxSide: 800, maxBytes: 1024 * 1024 },
  news: { maxSide: 1920, maxBytes: 2 * 1024 * 1024 },
});

/** The largest file anyone may choose, before it is resized. */
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** The size to draw at: the longer side at most `maxSide`, never larger than the original. */
export function fitWithin(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decodeInBrowser(file) {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

async function encodeInBrowser(image, { width, height }, type, quality) {
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function shrinkImage(file, { maxSide, maxBytes }, { decode = decodeInBrowser, encode = encodeInBrowser } = {}) {
  if (!TYPES.includes(file.type)) throw new Error('A picture is a PNG, JPEG or WebP.');
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error('That picture is over 25 MB, too large even to resize.');

  const image = await decode(file);
  if (!image) {
    // This browser cannot redraw it: fine if it is small enough already.
    if (file.size <= maxBytes) return file;
    throw new Error('This browser could not resize that picture. Try a smaller one.');
  }
  if (file.size <= maxBytes && Math.max(image.width, image.height) <= maxSide) return file;

  let side = Math.min(maxSide, Math.max(image.width, image.height));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const size = fitWithin(image.width, image.height, side);
    const blob = await encode(image, size, file.type, file.type === 'image/png' ? undefined : 0.85);
    if (!blob) break;
    if (blob.size <= maxBytes) {
      // Some browsers cannot write WebP and hand back PNG: name it for what it is.
      const type = blob.type || file.type;
      const name = file.name.replace(/\.[^.]+$/, '') + '.' + (EXTENSIONS[type] ?? 'png');
      return new File([blob], name, { type });
    }
    side = Math.round(side * 0.8);
  }
  throw new Error('That picture could not be made small enough. Try a smaller one.');
}
