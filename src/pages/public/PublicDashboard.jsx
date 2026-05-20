import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2 } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '../../supabaseClient.js';
import santaCruzBoundary from '../../data/Santa-Cruz-Boundary.geojson';

const SANTA_CRUZ_CENTER = [14.2823, 121.4163];
const SANTA_CRUZ_ZOOM = 13;

const BARANGAYS = [
  'Alipit', 'Bagumbayan', 'Barangay I', 'Barangay II', 'Barangay III',
  'Barangay IV', 'Barangay V', 'Bubukal', 'Calios', 'Duhat', 'Gatid',
  'Jasaan', 'Labuin', 'Malinao', 'Oogong', 'Pagsawitan', 'Palasan',
  'Patimbao', 'San Jose', 'San Juan', 'San Pablo Norte', 'San Pablo Sur',
  'Santisima Cruz', 'Santo Angel Central', 'Santo Angel Norte', 'Santo Angel Sur',
];

const ALL_BARANGAYS_LABEL = 'Santa Cruz (All Barangays)';

// Carbon proxy: 2.5 kg CO₂ per cm of DBH
const CARBON_PER_DBH_CM = 2.5;

const SPECIES_COLORS = [
  '#16a34a', '#22c55e', '#65a30d', '#84cc16', '#eab308', '#94a3b8',
  '#0891b2', '#7c3aed', '#dc2626', '#f97316', '#06b6d4', '#ec4899',
  '#14b8a6', '#a855f7', '#f59e0b', '#6366f1',
];
const CATEGORY_COLORS = ['#0f766e', '#dc2626', '#7c3aed', '#0891b2', '#f59e0b'];

// Land area per barangay (hectares) — CDRA 2025
const BARANGAY_AREA_HECTARES = {
  'Alipit': 211.59,
  'Bagumbayan': 266.38,
  'Bubukal': 278.55,
  'Calios': 226.14,
  'Duhat': 387.05,
  'Gatid': 395.33,
  'Labuin': 239.02,
  'Oogong': 184.75,
  'Pagsawitan': 108.53,
  'Palasan': 208.63,
  'Patimbao': 236.16,
  'Barangay I': 23.51,
  'Barangay II': 8.86,
  'Barangay III': 10,
  'Barangay IV': 6.04,
  'Barangay V': 9.51,
  'San Jose': 133.5,
  'San Pablo Norte': 79.14,
  'Santisima Cruz': 108.93,
  'Santo Angel Central': 33.37,
  'Santo Angel Norte': 104.93,
  'Santo Angel Sur': 26.6,
};

/** Compute carbon (kg) for a single tree using DBH proxy. */
function carbonForTree(tree) {
  if (tree?.carbon != null) {
    const direct = parseFloat(tree.carbon);
    if (Number.isFinite(direct)) return direct;
  }
  const dbh = parseFloat(tree?.dbh);
  if (!Number.isFinite(dbh) || dbh <= 0) return 0;
  return dbh * CARBON_PER_DBH_CM;
}

/** Normalize a tree_category value for display. */
function normalizeCategory(raw) {
  if (!raw) return null;
  return String(raw).replace(/\s*Trees$/i, '').trim() || null;
}

