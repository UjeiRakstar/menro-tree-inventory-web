import { AlertTriangle } from 'lucide-react';
import {
  DIVERSITY_LIMITS,
  asPercent,
  categoryMix,
  originMix,
  overPlanted,
  speciesCounts,
  speciesRichness,
} from '../../lib/speciesMetrics.js';
import { formatFigure } from '../../lib/dashboardMetrics.js';

/** How many species the list shows before it stops. */
const SHOWN = 10;

/**
 * A row of the commonest-species list.
 *
 * The bar is a div rather than a charting library: the track has to be a share
 * of the whole inventory so that the 10% guideline can sit at a fixed place on
 * it, every row needs its number and percentage in text beside it anyway, and
 * this way the section costs nothing to download.
 */
function SpeciesRow({ row, trackMax, guidelineAt, over }) {
  const width = Math.max(1.5, (row.share / trackMax) * 100);

  return (
    <li className="grid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-2 sm:gap-3">
      <span className="truncate text-xs font-medium text-slate-700" title={row.name}>
        {row.name}
      </span>

      <span className="relative block h-4 rounded-full bg-slate-100">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-amber-500' : 'bg-green-600'}`}
          style={{ width: `${width}%` }}
        />
        {/* The guideline, inside the track it applies to. Every track is the
            same width, so these line up down the list without anything having
            to know how wide the name column came out. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-[-2px] border-l border-dashed border-amber-600/80"
          style={{ left: `${guidelineAt}%` }}
        />
      </span>

      <span className="flex items-center gap-1.5 tabular-nums text-xs text-slate-500">
        <span className="font-semibold text-slate-700">{formatFigure(row.count)}</span>
        <span className="w-11 text-right">{asPercent(row.share)}</span>
        {/* Never colour alone: the warning carries an icon and a word. */}
        {over ? (
          <AlertTriangle size={13} className="text-amber-600" aria-hidden="true" />
        ) : (
          <span className="w-[13px]" aria-hidden="true" />
        )}
        {over && <span className="sr-only">above the guideline</span>}
      </span>
    </li>
  );
}

/** A small labelled breakdown — origin, or what the trees are grown for. */
function Mix({ title, rows, total }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {rows.map(({ label, count, tone }) => (
          <li key={label} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: tone }} />
            <span className="flex-1 truncate text-xs text-slate-600">{label}</span>
            <span className="tabular-nums text-xs font-semibold text-slate-700">
              {formatFigure(count)}
            </span>
            <span className="w-11 text-right tabular-nums text-[11px] text-slate-400">
              {total ? asPercent(count / total) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What is growing here.
 *
 * The page is called a Biodiversity dashboard and measured no diversity: it
 * counted trees, invasive trees and carbon, all of which a monoculture would
 * score well on. This is the part that answers how many kinds there are, which
 * dominate, and whether the mix is one a single pest could take out.
 */
export default function SpeciesSection({ trees, scopeLabel }) {
  const richness = speciesRichness(trees);
  const counts = speciesCounts(trees);
  const warnings = overPlanted(trees);
  const origin = originMix(trees);
  const uses = categoryMix(trees);
  const total = richness.total;

  const top = counts.slice(0, SHOWN);
  const overNames = new Set(
    warnings.filter((w) => w.rank === 'species').map((w) => w.name.toLowerCase())
  );

  // The track runs a little past whichever is larger — the commonest species
  // or the guideline — so the guideline is always on the chart and the bars
  // still fill a useful amount of it.
  const trackMax = Math.max(top[0]?.share ?? 0, DIVERSITY_LIMITS.species) * 1.25;
  const guidelineAt = (DIVERSITY_LIMITS.species / trackMax) * 100;

  if (total === 0) {
    return null;
  }

  return (
    <section aria-label="What is growing here" className="mt-10">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
        What is growing in {scopeLabel}
      </h2>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        {/* The species list */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-bold text-green-800 sm:text-4xl">
              {formatFigure(richness.species)}
            </span>
            <span className="text-sm font-semibold text-slate-700">
              {richness.species === 1 ? 'species recorded' : 'species recorded'}
            </span>
            <span className="text-xs text-slate-500">
              across {formatFigure(total)} {total === 1 ? 'tree' : 'trees'}
              {richness.unnamed > 0 && `, ${formatFigure(richness.unnamed)} not yet identified`}
            </span>
          </p>

          {top.length > 0 && (
            <>
              <h3 className="mt-5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Commonest species
              </h3>

              <ol className="mt-2 space-y-1.5">
                {top.map((row) => (
                  <SpeciesRow
                    key={row.name}
                    row={row}
                    trackMax={trackMax}
                    guidelineAt={guidelineAt}
                    over={overNames.has(row.name.toLowerCase())}
                  />
                ))}
              </ol>

              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 border-l border-dashed border-amber-600" />
                  10% guideline
                </span>
                {counts.length > top.length && (
                  <span>and {formatFigure(counts.length - top.length)} more species.</span>
                )}
              </p>
            </>
          )}
        </div>

        {/* The two small breakdowns */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <Mix
              title="Where they come from"
              total={total}
              rows={[
                { label: 'Endemic', count: origin.endemic, tone: '#16a34a' },
                { label: 'Invasive', count: origin.invasive, tone: '#dc2626' },
                { label: 'Not recorded', count: origin.unrecorded, tone: '#cbd5e1' },
              ]}
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <Mix
              title="What they are grown for"
              total={total}
              rows={[
                { label: 'Fruit', count: uses.fruit, tone: '#ea580c' },
                { label: 'Timber', count: uses.timber, tone: '#a16207' },
                { label: 'Ornamental', count: uses.ornamental, tone: '#7c3aed' },
                { label: 'Not recorded', count: uses.unrecorded, tone: '#cbd5e1' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* The recommendation. This is what turns the chart into advice. */}
      <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:px-6">
        {warnings.length === 0 ? (
          <p className="text-xs leading-relaxed text-slate-600">
            <span className="font-semibold text-green-800">The mix is within the guideline.</span>{' '}
            No single species makes up more than a tenth of the trees here, and no genus more than a
            fifth — which is what keeps one pest or disease from taking out a large share of the
            canopy.
          </p>
        ) : (
          <div className="flex gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="text-xs leading-relaxed text-slate-700">
              <p className="font-semibold text-amber-800">Planted past the guideline</p>
              <ul className="mt-1 space-y-0.5">
                {warnings.slice(0, 4).map((warning) => (
                  <li key={`${warning.rank}-${warning.name}`}>
                    <span className="font-semibold">{warning.name}</span> is{' '}
                    {asPercent(warning.share)} of the trees here — above the{' '}
                    {asPercent(warning.limit)} guideline for one {warning.rank}.
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-slate-500">
                Choosing other species for new planting spreads the risk: a forest that is a large
                share of one thing can lose that share to a single pest or disease.
              </p>
            </div>
          </div>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
          Guideline: no more than 10% of an urban forest in one species and 20% in one genus
          (Santamour&apos;s 10-20-30 rule). The third threshold, 30% in one family, is not checked —
          it needs a species-to-family list this system does not have.
        </p>
      </div>
    </section>
  );
}
