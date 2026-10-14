import { X } from 'lucide-react';
import { LIVE_LAYERS, PGENRO_OVERLAYS } from '../../lib/mapLayers.js';
import { ProvisionalTag } from '../public/Provisional.jsx';

/**
 * Which layers are drawn over the base map.
 *
 * The ones that exist switch on and off. The PGENRO survey layers are listed
 * underneath, disabled, with where each will come from — a promise the office
 * can see, rather than a feature nobody knows is coming.
 */
export default function LayersPanel({ id, layers, onToggle, onClose }) {
  return (
    <div
      id={id}
      role="dialog"
      aria-label="Map layers"
      className="w-72 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-2xl"
    >
      <div className="flex items-start gap-2">
        <h2 className="flex-1 text-sm font-bold">Layers</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close layers"
          className="-mr-1 -mt-1 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={16} />
        </button>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
        Drawn over the base map. Street or satellite is chosen with the pictures below.
      </p>

      <fieldset className="mt-3">
        <legend className="text-[10px] font-bold uppercase tracking-wider text-slate-500">On this map</legend>
        <ul className="mt-1.5 space-y-1.5">
          {LIVE_LAYERS.map((layer) => (
            <li key={layer.id}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={Boolean(layers[layer.id])}
                  onChange={() => onToggle(layer.id)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-600"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-800">{layer.label}</span>
                  <span className="block text-[10.5px] text-slate-500">{layer.detail}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="mt-3 border-t border-slate-100 pt-3">
        <legend className="sr-only">From the PGENRO survey uploads</legend>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">From PGENRO uploads</p>
        <ul className="mt-1.5 space-y-1.5">
          {PGENRO_OVERLAYS.map((overlay) => (
            <li key={overlay.id} className="flex items-start gap-2.5 px-1.5 py-1">
              <input
                type="checkbox"
                disabled
                aria-describedby={`overlay-${overlay.id}-why`}
                aria-label={overlay.label}
                className="mt-0.5 h-4 w-4 rounded border-slate-200 bg-slate-100"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-400">{overlay.label}</span>
                <span id={`overlay-${overlay.id}-why`} className="block text-[10.5px] text-slate-400">
                  {overlay.source} — not uploaded yet
                </span>
              </span>
              <ProvisionalTag kind="awaiting" compact className="mt-1" />
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}
