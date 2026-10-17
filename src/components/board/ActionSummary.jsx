import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, MapPin, X } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import {
  BOARD_METRICS,
  RECENT_DAYS,
  emptyBoardCounts,
  mapLinkFor,
  metricByKey,
  officesByLgu,
  rowsBehind,
  rowsByBarangay,
  rowsByLgu,
  tallyBoard,
} from '../../lib/provinceBoard.js';
import { namriaClassById } from '../../lib/namriaCover.js';

/**
 * What needs doing, what to watch, and how far along things are — the
 * summary at the top of the PGENRO and MENRO / CENRO BioDashboards (moved
 * here from PGENRO's Action Board, 17 October).
 *
 * Across the province it has a line per city or municipality, and its lists
 * come by city or municipality; for one LGU (`lgu`), only that LGU's
 * numbers, and its lists by barangay. Every number opens what is behind it,
 * each row a link to the map.
 */

/** Each metric's colour, the office map's where it has one. */
const TONE = {
  red: { dot: 'bg-red-600', text: 'text-red-700', ring: 'ring-red-200 hover:bg-red-50' },
  orange: { dot: 'bg-orange-500', text: 'text-orange-700', ring: 'ring-orange-200 hover:bg-orange-50' },
  grey: { dot: 'bg-slate-400', text: 'text-slate-700', ring: 'ring-slate-200 hover:bg-slate-50' },
  amber: { dot: 'bg-amber-600', text: 'text-amber-800', ring: 'ring-amber-200 hover:bg-amber-50' },
  yellow: { dot: 'bg-yellow-500', text: 'text-yellow-800', ring: 'ring-yellow-200 hover:bg-yellow-50' },
  green: { dot: 'bg-green-600', text: 'text-green-800', ring: 'ring-green-200 hover:bg-green-50' },
  teal: { dot: 'bg-teal-600', text: 'text-teal-800', ring: 'ring-teal-200 hover:bg-teal-50' },
  lime: { dot: 'bg-lime-500', text: 'text-lime-800', ring: 'ring-lime-300 hover:bg-lime-50' },
};

const GROUPS = [
  ['action', 'Needs action — by the MENRO / CENRO'],
  ['watch', 'Watch list'],
  ['progress', 'Progress'],
];

const HAZARD_NAMES = [
  [['isLeaning', 'is_leaning'], 'Leaning'],
  [['hasPowerlineConflict', 'has_powerline_conflict'], 'Power line'],
  [['isRootProblem', 'is_root_problem'], 'Root problem'],
  [['isDecayed', 'is_decayed'], 'Decayed'],
];
const hazardsOf = (tree) =>
  HAZARD_NAMES.filter(([keys]) => keys.some((key) => tree[key])).map(([, name]) => name);

const hectares = (ha) => ha.toLocaleString('en-US', { maximumFractionDigits: ha < 10 ? 2 : 1 });

