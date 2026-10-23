import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tipPosition } from './tipPlacement.js';

/** Matches the w-56 below; needed before the tooltip exists to measure. */
const WIDTH = 224;

/**
 * A tooltip for anything that is not an ⓘ: a trait badge, a phenology icon.
 *
 * It used to hang absolutely inside its trigger, and the tree panel scrolls,
 * so near the bottom of the panel the explanation was cut off — the same fault
 * InfoHint was rebuilt for. This is drawn the same way: through a portal into
 * document.body, positioned fixed, where no ancestor's overflow can clip it.
 *
 * It opens while the pointer is over the trigger or focus is inside it, and
 * goes when the page scrolls, since the trigger moves out from under it.
 */
export default function HoverTip({ tip, className = '', children }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const anchorRef = useRef(null);
  const tipRef = useRef(null);
  const tipId = useId();

  // Twice, as InfoHint does: once to place it, again once it has a height.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    setPosition(tipPosition(anchorRef.current.getBoundingClientRect(), tipRef.current?.offsetHeight ?? 0, WIDTH));
  }, [open, tip]);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = () => setOpen(false);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  return (
    <span
      ref={anchorRef}
      className={className}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tipRef}
            id={tipId}
            role="tooltip"
            style={{ left: position.left, top: position.top, width: WIDTH }}
            className="pointer-events-none fixed z-[2000] rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-normal not-italic leading-snug text-white shadow-lg"
          >
            {tip}
          </span>,
          document.body
        )}
    </span>
  );
}
