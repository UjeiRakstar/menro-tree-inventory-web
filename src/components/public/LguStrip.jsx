import { useRef } from 'react';
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
 * The row of seals along the top of the dashboard.
 *
 * Picking one is how the whole page changes — the figures, the chart and the
 * map all follow it — so the seals are buttons in a tablist rather than
 * decoration, and the selected one is marked for a screen reader as well as by
 * its ring.
 *
 * A seal grows a little under the pointer. It is a transform rather than a size
 * change so nothing beside it shifts, and it is dropped for anyone who has
 * asked for less motion.
 */
export default function LguStrip({ selected, onSelect }) {
  const railRef = useRef(null);

  const scrollBy = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(240, rail.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className="relative flex items-center gap-1 sm:gap-2">
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        aria-label="Scroll to earlier cities and municipalities"
        className="shrink-0 rounded-full p-1 text-green-800 hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
      >
        <ChevronLeft size={24} />
      </button>

      <div
        ref={railRef}
        role="tablist"
        aria-label="Cities and municipalities of Laguna"
        className="flex flex-1 items-center gap-3 overflow-x-auto overflow-y-hidden scroll-smooth px-2 py-4 sm:gap-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {CHOICES.map((choice) => {
          const active = choice.name === selected;
          return (
            <button
              key={choice.label}
              type="button"
              role="tab"
              aria-selected={active}
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
                    active ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-14 w-14 opacity-80 group-hover:opacity-100 sm:h-16 sm:w-16'
                  }`}
                />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-[10px] font-bold text-green-800 sm:h-16 sm:w-16">
                  {choice.label}
                </span>
              )}
              <span className="sr-only">{choice.label}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => scrollBy(1)}
        aria-label="Scroll to later cities and municipalities"
        className="shrink-0 rounded-full p-1 text-green-800 hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
      >
        <ChevronRight size={24} />
      </button>
    </div>
  );
}
