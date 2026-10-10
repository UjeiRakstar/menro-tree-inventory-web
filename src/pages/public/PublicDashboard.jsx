import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Polygon, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Download, Info, Loader2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../../supabaseClient.js';
import {
  LAGUNA_BOUNDS,
  LAGUNA_MUNICIPALITIES,
  LAGUNA_PROVINCE,
  OUTSIDE_LAGUNA_MASK,
  boundsOfMunicipality,
  municipalityAt,
  municipalityNamed,
} from '../../lib/lagunaBoundaries.js';
import { labelOf } from '../../lib/lguOptions.js';
import {
  METRIC_PAIRS,
  formatFigure,
  groupBy,
  summarise,
} from '../../lib/dashboardMetrics.js';
import {
  barangayForTree,
  barangayIndexReady,
  loadBarangayIndex,
  needsBarangayIndex,
} from '../../lib/barangayLookup.js';
import LguStrip from '../../components/public/LguStrip.jsx';
import DataRequestModal from '../../components/public/DataRequestModal.jsx';

const MARKER_COLOR = '#16a34a';
const MASK_STYLE = { color: 'transparent', weight: 0, fillColor: '#e2e8f0', fillOpacity: 0.75 };
const PROVINCE_STYLE = { color: '#0f172a', weight: 2.5, opacity: 0.9, fill: false };
const MUNICIPALITY_STYLE = { color: '#64748b', weight: 1, opacity: 0.85, fillColor: '#16a34a', fillOpacity: 0.04 };
const SELECTED_STYLE = { color: '#15803d', weight: 3, opacity: 1, fillColor: '#22c55e', fillOpacity: 0.28 };
const HOVER_STYLE = { color: '#15803d', weight: 2, opacity: 1, fillColor: '#22c55e', fillOpacity: 0.14 };

/** How a city or municipality should look, given what is selected. */
const styleFor = (name, selected) => (name === selected ? SELECTED_STYLE : MUNICIPALITY_STYLE);

/** Series colours, matched to how each figure reads: growth green, pressure red. */
const SERIES_COLOR = { green: '#16a34a', red: '#dc2626', blue: '#0ea5e9' };