/** What one row of the dialog says about itself, beside its name. */
function rowDetail(row, metric) {
  if (metric.of === 'tags') {
    return row.status === 'dispatched'
      ? `Out for checking${row.assigned_to ? ` · ${row.assigned_to}` : ''}`
      : 'Waiting';
  }
  if (metric.of === 'areas') {
    const ha = (Number(row.area_m2) || 0) / 10000;
    const what = row.kind === 'planting-site' ? 'Planting site' : namriaClassById(row.cover_class)?.label ?? 'Land cover';
    return `${what} · ${hectares(ha)} ha`;
  }
  return [
    ...hazardsOf(row),
    metric.key === 'code3' ? null : row.stem_quality?.replace(/\s*\(.*\)$/, ''),
    row.assigned_to ? `· ${row.assigned_to}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** One row: what it is, where, and what is wrong — the whole row a link to it on the map. */
function RowLink({ row, metric }) {
  return (
    <li>
      <Link
        to={mapLinkFor(row, { of: metric.of })}
        className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-5 py-2 text-sm hover:bg-green-50 focus:bg-green-50 focus:outline-none"
      >
        <span className="font-semibold text-slate-800">
          {metric.of === 'areas' ? row.name : row.species || 'Unknown species'}
        </span>
        <span className="text-xs text-slate-500">
          {row.barangay ? `Brgy. ${row.barangay}` : metric.of === 'areas' ? '' : 'No barangay'}
        </span>
        <span className="text-xs text-slate-600">{rowDetail(row, metric)}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-green-700">
          <MapPin size={12} aria-hidden="true" /> On the map
        </span>
      </Link>
    </li>
  );
}

/**
 * The trees, tags or areas behind one number. Across the province they come
 * by city or municipality, each opened when wanted — a list of every tree in
 * Laguna is a list nobody reads.
 */
function RowsDialog({ metric, lguLabel, rows, onClose, labelOf = String, groupBy = null }) {
  const noun = { tags: ['tag', 'tags'], areas: ['area', 'areas'], trees: ['tree', 'trees'] }[metric.of];
  const groups =
    groupBy === 'lgu'
      ? rowsByLgu(rows, { of: metric.of })
      : groupBy === 'barangay'
        ? rowsByBarangay(rows)
        : null;
  const placeNoun = groupBy === 'barangay' ? ['barangay', 'barangays'] : ['city or municipality', 'cities and municipalities'];
  const [opened, setOpened] = useState(() => new Set(groups?.length === 1 ? [groups[0].lgu] : []));
  const toggle = (lgu) =>
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(lgu)) next.delete(lgu);
      else next.add(lgu);
      return next;
    });
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${metric.label} — ${lguLabel}`}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex-1">
            <h2 className="text-base font-bold text-slate-900">{metric.label}</h2>
            <p className="text-sm text-slate-500">
              {lguLabel} · {rows.length} {rows.length === 1 ? noun[0] : noun[1]}
              {groups && ` in ${groups.length} ${groups.length === 1 ? placeNoun[0] : placeNoun[1]}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        {groups ? (
          <ul className="divide-y divide-slate-100 overflow-y-auto">
            {groups.map(({ lgu, rows: list }) => {
              const isOpen = opened.has(lgu);
              return (
                <li key={lgu ?? 'none'}>
                  <button
                    type="button"
                    onClick={() => toggle(lgu)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-2 bg-slate-50 px-5 py-2.5 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
                  >
                    <ChevronRight size={15} aria-hidden="true" className={`shrink-0 text-slate-500 transition ${isOpen ? 'rotate-90' : ''}`} />
                    <span className="flex-1">{groupBy === 'barangay' ? lgu ?? 'No barangay' : labelOf(lgu)}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{list.length}</span>
                  </button>
                  {isOpen && (
                    <ul className="divide-y divide-slate-100">
                      {list.map((row) => <RowLink key={row.id} row={row} metric={metric} />)}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-y-auto">
            {rows.map((row) => <RowLink key={row.id} row={row} metric={metric} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One count; a number above zero opens what is behind it. */
function Count({ value, metric, where, onOpen }) {
  if (!value) return <span className="text-slate-300">0</span>;
  const tone = TONE[metric.tone];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${value} — ${metric.label}, ${where}`}
      className={`min-w-[2.25rem] rounded-md px-2 py-0.5 font-bold ring-1 ${tone.text} ${tone.ring}`}
    >
      {value}
    </button>
  );
}

function Tile({ metric, value, note, onOpen, where = 'all of Laguna' }) {
  const tone = TONE[metric.tone];
  return (
    <button
      type="button"
      disabled={!value}
      onClick={onOpen}
      aria-label={`${value} — ${metric.label}, ${where}`}
      className="rounded-2xl border border-slate-200 bg-white p-3 text-left transition enabled:hover:shadow-md disabled:cursor-default"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden="true" /> {metric.short}
      </span>
      <span className={`mt-1 block text-2xl font-bold ${value ? tone.text : 'text-slate-300'}`}>{value}</span>
      <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">{metric.label}</span>
      {note && <span className="mt-0.5 block text-[11px] font-semibold leading-tight text-slate-600">{note}</span>}
    </button>
  );
}

