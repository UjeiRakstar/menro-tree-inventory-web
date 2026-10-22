/**
 * A Cloudinary photo at the size it is shown (22 October).
 *
 * The field app uploads full-size phone photos — 2–4 MB each. Cloudinary
 * resizes on the fly when the transformation is in the address, after
 * /image/upload/: `w_400` for the width, `c_limit` never to enlarge, and
 * `f_auto,q_auto` for the lightest format and quality the browser takes. A
 * list of thumbnails then costs kilobytes, not megabytes.
 *
 * Any other address is returned as it is.
 */
const CLOUDINARY_UPLOAD = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

export function sizedPhoto(url, width) {
  const address = String(url ?? '').trim();
  const match = address.match(CLOUDINARY_UPLOAD);
  if (!match || !width) return address;
  return `${match[1]}w_${Math.round(width)},c_limit,f_auto,q_auto/${match[2]}`;
}
