/**
 * One square in the map's corner column.
 *
 * Legend, Layers, Draw, and the two basemap pictures are all this size, so the
 * column reads as one set of tools rather than five things that happen to be
 * near each other. The size lives here and the basemap buttons use it too.
 */
export const TILE_SIZE = 'h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]';

export default function ToolTile({
  icon: Icon,
  label,
  // The fuller name a screen reader and a hover give, where the two-word
  // label under the icon is not enough on its own: "Draw Map" → "Draw and
  // measure an area".
  description = undefined,
  onClick,
  pressed = undefined,
  expanded = undefined,
  controls = undefined,
  tone = 'white',
  className = '',
}) {
  const colours =
    tone === 'yellow'
      ? 'bg-yellow-300 text-slate-900 hover:bg-yellow-200'
      : 'bg-white text-slate-700 hover:bg-slate-50';
  const active = pressed || expanded;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={description}
      title={description}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      className={`flex ${TILE_SIZE} flex-col items-center justify-center gap-1 rounded-xl shadow-lg transition active:scale-95 ${colours} ${
        active ? 'ring-[3px] ring-slate-900' : 'ring-1 ring-slate-200'
      } ${className}`}
    >
      <Icon size={24} aria-hidden="true" />
      <span className="text-[10px] font-semibold leading-none">{label}</span>
    </button>
  );
}
