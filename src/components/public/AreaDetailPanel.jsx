import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { METRIC_PAIRS, formatFigure } from '../../lib/dashboardMetrics.js';
import InfoHint from './InfoHint.jsx';

/** In step with the slide class below, and with the tree panel's. */
const SLIDE_MS = 300;

/** How many barangays the panel lists before sending the reader to the chart. */
const BARANGAYS_SHOWN = 6;

/**
 * Which part of the place's trees the carbon figure speaks for.
 *
 * The carbon equation needs a diameter and a total height, and not every record has both.
 * A total from some of the trees is worth showing, but only if it says so.
 */
function carbonNote(totals) {
  const measured = totals?.carbonMeasured ?? 0;
  const total = totals?.treeCount ?? 0;
  if (total === 0 || measured === total) return '';
  if (measured === 0) return 'none measured yet';
  return `from ${formatFigure(measured)} of ${formatFigure(total)}`;
}

/** One figure: its name on the left, the number on the right. */
function FigureRow({ metric, value, note = '' }) {
  const unavailable = !metric.available;
  const tone = metric.tone === 'red' ? 'text-red-700' : 'text-green-800';

  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <dt className="flex items-start gap-1 pt-0.5 text-[11px] font-semibold leading-snug text-slate-600">
        <span>{metric.label}</span>
        <InfoHint label={`What ${metric.label} means`} text={metric.hint} size={13} />
      </dt>
      <dd className="shrink-0 text-right">
        <span className={`text-xl font-bold leading-none ${unavailable ? 'text-slate-300' : tone}`}>
          {unavailable ? '—' : formatFigure(value)}
        </span>
        {metric.unit && !unavailable && (
          <span className="ml-1 text-[10px] text-slate-400">{metric.unit}</span>
        )}
        {unavailable && (
          <span className="block text-[10px] font-semibold text-amber-700">Awaiting data</span>
        )}
        {!unavailable && note && (
          <span className="mt-0.5 block text-[10px] leading-tight text-slate-400">{note}</span>
        )}
      </dd>
    </div>
  );
}

/**
 * Where the trees are within this city or municipality.
 *
 * A bar chart does not fit in a column this narrow, so this is the same
 * ordering the dashboard charts, read as a list instead. The chart itself is
 * one link away.
 */
