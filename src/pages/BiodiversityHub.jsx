import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { loadWoodDensities, withWoodDensities } from '../lib/woodDensities.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { inOfficeLgu, isPgenro, officeLguOf } from '../lib/roles.js';
import { lguOfTree } from '../hooks/useAttention.js';
import { annualCo2Kg } from '../lib/treeCarbon.js';
import { MUNICIPALITY_LIST } from '../lib/lagunaBoundaries.js';

const LGU_LABEL = new Map(MUNICIPALITY_LIST.map((item) => [item.psgc, item.label]));
import { classifyPinColor } from '../lib/pinColor.js';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { X, Image, ArrowUpDown, MapPin, Download, Search, ChevronRight } from 'lucide-react';
import { everyRow } from '../lib/everyRow.js';

const PIE_COLORS = ['#16a34a', '#dc2626', '#f97316', '#eab308', '#06b6d4'];

// PGENRO's forester keeps the RISE write-ups; nobody else opens the tab, so
// nobody else downloads it.
const SpeciesLibrary = lazy(() => import('../components/pgenro/SpeciesLibrary.jsx'));
// PGENRO decides the planting site requests here (22 October; they were on
// its Action Board).
const PlantingRequests = lazy(() => import('../components/PlantingRequests.jsx'));

