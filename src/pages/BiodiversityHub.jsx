import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { loadWoodDensities, withWoodDensities } from '../lib/woodDensities.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { inOfficeLgu, isPgenro, officeLguOf } from '../lib/roles.js';
import { lguOfTree } from '../hooks/useAttention.js';
import { MUNICIPALITY_LIST } from '../lib/lagunaBoundaries.js';

const LGU_LABEL = new Map(MUNICIPALITY_LIST.map((item) => [item.psgc, item.label]));
import { X, MapPin, Download, Search, ChevronRight, Archive, RotateCcw } from 'lucide-react';
import { everyRow } from '../lib/everyRow.js';
import { loadFieldOfficers } from '../lib/fieldTeam.js';
import InventoryTable, { ArchiveTreeDialog } from '../components/trees/InventoryTable.jsx';
import { lguLabelOfTree } from '../lib/treeRows.js';

/** A tree's barangay, for the Tree Database's "Where it is tagged". */
const barangayOfTree = (tree) => tree.barangay;

const DispatchModal = lazy(() => import('../components/DispatchModal.jsx'));

// PGENRO's forester keeps the RISE write-ups; nobody else opens the tab, so
// nobody else downloads it.
const SpeciesLibrary = lazy(() => import('../components/pgenro/SpeciesLibrary.jsx'));
// PGENRO decides the planting site requests here (22 October; they were on
// its Action Board).
const PlantingRequests = lazy(() => import('../components/PlantingRequests.jsx'));
// An office's tags to check, and its Tree Database (22 October): the tags
// moved here from its BioDashboard.
const PendingTreesTable = lazy(() => import('../components/admin/PendingTreesTable.jsx'));
const TreeDatabase = lazy(() => import('../components/TreeDatabase.jsx'));

/**
 * The tabs of Trees. The carbon and biodiversity charts that were here are
 * on the BioDashboard (22 October).
 *   PGENRO         the inventory, the planting site requests to decide, the
 *                  RISE species library it keeps, and the province's Tree
 *                  Database as the public sees it — where it chooses each
 *                  species' cover photo and hides the wrong ones
 *   MENRO / CENRO  the inventory, the tags to check, and the Tree Database:
 *                  its own species, with PGENRO's write-ups, read-only
 */
const TABS = {
  pgenro: [
    ['inventory', '🌳 Inventory'],
    ['requests', '🌱 Planting site requests'],
    ['species', '📘 Species (RISE)'],
    ['database', '📚 Tree Database'],
  ],
  office: [
    ['inventory', '🌳 Inventory'],
    ['tags', '🏷️ Tags'],
    ['database', '📚 Tree Database'],
  ],
};

