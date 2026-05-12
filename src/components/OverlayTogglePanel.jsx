const PAGASA_LABEL = 'PAGASA DRR Overlay';
const UHI_LABEL = 'Urban Heat Island Map';

/**
 * Glassmorphism overlay toggle panel pinned to the map's top-right corner.
 * Hosts two independent toggles (PAGASA DRR, Urban Heat Island) as controlled
 * components. The parent owns the toggle state and provides callbacks.
 */
export default function OverlayTogglePanel({
  pagasaPressed,
  uhiPressed,
  onPagasaToggle,
  onUhiToggle,
}) {
  return (
    <div className="absolute top-4 right-4 z-[500] flex flex-col gap-2">
      <OverlayButton
        label={PAGASA_LABEL}
        pressed={pagasaPressed}
        onClick={() => onPagasaToggle(!pagasaPressed)}
      />
      <OverlayButton
        label={UHI_LABEL}
        pressed={uhiPressed}
        onClick={() => onUhiToggle(!uhiPressed)}
      />
    </div>
  );
}

function OverlayButton({ label, pressed, onClick }) {
  const base =
    'backdrop-blur-md bg-white/30 border border-white/40 text-slate-900 shadow-lg rounded-lg px-4 py-2 text-sm font-medium transition';
  const pressedTreatment = pressed
    ? 'ring-2 ring-sky-500 bg-sky-500/40 text-white'
    : '';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`${base} ${pressedTreatment}`.trim()}
    >
      {label}
    </button>
  );
}