function Overview({ trees, tags, areas, offices, lgus, onOpen, lgu = undefined, lguLabel = '' }) {
  const one = lgu !== undefined;
  const [showAll, setShowAll] = useState(false);
  const { byLgu, totals } = useMemo(() => tallyBoard(trees, tags, areas), [trees, tags, areas]);
  const lgusWithOffice = lgus.filter((lgu) => offices.get(lgu.psgc)).length;

  const rows = useMemo(() => {
    const list = lgus
      .map((lgu) => ({ lgu: lgu.psgc, label: lgu.label, offices: offices.get(lgu.psgc) ?? 0, ...(byLgu.get(lgu.psgc) ?? null) }))
      .filter((row) => showAll || row.counts);
    if (byLgu.has(null)) list.push({ lgu: null, label: 'Not placed in an LGU', offices: null, ...byLgu.get(null) });
    // Most hazards nobody has been sent to first: where the province looks.
    return list.sort(
      (a, b) =>
        (b.counts?.undispatched ?? 0) - (a.counts?.undispatched ?? 0) ||
        (b.counts?.dispatched ?? 0) - (a.counts?.dispatched ?? 0) ||
        a.label.localeCompare(b.label)
    );
  }, [lgus, byLgu, offices, showAll]);

  // One LGU's own numbers, or the province's.
  const shown = one ? byLgu.get(lgu) ?? { trees: 0, coverHa: 0, counts: emptyBoardCounts() } : totals;
  const noteFor = (metric) =>
    metric.key === 'mapped' && shown.coverHa > 0 ? `${hectares(shown.coverHa)} ha of tree cover` : '';

  return (
    <div className="space-y-6">
      {GROUPS.map(([group, title]) => (
        <section key={group} aria-label={title}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BOARD_METRICS.filter((metric) => metric.group === group).map((metric) => (
              <Tile
                key={metric.key}
                metric={metric}
                value={shown.counts[metric.key]}
                note={noteFor(metric)}
                where={one ? lguLabel : 'all of Laguna'}
                onOpen={() => onOpen(metric.key, one ? lgu : undefined)}
              />
            ))}
            {group === 'progress' && !one && (
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <Building2 size={12} aria-hidden="true" /> Offices
                </span>
                <span className="mt-1 block text-2xl font-bold text-slate-800">
                  {lgusWithOffice}
                  <span className="text-sm font-semibold text-slate-400"> of {lgus.length}</span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">
                  LGUs with an active MENRO / CENRO account
                </span>
              </div>
            )}
          </div>
        </section>
      ))}

      {one ? (
        <p className="text-xs text-slate-500">
          {shown.trees} standing trees in {lguLabel}. Tap a number to see what is behind it.
        </p>
      ) : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {totals.trees} standing trees in the inventory. Tap a number to see what is behind it.
        </p>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show LGUs with nothing yet
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">City / municipality</th>
              <th scope="col" title="Active MENRO / CENRO accounts" className="px-2 py-2 text-center font-semibold">Office</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Trees</th>
              {BOARD_METRICS.map((metric) => (
                <th key={metric.key} scope="col" title={metric.label} className="px-2 py-2 text-center font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${TONE[metric.tone].dot}`} aria-hidden="true" />
                    {metric.short}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.lgu ?? 'none'}>
                <th scope="row" className="px-3 py-2 text-left font-semibold text-slate-800">{row.label}</th>
                <td className="px-2 py-2 text-center">
                  {row.offices === null ? (
                    ''
                  ) : row.offices > 0 ? (
                    <span className="text-xs font-semibold text-green-700" title={`${row.offices} active`}>
                      ✓ {row.offices}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-700" title="No active MENRO / CENRO account">
                      None
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">{row.trees ?? 0}</td>
                {BOARD_METRICS.map((metric) => (
                  <td key={metric.key} className="px-2 py-1.5 text-center">
                    <Count
                      value={row.counts?.[metric.key] ?? 0}
                      metric={metric}
                      where={row.label}
                      onOpen={() => onOpen(metric.key, row.lgu)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3 + BOARD_METRICS.length} className="px-3 py-6 text-center text-slate-500">
                  Nothing in the inventory yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">
        {`New (${RECENT_DAYS}d)`} counts trees by the date they were tagged in the field. Areas counts land cover mapped
        by the offices; the hectares are tree cover only.
      </p>
      </>
      )}
    </div>
  );
}

/** Everything the summary counts, read once. */
export function useBoardData() {
  const [data, setData] = useState({ trees: [], tags: [], areas: [], profiles: [], lgus: [], permits: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    const [trees, tags, areas, profiles, lgus, permits] = await Promise.all([
      supabase.from('trees').select('*'),
      supabase.from('pending_trees').select('*'),
      supabase.from('map_areas').select('*'),
      supabase.from('profiles').select('*').eq('role', 'lgu_admin'),
      supabase.from('lgus').select('psgc, name, label').order('label'),
      supabase.from('permits').select('*').order('created_at', { ascending: false }),
    ]);
    setLoadError(trees.error?.message ?? '');
    // A table not there yet is no reason to hide everything else.
    const rowsOf = (result) => (result.error || !Array.isArray(result.data) ? [] : result.data);
    setData({
      trees: trees.data ?? [],
      tags: rowsOf(tags),
      // A planting site an office only asked for is not on the map yet.
      areas: rowsOf(areas).filter((area) => !area.approval || area.approval === 'approved'),
      profiles: rowsOf(profiles),
      lgus: rowsOf(lgus).map((lgu) => ({ ...lgu, psgc: Number(lgu.psgc) })),
      permits: rowsOf(permits),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const labelOf = useCallback(
    (lgu) => (lgu == null ? 'Not placed in an LGU' : data.lgus.find((row) => row.psgc === lgu)?.label ?? String(lgu)),
    [data.lgus]
  );

  return { data, loading, loadError, labelOf, reload: load };
}

/**
 * The summary itself. `lgu` (a PSGC code) narrows it to one LGU; without
 * it, the province.
 */
export default function ActionSummary({ data, labelOf, lgu = undefined }) {
  const [open, setOpen] = useState(null); // { metric, lgu }
  const offices = useMemo(() => officesByLgu(data.profiles), [data.profiles]);
  const openMetric = open && metricByKey(open.metric);
  const openRows = open ? rowsBehind(open.metric, open.lgu, data.trees, data.tags, data.areas) : [];
  const lguLabel = lgu !== undefined ? labelOf(lgu) : 'all of Laguna';

  return (
    <>
      <Overview
        trees={data.trees}
        tags={data.tags}
        areas={data.areas}
        offices={offices}
        lgus={data.lgus}
        lgu={lgu}
        lguLabel={lguLabel}
        onOpen={(metric, where) => setOpen({ metric, lgu: where })}
      />
      {openMetric && (
        <RowsDialog
          metric={openMetric}
          lguLabel={open.lgu === undefined ? 'All of Laguna' : labelOf(open.lgu)}
          rows={openRows}
          onClose={() => setOpen(null)}
          labelOf={labelOf}
          groupBy={open.lgu === undefined ? 'lgu' : 'barangay'}
        />
      )}
    </>
  );
}

/** The province's summary, loading its own data. */
export function ProvinceOverview() {
  const { data, loading, loadError, labelOf } = useBoardData();
  if (loading) return <p role="status" className="text-sm text-slate-600">Loading the province…</p>;
  if (loadError) return <p role="alert" className="text-sm text-red-700">{loadError}</p>;
  return <ActionSummary data={data} labelOf={labelOf} />;
}
