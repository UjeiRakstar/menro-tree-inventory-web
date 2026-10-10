import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MUNICIPALITY_LIST } from '../../lib/lagunaBoundaries.js';
import { PROVINCE_LOGO, logoFor } from '../../lib/lguLogos.js';

/** The province, then its thirty cities and municipalities. */
const PROVINCE = { name: '', label: 'All of Laguna', logo: PROVINCE_LOGO };

const CHOICES = [
  PROVINCE,
  ...MUNICIPALITY_LIST.map((lgu) => ({ name: lgu.name, label: lgu.label, logo: logoFor(lgu.name) })),
];

/**
 * The list is laid out three times over, and the middle copy is the real one.
 *
 * Scrolling off either end lands in a copy, and the scroll position is then
 * moved back by exactly one copy's width — which looks like nothing happened,
 * and is what makes the rail endless in both directions. The outer copies are
 * hidden from screen readers and kept out of the tab order, so there are still
 * only thirty-one things here as far as anything but the eye is concerned.
 */
const COPIES = 3;
const REAL_COPY = 1;

/** Pixels per frame while the pointer rests on an arrow. */
const DRIFT_SPEED = 6;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * The row of seals along the top of the dashboard.
 *
 * Picking one is how the whole page changes — the figures, the chart and the
 * map all follow it — so the seals are buttons in a tablist rather than
 * decoration, and the selected one is marked for a screen reader as well as by
 * its ring.
 *
 * A seal grows a little under the pointer. It is a transform rather than a size
 * change so nothing beside it shifts, and it is dropped for anyone who has
 * asked for less motion. Resting the pointer on either arrow drifts the rail
 * that way without a click.
 */
