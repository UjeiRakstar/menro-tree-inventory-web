import {
  diameterDistribution,
  readDiameterShape,
} from '../../lib/treeVolume.js';
import { asPercent } from '../../lib/speciesMetrics.js';
import { formatFigure } from '../../lib/dashboardMetrics.js';

/**
 * How old the forest is, read from how thick its trees are.
 *
 * Counting trees cannot answer whether there is a mature canopy coming. The
 * size structure can: a thousand trees all in the smallest class is a planting
 * programme that worked and a canopy still twenty years away, while the same
 * thousand spread across the classes is a forest that replaces itself.
 *
 * The classes are the DENR's own, from FMB Technical Bulletin No. 3 page 7 —
 * the same document the volume equation comes from, so the dashboard and any
 * inventory report MENRO files are counting in the same bands.
 */
export default function SizeSection({ trees, scopeLabel, className = '' }) {
  const distribution = diameterDistribution(trees);
  const shape = readDiameterShape(distribution);
  const { classes, measured, unmeasured, belowSmallest, total } = distribution;

  if (total === 0) return null;

  const tallest = Math.max(1, ...classes.map((row) => row.count));

  return (
    <section aria-label="How old the trees are" className={className}>
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
        How big the trees are in {scopeLabel}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        By diameter at breast height, in the DENR&apos;s standard classes.
      </p>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        {measured === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No tree here has a diameter recorded yet, so there is nothing to size.
          </p>
        ) : (
          <>
            {/* A column per class. Vertical, because size reads left to right. */}
            <ol className="flex items-end gap-1 sm:gap-2" style={{ height: '11rem' }}>
              {classes.map((row) => (
                <li
                  key={row.class}
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
                  title={`${row.count} ${row.count === 1 ? 'tree' : 'trees'} ${row.range}`}
                >
                  <span className="text-[10px] font-semibold tabular-nums text-slate-600">
                    {row.count > 0 ? formatFigure(row.count) : ''}
                  </span>
                  <span
                    className={`w-full rounded-t ${row.count > 0 ? 'bg-green-600' : 'bg-slate-100'}`}
                    style={{ height: `${Math.max(row.count > 0 ? 4 : 2, (row.count / tallest) * 100)}%` }}
                  />
                </li>
              ))}
            </ol>

            {/* The axis, labelled by the band each class covers. */}
            <ol className="mt-1.5 flex gap-1 border-t border-slate-200 pt-1.5 sm:gap-2">
              {classes.map((row) => (
                <li key={row.class} className="flex-1 text-center">
                  <span className="block text-[10px] font-semibold tabular-nums text-slate-600">
                    {row.class}
                  </span>
                  <span className="hidden text-[9px] leading-tight text-slate-400 sm:block">
                    {row.class - 5}–{row.class + 4}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-1 text-center text-[10px] text-slate-400">
              Diameter class, centimetres
            </p>

            {shape && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-green-800">{shape.headline}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{shape.detail}</p>
              </div>
            )}

            {/* What the bars are not counting. */}
            {(unmeasured > 0 || belowSmallest > 0) && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                From {formatFigure(measured)} of {formatFigure(total)}{' '}
                {total === 1 ? 'tree' : 'trees'} ({asPercent(measured / total)})
                {belowSmallest > 0 &&
                  `. ${formatFigure(belowSmallest)} ${
                    belowSmallest === 1 ? 'is a seedling' : 'are seedlings'
                  } under 5 cm, below the smallest class`}
                {unmeasured > 0 &&
                  `. ${formatFigure(unmeasured)} ${
                    unmeasured === 1 ? 'has' : 'have'
                  } no diameter recorded`}
                .
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
