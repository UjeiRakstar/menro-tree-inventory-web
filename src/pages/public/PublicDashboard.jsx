import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Polygon, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CalendarRange,
  Download,
  Leaf,
  Loader2,
  MapPin,
  Maximize2,
  Ruler,
  TreePine,
} from 'lucide-react';
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
  MUNICIPALITY_LIST,
  OUTSIDE_LAGUNA_MASK,
  boundsOfMunicipality,
  municipalityAt,
  municipalityNamed,
  boundsOf,
} from '../../lib/lagunaBoundaries.js';
import { barangaysOf, labelOf } from '../../lib/lguOptions.js';
import { useMapAreas } from '../../hooks/useMapAreas.js';
import { summariseMappedCover } from '../../lib/mappedCover.js';
import { formatTonnesPerYear } from '../../lib/landCover.js';
import { PLANNING_ONLY } from '../../lib/namriaCover.js';
import {
  FORESTRY_PAIR,
  METRIC_PAIRS,
  PENDING_METRICS,
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
import { PUBLIC_DASHBOARD_COLUMNS, selectPublicTrees } from '../../lib/treeColumns.js';
import { loadWoodDensities, withWoodDensities } from '../../lib/woodDensities.js';
import { MIN_MERCHANTABLE_HEIGHT_M, VOLUME_COEFFICIENT, measuredCoverage } from '../../lib/treeVolume.js';
import {
  ANNUAL_DBH_GROWTH_CM,
  CARBON_FRACTION,
  DEFAULT_WOOD_DENSITY,
  carbonCoverage,
} from '../../lib/treeCarbon.js';
import InfoHint from '../../components/public/InfoHint.jsx';
import {
  ProvisionalKey,
  ProvisionalNote,
  ProvisionalTag,
} from '../../components/public/Provisional.jsx';
import LguStrip from '../../components/public/LguStrip.jsx';
import DataRequestModal from '../../components/public/DataRequestModal.jsx';
import LguPlanBadges from '../../components/public/LguPlanBadges.jsx';
import SpeciesSection from '../../components/public/SpeciesSection.jsx';
import CoverageSection from '../../components/public/CoverageSection.jsx';
import SizeSection from '../../components/public/SizeSection.jsx';
import GrowthStrip from '../../components/public/GrowthStrip.jsx';
import {
  RECENT_DAYS,
  formatDate,
  lastTagged,
  taggedRecently,
  taggingTimeline,
  timeAgo,
  undated,
} from '../../lib/inventoryFreshness.js';

const MARKER_COLOR = '#16a34a';
const MASK_STYLE = { color: 'transparent', weight: 0, fillColor: '#e2e8f0', fillOpacity: 0.75 };
const PROVINCE_STYLE = { color: '#0f172a', weight: 2.5, opacity: 0.9, fill: false };
const MUNICIPALITY_STYLE = { color: '#64748b', weight: 1, opacity: 0.85, fillColor: '#16a34a', fillOpacity: 0.04 };
const SELECTED_STYLE = { color: '#15803d', weight: 3, opacity: 1, fillColor: '#22c55e', fillOpacity: 0.28 };
const HOVER_STYLE = { color: '#15803d', weight: 2, opacity: 1, fillColor: '#22c55e', fillOpacity: 0.14 };

/** How a city or municipality should look, given what is selected. */
const styleFor = (name, selected) => (name === selected ? SELECTED_STYLE : MUNICIPALITY_STYLE);

/**
 * The four detail views, one at a time.
 *
 * Stacked, they made the page a scroll and nothing below the figures was ever
 * on screen with them. Behind tabs each is a step a reader takes on purpose.
 */
const DETAIL_TABS = [
  // First (decided 18 October): the figures the offices report.
  { key: 'forestry', label: 'Forestry', icon: TreePine },
  { key: 'species', label: 'Species', icon: Leaf },
  { key: 'places', label: 'Places', icon: MapPin },
  { key: 'sizes', label: 'Sizes', icon: Ruler },
  { key: 'survey', label: 'Survey', icon: CalendarRange },
];

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

/**
 * The map can be explored, but only Laguna: dragged no further than the
 * province's edge, and zoomed out no further than the whole of it.
 */
function KeepToLaguna() {
  const map = useMap();
  useEffect(() => {
    if (!LAGUNA_BOUNDS) return;
    map.setMaxBounds?.(LAGUNA_BOUNDS);
    const whole = map.getBoundsZoom?.(LAGUNA_BOUNDS);
    if (Number.isFinite(whole)) map.setMinZoom?.(whole);
  }, [map]);
  return null;
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
    <div className="relative bg-white">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        /* The figure is first on screen because six of these are scanned, not
           read. Spoken, that order is useless — a bare number before its
           name — so the accessible name puts the label back in front. */
        aria-label={[
          metric.label,
          unavailable ? 'not available yet' : `${formatFigure(value)} ${metric.unit}`.trim(),
          !unavailable && note ? note : '',
        ]
          .filter(Boolean)
          .join(', ')}
        className={`flex h-full w-full flex-col justify-between px-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-600 sm:px-4 ${
          active ? 'bg-green-50/70' : 'hover:bg-slate-50'
        }`}
      >
        {/* The number first and largest: a reader scanning six of these is
            comparing figures, not reading labels. */}
        <span className="flex items-baseline gap-1">
          <span
            className={`text-2xl font-bold leading-none sm:text-3xl ${
              unavailable ? 'text-slate-300' : tone
            }`}
          >
            {unavailable ? '—' : formatFigure(value)}
          </span>
          {metric.unit && !unavailable && (
            <span className="text-[10px] leading-tight text-slate-400">{metric.unit}</span>
          )}
        </span>

        <span
          className={`mt-1.5 block pr-5 text-[10px] font-semibold uppercase leading-tight tracking-wide ${
            metric.tone === 'red' ? 'text-red-700/90' : 'text-slate-600'
          }`}
        >
          {metric.label}
        </span>

        {/* Context under the figure: how much of the inventory it speaks for,
            or how it has moved. A number alone is raw data. */}
        {unavailable ? (
          <span className="mt-1 block text-[10px] font-semibold leading-snug text-amber-700">
            Awaiting data
          </span>
        ) : (
          note && <span className="mt-1 block text-[10px] leading-snug text-slate-500">{note}</span>
        )}

        {/* The chosen pair is marked with a rule, not by tint alone. */}
        <span
          aria-hidden="true"
          className={`mt-2 block h-0.5 rounded-full ${active ? 'bg-green-600' : 'bg-transparent'}`}
        />
      </button>

      {metric.hint && (
        <span className="absolute right-1.5 top-2.5">
          <InfoHint label={`What ${metric.label} means`} text={metric.hint} />
        </span>
      )}
    </div>
  );
}