/** Coerce latitude/longitude to a finite number pair, or null. */
function getLatLng(tree) {
  const lat = Number(tree?.latitude);
  const lng = Number(tree?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

/** Keeps the map over whichever place is selected. */
function FocusController({ selected }) {
  const map = useMap();
  useEffect(() => {
    const bounds = (selected && boundsOfMunicipality(selected)) || LAGUNA_BOUNDS;
    if (!bounds) return;
    map.flyToBounds(bounds, { padding: [24, 24], maxZoom: selected ? 13 : 11, duration: 1 });
  }, [selected, map]);
  return null;
}

/** The ⓘ beside a figure: hover on a mouse, tap on a phone. */
function InfoHint({ label, text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex group align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className="text-slate-400 transition hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded-full"
      >
        <Info size={14} />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-60 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-normal leading-snug text-white shadow-lg ${
          open ? 'block' : 'hidden group-hover:block group-focus-within:block'
        }`}
      >
        {text}
      </span>
    </span>
  );
}

/**
 * One figure.
 *
 * The whole card is the button that charts its pair, so the target is the thing
 * being read rather than a separate control beside it.
 */
function StatCard({ metric, value, note = '', active, onSelect }) {
  const unavailable = !metric.available;
  const tone = metric.tone === 'red' ? 'text-red-700' : 'text-green-800';

  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={`flex h-full w-full flex-col justify-between rounded-2xl border bg-white px-5 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ${
          active
            ? 'border-green-600 shadow-md ring-1 ring-green-600'
            : 'border-slate-200 hover:border-green-400 hover:shadow-sm'
        }`}
      >
        <span
          className={`block min-h-[2.25rem] pr-7 text-[11px] font-bold uppercase leading-snug tracking-wider sm:text-xs ${
            metric.tone === 'red' ? 'text-red-700' : 'text-green-800'
          }`}
        >
          {metric.label}
        </span>

        <span className="mt-3 block">
          <span className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold sm:text-4xl ${unavailable ? 'text-slate-300' : tone}`}>
              {unavailable ? '—' : formatFigure(value)}
            </span>
            {metric.unit && <span className="text-xs text-slate-400">{metric.unit}</span>}
          </span>

          {unavailable && (
            <span className="mt-1 block text-[11px] leading-snug text-slate-500">Not available yet</span>
          )}

          {/* A total built from part of the inventory says which part. */}
          {!unavailable && note && (
            <span className="mt-1 block text-[11px] leading-snug text-slate-500">{note}</span>
          )}
        </span>
      </button>

      {metric.hint && (
        <span className="absolute right-4 top-4">
          <InfoHint label={`What ${metric.label} means`} text={metric.hint} />
        </span>
      )}
    </div>
  );
}

/** The chart under the figures, showing the selected pair place by place. */
function PairChart({ pair, rows, scopeLabel }) {
  const charted = pair.metrics.filter((metric) => metric.available);

  if (charted.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
        <p className="max-w-md text-sm text-slate-500">
          {pair.metrics.map((m) => m.label).join(' and ')} have no source yet, so there is nothing to chart.
          They arrive with the mapping feature.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
        <p className="text-sm text-slate-500">No tagged trees in {scopeLabel} yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 56 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            angle={-35}
            textAnchor="end"
            interval={0}
            height={70}
            tick={{ fontSize: 11, fill: '#475569' }}
          />
          <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
          <Tooltip
            formatter={(value, name) => [formatFigure(value), name]}
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {charted.map((metric) => (
            <Bar
              key={metric.key}
              dataKey={metric.key}
              name={metric.label}
              fill={SERIES_COLOR[metric.tone] || SERIES_COLOR.green}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {charted.length < pair.metrics.length && (
        <p className="mt-2 text-center text-[11px] text-slate-500">
          {pair.metrics.filter((m) => !m.available).map((m) => m.label).join(' and ')} is not connected yet, so
          only what the inventory knows is charted.
        </p>
      )}
    </div>
  );
}

export default function PublicDashboard() {
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  /**
   * Which place is being read, held in the query string rather than in state.
   *
   * That is what makes ?lgu=Santa%20Cruz work — the map's panel links straight
   * here — and it means the page someone is looking at is the page they can
   * send to someone else. A name that is not one of Laguna's thirty is ignored
   * rather than trusted.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedLgu = searchParams.get('lgu') || '';
  const selectedLgu = municipalityNamed(requestedLgu) ? requestedLgu : '';

  const setSelectedLgu = (name) =>
    setSearchParams(
      (params) => {
        const updated = new URLSearchParams(params);
        if (name) updated.set('lgu', name);
        else updated.delete('lgu');
        return updated;
      },
      { replace: true }
    );

  const [activePair, setActivePair] = useState(METRIC_PAIRS[0].id);
  const [requestOpen, setRequestOpen] = useState(false);
  const municipalityLayer = useRef(null);
  const selectedRef = useRef('');
  selectedRef.current = selectedLgu;
  const toggleRef = useRef(null);
  toggleRef.current = (name) => setSelectedLgu(name === selectedLgu ? '' : name);

  /**
   * Make each city or municipality clickable on the map.
   *
   * Picking one here does exactly what picking its seal does, and clicking the
   * selected one again goes back to the whole province. The seals above remain
   * the keyboard route to the same thing, since a Leaflet path cannot be
   * focused.
   */
  const bindMunicipality = useCallback((feature, layer) => {
    const name = feature?.properties?.municipality;
    if (!name) return;
    layer.bindTooltip?.(labelOf(name), { sticky: true, direction: 'top', className: 'text-xs' });
    layer.on({
      click: () => toggleRef.current?.(name),
      mouseover: () => {
        if (name !== selectedRef.current) layer.setStyle(HOVER_STYLE);
      },
      mouseout: () => layer.setStyle(styleFor(name, selectedRef.current)),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      const { data, error } = await supabase.from('trees').select('*');
      if (cancelled) return;
      if (error) setLoadError(error.message || 'The inventory could not be loaded.');
      else setTrees(Array.isArray(data) ? data : []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Which LGU each tree stands in, worked out once for the whole set.
  const treeAreas = useMemo(() => {
    const areas = new Map();
    for (const tree of trees) {
      const position = getLatLng(tree);
      if (!position) continue;
      const name = municipalityAt(position);
      if (name) areas.set(tree.id, name);
    }
    return areas;
  }, [trees]);

  const scopedTrees = useMemo(
    () => (selectedLgu ? trees.filter((tree) => treeAreas.get(tree.id) === selectedLgu) : trees),
    [trees, treeAreas, selectedLgu]
  );

  const totals = useMemo(() => summarise(scopedTrees), [scopedTrees]);

  /**
   * Which part of the inventory the carbon figure speaks for.
   *
   * The DENR equation needs a merchantable height, and not every tree has one
   * recorded. A total from some of the trees is still worth showing — but only
   * if it says so.
   */
  const carbonCoverage = useMemo(() => {
    const { carbonMeasured, treeCount } = totals;
    if (treeCount === 0) return '';
    if (carbonMeasured === 0) return 'No tree here has a merchantable height recorded yet';
    if (carbonMeasured === treeCount) return '';
    return `From ${formatFigure(carbonMeasured)} of ${formatFigure(treeCount)} trees measured`;
  }, [totals]);

  // The barangay of a tree is worked out from where it stands, not from the
  // name someone typed — so the index has to arrive before the bars are right.
  const [barangaysReady, setBarangaysReady] = useState(barangayIndexReady);
  useEffect(() => {
    // Only when some tree still needs working out. Every row the database has
    // settled already carries its barangay, so there is nothing to fetch.
    if (!needsBarangayIndex(trees)) return undefined;
    let cancelled = false;
    loadBarangayIndex()
      .then(() => !cancelled && setBarangaysReady(true))
      .catch(() => {
        // The written names carry the chart until a reload; nothing to say.
      });
    return () => { cancelled = true; };
  }, [trees]);

  // Across the province the bars are LGUs; inside one, they are its barangays.
  const chartRows = useMemo(
    () =>
      selectedLgu
        ? groupBy(scopedTrees, barangayForTree)
        : groupBy(scopedTrees, (tree) => {
            const name = treeAreas.get(tree.id);
            return name ? labelOf(name) : null;
          }),
    // barangaysReady is not read here; it is what re-runs this once the
    // boundaries are in hand.
    [scopedTrees, selectedLgu, treeAreas, barangaysReady]
  );

  const scopeLabel = selectedLgu ? labelOf(selectedLgu) : 'Laguna';
  const pair = METRIC_PAIRS.find((p) => p.id === activePair) ?? METRIC_PAIRS[0];

  const mapPins = useMemo(
    () => scopedTrees.map((tree) => getLatLng(tree)).filter(Boolean),
    [scopedTrees]
  );

  // Restyle the boundaries in place when the selection changes.
  useEffect(() => {
    const group = municipalityLayer.current;
    if (!group) return;
    group.eachLayer((layer) => {
      layer.setStyle(styleFor(layer.feature?.properties?.municipality, selectedLgu));
    });
  }, [selectedLgu]);

  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Who you are looking at */}
        <LguStrip selected={selectedLgu} onSelect={setSelectedLgu} />

        {/* What you are looking at */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold text-green-800 sm:text-4xl">
            {scopeLabel} Biodiversity Analytics
          </h1>

          <span className="inline-flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setRequestOpen(true)}
              className="inline-flex items-center justify-center gap-3 rounded-xl border-2 border-green-700 px-5 py-3 text-sm font-bold text-green-800 transition hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
            >
              Download Data
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-700 text-white">
                <Download size={16} />
              </span>
            </button>
            <InfoHint
              label="What can be downloaded"
              text="Tables, maps and images of this inventory. The exports are still being prepared."
            />
          </span>
        </div>

        {loadError && (
          <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {loadError}
          </p>
        )}

{/* The figures: one column per pair, so the two that belong together are
            always one above the other. */}
        <div className="mt-6 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {METRIC_PAIRS.map((group) => (
            <div key={group.id} className="flex flex-col gap-4">
              {group.metrics.map((metric) => (
                <StatCard
                  key={metric.key}
                  metric={metric}
                  value={totals[metric.key]}
                  note={metric.key === 'carbonKg' ? carbonCoverage : ''}
                  active={activePair === group.id}
                  onSelect={() => setActivePair(group.id)}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Pick any figure to chart its pair below, {selectedLgu ? 'barangay by barangay' : 'across the province'}.
          You can also click a city or municipality on the map to look at it on its own.
        </p>

        {/* Where it is */}
        <div className="relative mt-6 h-[380px] overflow-hidden rounded-2xl border border-slate-200 sm:h-[460px]">
          {loading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/80">
              <span className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 size={18} className="animate-spin text-green-700" />
                Loading the inventory…
              </span>
            </div>
          )}

          {/* Not a tool to navigate: it cannot be panned or zoomed, and the pins
              are not clickable. The one thing it does take is a click on a city
              or municipality, which selects it. */}
          <MapContainer
            bounds={LAGUNA_BOUNDS}
            boundsOptions={{ padding: [24, 24] }}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            dragging={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            touchZoom={false}
            boxZoom={false}
            keyboard={false}
            attributionControl={false}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Polygon positions={OUTSIDE_LAGUNA_MASK} pathOptions={MASK_STYLE} interactive={false} />
            <GeoJSON
              ref={municipalityLayer}
              data={LAGUNA_MUNICIPALITIES}
              style={(feature) => styleFor(feature.properties.municipality, selectedLgu)}
              onEachFeature={bindMunicipality}
            />
            <GeoJSON data={LAGUNA_PROVINCE} style={PROVINCE_STYLE} interactive={false} />
            <FocusController selected={selectedLgu} />

            {mapPins.map((position, i) => (
              <CircleMarker
                key={`${position[0]},${position[1]},${i}`}
                center={position}
                radius={5}
                interactive={false}
                pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: MARKER_COLOR, fillOpacity: 0.9 }}
              />
            ))}
          </MapContainer>
        </div>

        {/* How it is distributed */}
        <h2 className="mt-8 text-sm font-bold uppercase tracking-wider text-slate-600">
          {pair.title} — {selectedLgu ? `barangays of ${scopeLabel}` : 'cities and municipalities of Laguna'}
        </h2>
        <div className="mt-3">
          <PairChart pair={pair} rows={chartRows} scopeLabel={scopeLabel} />
        </div>
      </div>

      <DataRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} />
    </div>
  );
}
