import { TILE_SIZE } from './ToolTile.jsx';

/**
 * One picture standing for a choice, the way Google Maps keeps its map types:
 * the current choice on top of a little stack, and the stack opened into a
 * row of pictures when it is clicked.
 *
 *   label     what is being chosen — "Base map", "Survey layer"
 *   options   [{ id, label, thumb: node, disabled?, note? }]
 *   current   the chosen option's id
 *   open      whether the row is showing; the map keeps one corner panel
 *             open at a time, so it owns this
 *
 * The current option is ringed and its name is written under its picture, so
 * it is never told by colour alone.
 */
export default function StackedPicker({ id, label, options, current, onChange, open, onOpenChange, children = null }) {
  const chosen = options.find((option) => option.id === current) ?? options[0];

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) onOpenChange(false);
      }}
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${chosen.label}. Choose another`}
        title={`${label}: ${chosen.label}`}
        className={`group relative block ${TILE_SIZE} transition active:scale-95`}
      >
        {/* The stack: two cards peeking out behind the top one. */}
        <span aria-hidden="true" className="absolute inset-0 -translate-x-[6px] -translate-y-[6px] rounded-xl bg-white shadow ring-1 ring-slate-300" />
        <span aria-hidden="true" className="absolute inset-0 -translate-x-[3px] -translate-y-[3px] rounded-xl bg-slate-50 shadow ring-1 ring-slate-300" />
        <span
          className={`absolute inset-0 overflow-hidden rounded-xl bg-white shadow-lg ${
            open ? 'ring-[3px] ring-slate-900' : 'ring-1 ring-slate-200 group-hover:ring-2 group-hover:ring-slate-400'
          }`}
        >
          {chosen.thumb}
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-center text-[10px] font-semibold text-white">
            {chosen.label}
          </span>
        </span>
      </button>

      {open && (
        <div
          id={id}
          className="absolute bottom-0 right-full mr-3 w-max max-w-[calc(100vw-7rem)] rounded-2xl border border-slate-200 bg-white p-2.5 shadow-2xl"
        >
          <p className="px-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
          <div role="radiogroup" aria-label={label} className="mt-1.5 flex flex-wrap gap-2">
            {options.map((option) => {
              const selected = option.id === chosen.id;
              return (
                <button
                  key={option.id ?? 'none'}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={option.disabled}
                  onClick={() => {
                    onChange(option.id);
                    onOpenChange(false);
                  }}
                  title={option.note ? `${option.label} — ${option.note}` : option.label}
                  className="w-[4.5rem] text-left disabled:cursor-not-allowed"
                >
                  <span
                    className={`relative block h-16 w-[4.5rem] overflow-hidden rounded-xl ${
                      selected ? 'ring-[3px] ring-lime-400' : 'ring-1 ring-slate-200 hover:ring-2 hover:ring-slate-400'
                    } ${option.disabled ? 'opacity-40 grayscale' : ''}`}
                  >
                    {option.thumb}
                  </span>
                  <span className={`mt-1 block text-[10.5px] font-semibold leading-tight ${option.disabled ? 'text-slate-400' : 'text-slate-700'}`}>
                    {option.label}
                  </span>
                  {option.note && <span className="block text-[9.5px] leading-tight text-slate-400">{option.note}</span>}
                </button>
              );
            })}
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