export default function BiodiversityHub() {
  const { profile, lgu } = useAuth();
  const forester = isPgenro(profile);
  const officeLgu = officeLguOf(profile);
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  // ?tab=requests opens PGENRO's planting site requests (the header links there).
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => (forester && searchParams.get('tab') === 'requests' ? 'requests' : 'inventory'));
  useEffect(() => {
    if (forester && searchParams.get('tab') === 'requests') setActiveTab('requests');
  }, [forester, searchParams]);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [selectedTree, setSelectedTree] = useState(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('dateCaptured');
  const [sortDir, setSortDir] = useState('desc');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      const { data } = await everyRow(() => supabase.from('trees').select('*'));
      if (cancelled) return;
      // An office's own LGU only; PGENRO, the province.
      const densities = await loadWoodDensities(supabase);
      setTrees(withWoodDensities((Array.isArray(data) ? data : []).filter((tree) => inOfficeLgu(officeLgu, lguOfTree(tree))), densities));
      setLoading(false);
    }
    fetch();
    return () => { cancelled = true; };
  }, [officeLgu]);

  // Filtered & sorted trees for inventory tab
  const filteredTrees = useMemo(() => {
    let result = [...trees];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        (t.species || '').toLowerCase().includes(q) ||
        (t.tree_id || '').toLowerCase().includes(q) ||
        (t.barangay || '').toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let aVal = a[sortField] ?? '';
      let bVal = b[sortField] ?? '';
      if (sortField === 'dbh') { aVal = parseFloat(aVal) || 0; bVal = parseFloat(bVal) || 0; }
      else { aVal = String(aVal).toLowerCase(); bVal = String(bVal).toLowerCase(); }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [trees, search, sortField, sortDir]);

  function handleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  // Analytics data
  const endemicCount = trees.filter(t => (t.biodiversity_status || t.species_type) === 'Endemic').length;
  const invasiveCount = trees.filter(t => (t.biodiversity_status || t.species_type) === 'Invasive').length;
  const fruitCount = trees.filter(t => t.tree_category === 'Fruit Trees').length;
  const timberCount = trees.filter(t => t.tree_category === 'Timber Trees').length;
  const ornamentalCount = trees.filter(t => t.tree_category === 'Ornamental Trees').length;

  const biodiversityPie = [
    { name: 'Endemic', value: endemicCount },
    { name: 'Invasive', value: invasiveCount },
  ].filter(d => d.value > 0);

  const categoryPie = [
    { name: 'Fruit Trees', value: fruitCount },
    { name: 'Timber Trees', value: timberCount },
    { name: 'Ornamental Trees', value: ornamentalCount },
  ].filter(d => d.value > 0);

  // Each barangay the trees stand in, and the CO₂ they take up a year (Chave
  // et al. 2014, treeCarbon.js). It used to be Santa Cruz's barangays for any
  // office, at a flat 62.47 kg a tree.
  const barangayData = [...trees.reduce((places, t) => {
    const name = String(t.barangay ?? '').trim();
    if (!name) return places;
    const row = places.get(name) ?? { name, trees: 0, sequestration: 0 };
    row.trees += 1;
    row.sequestration += annualCo2Kg(t) ?? 0;
    places.set(name, row);
    return places;
  }, new Map()).values()]
    .map((row) => ({ ...row, sequestration: Math.round(row.sequestration * 10) / 10 }))
    .sort((a, b) => b.trees - a.trees)
    .slice(0, 30);

  // The province sees every LGU's trees: grouped by the LGU each stands in.
  const province = officeLgu === undefined;
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const toggleGroup = (name) =>
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const treesByLgu = useMemo(() => {
    if (!province) return [];
    const groups = new Map();
    for (const tree of filteredTrees) {
      const name = LGU_LABEL.get(Number(lguOfTree(tree))) ?? 'Not placed in an LGU';
      if (!groups.has(name)) groups.set(name, { name, trees: [] });
      groups.get(name).trees.push(tree);
    }
    return [...groups.values()].sort((a, b) => b.trees.length - a.trees.length || a.name.localeCompare(b.name));
  }, [province, filteredTrees]);

  if (loading) {
    return (
      <section className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Biodiversity</h1>
        <div className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading…</div>
      </section>
    );
  }


  /** The trees as a table: the office's, or one city or municipality's. */
  const renderTable = (rows) => (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Photo</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 cursor-pointer" onClick={() => handleSort('tree_id')}>Tree ID</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 cursor-pointer" onClick={() => handleSort('species')}>Species</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 cursor-pointer" onClick={() => handleSort('dbh')}>DBH</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">MH</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">TH</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Coordinates</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Category</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Stem Quality</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 cursor-pointer" onClick={() => handleSort('dateCaptured')}>Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {rows.map((tree) => {
                    const photoUrl = tree.photo_url || tree.imageUrl;
                    return (
                      <tr key={tree.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedTree(tree)}>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          {photoUrl ? (
                            <img src={photoUrl} alt={tree.species} onClick={() => setLightboxUrl(photoUrl)}
                              className="w-9 h-9 object-cover rounded cursor-pointer hover:ring-2 hover:ring-green-500"
                              onError={(e) => { e.target.style.display = 'none'; }} />
                          ) : (
                            <div className="w-9 h-9 rounded bg-slate-100 flex items-center justify-center"><Image size={12} className="text-slate-400" /></div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm font-medium text-slate-900">{tree.tree_id || '—'}</td>
                        <td className="px-3 py-2 text-sm text-slate-700">{tree.species}</td>
                        <td className="px-3 py-2 text-sm text-slate-700">{tree.dbh}</td>
                        <td className="px-3 py-2 text-sm text-slate-500">{tree.merchantable_height || tree.height_m || '—'}</td>
                        <td className="px-3 py-2 text-sm text-slate-500">{tree.total_height || tree.heightClass || '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {tree.latitude && tree.longitude ? `${Number(tree.latitude).toFixed(4)}, ${Number(tree.longitude).toFixed(4)}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-700">{tree.tree_category || '—'}</td>
                        <td className="px-3 py-2 text-sm text-slate-700">{tree.stem_quality || '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{tree.dateCaptured ? new Date(tree.dateCaptured).toLocaleDateString() : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Biodiversity</h1>
          <p className="mt-1 text-slate-600 text-sm">
            {forester
              ? 'Tree inventory, the planting site requests to decide, and the species library.'
              : 'Tree inventory, carbon sink analytics, and DENR reporting.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              // Fetched on the click rather than with the page: ExcelJS is
              // 900 KB, and most visits here never export anything.
              const { generateMenroExcel } = await import('../lib/excelExport.js');
              await generateMenroExcel(trees, { lgu: officeLgu === undefined ? null : lgu, preparedBy: profile?.full_name || '' });
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-800 transition"
          >
            <Download size={16} />
            Export to Excel
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'inventory' ? 'border-green-700 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          🌳 Inventory
        </button>
        {/* PGENRO's carbon and biodiversity are on its BioDashboard (22 October). */}
        {forester ? (
          <button onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'requests' ? 'border-green-700 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            🌱 Planting site requests
          </button>
        ) : (
          <button onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'analytics' ? 'border-green-700 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            📊 Carbon Sink & Biodiversity
          </button>
        )}
        {forester && (
          <button onClick={() => setActiveTab('species')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'species' ? 'border-green-700 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            📘 Species (RISE)
          </button>
        )}
      </div>

      {activeTab === 'species' && forester ? (
        <Suspense fallback={<p className="text-sm text-slate-500">Loading species…</p>}>
          <SpeciesLibrary trees={trees} />
        </Suspense>
      ) : activeTab === 'requests' && forester ? (
        <Suspense fallback={<p className="text-sm text-slate-500">Loading the requests…</p>}>
          <PlantingRequests decides />
        </Suspense>
      ) : activeTab === 'inventory' || forester ? (
        <>
          {/* Search */}
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search species, ID, barangay…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" />
          </div>

          {/* Inventory Table: the province's by city or municipality (21 October). */}
          {province ? (
            <div className="space-y-2" aria-label="Trees by city and municipality">
              {treesByLgu.map((group) => {
                const isOpen = openGroups.has(group.name);
                return (
                  <section key={group.name} aria-label={group.name} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                    <button type="button" onClick={() => toggleGroup(group.name)} aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                      <ChevronRight size={16} className={`text-slate-400 transition ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
                      <span className="flex-1 font-semibold text-slate-900">{group.name}</span>
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">
                        {group.trees.length.toLocaleString('en-US')} {group.trees.length === 1 ? 'tree' : 'trees'}
                      </span>
                    </button>
                    {isOpen && <div className="border-t border-slate-200">{renderTable(group.trees)}</div>}
                  </section>
                );
              })}
              {treesByLgu.length === 0 && <p className="text-sm text-slate-500">No trees match.</p>}
            </div>
          ) : (
            <section className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {renderTable(filteredTrees)}
            </section>
          )}
        </>
      ) : (
        /* Analytics Tab */
        <div className="space-y-6">
          {/* Pie Charts Row */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Endemic vs. Invasive</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={biodiversityPie} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {biodiversityPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Tree Category Breakdown</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={categoryPie} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {categoryPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i + 2]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">CO₂ Taken Up a Year, by Barangay</h3>
            {barangayData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={barangayData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: 'kg CO₂', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} label={{ value: 'Trees', angle: 90, position: 'insideRight' }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="sequestration" fill="#16a34a" name="CO₂ taken up a year (kg)" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="trees" fill="#06b6d4" name="Number of Trees" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-500">No barangay data available. Assign barangays to trees to see this chart.</p>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setLightboxUrl(null)}>
          <div className="relative max-w-3xl max-h-[85vh] mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLightboxUrl(null)} className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-600 hover:text-slate-900 z-10"><X size={16} /></button>
            <img src={lightboxUrl} alt="Tree photo" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain" />
          </div>
        </div>
      )}

      {/* View on Map prompt */}
      {selectedTree && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedTree(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3"><MapPin size={24} className="text-green-700" /></div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">{selectedTree.species}</h3>
              <p className="text-sm text-slate-500 mb-4">{selectedTree.tree_id || 'Untagged'} • DBH: {selectedTree.dbh}</p>
              <div className="flex gap-3">
                <button onClick={() => setSelectedTree(null)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Close</button>
                <button onClick={() => { navigate(`/map?lat=${selectedTree.latitude}&lng=${selectedTree.longitude}&tree=${selectedTree.id}`); setSelectedTree(null); }}
                  className="flex-1 py-2 rounded-lg bg-green-700 text-sm font-medium text-white hover:bg-green-800 transition">View on Map</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
