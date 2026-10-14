import { BASEMAPS, thumbnailTile } from '../../lib/basemaps.js';

/**
 * Street or satellite, as two small pictures of the map itself.
 *
 * Google Maps' corner switcher, which is what the LGU offices already know: a
 * picture says "satellite" faster than a dropdown does, and the thumbnail is a
 * real tile of the real place. The current one is ringed in green and named in
 * words, so it is not told by colour alone.
 */
export default function BasemapSwitcher({ current, onChange, centre, className = '' }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} role="radiogroup" aria-label="Base map">
      {BASEMAPS.map((basemap) => {
        const selected = basemap.id === current;
        return (
          <button
            key={basemap.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(basemap.id)}
            title={basemap.longLabel}
            className={`group relative h-16 w-16 overflow-hidden rounded-xl bg-white shadow-lg transition sm:h-[4.5rem] sm:w-[4.5rem] ${
              selected ? 'ring-[3px] ring-lime-400' : 'ring-1 ring-slate-200 hover:ring-2 hover:ring-slate-400'
            }`}
          >
            <img
              src={thumbnailTile(basemap, centre)}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[10px] font-semibold text-white">
              {basemap.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
