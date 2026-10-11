import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/**
 * The ⓘ beside a figure, and the only place that figure is explained.
 *
 * There is no footnote anywhere on this site any more — the hint IS the
 * explanation — so a hint that gets cut off takes the explanation with it. And
 * it was being cut off everywhere: the figures sit in a grid with
 * `overflow-hidden` for its rounded corners and hairlines, both side panels
 * scroll their contents, and an absolutely-positioned tooltip inside any of
 * those is clipped to the box. A reader hovering a figure got the first line
 * and a half of a paragraph that says where the number came from.
 *
 * So the tooltip is rendered through a portal into document.body and positioned
 * fixed. `overflow` on an ancestor cannot clip a fixed element, and the body is
 * nobody's scroll container, so it escapes all three cases at once rather than
 * each of them being unpicked separately.
 *
 * It opens on hover, and stays open when clicked or tapped — a phone has no
 * hover, and a long explanation is something a reader may want to hold still
 * while they read it.
 */

/** How close to the window edge the tooltip may come. */
const GUTTER = 8;

/** Matches the w-72 below; needed before the tooltip exists to measure. */
const WIDTH = 288;

export default function InfoHint({ label, text, size = 14, className = '' }) {
  const [open, setOpen] = useState(false);
  // Opened by a click rather than a hover: it then stays until it is dismissed.
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef(null);
  const tipRef = useRef(null);
  const tipId = useId();

  /** Under the ⓘ, pulled back inside the window, and flipped up if it has to be. */
  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const height = tipRef.current?.offsetHeight ?? 0;

    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - WIDTH / 2, GUTTER),
      Math.max(GUTTER, window.innerWidth - WIDTH - GUTTER)
    );

    const below = rect.bottom + GUTTER;
    const flip = height > 0 && below + height > window.innerHeight - GUTTER;
    const top = flip ? Math.max(GUTTER, rect.top - height - GUTTER) : below;

    setPosition({ left, top });
  }, []);

  // Twice: once to put it somewhere before it can be seen, and again once it
  // has a height, which is the only way to know whether it has to flip up.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, text]);

  useEffect(() => {
    if (!open) return undefined;

    // Scrolling the page moves the ⓘ out from under its own tooltip, so the
    // tooltip goes rather than drifting off on its own.
    const dismiss = () => {
      setOpen(false);
      setPinned(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') dismiss();
    };
    const onPointerDown = (event) => {
      if (buttonRef.current?.contains(event.target)) return;
      dismiss();
    };

    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const tooltip =
    open && typeof document !== 'undefined'
      ? createPortal(
          <span
            ref={tipRef}
            id={tipId}
            role="tooltip"
            style={{ left: position.left, top: position.top, width: WIDTH }}
            className="pointer-events-none fixed z-[2000] rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-normal leading-snug text-white shadow-xl"
          >
            {text}
          </span>,
          document.body
        )
      : null;

  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => {
          const next = !pinned;
          setPinned(next);
          setOpen(next);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        className="rounded-full text-slate-400 transition hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
      >
        <Info size={size} />
      </button>
      {tooltip}
    </span>
  );
}
