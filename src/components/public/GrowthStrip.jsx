import { formatFigure } from '../../lib/dashboardMetrics.js';

/**
 * The inventory growing, month by month.
 *
 * A running total rather than what was added each month: the question this
 * answers is "how far has the survey got", and a bar chart of monthly activity
 * answers a different one. The months with no tagging are still drawn, because
 * a flat stretch is part of the story and leaving it out would show a survey
 * that never paused.
 *
 * Deliberately small. It is context for the figures above it, not a figure of
 * its own, and giving it a quarter of the page would say otherwise.
 */
export default function GrowthStrip({ timeline, scopeLabel }) {
  // One month is a dot, not a trend. Two is the shortest thing worth drawing.
  if (!Array.isArray(timeline) || timeline.length < 2) return null;

  const final = timeline[timeline.length - 1].total;
  const busiest = timeline.reduce((best, month) => (month.added > best.added ? month : best));

  return (
    <section aria-label="How the inventory has grown" className="mt-10">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
        How the survey has grown
      </h2>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <ol className="flex items-end gap-[3px]" style={{ height: '4.5rem' }}>
          {timeline.map((month) => (
            <li
              key={month.key}
              className="flex h-full flex-1 items-end"
              title={`${month.label}: ${formatFigure(month.total)} tagged in total${
                month.added > 0 ? `, ${formatFigure(month.added)} that month` : ', none added'
              }`}
            >
              <span
                className={`w-full rounded-t ${month.added > 0 ? 'bg-green-600' : 'bg-green-600/40'}`}
                style={{ height: `${Math.max(3, (month.total / final) * 100)}%` }}
              />
            </li>
          ))}
        </ol>

        <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 text-[10px] text-slate-500">
          <span>{timeline[0].label}</span>
          <span>{timeline[timeline.length - 1].label}</span>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          {formatFigure(final)} {final === 1 ? 'tree' : 'trees'} tagged in {scopeLabel} over{' '}
          {formatFigure(timeline.length)} {timeline.length === 1 ? 'month' : 'months'}
          {busiest.added > 0 && (
            <>
              , the most in {busiest.label} with {formatFigure(busiest.added)}
            </>
          )}
          .
        </p>
      </div>
    </section>
  );
}