function BarangayList({ barangays, municipality }) {
  if (barangays.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-[11px] text-slate-500">
        No tagged trees here yet.
      </p>
    );
  }

  const shown = barangays.slice(0, BARANGAYS_SHOWN);
  const rest = barangays.length - shown.length;
  const most = shown[0].treeCount || 1;

  return (
    <>
      <ol className="space-y-1.5">
        {shown.map((row) => (
          <li key={row.name}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate font-medium text-slate-700">{row.name}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{formatFigure(row.treeCount)}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-green-600"
                style={{ width: `${Math.max(4, (row.treeCount / most) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
      {rest > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          and {rest} more {rest === 1 ? 'barangay' : 'barangays'} — the full chart is on the analytics page.
        </p>
      )}
      <p className="mt-2 text-[10px] text-slate-400">
        Barangays of {municipality} with nothing tagged yet are left out.
      </p>
    </>
  );
}

/**
 * The side panel the public map opens for a city or municipality.
 *
 * It is the short form of the BioDashboard: the same figures, out of the same
 * module, so the two can never disagree — and a link through to the full page
 * for the one thing a 380px column cannot do, which is set places beside each
 * other. It shares the tree panel's shell and timing, so moving between a tree
 * and the town it stands in feels like one panel changing its mind.
 */
export default function AreaDetailPanel({
  municipality,
  label,
  logo = null,
  totals,
  barangays = [],
  onClose,
  onCollapsedChange,
  onRequestData,
  // A barangay: what kind of place it says it is, the facts about the place
  // itself ([{ label, value, note }]), and no list of barangays within it.
  placeKind = null,
  facts = [],
  showBarangays = true,
}) {
  const [collapsed, setCollapsed] = useState(false);
  // Mount off-screen, then slide in on the next frame.
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const closeTimer = useRef(null);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Clicking another city swaps what is in the open panel rather than
  // re-animating it — and brings it back if it had been collapsed, or the
  // click would look like it did nothing.
  const collapsedRef = useRef(false);
  useEffect(() => {
    clearTimeout(closeTimer.current);
    setLeaving(false);
    if (collapsedRef.current) {
      collapsedRef.current = false;
      setCollapsed(false);
      onCollapsedChange?.(false);
    }
  }, [municipality]);

  /** Slide out, then tell the map to drop the selection. */
  function handleClose() {
    if (leaving) return;
    setLeaving(true);
    // The zoom control and the locate button travel back in step with it.
    onCollapsedChange?.(true);
    closeTimer.current = setTimeout(() => onClose?.(), SLIDE_MS);
  }

  function toggleCollapsed() {
    const next = !collapsed;
    collapsedRef.current = next;
    setCollapsed(next);
    onCollapsedChange?.(next);
  }

  const showing = entered && !collapsed && !leaving;
  const kind = placeKind ?? `${/\bcity\b/i.test(label) ? 'City' : 'Municipality'} of Laguna`;

  return (
    <>
      <aside
        role="complementary"
        aria-label={`Biodiversity of ${label}`}
        aria-hidden={collapsed}
        className={`absolute inset-y-0 left-0 z-[600] flex w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] sm:w-[380px] sm:rounded-r-2xl ${
          showing ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Which place this is */}
        <div className="flex items-start gap-3 border-b border-slate-200 px-4 py-4">
          {logo && (
            <img
              src={logo}
              alt=""
              aria-hidden="true"
              className="h-14 w-14 shrink-0 rounded-full object-contain"
            />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold leading-tight text-green-800">{label}</h2>
            <p className="text-[11px] text-slate-500">{kind} · Biodiversity at a glance</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={`Close ${label}`}
            className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {facts.length > 0 && (
            <section className="mb-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">The place</h3>
              <dl className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {facts.map((fact) => (
                  <div key={fact.label} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <dt className="text-[12px] text-slate-600">{fact.label}</dt>
                    <dd className="text-right text-[13px] font-bold text-slate-900">
                      {fact.value}
                      {fact.note && <span className="block text-[10.5px] font-normal text-slate-400">{fact.note}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {/* The same six figures as the analytics page, in the same pairs */}
          <div className="space-y-4">
            {METRIC_PAIRS.map((pair) => (
              <section key={pair.id}>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {pair.title}
                </h3>
                <dl className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {pair.metrics.map((metric) => (
                    <FigureRow
                      key={metric.key}
                      metric={metric}
                      value={totals?.[metric.key]}
                      note={metric.key === 'carbonKg' ? carbonNote(totals) : ''}
                    />
                  ))}
                </dl>
              </section>
            ))}
          </div>

          {/* Where they stand within it */}
          {showBarangays && (
          <section className="mt-5">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Tagged trees by barangay
            </h3>
            <div className="mt-2">
              <BarangayList barangays={barangays} municipality={label} />
            </div>
          </section>
          )}
        </div>

        {/* What to do with it */}
        <div className="space-y-2 border-t border-slate-200 px-4 py-3">
          <Link
            to={`/biodiversity?lgu=${encodeURIComponent(municipality)}`}
            className="flex items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
          >
            <BarChart3 size={16} />
            View full analytics
          </Link>
          <button
            type="button"
            onClick={onRequestData}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-green-700 px-4 py-2.5 text-sm font-bold text-green-800 transition hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
          >
            <Download size={16} />
            Download Data
          </button>
        </div>
      </aside>

      {/* Collapse handle, riding the panel's edge so it moves with it. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className={`absolute left-0 top-1/2 z-[600] hidden -translate-y-1/2 items-center rounded-r-lg border border-l-0 border-slate-200 bg-white py-4 pl-1 pr-1.5 text-slate-500 shadow-lg transition-[transform,color] duration-300 ease-[cubic-bezier(0.2,0,0,1)] hover:text-green-700 sm:flex ${
          showing ? 'translate-x-[380px]' : 'translate-x-0'
        }`}
        aria-label={collapsed ? `Show ${label}` : `Hide ${label}`}
        title={collapsed ? `Show ${label}` : `Hide ${label}`}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </>
  );
}
