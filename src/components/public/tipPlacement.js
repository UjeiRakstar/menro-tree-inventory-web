/**
 * Where a portalled tooltip goes: under what it explains, pulled back inside
 * the window, and flipped up when there is no room below. Shared by InfoHint
 * (the ⓘ) and HoverTip (a badge or an icon), both drawn fixed in
 * document.body so no scrolling panel can cut them off.
 */

/** How close to the window edge the tooltip may come. */
export const GUTTER = 8;

/**
 * @param {DOMRect} rect     what the tooltip explains
 * @param {number}  height   the tooltip's height, 0 before it has one
 * @param {number}  width    the tooltip's width
 */
export function tipPosition(rect, height, width) {
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - width / 2, GUTTER),
    Math.max(GUTTER, window.innerWidth - width - GUTTER)
  );

  const below = rect.bottom + GUTTER;
  const flip = height > 0 && below + height > window.innerHeight - GUTTER;
  const top = flip ? Math.max(GUTTER, rect.top - height - GUTTER) : below;

  return { left, top };
}