/**
 * Every constant behind the two forestry figures, and which of them is a guess:
 * the volume from the DENR's equation, the growth from Chave et al. 2014 —
 * the equation the carbon on the headline comes from too.
 *
 * This sits on the Forestry tab because that is who it is for: a MENRO officer
 * putting standing volume into a report needs to be able to say where each
 * number came from, and an assumption nobody can find is one nobody can
 * challenge. The values are read out of src/lib/treeVolume.js rather than
 * typed here, so the page cannot quietly disagree with the arithmetic.
 */
function WorkingsCard({ trees }) {
  const coverage = measuredCoverage(trees);
  const growthCoverage = carbonCoverage(trees);

  const rows = [
    {
      label: 'Volume equation',
      value: 'V = c × D² × H',
      note: 'FMB Technical Bulletin No. 3, Southern Luzon',
    },
    {
      label: 'Coefficient c',
      value: `${VOLUME_COEFFICIENT.dipterocarp} / ${VOLUME_COEFFICIENT.nonDipterocarp}`,
      note: 'dipterocarp / non-dipterocarp',
    },
    {
      label: 'Shortest bole counted',
      value: `${MIN_MERCHANTABLE_HEIGHT_M} m`,
      note: 'anything less is not a merchantable bole',
    },
    {
      label: 'Biomass and carbon',
      value: 'AGB = 0.0673 × (ρD²H)^0.976',
      note: 'Chave et al. 2014, on total height',
    },
    {
      label: 'Wood density ρ',
      value: `${DEFAULT_WOOD_DENSITY} g/cm³`,
      note: 'tropical Asian mean (Reyes et al. 1992)',
    },
    { label: 'Carbon fraction', value: `${CARBON_FRACTION}`, note: 'Philippine wood (Lasco & Pulhin 2000)' },
  ];

  return (
    <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
        How these are worked out
      </h3>

      <dl className="mt-3 divide-y divide-slate-100 text-[11px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-slate-500">{row.label}</dt>
            <dd className="shrink-0 text-right">
              <span className="font-semibold tabular-nums text-slate-700">{row.value}</span>
              {row.note && <span className="block text-[10px] text-slate-400">{row.note}</span>}
            </dd>
          </div>
        ))}
      </dl>

      {/* Borrowed: a Philippine measurement, not a Laguna one. */}
      <ProvisionalNote
        kind="borrowed"
        title={`${ANNUAL_DBH_GROWTH_CM} cm of diameter growth a year`}
        className="mt-3"
      >
        The mean annual increment of sixty species on Leyte (Schneider et al. 2013), applied to city
        trees in Cebu (Pansit 2019). Measured in the Philippines rather than in Laguna, and applicable
        here; the increment scales straight off it, so a figure measured on Laguna&apos;s own trees would
        make it exact.
      </ProvisionalNote>

      <ProvisionalNote kind="awaiting" title="per hectare" className="mt-2">
        Both figures are totals for the TAGGED TREES, not per hectare. Hectares need the mapping
        feature to delineate cover first; nothing here can derive them.
      </ProvisionalNote>

      {/* Live, so NOT amber: this moves every time somebody records a height. */}
      <p className="mt-2.5 text-[10.5px] leading-snug text-slate-400">
        The volume covers {formatFigure(coverage.measured)} of {formatFigure(coverage.total)} trees, the
        ones with a merchantable height; the growth {formatFigure(growthCoverage.measured)}, the ones with
        a total height. The rest are left out rather than guessed at.
      </p>
    </div>
  );
}

