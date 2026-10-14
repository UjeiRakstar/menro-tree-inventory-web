import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Loader2, MapPin, X } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { BOARD_METRICS, mapLinkFor, metricByKey, rowsBehind, tallyBoard } from '../../lib/provinceBoard.js';
import ProvincePermits from './ProvincePermits.jsx';

/** Each metric's colour, the office map's where it has one. */
const TONE = {
  red: { dot: 'bg-red-600', text: 'text-red-700', ring: 'ring-red-200 hover:bg-red-50' },
  orange: { dot: 'bg-orange-500', text: 'text-orange-700', ring: 'ring-orange-200 hover:bg-orange-50' },
  grey: { dot: 'bg-slate-400', text: 'text-slate-700', ring: 'ring-slate-200 hover:bg-slate-50' },
  amber: { dot: 'bg-amber-600', text: 'text-amber-800', ring: 'ring-amber-200 hover:bg-amber-50' },
  yellow: { dot: 'bg-yellow-500', text: 'text-yellow-800', ring: 'ring-yellow-200 hover:bg-yellow-50' },
  green: { dot: 'bg-green-600', text: 'text-green-800', ring: 'ring-green-200 hover:bg-green-50' },
};

const HAZARD_NAMES = [
  [['isLeaning', 'is_leaning'], 'Leaning'],
  [['hasPowerlineConflict', 'has_powerline_conflict'], 'Power line'],
  [['isRootProblem', 'is_root_problem'], 'Root problem'],
  [['isDecayed', 'is_decayed'], 'Decayed'],
];
const hazardsOf = (tree) =>
  HAZARD_NAMES.filter(([keys]) => keys.some((key) => tree[key])).map(([, name]) => name);

/** The trees (or tags) behind one number, each a link to it on the map. */
function RowsDialog({ metric, lguLabel, rows, onClose }) {
  const tags = metric.of === 'tags';
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
              {lguLabel} · {rows.length} {tags ? (rows.length === 1 ? 'tag' : 'tags') : rows.length === 1 ? 'tree' : 'trees'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <ul className="divide-y divide-slate-100 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
              <span className="font-semibold text-slate-800">{row.species || 'Unknown species'}</span>
              {row.tree_id && <span className="font-mono text-xs text-slate-500">{row.tree_id}</span>}
              <span className="text-xs text-slate-500">{row.barangay || 'No barangay'}</span>
              <span className="text-xs text-slate-600">
                {tags
                  ? row.status === 'dispatched'
                    ? `Out for checking${row.assigned_to ? ` · ${row.assigned_to}` : ''}`
                    : 'Waiting'
                  : [
                      ...hazardsOf(row),
                      metric.key.startsWith('code') ? null : row.stem_quality?.replace(/\s*\(.*\)$/, ''),
                      row.assigned_to ? `· ${row.assigned_to}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
              <Link
                to={mapLinkFor(row, { tag: tags })}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800"
              >
                <MapPin size={12} aria-hidden="true" /> View on map
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** One count; a number above zero opens the trees behind it. */
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

function Overview({ trees, tags, lgus, onOpen }) {
  const [showAll, setShowAll] = useState(false);
  const { byLgu, totals } = useMemo(() => tallyBoard(trees, tags), [trees, tags]);

  const rows = useMemo(() => {
    const list = lgus
      .map((lgu) => ({ lgu: lgu.psgc, label: lgu.label, ...(byLgu.get(lgu.psgc) ?? null) }))
      .filter((row) => showAll || row.counts);
    if (byLgu.has(null)) list.push({ lgu: null, label: 'Not placed in an LGU', ...byLgu.get(null) });
    // Most hazards nobody has been sent to first: where the province looks.
    return list.sort(
      (a, b) =>
        (b.counts?.undispatched ?? 0) - (a.counts?.undispatched ?? 0) ||
        (b.counts?.dispatched ?? 0) - (a.counts?.dispatched ?? 0) ||
        a.label.localeCompare(b.label)
    );
  }, [lgus, byLgu, showAll]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {BOARD_METRICS.map((metric) => {
          const value = totals.counts[metric.key];
          const tone = TONE[metric.tone];
          return (
            <button
              key={metric.key}
              type="button"
              disabled={!value}
              onClick={() => onOpen(metric.key, undefined)}
              aria-label={`${value} — ${metric.label}, all of Laguna`}
              className={`rounded-2xl border border-slate-200 bg-white p-3 text-left transition enabled:hover:shadow-md disabled:cursor-default`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden="true" /> {metric.short}
              </span>
              <span className={`mt-1 block text-2xl font-bold ${value ? tone.text : 'text-slate-300'}`}>{value}</span>
              <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">{metric.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {totals.trees} standing trees in the inventory. Tap a number to see the trees behind it.
        </p>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show LGUs with no trees yet
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">City / municipality</th>
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
                <td colSpan={2 + BOARD_METRICS.length} className="px-3 py-6 text-center text-slate-500">
                  No trees in the inventory yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The Action Board, for PGENRO: the province at a glance, and every LGU's
 * permit logs. Read-only — the work stays with each MENRO/CENRO.
 */
export default function ProvinceBoard() {
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState({ trees: [], tags: [], lgus: [], permits: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(null); // { metric, lgu }

  const load = useCallback(async () => {
    const [trees, tags, lgus, permits] = await Promise.all([
      supabase.from('trees').select('*'),
      supabase.from('pending_trees').select('*'),
      supabase.from('lgus').select('psgc, name, label').order('label'),
      supabase.from('permits').select('*').order('created_at', { ascending: false }),
    ]);
    setLoadError(trees.error?.message ?? '');
    setData({
      trees: trees.data ?? [],
      // A missing table is no reason to hide everything else.
      tags: tags.error ? [] : tags.data ?? [],
      lgus: lgus.error ? [] : (lgus.data ?? []).map((lgu) => ({ ...lgu, psgc: Number(lgu.psgc) })),
      permits: permits.error ? [] : permits.data ?? [],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const labelOf = useCallback(
    (lgu) =>
      lgu == null ? 'Not placed in an LGU' : data.lgus.find((row) => row.psgc === lgu)?.label ?? String(lgu),
    [data.lgus]
  );

  const openMetric = open && metricByKey(open.metric);
  const openRows = open ? rowsBehind(open.metric, open.lgu, data.trees, data.tags) : [];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Action Board</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
          <Eye size={14} aria-hidden="true" />
          Laguna at a glance. Read-only: dispatching, re-assigning and permits stay with each MENRO/CENRO.
        </p>
      </div>

      <div role="tablist" aria-label="Action Board views" className="flex gap-2 border-b border-slate-200">
        {[
          ['overview', 'Overview'],
          ['permits', 'Permit logs'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin text-green-700" aria-hidden="true" /> Loading the province…
        </p>
      ) : loadError ? (
        <p role="alert" className="text-sm text-red-700">{loadError}</p>
      ) : tab === 'overview' ? (
        <Overview
          trees={data.trees}
          tags={data.tags}
          lgus={data.lgus}
          onOpen={(metric, lgu) => setOpen({ metric, lgu })}
        />
      ) : (
        <ProvincePermits permits={data.permits} trees={data.trees} lgus={data.lgus} labelOf={labelOf} />
      )}

      {openMetric && (
        <RowsDialog
          metric={openMetric}
          lguLabel={open.lgu === undefined ? 'All of Laguna' : labelOf(open.lgu)}
          rows={openRows}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
