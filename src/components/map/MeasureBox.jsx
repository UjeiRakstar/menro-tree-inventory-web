import { useState } from 'react';
import { Undo2, Trash2, X } from 'lucide-react';
import { formatArea } from '../../lib/areaGeometry.js';
import { areaM2, drawingHint, formatLength, lengthM } from '../../lib/drawing.js';

/**
 * The measurement, live, while a shape is drawn.
 *
 * Google Maps' measure box, which is the one the LGU offices know: a sentence
 * saying what to do next, and the figures, changing with every point. Area in
 * square metres or hectares; the line's length while drawing, the perimeter
 * once it is closed.
 *
 * `notice` is the last thing the map refused, said in words — a point dropped
 * outside the LGU does nothing visible on the map, and silence would read as
 * the click not registering.
 */
export default function MeasureBox({ shape, notice = '', onUndo, onClear, onClose }) {
  const [unit, setUnit] = useState('m2');
  const area = areaM2(shape);
  const length = lengthM(shape);
  const hasPoints = shape.points.length > 0;

  return (
    <div
      role="region"
      aria-label="Measure area"
      className="w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
    >
      <div className="flex items-start gap-2">
        <h2 className="flex-1 text-sm font-bold text-slate-900">Measure area</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Stop drawing"
          className="-mr-1 -mt-1 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={16} />
        </button>
      </div>

      <p className="mt-1 text-xs leading-snug text-slate-500" aria-live="polite">
        {drawingHint(shape)}
      </p>

      {notice && (
        <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">
          {notice}
        </p>
      )}

      <dl className="mt-3 space-y-1 text-xs text-slate-700">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">Total area</dt>
          <dd className="font-semibold tabular-nums">
            {area === null ? (shape.closed ? 'Not measurable' : 'Close the shape to measure') : formatArea(area, unit)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">{shape.closed ? 'Perimeter' : 'Total distance'}</dt>
          <dd className="font-semibold tabular-nums">{hasPoints ? formatLength(length) : '—'}</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="Area unit">
          {[
            ['m2', 'm²'],
            ['ha', 'ha'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setUnit(value)}
              aria-pressed={unit === value}
              className={`px-2 py-0.5 text-[11px] font-bold transition ${
                unit === value ? 'bg-green-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onUndo}
          disabled={!hasPoints}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
        >
          <Undo2 size={12} aria-hidden="true" /> Undo
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!hasPoints}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
        >
          <Trash2 size={12} aria-hidden="true" /> Clear
        </button>
      </div>
    </div>
  );
}