/** Coerce latitude/longitude to a finite number pair, or null. */
function getLatLng(tree) {
  const lat = Number(tree?.latitude);
  const lng = Number(tree?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

/** Fly the map viewport to the supplied pins whenever they change. */
function FitToPins({ pins, allBarangays }) {
  const map = useMap();
  useEffect(() => {
    if (allBarangays) {
      map.flyTo(SANTA_CRUZ_CENTER, SANTA_CRUZ_ZOOM, { duration: 1.2 });
      return;
    }
    if (!pins || pins.length === 0) return;
    if (pins.length === 1) {
      map.flyTo(pins[0].position, 17, { duration: 1.2 });
      return;
    }
    const bounds = pins.map((p) => p.position);
    map.flyToBounds(bounds, { padding: [30, 30], maxZoom: 17, duration: 1.2 });
  }, [pins, allBarangays, map]);
  return null;
}

export default function PublicDashboard() {
  const [location, setLocation] = useState(ALL_BARANGAYS_LABEL);
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch all trees on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchTrees() {
      setLoading(true);
      const { data, error } = await supabase.from('trees').select('*');
      if (cancelled) return;
      if (error) {
        setErrorMessage(error.message ?? 'Failed to load trees');
        setTrees([]);
      } else {
        setTrees(Array.isArray(data) ? data : []);
        setErrorMessage('');
      }
      setLoading(false);
    }
    fetchTrees();
    return () => { cancelled = true; };
  }, []);

  const isAllBarangays = location === ALL_BARANGAYS_LABEL;

  // Apply location filter
  const filteredTrees = useMemo(() => {
    if (isAllBarangays) return trees;
    return trees.filter((t) => (t?.barangay || '') === location);
  }, [trees, location, isAllBarangays]);

  // KPI: total tree count
  const totalTrees = filteredTrees.length;

  // Latest data date
  const latestDataDate = useMemo(() => {
    let latest = null;
    for (const t of filteredTrees) {
      if (!t?.dateCaptured) continue;
      const d = new Date(t.dateCaptured);
      if (Number.isFinite(d.getTime()) && (!latest || d > latest)) latest = d;
    }
    return latest;
  }, [filteredTrees]);

  const formattedLatestDate = latestDataDate
    ? latestDataDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  // Bar chart: carbon + tree count per barangay
  const barangayCarbonData = useMemo(() => {
    const totals = filteredTrees.reduce((acc, tree) => {
      const brgy = tree?.barangay || 'Unassigned';
      if (!acc[brgy]) acc[brgy] = { carbon: 0, trees: 0 };
      acc[brgy].carbon += carbonForTree(tree);
      acc[brgy].trees += 1;
      return acc;
    }, {});

    const rows = BARANGAYS.map((brgy) => ({
      barangay: brgy,
      carbon: parseFloat((totals[brgy]?.carbon || 0).toFixed(2)),
      trees: totals[brgy]?.trees || 0,
    }));

    Object.keys(totals).forEach((brgy) => {
      if (!BARANGAYS.includes(brgy)) {
        rows.push({
          barangay: brgy,
          carbon: parseFloat(totals[brgy].carbon.toFixed(2)),
          trees: totals[brgy].trees,
        });
      }
    });

    return rows;
  }, [filteredTrees]);

  // KPI: total carbon
  const totalCarbon = useMemo(
    () => barangayCarbonData.reduce((sum, d) => sum + d.carbon, 0),
    [barangayCarbonData],
  );

  // KPI: invasive species count
  const invasiveCount = useMemo(
    () =>
      filteredTrees.filter((t) => {
        const status = (t?.biodiversity_status || t?.species_type || '').toString().toLowerCase();
        return status === 'invasive';
      }).length,
    [filteredTrees],
  );

  // KPI: total land area
  const totalLandAreaHa = useMemo(() => {
    if (!isAllBarangays) {
      return BARANGAY_AREA_HECTARES[location] || 0;
    }
    const distinctBarangays = new Set(
      filteredTrees.map((t) => t?.barangay).filter(Boolean),
    );
    let total = 0;
    distinctBarangays.forEach((brgy) => {
      total += BARANGAY_AREA_HECTARES[brgy] || 0;
    });
    return total;
  }, [filteredTrees, location, isAllBarangays]);

  // Barangays missing CDRA data
  const barangaysMissingCdra = useMemo(() => {
    const distinct = new Set(
      filteredTrees.map((t) => t?.barangay).filter(Boolean),
    );
    return Array.from(distinct).filter(
      (brgy) => !(brgy in BARANGAY_AREA_HECTARES),
    );
  }, [filteredTrees]);

  const isSelectedBarangayMissingCdra =
    !isAllBarangays && !(location in BARANGAY_AREA_HECTARES);

  // Pie 1: species distribution
  const speciesData = useMemo(() => {
    const bySpecies = filteredTrees.reduce((acc, tree) => {
      const name = (tree?.species || '').trim() || 'Unknown';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(bySpecies)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTrees]);

  // Pie 2: tree category distribution
  const categoryData = useMemo(() => {
    const byCategory = filteredTrees.reduce((acc, tree) => {
      const name = normalizeCategory(tree?.tree_category);
      if (!name) return acc;
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTrees]);

  // Map pins: simple green markers, no hazard info
  const mapPins = useMemo(() => {
    return filteredTrees
      .map((tree) => {
        const position = getLatLng(tree);
        if (!position) return null;
        return {
          id: tree.id,
          position,
          species: tree.species || 'Unknown species',
          barangay: tree.barangay || '',
        };
      })
      .filter(Boolean);
  }, [filteredTrees]);

  const formattedTotalTrees = totalTrees.toLocaleString();
  const formattedTotalCarbon = totalCarbon.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
  const formattedLandArea = totalLandAreaHa.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  const formattedInvasive = invasiveCount.toLocaleString();

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
            Santa Cruz Biodiversity Analytics
          </h1>
          <div className="flex items-center gap-3">
            <label htmlFor="public-location-select" className="text-sm font-medium text-slate-700">
              Location:
            </label>
            <select
              id="public-location-select"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            >
              <option value={ALL_BARANGAYS_LABEL}>{ALL_BARANGAYS_LABEL}</option>
              {BARANGAYS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </div>

        {!loading && !errorMessage && (
          <p className="text-xs text-slate-500">
            Showing {filteredTrees.length.toLocaleString()} of {trees.length.toLocaleString()} trees
          </p>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-12 text-sm text-slate-600 shadow-sm">
            <Loader2 size={18} className="animate-spin text-green-700" />
            Loading biodiversity data…
          </div>
        )}

        {/* Error state */}
        {!loading && errorMessage && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Failed to load analytics: {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && (
          <>
            {/* Row 1: KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Total Trees */}
              <div className="rounded-xl border border-green-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total Number of Trees
                </p>
                <p className="mt-2 text-3xl sm:text-4xl font-bold text-slate-900">
                  {formattedTotalTrees}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {isAllBarangays ? 'Across all barangays' : `In ${location}`}
                  {formattedLatestDate && (
                    <span> · Latest data: {formattedLatestDate}</span>
                  )}
                </p>
              </div>

              {/* Total Land Area */}
              <div className="rounded-xl border border-green-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total Land Area
                </p>
                {isSelectedBarangayMissingCdra ? (
                  <>
                    <p className="mt-2 text-xl font-bold text-amber-600">No CDRA data</p>
                    <p className="mt-1 text-[11px] text-amber-600">
                      {location} is not yet in the CDRA 2025 reference table.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-3xl sm:text-4xl font-bold text-slate-900">
                      {formattedLandArea}{' '}
                      <span className="text-lg font-semibold text-slate-500">ha</span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Source: Climate and Disaster Risk Assessment 2025
                    </p>
                    {barangaysMissingCdra.length > 0 && isAllBarangays && (
                      <p className="mt-1 text-[11px] text-amber-600">
                        ⚠ {barangaysMissingCdra.length} barangay{barangaysMissingCdra.length > 1 ? 's' : ''} flagged as no CDRA data
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Total Carbon */}
              <div className="rounded-xl border border-green-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total Estimated Carbon Sequestered
                </p>
                <p className="mt-2 text-3xl sm:text-4xl font-bold text-green-700">
                  {formattedTotalCarbon}{' '}
                  <span className="text-lg font-semibold text-slate-500">kg CO₂</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Estimate via DBH proxy ({CARBON_PER_DBH_CM} kg / cm)
                </p>
              </div>

              {/* Invasive Trees */}
              <div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-red-600">
                  Number of Invasive Trees
                </p>
                <p className="mt-2 text-3xl sm:text-4xl font-bold text-red-600">
                  {formattedInvasive}
                </p>
                <p className="mt-1 text-[11px] text-red-500">
                  Tagged as invasive species
                </p>
              </div>
            </div>

            {/* Row 2: Map + Pie Charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Map - spans 2 cols on desktop */}
              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden relative">
                <div className="absolute top-3 left-3 z-[400] rounded-md bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow border border-slate-200">
                  {mapPins.length.toLocaleString()} tree{mapPins.length === 1 ? '' : 's'} on map
                </div>
                <div className="h-[350px] sm:h-[450px] md:h-[500px] w-full">
                  <MapContainer
                    center={SANTA_CRUZ_CENTER}
                    zoom={SANTA_CRUZ_ZOOM}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution="&copy; OpenStreetMap contributors"
                    />
                    <GeoJSON
                      data={santaCruzBoundary}
                      style={{
                        color: '#16a34a',
                        weight: 2,
                        fillColor: '#16a34a',
                        fillOpacity: 0.05,
                      }}
                    />
                    <FitToPins pins={mapPins} allBarangays={isAllBarangays} />
                    {mapPins.map((pin) => (
                      <CircleMarker
                        key={pin.id}
                        center={pin.position}
                        radius={6}
                        pathOptions={{
                          color: '#ffffff',
                          weight: 1.5,
                          fillColor: '#16a34a',
                          fillOpacity: 0.85,
                        }}
                      >
                        <Popup>
                          <div className="text-xs">
                            <div className="font-semibold text-slate-900">
                              {pin.species}
                            </div>
                            {pin.barangay && (
                              <div className="text-slate-500 mt-0.5">
                                {pin.barangay}
                              </div>
                            )}
                          </div>
                        </Popup>
                      </CircleMarker>
                    ))}
                  </MapContainer>
                </div>
              </div>

              {/* Pie Charts - stacked vertically */}
              <div className="md:col-span-1 flex flex-col gap-4">
                {/* Species Distribution */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Species Distribution</h3>
                  <div className="flex-1 min-h-[220px]">
                    {speciesData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400">
                        No species data
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={speciesData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius="75%"
                            label={({ name, value }) => `${name}: ${value}`}
                          >
                            {speciesData.map((_, i) => (
                              <Cell key={`species-${i}`} fill={SPECIES_COLORS[i % SPECIES_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Tree Categories */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Tree Categories</h3>
                  <div className="flex-1 min-h-[220px]">
                    {categoryData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400">
                        No category data
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={categoryData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius="75%"
                            label={({ name, value }) => `${name}: ${value}`}
                          >
                            {categoryData.map((_, i) => (
                              <Cell key={`category-${i}`} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Bar Chart - only when all barangays selected */}
            {isAllBarangays && (
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-700">
                    Sequestration Potential &amp; Tree Count by Barangay
                  </h3>
                  <span className="text-xs text-slate-500">
                    {barangayCarbonData.length} barangays
                  </span>
                </div>
                <div className="w-full overflow-x-auto">
                  {barangayCarbonData.every((d) => d.trees === 0) ? (
                    <div className="h-64 flex items-center justify-center text-sm text-slate-400">
                      No barangay sequestration data available.
                    </div>
                  ) : (
                    <div style={{ width: Math.max(barangayCarbonData.length * 60, 600), height: 400 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={barangayCarbonData}
                          margin={{ top: 5, right: 30, left: 10, bottom: 80 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="barangay"
                            angle={-40}
                            textAnchor="end"
                            interval={0}
                            height={80}
                            tick={{ fontSize: 11, fill: '#475569' }}
                          />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 11, fill: '#475569' }}
                            label={{
                              value: 'kg CO₂',
                              angle: -90,
                              position: 'insideLeft',
                              style: { fontSize: 11, fill: '#475569' },
                            }}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: '#475569' }}
                            label={{
                              value: 'Trees',
                              angle: 90,
                              position: 'insideRight',
                              style: { fontSize: 11, fill: '#475569' },
                            }}
                          />
                          <Tooltip
                            formatter={(value, name) => {
                              if (name === 'Sequestration (kg CO₂)') {
                                return [
                                  `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`,
                                  name,
                                ];
                              }
                              return [Number(value).toLocaleString(), name];
                            }}
                          />
                          <Legend wrapperStyle={{ paddingTop: 8 }} />
                          <Bar
                            yAxisId="left"
                            dataKey="carbon"
                            name="Sequestration (kg CO₂)"
                            fill="#16a34a"
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            yAxisId="right"
                            dataKey="trees"
                            name="Number of Trees"
                            fill="#06b6d4"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