/** The chart under the figures, showing the selected pair place by place. */
/** How many places the chart draws before the names stop being readable. */
const CHARTED_PLACES = 12;

function PairChart({ pair, rows, scopeLabel }) {
  const charted = pair.metrics.filter((metric) => metric.available);

  if (charted.length === 0) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center px-6 text-center">
        <p className="max-w-md text-sm text-slate-500">
          {pair.metrics.map((m) => m.label).join(' and ')} have no source yet, so there is nothing
          to chart.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center px-6 text-center">
        <p className="text-sm text-slate-500">No tagged trees in {scopeLabel} yet.</p>
      </div>
    );
  }

  /*
   * Twenty-six barangays at an angle is a smear of overlapping text, and the
   * tail of the list is a row of bars a pixel high. The top twelve are the
   * ones with anything to say; the rest are named in the Places tab, which is
   * a list and does not have this problem.
   */
  const shown = rows.slice(0, CHARTED_PLACES);
  const hidden = rows.length - shown.length;

  /*
   * TWO AXES, NOT ONE. The metrics in a pair share a subject, not a scale:
   * standing volume runs to 28 m³ in a barangay while the biomass it adds in
   * a year is about 0.1 Mg, and carbon stored is eighty times what is taken
   * up in a year. On a single axis the second series is a flat line along the
   * bottom — drawn, truthful and completely unreadable. Each gets its own
   * axis, coloured to match the bars it belongs to.
   */
  const twoScales = charted.length === 2;

  return (
    <div className="h-full">
      <ResponsiveContainer width="100%" height="100%" minHeight={260}>
        <BarChart data={shown} margin={{ top: 8, right: twoScales ? 4 : 8, left: -8, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="name"
            angle={-40}
            textAnchor="end"
            interval={0}
            height={76}
            tick={{ fontSize: 10, fill: '#475569' }}
          />
          <YAxis
            yAxisId="left"
            width={46}
            tick={{ fontSize: 10, fill: SERIES_COLOR[charted[0].tone] || SERIES_COLOR.green }}
          />
          {twoScales && (
            <YAxis
              yAxisId="right"
              orientation="right"
              width={46}
              tick={{ fontSize: 10, fill: SERIES_COLOR[charted[1].tone] || SERIES_COLOR.green }}
            />
          )}
          <Tooltip
            formatter={(value, name) => [formatFigure(value), name]}
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {charted.map((metric, index) => (
            <Bar
              key={metric.key}
              yAxisId={twoScales && index === 1 ? 'right' : 'left'}
              dataKey={metric.key}
              name={metric.label}
              fill={SERIES_COLOR[metric.tone] || SERIES_COLOR.green}
              radius={[3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <p className="mt-1 text-center text-[10px] leading-snug text-slate-400">
        {twoScales && 'Each figure has its own axis — they share a subject, not a scale. '}
        {hidden > 0 && `Top ${CHARTED_PLACES} of ${rows.length}; the rest are in the Places tab.`}
      </p>
    </div>
  );
}

/**
 * The public BioDashboard, as everyone sees it.
 */
export default function PublicDashboard() {
  return <BioDashboardView />;
}

/** An office's map follows its barangay: in to the one chosen, out to the LGU. */
function BarangayFocus({ shapes, barangay, lgu }) {
  const map = useMap();
  useEffect(() => {
    if (!shapes || !lgu) return;
    const feature = barangay ? shapes.features.find((f) => f.properties.barangay === barangay) : null;
    const bounds = feature ? boundsOf(feature.geometry) : boundsOfMunicipality(lgu);
    if (bounds) map.flyToBounds?.(bounds, { padding: [24, 24], duration: 0.8 });
  }, [shapes, barangay, lgu, map]);
  return null;
}

// The barangay lines, fetched only when an office's dashboard needs them.
let barangaysOnce = null;
const loadBarangayShapes = () => {
  barangaysOnce ??= import('../../data/Laguna-Barangays.geojson').then((module) => module.default);
  return barangaysOnce;
};
const BARANGAY_STYLE = { color: '#64748b', weight: 1, opacity: 0.8, dashArray: '3 3', fillColor: '#16a34a', fillOpacity: 0.03 };
const BARANGAY_SELECTED_STYLE = { color: '#15803d', weight: 2.5, opacity: 1, dashArray: null, fillColor: '#22c55e', fillOpacity: 0.3 };

/**
 * The BioDashboard, for whoever is reading it (decided 17 October):
 *
 *   audience 'public'  the province, an LGU chosen from the seals; Download
 *   audience 'pgenro'  the same, without Download — and `top`, PGENRO's
 *                      summary of what needs action, above the figures
 *   lockedLgu          an office's own LGU, always: no seals to choose from,
 *                      but its barangays — from a list, or on its map
 *
 * `top` is what the reader must act on, put before what they read.
 */
export function BioDashboardView({ audience = 'public', lockedLgu = null, top = null }) {
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
  const selectedLgu = lockedLgu ?? (municipalityNamed(requestedLgu) ? requestedLgu : '');
  // An office's dashboard narrows to one of its barangays, or none.
  const [barangay, setBarangay] = useState('');
  const barangayNames = useMemo(() => (lockedLgu ? barangaysOf(lockedLgu) : []), [lockedLgu]);

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
  const [detail, setDetail] = useState(DETAIL_TABS[0].key);
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
      // Each species' own wood density, for the carbon, read alongside.
      const [{ data, error }, densities] = await Promise.all([
        selectPublicTrees(supabase, PUBLIC_DASHBOARD_COLUMNS),
        loadWoodDensities(supabase),
      ]);
      if (cancelled) return;
      if (error) setLoadError(error.message || 'The inventory could not be loaded.');
      else setTrees(withWoodDensities(Array.isArray(data) ? data : [], densities));
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

  // The LGU in view — and, within it, the barangay chosen, if any.
  const lguTrees = useMemo(
    () => (selectedLgu ? trees.filter((tree) => treeAreas.get(tree.id) === selectedLgu) : trees),
    [trees, treeAreas, selectedLgu]
  );
  const scopedTrees = useMemo(
    () => (barangay ? lguTrees.filter((tree) => barangayForTree(tree) === barangay) : lguTrees),
    // barangaysReady re-runs this once the boundaries are in hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lguTrees, barangay, barangaysReady]
  );

  const totals = useMemo(() => summarise(scopedTrees), [scopedTrees]);

  /**
   * Which part of the inventory the carbon figure speaks for.
   *
   * The DENR equation needs a merchantable height, and not every tree has one
   * recorded. A total from some of the trees is still worth showing — but only
   * if it says so.
   */
  /**
   * When this place was last added to.
   *
   * A survey whose newest tree was tagged six weeks ago is not out of date —
   * it means nobody has been out in six weeks, which is a fact about the
   * survey rather than a fault in the data. The page reports it and leaves the
   * judgement to the reader.
   */
  const freshness = useMemo(
    () => ({
      lastTagged: lastTagged(scopedTrees),
      recent: taggedRecently(scopedTrees),
      undated: undated(scopedTrees),
      timeline: taggingTimeline(scopedTrees),
    }),
    [scopedTrees]
  );

  /** "+6 in the last 30 days", or that nobody has been out. */
  const recentLine = useMemo(() => {
    if (!freshness.lastTagged) return '';
    if (freshness.recent === 0) return `None tagged in the last ${RECENT_DAYS} days`;
    return `+${formatFigure(freshness.recent)} in the last ${RECENT_DAYS} days`;
  }, [freshness]);

  const carbonCoverage = useMemo(() => {
    const { carbonMeasured, treeCount } = totals;
    if (treeCount === 0) return '';
    if (carbonMeasured === 0) return 'No tree here has a diameter and total height recorded yet';
    if (carbonMeasured === treeCount) return '';
    return `From ${formatFigure(carbonMeasured)} of ${formatFigure(treeCount)} trees measured`;
  }, [totals]);

  // Across the province the bars are LGUs; inside one, they are its barangays.
  const chartRows = useMemo(
    () =>
      selectedLgu
        ? groupBy(lguTrees, barangayForTree)
        : groupBy(lguTrees, (tree) => {
            const name = treeAreas.get(tree.id);
            return name ? labelOf(name) : null;
          }),
    // barangaysReady is not read here; it is what re-runs this once the
    // boundaries are in hand.
    [lguTrees, selectedLgu, treeAreas, barangaysReady]
  );

  const scopeLabel = barangay
    ? `Brgy. ${barangay}, ${labelOf(selectedLgu)}`
    : selectedLgu
      ? labelOf(selectedLgu)
      : 'Laguna';

  // An office's map shows its barangays, each a click away from being chosen.
  const [barangayShapes, setBarangayShapes] = useState(null);
  useEffect(() => {
    if (!lockedLgu) return undefined;
    let cancelled = false;
    loadBarangayShapes()
      .then((data) => {
        if (cancelled) return;
        setBarangayShapes({
          type: 'FeatureCollection',
          features: data.features.filter((f) => f.properties.municipality === lockedLgu),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lockedLgu]);
  const barangayRef = useRef('');
  barangayRef.current = barangay;

  // Tree cover the LGU offices have mapped, in the place in view.
  const savedAreas = useMapAreas();
  const mappedCover = useMemo(
    () => summariseMappedCover(savedAreas.features, { municipality: selectedLgu }),
    [savedAreas.features, selectedLgu]
  );
  const pendingMetrics = PENDING_METRICS.filter(
    (metric) => !(metric.key === 'forestCoverHa' && mappedCover.areas > 0)
  );

  /**
   * Every place in scope, including the ones with no trees in them.
   *
   * This is what lets the page name a barangay nobody has surveyed. It cannot
   * come from the inventory — an empty barangay puts no row in it — so it
   * comes from the PSA list the boundaries were built from.
   */
  const places = useMemo(
    () =>
      selectedLgu
        ? barangaysOf(selectedLgu).map((name) => ({ name, label: name }))
        : MUNICIPALITY_LIST.map((lgu) => ({ name: lgu.name, label: lgu.label })),
    [selectedLgu]
  );
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
      {/* Full width. A dashboard is read across, and a 1152px column on a
          1900px screen left a third of the browser empty while the chart
          crushed twenty-six barangay names into half of what was left. */}
      <div className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Who you are looking at */}
        {!lockedLgu && <LguStrip selected={selectedLgu} onSelect={setSelectedLgu} />}

        {/* What you are looking at.
            The title and the freshness line stack in one column so the title
            has the width to stay on one line — it was breaking into three
            ("Santa Cruz / Biodiversity / Analytics") because the date was a
            full-width flex sibling squeezing it from the right. */}
        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight text-green-800 sm:text-3xl">
              {scopeLabel} Biodiversity Analytics
            </h1>
            {selectedLgu && (
              <div className="mt-1.5">
                <LguPlanBadges lguPsgc={MUNICIPALITY_LIST.find((item) => item.name === selectedLgu)?.psgc} />
              </div>
            )}

            {/* Every figure below was true at some moment; this says which. */}
            <p className="mt-1 text-xs text-slate-500">
              {freshness.lastTagged ? (
                <>
                  Newest tag {formatDate(freshness.lastTagged)}{' '}
                  <span className="text-slate-400">({timeAgo(freshness.lastTagged)})</span>
                  {freshness.undated > 0 &&
                    `. ${formatFigure(freshness.undated)} ${
                      freshness.undated === 1 ? 'tree is' : 'trees are'
                    } undated`}
                </>
              ) : (
                'No tree here records when it was tagged.'
              )}
            </p>
          </div>

          {lockedLgu && (
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              Barangay
              <select
                value={barangay}
                onChange={(event) => setBarangay(event.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 focus:border-green-600 focus:outline-none"
              >
                <option value="">All of {labelOf(lockedLgu)}</option>
                {barangayNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          )}

          {audience === 'public' && (
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRequestOpen(true)}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border-2 border-green-700 px-4 py-2.5 text-sm font-bold text-green-800 transition hover:bg-green-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
            >
              Download Data
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-700 text-white">
                <Download size={14} />
              </span>
            </button>
            <InfoHint
              label="What can be downloaded"
              text="Tables, maps and images of this inventory. The exports are still being prepared."
            />
          </span>
          )}
        </div>

        {/* What needs doing, before what there is to read */}
        {top && <div className="mt-5">{typeof top === 'function' ? top({ barangay }) : top}</div>}

        {loadError && (
          <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {loadError}
          </p>
        )}

        {/* The figures: one row of six, hairline-separated. A dashboard is
            read across before it is read down, and six stacked cards push
            everything else off the first screen. */}
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
          {METRIC_PAIRS.flatMap((group) =>
            group.metrics.map((metric) => (
              <StatCard
                key={metric.key}
                metric={metric}
                value={totals[metric.key]}
                note={
                  metric.key === 'carbonKg'
                    ? carbonCoverage
                    : metric.key === 'treeCount'
                      ? recentLine
                      : ''
                }
                active={activePair === group.id}
                onSelect={() => setActivePair(group.id)}
              />
            ))
          )}
        </div>

        {/* Where it is, and how it is spread — side by side, because one
            answers "where" and the other "how much where", and a reader
            wants them in the same glance. */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* `isolate` matters here. Leaflet stacks its panes up past z-index
            600, and the site header is sticky at z-50 — so scrolling put the
            map on top of the navigation. Isolating makes a stacking context,
            which keeps Leaflet's numbers scoped inside this box instead of
            competing with the page. */}
        <div className="relative isolate h-[320px] overflow-hidden rounded-2xl border border-slate-200 sm:h-[380px]">
          {loading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/80">
              <span className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 size={18} className="animate-spin text-green-700" />
                Loading the inventory…
              </span>
            </div>
          )}

          {/* The way to the full map, for whoever wants more than this view. */}
          <Link
            to={audience === 'public' ? '/public-map' : '/map'}
            className="absolute right-3 top-3 z-[1000] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-white hover:text-green-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          >
            <Maximize2 size={14} aria-hidden="true" />
            Enlarge map
          </Link>

          {/* Explored within Laguna (KeepToLaguna): dragged and zoomed with the
              buttons, a double click or a pinch. The scroll wheel stays the
              page's, so scrolling past the map never zooms it. The pins are
              not clickable; a click on a city or municipality selects it. */}
          <MapContainer
            bounds={LAGUNA_BOUNDS}
            boundsOptions={{ padding: [24, 24] }}
            style={{ height: '100%', width: '100%' }}
            zoomControl
            dragging
            scrollWheelZoom={false}
            doubleClickZoom
            touchZoom
            boxZoom={false}
            keyboard={false}
            maxBoundsViscosity={1}
            attributionControl={false}
          >
            <KeepToLaguna />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Polygon positions={OUTSIDE_LAGUNA_MASK} pathOptions={MASK_STYLE} interactive={false} />
            <GeoJSON
              ref={municipalityLayer}
              data={LAGUNA_MUNICIPALITIES}
              style={(feature) => styleFor(feature.properties.municipality, selectedLgu)}
              onEachFeature={bindMunicipality}
            />
            <GeoJSON data={LAGUNA_PROVINCE} style={PROVINCE_STYLE} interactive={false} />
            {barangayShapes && (
              <GeoJSON
                key={`brgy-${barangay}`}
                data={barangayShapes}
                style={(feature) => (feature.properties.barangay === barangay ? BARANGAY_SELECTED_STYLE : BARANGAY_STYLE)}
                onEachFeature={(feature, layer) => {
                  const name = feature.properties.barangay;
                  layer.bindTooltip?.(name, { sticky: true, direction: 'top', className: 'text-xs' });
                  // The one chosen drawn over its neighbours, its whole outline showing.
                  if (name === barangay) setTimeout(() => layer.bringToFront?.(), 0);
                  layer.on({ click: () => setBarangay(name === barangayRef.current ? '' : name) });
                }}
              />
            )}
            <BarangayFocus shapes={barangayShapes} barangay={barangay} lgu={lockedLgu} />
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

        {/* How it is distributed — the pair chosen above, place by place */}
        <div className="flex min-h-[320px] flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:min-h-[380px] sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            {pair.title}
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {selectedLgu ? `By barangay of ${scopeLabel}` : 'By city and municipality'} · pick any
            figure above to change this
          </p>
          <div className="mt-2 flex-1">
            <PairChart pair={pair} rows={chartRows} scopeLabel={scopeLabel} />
          </div>
        </div>
        </div>

        {/* The detail, one question at a time.
            These were four full-width sections stacked down the page, which
            made the dashboard a scroll: nothing below the figures was ever on
            screen with them. Behind tabs, each is a step a reader takes on
            purpose rather than one they have to pass through. */}
        <div className="mt-6">
          <div
            role="tablist"
            aria-label="What to look at"
            className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
          >
            {DETAIL_TABS.map((tab) => {
              const Icon = tab.icon;
              const current = detail === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`detail-tab-${tab.key}`}
                  aria-selected={current}
                  aria-controls="detail-panel"
                  onClick={() => setDetail(tab.key)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 sm:flex-none ${
                    current ? 'bg-white text-green-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon size={14} aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div
            id="detail-panel"
            role="tabpanel"
            aria-labelledby={`detail-tab-${detail}`}
            tabIndex={-1}
            className="mt-4"
          >
            {detail === 'species' && (
              <SpeciesSection trees={scopedTrees} scopeLabel={scopeLabel} />
            )}
            {detail === 'places' && (
              <CoverageSection
                trees={scopedTrees}
                keyOf={selectedLgu ? barangayForTree : (tree) => treeAreas.get(tree.id) ?? null}
                allPlaces={places}
                scopeLabel={scopeLabel}
                noun={selectedLgu ? 'barangay' : 'city or municipality'}
                nounPlural={selectedLgu ? 'barangays' : 'cities and municipalities'}
              />
            )}
            {detail === 'sizes' && <SizeSection trees={scopedTrees} scopeLabel={scopeLabel} />}
            {detail === 'survey' && (
              <GrowthStrip timeline={freshness.timeline} scopeLabel={scopeLabel} />
            )}
            {detail === 'forestry' && (
              <section aria-label="Forestry figures">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
                  Forestry figures for {scopeLabel}
                </h2>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
                  How a stand is reported to the DENR. These are inventory terms rather than public
                  ones, which is why they sit here and not among the figures above — but they are
                  what MENRO and the decision-support work are built on, and both come straight out
                  of the volume equation in FMB Technical Bulletin No. 3.
                </p>

                <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 lg:grid-cols-1">
                      {FORESTRY_PAIR.metrics.map((metric) => (
                        <StatCard
                          key={metric.key}
                          metric={metric}
                          value={totals[metric.key]}
                          note={carbonCoverage}
                          active={false}
                          onSelect={() => {}}
                        />
                      ))}
                    </div>

                    {/* What used to be empty column. Anyone defending these two
                        figures in a report needs every constant behind them,
                        and this is the one tab where that belongs. */}
                    <WorkingsCard trees={scopedTrees} />
                  </div>

                  <div className="flex min-h-[300px] flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      {FORESTRY_PAIR.title}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {selectedLgu ? `By barangay of ${scopeLabel}` : 'By city and municipality'}
                    </p>
                    <div className="mt-2 flex-1">
                      <PairChart pair={FORESTRY_PAIR} rows={chartRows} scopeLabel={scopeLabel} />
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Tree cover as the offices have mapped it, and what is not here yet,
            side by side when both are shown (20 October): one row, no empty
            half beside the mapped card. */}
        <div className={`mt-10 grid gap-x-3 gap-y-10 ${mappedCover.areas > 0 ? 'lg:grid-cols-2' : ''}`}>
        {/* A real figure, but only of what has been drawn, and the card says so. */}
        {mappedCover.areas > 0 && (
          <section aria-label="Mapped tree cover" className="flex flex-col">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">From the map</h2>
            <div className="mt-3 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Forest / Tree Cover Area — mapped
              </p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-green-800">
                  {mappedCover.hectares.toLocaleString('en-US', {
                    minimumFractionDigits: mappedCover.hectares < 10 ? 2 : 1,
                    maximumFractionDigits: mappedCover.hectares < 10 ? 2 : 1,
                  })}
                </span>
                <span className="text-xs text-slate-500">ha</span>
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                Across {mappedCover.areas} {mappedCover.areas === 1 ? 'area' : 'areas'} the LGU offices have mapped in{' '}
                {scopeLabel}: {mappedCover.byClass.map((c) => `${c.label} ${c.hectares.toFixed(1)} ha`).join(' · ')}.
                Only what has been mapped — not all of {scopeLabel}&rsquo;s tree cover.
              </p>
              {mappedCover.biomassTPerYear > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-700">
                  About <strong>{formatTonnesPerYear(mappedCover.biomassTPerYear)} t</strong> of above-ground biomass a
                  year, at each class&rsquo;s published rate.
                  <ProvisionalTag kind="borrowed" />
                </p>
              )}
              {mappedCover.unratedHa > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {mappedCover.unratedHa.toFixed(1)} ha has no published rate, and is not counted in the growth.
                </p>
              )}
              <p className="mt-2 text-[10.5px] text-slate-400">{PLANNING_ONLY}</p>
            </div>
          </section>
        )}

        {/* Asked for, and honestly not here yet. Shown small rather than
            omitted: the public looks for these, and a page that left them out
            would read as though nobody had thought of them. */}
        <section aria-label="Figures not available yet" className="flex flex-col">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
            Not available yet
          </h2>
          <ul className={`mt-3 grid flex-1 auto-rows-fr grid-cols-1 gap-3 ${mappedCover.areas > 0 ? '' : 'sm:grid-cols-2'}`}>
            {pendingMetrics.map((metric) => (
              <li
                key={metric.key}
                data-provisional="awaiting"
                className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3"
              >
                <p className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
                    {metric.label}
                  </span>
                  <ProvisionalTag kind="awaiting" />
                </p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-amber-300">—</span>
                  <span className="text-xs text-amber-700/80">{metric.unit}</span>
                </p>
                <p className="mt-1 text-[11px] leading-snug text-amber-800">
                  Waiting on {metric.waitingOn}.
                </p>
              </li>
            ))}
          </ul>
        </section>
        </div>

        {/* What the amber means, said once, on the page that uses it most. */}
        <ProvisionalKey className="mt-4" />
      </div>

      <DataRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} place={selectedLgu} />
    </div>
  );
}