export default function LguStrip({ selected, onSelect }) {
  const railRef = useRef(null);
  /** The width of one copy of the list, measured rather than divided. */
  const strideRef = useRef(0);
  /** Set while a paging glide is in flight, so the wrap does not cut it short. */
  const pagingRef = useRef(false);
  const pagingTimer = useRef(null);
  const driftFrame = useRef(0);

  /**
   * One copy's width, taken from where the same seal sits in the next copy.
   *
   * Measured, because the copies are not something to divide scrollWidth by:
   * the selected seal is larger than the rest, and a third of the scroll width
   * leaves the rail a few pixels adrift on every wrap.
   */
  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return 0;
    const first = rail.children[0];
    const next = rail.children[CHOICES.length];
    if (!first || !next) return 0;
    strideRef.current = next.offsetLeft - first.offsetLeft;
    return strideRef.current;
  }, []);

  /** Bring the scroll position back into the middle copy. */
  const wrap = useCallback(() => {
    const rail = railRef.current;
    const stride = strideRef.current;
    // jsdom has no layout, so there is nothing to wrap and nothing to break.
    if (!rail || !stride || pagingRef.current) return;
    if (rail.scrollLeft < stride * 0.5) rail.scrollLeft += stride;
    else if (rail.scrollLeft > stride * 1.5) rail.scrollLeft -= stride;
  }, []);

  // Start in the middle copy, so there is as much rail to the left as to the
  // right. Re-measured when the selection changes, because the selected seal
  // is bigger than the others and every copy grows with it.
  useLayoutEffect(() => {
    const rail = railRef.current;
    const stride = measure();
    if (!rail || !stride) return;
    if (rail.scrollLeft < stride * 0.5 || rail.scrollLeft > stride * 1.5) {
      rail.scrollLeft = stride * REAL_COPY;
    }
  }, [measure, selected]);

  useEffect(() => {
    const onResize = () => measure();
    globalThis.addEventListener?.('resize', onResize);
    return () => globalThis.removeEventListener?.('resize', onResize);
  }, [measure]);

  useEffect(
    () => () => {
      cancelAnimationFrame(driftFrame.current);
      clearTimeout(pagingTimer.current);
    },
    []
  );

  /**
   * Drift while the pointer rests on an arrow.
   *
   * The scroll position is nudged by hand each frame rather than handed to a
   * smooth scroll: a smooth scroll in flight is cancelled the moment the wrap
   * moves the rail, which would make the seam stutter.
   */
  const startDrift = (direction) => {
    if (globalThis.matchMedia?.(REDUCED_MOTION).matches) return;
    cancelAnimationFrame(driftFrame.current);
    const step = () => {
      const rail = railRef.current;
      if (!rail) return;
      rail.scrollLeft += direction * DRIFT_SPEED;
      wrap();
      driftFrame.current = requestAnimationFrame(step);
    };
    driftFrame.current = requestAnimationFrame(step);
  };

  const stopDrift = () => cancelAnimationFrame(driftFrame.current);

  /** A click moves a screenful, wrapping first if the glide would cross a seam. */
  const page = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const stride = measure();
    const distance = direction * Math.max(240, rail.clientWidth * 0.8);

    if (stride) {
      // Wrap before the glide rather than during it, so the glide survives.
      const landing = rail.scrollLeft + distance;
      if (landing < 0) rail.scrollLeft += stride;
      else if (landing > stride * 2) rail.scrollLeft -= stride;

      pagingRef.current = true;
      clearTimeout(pagingTimer.current);
      pagingTimer.current = setTimeout(() => {
        pagingRef.current = false;
        wrap();
      }, 600);
    }

    rail.scrollBy?.({ left: distance, behavior: 'smooth' });
  };

  const arrow = (direction, Icon, label) => (
    <button
      type="button"
      onClick={() => page(direction)}
      onMouseEnter={() => startDrift(direction)}
      onMouseLeave={stopDrift}
      onFocus={() => startDrift(direction)}
      onBlur={stopDrift}
      aria-label={label}
      className="shrink-0 rounded-full p-2 text-green-800 transition hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
    >
      <Icon size={24} />
    </button>
  );

  return (
    <div className="relative flex items-center gap-1 sm:gap-2">
      {arrow(-1, ChevronLeft, 'Scroll to earlier cities and municipalities')}

      <div
        ref={railRef}
        role="tablist"
        aria-label="Cities and municipalities of Laguna"
        onScroll={wrap}
        className="flex flex-1 items-center gap-3 overflow-x-auto overflow-y-hidden px-2 py-2.5 sm:gap-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {Array.from({ length: COPIES }).flatMap((_, copy) =>
          CHOICES.map((choice) => {
            const active = choice.name === selected;
            const clone = copy !== REAL_COPY;
            return (
              <button
                key={`${copy}-${choice.label}`}
                type="button"
                role={clone ? undefined : 'tab'}
                aria-selected={clone ? undefined : active}
                aria-hidden={clone || undefined}
                tabIndex={clone ? -1 : undefined}
                onClick={() => onSelect(choice.name)}
                title={choice.label}
                className={`group shrink-0 transform-gpu rounded-full transition-transform duration-300 ease-out hover:scale-110 focus-visible:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${
                  active ? 'ring-4 ring-green-600' : 'ring-1 ring-slate-200 hover:ring-green-400'
                }`}
              >
                {choice.logo ? (
                  <img
                    src={choice.logo}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className={`rounded-full object-contain transition-all duration-300 ease-out motion-reduce:transition-none ${
                      active
                        ? 'h-14 w-14 sm:h-16 sm:w-16'
                        : 'h-10 w-10 opacity-80 group-hover:opacity-100 sm:h-12 sm:w-12'
                    }`}
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-[9px] font-bold text-green-800 sm:h-12 sm:w-12">
                    {choice.label}
                  </span>
                )}
                {!clone && <span className="sr-only">{choice.label}</span>}
              </button>
            );
          })
        )}
      </div>

      {arrow(1, ChevronRight, 'Scroll to later cities and municipalities')}
    </div>
  );
}
