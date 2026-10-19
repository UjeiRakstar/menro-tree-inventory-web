import { describe, it, expect, vi } from 'vitest';
import { LIMITS, fitWithin, shrinkImage } from './shrinkImage.js';

const MB = 1024 * 1024;
const fileOf = (bytes, type = 'image/jpeg', name = 'seal.jpg') => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
};
/** A stand-in canvas: the output's bytes grow with the pixels drawn. */
const encoder = (bytesPerPixel) =>
  vi.fn(async (image, { width, height }, type) => ({ size: width * height * bytesPerPixel, type, slice: () => new Blob(['x']) }));

describe('pictures resized before they are kept', () => {
  it('fits the longer side within the limit, and never enlarges', () => {
    expect(fitWithin(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000, 800)).toEqual({ width: 600, height: 800 });
    expect(fitWithin(300, 200, 1024)).toEqual({ width: 300, height: 200 });
  });

  it('keeps a picture already within both limits as it is', async () => {
    const small = fileOf(200 * 1024);
    const encode = encoder(1);
    const kept = await shrinkImage(small, LIMITS.logo, { decode: async () => ({ width: 600, height: 600 }), encode });
    expect(kept).toBe(small);
    expect(encode).not.toHaveBeenCalled();
  });

  it('resizes a 6 MB photo to the limit, in its own format', async () => {
    const encode = encoder(0.5);
    const out = await shrinkImage(fileOf(6 * MB, 'image/jpeg', 'me.jpeg'), LIMITS.photo, {
      decode: async () => ({ width: 4000, height: 3000 }),
      encode,
    });
    expect(encode.mock.calls[0][1]).toEqual({ width: 800, height: 600 });
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('me.jpg');
  });

  it('keeps a transparent seal a PNG, and goes smaller until it is under the limit', async () => {
    const encode = encoder(3);
    const out = await shrinkImage(fileOf(5 * MB, 'image/png', 'seal.png'), LIMITS.logo, {
      decode: async () => ({ width: 3000, height: 3000 }),
      encode,
    });
    // 1024² × 3 bytes is over 2 MB; a fifth smaller, 819² × 3, is under.
    expect(encode.mock.calls.map((call) => call[1].width)).toEqual([1024, 819]);
    expect(out.type).toBe('image/png');
  });

  it('refuses what is not a picture, and what is too large even to resize', async () => {
    await expect(shrinkImage(fileOf(1000, 'application/pdf', 'a.pdf'), LIMITS.logo)).rejects.toThrow(/PNG, JPEG or WebP/);
    await expect(shrinkImage(fileOf(30 * MB), LIMITS.logo)).rejects.toThrow(/over 25 MB/);
  });

  it('sends a small picture as it is where the browser cannot redraw it, and says so for a large one', async () => {
    const small = fileOf(MB / 2);
    expect(await shrinkImage(small, LIMITS.photo, { decode: async () => null })).toBe(small);
    await expect(shrinkImage(fileOf(3 * MB), LIMITS.photo, { decode: async () => null })).rejects.toThrow(/could not resize/);
  });
});