export default function BiodiversityHub() {
  const { profile, lgu } = useAuth();
  const forester = isPgenro(profile);
  const officeLgu = officeLguOf(profile);
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  // ?tab=… opens a tab: PGENRO's requests, an office's tags, and so on.
  const tabs = forester ? TABS.pgenro : TABS.office;
  const [searchParams] = useSearchParams();
  const askedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => (tabs.some(([id]) => id === askedTab) ? askedTab : 'inventory'));
  useEffect(() => {
    if (tabs.some(([id]) => id === askedTab)) setActiveTab(askedTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedTab, forester]);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [selectedTree, setSelectedTree] = useState(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('dateCaptured');
  const [sortDir, setSortDir] = useState('desc');
  const navigate = useNavigate();
  // The office's field officers, for who tagged a tree and who it is assigned
  // to (22 October); dispatching and archiving from the table.
  const [team, setTeam] = useState({ people: new Map(), officers: new Map() });
  const [dispatchTree, setDispatchTree] = useState(null);
  const [archiveTree, setArchiveTree] = useState(null);
  const [archived, setArchived] = useState(null);
  const [archiveNotice, setArchiveNotice] = useState(null);

  useEffect(() => {
    if (officeLgu === undefined) return undefined;
    let cancelled = false;
    loadFieldOfficers(officeLgu).then(({ officers }) => {
      if (cancelled) return;
      setTeam({
        people: new Map(officers.map((o) => [o.id, o.name])),
        officers: new Map(officers.map((o) => [String(o.email).toLowerCase(), o.name])),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [officeLgu]);

  /** Archive a tree with its reason (tree_records.sql); returns what went wrong, or null. */
  async function archiveOne(tree, reason) {
    const { error } = await supabase.rpc('archive_tree', { p_id: String(tree.id), p_archived: true, p_reason: reason });
    if (error) {
      return /archive_tree|Could not find the function/i.test(error.message ?? '')
        ? 'Archiving needs supabase/tree_records.sql to be run (step 33).'
        : error.message;
    }
    setTrees((current) => current.filter((t) => t.id !== tree.id));
    setArchiveTree(null);
    setArchived(null);
    setArchiveNotice(`${tree.species || 'The tree'} archived: ${reason}. It is under Archived, to put back if need be.`);
    return null;
  }

  async function showArchived() {
    if (archived) {
      setArchived(null);
      return;
    }
    const { data, error } = await supabase.rpc('archived_trees');
    setArchived(error ? { error: /archived_trees|Could not find the function/i.test(error.message ?? '') ? 'Archiving needs supabase/tree_records.sql to be run (step 33).' : error.message, rows: [] } : { rows: Array.isArray(data) ? data : [] });
  }

  async function restore(tree) {
    const { error } = await supabase.rpc('archive_tree', { p_id: String(tree.id), p_archived: false, p_reason: null });
    if (error) {
      setArchiveNotice(error.message);
      return;
    }
    setArchived((current) => ({ ...current, rows: current.rows.filter((t) => t.id !== tree.id) }));
    setTrees((current) => [{ ...tree, archived_at: null, archive_reason: null }, ...current]);
    setArchiveNotice(`${tree.species || 'The tree'} is back in the inventory.`);
  }

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
    // A tree tagged while the page is open comes on it, and its species on
    // the Tree Database, as it comes on the map (supabase/live_updates.sql).
    let timer = null;
    const channel = supabase
      .channel('trees-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trees' }, () => {
        clearTimeout(timer);
        timer = setTimeout(fetch, 1500);
      })
      .subscribe();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      supabase.removeChannel?.(channel);
    };
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
      if (sortField === 'dbh' || sortField === 'total_height') { aVal = parseFloat(aVal) || 0; bVal = parseFloat(bVal) || 0; }
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
    <InventoryTable
      rows={rows}
      province={province}
      people={team.people}
      officers={team.officers}
      onOpen={setSelectedTree}
      onPhoto={setLightboxUrl}
      onSort={handleSort}
      onDispatch={setDispatchTree}
      onArchive={setArchiveTree}
    />
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Biodiversity</h1>
          <p className="mt-1 text-slate-600 text-sm">
            {forester
              ? 'Tree inventory, the planting site requests to decide, and the species library.'
              : 'Tree inventory, the tags to check, and the Tree Database of the species tagged here.'}
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
      <div role="tablist" aria-label="Trees views" className="flex gap-2 border-b border-slate-200">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === id ? 'border-green-700 text-green-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab !== 'inventory' ? (
        <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
          {activeTab === 'species' && <SpeciesLibrary trees={trees} />}
          {activeTab === 'requests' && <PlantingRequests decides />}
          {activeTab === 'tags' && <PendingTreesTable />}
          {activeTab === 'database' && (
            forester ? (
              <TreeDatabase
                trees={trees}
                place="Laguna"
                placeOf={lguLabelOfTree}
                placesLabel="Where it is tagged, by city and municipality"
                choosePhotos={!profile?.is_training}
              />
            ) : (
              <TreeDatabase trees={trees} place={lgu?.label ?? 'this LGU'} placeOf={barangayOfTree} placesLabel="Where it is tagged, by barangay" />
            )
          )}
        </Suspense>
      ) : (
        <>
          {/* Search, and an office's archived trees */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search species, ID, barangay…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" />
            </div>
            {!province && (
              <button type="button" onClick={showArchived} aria-pressed={Boolean(archived)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                <Archive size={14} aria-hidden="true" /> {archived ? 'Hide archived' : 'Archived'}
              </button>
            )}
          </div>
          {archiveNotice && <p role="status" className="text-sm text-green-800">{archiveNotice}</p>}
          {archived && (
            <section aria-label="Archived trees" className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h2 className="text-sm font-semibold text-slate-800">Archived trees</h2>
              {archived.error ? (
                <p role="alert" className="mt-1 text-sm text-red-700">{archived.error}</p>
              ) : archived.rows.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">None archived.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-200">
                  {archived.rows.map((tree) => (
                    <li key={tree.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span>
                        <span className="font-medium text-slate-900">{tree.species || '—'}</span>
                        <span className="text-slate-500"> · {tree.barangay || '—'} · {tree.archive_reason}</span>
                        <span className="block text-xs text-slate-400">Archived {new Date(tree.archived_at).toLocaleDateString()}</span>
                      </span>
                      <button type="button" onClick={() => restore(tree)} aria-label={`Put back ${tree.species || 'this tree'}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50">
                        <RotateCcw size={11} aria-hidden="true" /> Put back
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

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
      )}

      {/* Dispatch, as on the Action Board; archiving with a reason */}
      {dispatchTree && (
        <Suspense fallback={null}>
          <DispatchModal
            tree={dispatchTree}
            onClose={() => setDispatchTree(null)}
            onDispatched={(email) => {
              setTrees((current) => current.map((t) => (t.id === dispatchTree.id ? { ...t, assigned_to: email } : t)));
            }}
          />
        </Suspense>
      )}
      {archiveTree && <ArchiveTreeDialog tree={archiveTree} onCancel={() => setArchiveTree(null)} onArchive={archiveOne} />}

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
