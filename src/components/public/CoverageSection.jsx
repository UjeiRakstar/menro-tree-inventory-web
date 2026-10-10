import { useState } from 'react';
import { MapPinOff, Trophy } from 'lucide-react';
import { coverage, coverageLine, tagged, untagged } from '../../lib/placeCoverage.js';
import { formatFigure } from '../../lib/dashboardMetrics.js';

/** How many places the leaderboard shows before it stops. */
const SHOWN = 10;

const VIEWS = [
  { key: 'most', label: 'Most tagged', icon: Trophy },
  { key: 'none', label: 'Not yet tagged', icon: MapPinOff },
];

/**
 * Where the trees are — and, the more useful half, where they are not.
 *
 * "Which barangay has the most" is worth answering. Which has none is worth
 * more, and it cannot come from grouping the trees: there is nothing in an
 * empty barangay to group. It comes from the list of barangays that exist,
 * with the counts joined onto it.
 *
 * The wording is careful on purpose. A place with no tagged trees has not been
 * surveyed; it does not mean there are no trees there. With 112 trees across
 * two municipalities this is a survey that has barely started, and a page that
 * called those places bare would be lying about the province.
 */
export default function CoverageSection({ trees, keyOf, allPlaces, scopeLabel, noun, nounPlural }) {
  const [view, setView] = useState('most');

  const result = coverage(trees, keyOf, allPlaces);
  if (result.total === 0) return null;

  const leaders = tagged(result).slice(0, SHOWN);
  const empty = untagged(result);
  const most = leaders[0]?.count ?? 1;
  const showing = view === 'most' ? leaders : empty.slice(0, SHOWN * 2);

  return (
    <section aria-label="Where the trees are" className="mt-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
            Where the trees are in {scopeLabel}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Tagged in{' '}
            <span className="font-semibold text-slate-700">
              {coverageLine(result, noun, nounPlural)}
            </span>
            {result.unplaced > 0 &&
              `, with ${formatFigure(result.unplaced)} ${
                result.unplaced === 1 ? 'tree' : 'trees'
              } nothing could place`}
            .
          </p>
        </div>

        {/* Two ways to read one list. */}
        <div role="tablist" aria-label="How to order the places" className="flex gap-1 self-start rounded-xl bg-slate-100 p-1">
          {VIEWS.map((option) => {
            const Icon = option.icon;
            const active = view === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(option.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${
                  active ? 'bg-white text-green-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon size={13} aria-hidden="true" />
                {option.label}
                {option.key === 'none' && empty.length > 0 && (
                  <span className="rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-600">
                    {formatFigure(empty.length)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        {showing.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            {view === 'most'
              ? `No tagged trees in ${scopeLabel} yet.`
              : `Every ${noun} of ${scopeLabel} has at least one tagged tree.`}
          </p>
        ) : view === 'most' ? (
          <ol className="space-y-1.5">
            {showing.map((place, index) => (
              <li
                key={place.name}
                className="grid grid-cols-[1.25rem_minmax(5rem,10rem)_1fr_auto] items-center gap-2 sm:gap-3"
              >
                <span className="text-right text-[11px] tabular-nums text-slate-400">
                  {index + 1}
                </span>
                <span className="truncate text-xs font-medium text-slate-700" title={place.label}>
                  {place.label}
                </span>
                <span className="block h-4 rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full bg-green-600"
                    style={{ width: `${Math.max(2, (place.count / most) * 100)}%` }}
                  />
                </span>
                <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-700">
                  {formatFigure(place.count)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <>
            <ul className="flex flex-wrap gap-1.5">
              {showing.map((place) => (
                <li
                  key={place.name}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                >
                  {place.label}
                </li>
              ))}
            </ul>
            {empty.length > showing.length && (
              <p className="mt-2 text-[11px] text-slate-500">
                and {formatFigure(empty.length - showing.length)} more.
              </p>
            )}
            <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-600">These have not been surveyed yet.</span>{' '}
              No tagged trees does not mean no trees — it means nobody has been there with the app.
              Once the survey covers the province, this same list becomes the places to plant.
            </p>
          </>
        )}

        {result.unlisted.length > 0 && view === 'none' && (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            {formatFigure(result.unlisted.length)}{' '}
            {result.unlisted.length === 1 ? 'name was' : 'names were'} written into the records that
            the official list does not have ({result.unlisted.map((p) => p.label).join(', ')}) — a
            subdivision or a misspelling rather than a {noun}.
          </p>
        )}
      </div>
    </section>
  );
}
