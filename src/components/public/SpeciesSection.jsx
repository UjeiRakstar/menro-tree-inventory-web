import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
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
import { ProvisionalNote } from './Provisional.jsx';

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
function SpeciesRow({ row, trackMax, guidelineAt, over, onExplain }) {
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
            to know how wide the name column came out. Absent when nothing is
            near it, rather than drawn far off to the right. */}
        {guidelineAt !== null && (
          <span
            aria-hidden="true"
            className="absolute inset-y-[-2px] border-l border-dashed border-amber-600/80"
            style={{ left: `${guidelineAt}%` }}
          />
        )}
      </span>

      <span className="flex items-center gap-1.5 tabular-nums text-xs text-slate-500">
        <span className="font-semibold text-slate-700">{formatFigure(row.count)}</span>
        <span className="w-11 text-right">{asPercent(row.share)}</span>
        {/* Never colour alone: the warning carries an icon and a word. The
            icon is also the way in to what it means — the explanation used to
            sit in a block under the whole section, which cost a hundred pixels
            of page to say something most readers already understood. */}
        {over ? (
          <button
            type="button"
            onClick={onExplain}
            aria-label={`${row.name} is above the guideline — what this means`}
            className="rounded-full text-amber-600 transition hover:text-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
          >
            <AlertTriangle size={13} aria-hidden="true" />
          </button>
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

/** The rule itself, said once, wherever it is needed. */
const SANTAMOUR_NOTE =
  'Guideline: no more than 10% of an urban forest in one species and 20% in one genus ' +
  '(Santamour’s 10-20-30 rule).';

/**
 * What being past the guideline means, on request.
 *
 * It used to be a block under the section, which is a lot of page spent on a
 * paragraph that does not change: three species names and a sentence about
 * pests. Behind the ⚠ it costs nothing until somebody wants it, and it can say
 * more rather than less once they do.
 */
function GuidelineModal({ warnings, scopeLabel, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guideline-modal-title"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
          <h2 id="guideline-modal-title" className="flex-1 text-base font-bold text-amber-800">
            Planted past the guideline
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          >
            <X size={18} />
          </button>
        </div>

        <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-700">
          {warnings.map((warning) => (
            <li key={`${warning.rank}-${warning.name}`}>
              <span className="font-semibold">{warning.name}</span> is {asPercent(warning.share)} of
              the trees in {scopeLabel} — above the {asPercent(warning.limit)} guideline for one{' '}
              {warning.rank}.
            </li>
          ))}
        </ul>

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Choosing other species for new planting spreads the risk: a forest that is a large share
          of one thing can lose that share to a single pest or disease.
        </p>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{SANTAMOUR_NOTE}</p>

        {/* Two of the three thresholds are checked. The third is not, and that
            is a gap in the advice rather than a footnote about it. */}
        <ProvisionalNote
          kind="awaiting"
          title="the third threshold is not checked"
          className="mt-2"
        >
          30% in one family is part of the same rule and this page does not test it — it needs a
          species-to-family list the system does not have. Until it does, a mix could pass both
          checks above and still be concentrated in one family.
        </ProvisionalNote>

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
        >
          Okay
        </button>
      </div>
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
export default function SpeciesSection({ trees, scopeLabel, className = '' }) {
  const [explaining, setExplaining] = useState(false);
  const richness = speciesRichness(trees);
  const counts = speciesCounts(trees);
  const warnings = overPlanted(trees);
  const origin = originMix(trees);
  const uses = categoryMix(trees);
  // Which invasive species, and how many of each: what to replace first.
  const invasive = (() => {
    const bySpecies = new Map();
    for (const tree of trees ?? []) {
      if (tree?.species_type !== 'Invasive') continue;
      const name = tree.species || 'Unidentified';
      bySpecies.set(name, (bySpecies.get(name) ?? 0) + 1);
    }
    return [...bySpecies].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  })();
  const total = richness.total;

  const top = counts.slice(0, SHOWN);
  const overNames = new Set(
    warnings.filter((w) => w.rank === 'species').map((w) => w.name.toLowerCase())
  );

  /**
   * How wide the bar track runs, as a share of the inventory.
   *
   * Forcing the 10% guideline onto the track regardless squashes the bars
   * whenever the mix is genuinely diverse: at sixty species the commonest is
   * under 3%, and every bar becomes a stub against a line nothing is near.
   *
   * So the guideline is drawn only when something is within reach of it.
   * Otherwise the track scales to the commonest species, the bars stay
   * readable, and the fact that nothing is close is said in words underneath —
   * which is the more useful way to say it anyway.
   */
  const topShare = top[0]?.share ?? 0;
  const guidelineInReach = topShare >= DIVERSITY_LIMITS.species / 2;
  const trackMax = (guidelineInReach ? Math.max(topShare, DIVERSITY_LIMITS.species) : topShare) * 1.15;
  const guidelineAt = guidelineInReach ? (DIVERSITY_LIMITS.species / trackMax) * 100 : null;

  if (total === 0) {
    return null;
  }

  return (
    <section aria-label="What is growing here" className={className}>
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
                    onExplain={() => setExplaining(true)}
                  />
                ))}
              </ol>

              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {guidelineAt !== null ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-3 border-l border-dashed border-amber-600" />
                    10% guideline
                  </span>
                ) : (
                  <span>No species is anywhere near the 10% guideline.</span>
                )}
                {counts.length > top.length && (
                  <span>and {formatFigure(counts.length - top.length)} more species.</span>
                )}

                {/* The verdict, in one line. What it MEANS is behind it, for
                    whoever wants it, rather than printed for everyone who
                    does not. */}
                {warnings.length === 0 ? (
                  <span className="font-semibold text-green-800">
                    The mix is within the guideline.
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setExplaining(true)}
                    className="inline-flex items-center gap-1.5 rounded-full font-semibold text-amber-700 underline decoration-dotted underline-offset-2 transition hover:text-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                  >
                    <AlertTriangle size={12} aria-hidden="true" />
                    {formatFigure(warnings.length)}{' '}
                    {warnings.length === 1 ? 'is' : 'are'} past the guideline — what this means
                  </button>
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
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Invasive species here</h3>
            {invasive.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No tree in {scopeLabel} is recorded as invasive.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {invasive.slice(0, 6).map(([name, count]) => (
                  <li key={name} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-600" aria-hidden="true" />
                    <span className="flex-1 text-slate-700">{name}</span>
                    <span className="font-semibold text-slate-900">{count}</span>
                  </li>
                ))}
              </ul>
            )}
            {invasive.length > 6 && (
              <p className="mt-1 text-[11px] text-slate-500">and {invasive.length - 6} more species.</p>
            )}
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              Where these come down, a native species is the one to plant in their place.
            </p>
          </div>
        </div>
      </div>

      {explaining && (
        <GuidelineModal
          warnings={warnings}
          scopeLabel={scopeLabel}
          onClose={() => setExplaining(false)}
        />
      )}
    </section>
  );
}
