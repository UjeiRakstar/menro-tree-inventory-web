import { X } from 'lucide-react';
import { LIVE_LAYERS, PGENRO_OVERLAYS } from '../../lib/mapLayers.js';
import { ProvisionalTag } from '../public/Provisional.jsx';

/**
 * Which layers are drawn over the base map.
 *
 * The ones that exist switch on and off. The PGENRO survey layers are listed
 * underneath: those PGENRO has uploaded (`available`, from useMapLayers)
 * switch on, with their colour key; the rest stay disabled, saying where each
 * will come from — a promise the office can see, rather than a feature nobody
 * knows is coming.
 */
function OverlayKey({ meta }) {
  const items =
    meta?.kind === 'soil'
      ? (meta.classes ?? []).map((c) => ({ label: c.description, colour: c.colour }))
      : (meta?.legend ?? []).map((l) => ({ label: l.label, colour: `rgba(${l.colour.join(',')})` }));
  if (items.length === 0) return null;
  return (
    <ul className="ml-7 mt-1 max-h-28 space-y-0.5 overflow-y-auto pr-1">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`} className="flex items-center gap-1.5 text-[10.5px] text-slate-600">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10" style={{ background: item.colour }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export default function LayersPanel({ id, layers, onToggle, onClose, audience = 'office', available = {} }) {
  return (
    <div
      id={id}
      role="dialog"
      aria-label="Map layers"
      className="max-h-[calc(100vh-13rem)] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-2xl"
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
        Drawn over the base map.{' '}
        {audience === 'office'
          ? 'Street or satellite is chosen with the pictures below.'
          : 'Street or satellite is chosen from the base map list.'}
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
                  <span className="block text-[10.5px] text-slate-500">{audience === 'public' && layer.publicDetail ? layer.publicDetail : layer.detail}</span>
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
          {PGENRO_OVERLAYS.map((overlay) =>
            available[overlay.id] ? (
              <li key={overlay.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={Boolean(layers[overlay.id])}
                    onChange={() => onToggle(overlay.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-800">{overlay.label}</span>
                    <span className="block text-[10.5px] text-slate-500">{overlay.source}</span>
                  </span>
                </label>
                {layers[overlay.id] && <OverlayKey meta={available[overlay.id].meta} />}
              </li>
            ) : (
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
            )
          )}
        </ul>
      </fieldset>
    </div>
  );
}
