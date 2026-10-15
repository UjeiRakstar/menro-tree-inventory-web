import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Eye, Loader2, MapPin, X } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import {
  BOARD_METRICS,
  RECENT_DAYS,
  mapLinkFor,
  metricByKey,
  officesByLgu,
  rowsBehind,
  tallyBoard,
} from '../../lib/provinceBoard.js';
import { namriaClassById } from '../../lib/namriaCover.js';
import ProvincePermits from './ProvincePermits.jsx';
import PlantingRequests from '../../components/PlantingRequests.jsx';

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

/** The trees, tags or areas behind one number, each a link to it on the map. */
function RowsDialog({ metric, lguLabel, rows, onClose }) {
  const noun = { tags: ['tag', 'tags'], areas: ['area', 'areas'], trees: ['tree', 'trees'] }[metric.of];
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
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <ul className="divide-y divide-slate-100 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
              <span className="font-semibold text-slate-800">
                {metric.of === 'areas' ? row.name : row.species || 'Unknown species'}
              </span>
              {row.tree_id && <span className="font-mono text-xs text-slate-500">{row.tree_id}</span>}
              <span className="text-xs text-slate-500">{row.barangay || (metric.of === 'areas' ? '' : 'No barangay')}</span>
              <span className="text-xs text-slate-600">{rowDetail(row, metric)}</span>
              <Link
                to={mapLinkFor(row, { of: metric.of })}
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

function Tile({ metric, value, note, onOpen }) {
  const tone = TONE[metric.tone];
  return (
    <button
      type="button"
      disabled={!value}
      onClick={onOpen}
      aria-label={`${value} — ${metric.label}, all of Laguna`}
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

function Overview({ trees, tags, areas, offices, lgus, onOpen }) {
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

  const noteFor = (metric) =>
    metric.key === 'mapped' && totals.coverHa > 0 ? `${hectares(totals.coverHa)} ha of tree cover` : '';

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
                value={totals.counts[metric.key]}
                note={noteFor(metric)}
                onOpen={() => onOpen(metric.key, undefined)}
              />
            ))}
            {group === 'progress' && (
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
    </div>
  );
}

/**
 * The Action Board, for PGENRO: the province at a glance, and every LGU's
 * permit logs. Read-only — the work stays with each MENRO/CENRO.
 */
export default function ProvinceBoard() {
  // ?tab=requests opens the planting site requests (the header's menu links there).
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => (searchParams.get('tab') === 'requests' ? 'requests' : 'overview'));
  useEffect(() => {
    if (searchParams.get('tab') === 'requests') setTab('requests');
  }, [searchParams]);
  const [data, setData] = useState({ trees: [], tags: [], areas: [], profiles: [], lgus: [], permits: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(null); // { metric, lgu }

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
      areas: rowsOf(areas),
      profiles: rowsOf(profiles),
      lgus: rowsOf(lgus).map((lgu) => ({ ...lgu, psgc: Number(lgu.psgc) })),
      permits: rowsOf(permits),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const offices = useMemo(() => officesByLgu(data.profiles), [data.profiles]);

  const labelOf = useCallback(
    (lgu) =>
      lgu == null ? 'Not placed in an LGU' : data.lgus.find((row) => row.psgc === lgu)?.label ?? String(lgu),
    [data.lgus]
  );

  const openMetric = open && metricByKey(open.metric);
  const openRows = open ? rowsBehind(open.metric, open.lgu, data.trees, data.tags, data.areas) : [];

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
          ['requests', 'Planting site requests'],
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
          areas={data.areas}
          offices={offices}
          lgus={data.lgus}
          onOpen={(metric, lgu) => setOpen({ metric, lgu })}
        />
      ) : tab === 'requests' ? (
        <PlantingRequests decides />
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

