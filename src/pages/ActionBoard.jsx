import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { isPgenro } from '../lib/roles.js';
import { classifyHazard, HAZARD_STATUS } from '../lib/hazardStatus.js';
import { ChevronRight, MapPin } from 'lucide-react';
import DispatchModal from '../components/DispatchModal.jsx';
import IssuePermitModal from '../components/IssuePermitModal.jsx';
import WalkInPermitForm from '../components/WalkInPermitForm.jsx';
import PermitsLog from './PermitsLog.jsx';
import PlantingRequests from '../components/PlantingRequests.jsx';

// Inline wrapper so PermitsLog renders as a tab without its own page heading
function PermitsLogTab() {
  return <PermitsLog />;
}

// PGENRO's own board: only PGENRO downloads it.
const ProvinceBoard = lazy(() => import('./pgenro/ProvinceBoard.jsx'));

/**
 * The Action Board. An LGU office works its hazards and permits here; PGENRO
 * watches every LGU's, read-only, because the work itself stays with the
 * MENRO/CENRO.
 */
export default function ActionBoard() {
  const { profile } = useAuth();
  if (isPgenro(profile)) {
    return (
      <Suspense fallback={<p className="text-sm text-slate-600">Loading the province…</p>}>
        <ProvinceBoard />
      </Suspense>
    );
  }
  return <OfficeBoard />;
}

function OfficeBoard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [trees, setTrees] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  // ?tab=requests opens the planting site requests (the header's menu links there).
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => (searchParams.get('tab') === 'requests' ? 'requests' : 'hazards'));
  useEffect(() => {
    if (searchParams.get('tab') === 'requests') setActiveTab('requests');
  }, [searchParams]);
  const [dispatchTree, setDispatchTree] = useState(null);
  const [permitModalOpen, setPermitModalOpen] = useState(false);
  const [selectedPermitTree, setSelectedPermitTree] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchTrees() {
      try {
        const { data, error } = await supabase.from('trees').select('*');
        if (cancelled) return;
        if (error) {
          setErrorMessage(error.message ?? 'Unknown Supabase error');
          setStatus('error');
          return;
        }
        setTrees(Array.isArray(data) ? data : []);
        setStatus('loaded');
      } catch (e) {
        if (cancelled) return;
        setErrorMessage(e?.message ?? 'Unexpected error loading the Action Board.');
        setStatus('error');
      }
    }
    fetchTrees();
    return () => { cancelled = true; };
  }, []);

  function handleIssuePermit(tree) {
    setSelectedPermitTree(tree);
    setPermitModalOpen(true);
  }

  function executeIssuePermit(tree) {
    supabase.from('trees').update({ has_cutting_permit: true }).eq('id', tree.id);
    setTrees(prev => prev.map(t => t.id === tree.id ? { ...t, has_cutting_permit: true } : t));
  }

  function handleViewOnMap(tree) {
    navigate(`/map?lat=${tree.latitude}&lng=${tree.longitude}&tree=${tree.id}`);
  }

  // Filter hazard trees
  const hazardTrees = trees.filter(t => classifyHazard(t) === HAZARD_STATUS.HAZARD);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Action Board</h1>

      {/* Tabs */}
      <div role="tablist" className="flex gap-2 border-b border-slate-200">
        <button type="button" onClick={() => setActiveTab('hazards')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'hazards' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          🚨 Hazard Management &amp; Permits
        </button>
        <button type="button" onClick={() => setActiveTab('walkins')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'walkins' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          📋 Permit Issuance
        </button>
        <button type="button" onClick={() => setActiveTab('permits')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'permits' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          📄 Permit Logs
        </button>
        <button type="button" onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'requests' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          🌱 Planting site requests
        </button>
      </div>

      {activeTab === 'hazards' ? (
        <div>
          {status === 'loading' && <div className="text-sm text-slate-600">Loading hazard tickets…</div>}
          {status === 'error' && <div role="alert" className="text-sm text-red-700">{errorMessage}</div>}
          {status === 'loaded' && hazardTrees.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">No hazardous trees found.</div>
          )}
          {status === 'loaded' && hazardTrees.length > 0 && (
            <HazardsByBarangay
              trees={hazardTrees}
              onDispatch={(tree) => setDispatchTree(tree)}
              onIssuePermit={(tree) => handleIssuePermit(tree)}
              onViewOnMap={(tree) => handleViewOnMap(tree)}
            />
          )}
        </div>
      ) : activeTab === 'walkins' ? (
        <WalkInPermitForm />
      ) : activeTab === 'requests' ? (
        <PlantingRequests />
      ) : (
        <PermitsLogTab />
      )}

      {/* Dispatch Modal */}
      {dispatchTree && (
        <DispatchModal
          tree={dispatchTree}
          onClose={() => setDispatchTree(null)}
          onDispatched={(email) => {
            setTrees(prev => prev.map(t => t.id === dispatchTree.id ? { ...t, assigned_to: email } : t));
          }}
        />
      )}

      {/* Issue Permit Modal */}
      <IssuePermitModal
        isOpen={permitModalOpen}
        tree={selectedPermitTree}
        onClose={() => { setPermitModalOpen(false); setSelectedPermitTree(null); }}
        onIssue={(tree) => executeIssuePermit(tree)}
      />
    </section>
  );
}

/** A tree's hazards, in words. */
function hazardsOf(tree) {
  const hazards = [];
  if (tree.isLeaning || tree.is_leaning) hazards.push('Leaning');
  if (tree.hasPowerlineConflict || tree.has_powerline_conflict) hazards.push('Powerline');
  if (tree.isDecayed || tree.is_decayed) hazards.push('Decayed');
  if (tree.isRootProblem || tree.is_root_problem) hazards.push('Root Problem');
  return hazards;
}

/** The first photo of a tree's evidence, if there is one. */
const photoOf = (tree) => {
  const first = (list) => (Array.isArray(list) && list.length ? (typeof list[0] === 'string' ? list[0] : list[0]?.url) : null);
  return tree.photo_url || first(tree.leaning_photos) || first(tree.powerline_photos) || first(tree.decayed_photos) || first(tree.root_photos) || null;
};

/**
 * The hazard queue by barangay (decided 17 October): one line per barangay —
 * how many, how many nobody has been sent to — opening into a list of its
 * trees, each with its actions. Barangays with someone still to send come
 * first.
 */
function HazardsByBarangay({ trees, onDispatch, onIssuePermit, onViewOnMap }) {
  const groups = useMemo(() => {
    const byName = new Map();
    for (const tree of trees) {
      const name = tree.barangay || 'No barangay';
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(tree);
    }
    return [...byName]
      .map(([name, list]) => ({ name, trees: list, waiting: list.filter((tree) => !tree.assigned_to).length }))
      .sort((a, b) => b.waiting - a.waiting || b.trees.length - a.trees.length || a.name.localeCompare(b.name));
  }, [trees]);
  const [opened, setOpened] = useState(() => new Set(groups.length === 1 ? [groups[0].name] : []));
  const allOpen = opened.size === groups.length;
  const toggle = (name) =>
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {trees.length} {trees.length === 1 ? 'hazard' : 'hazards'} in {groups.length} {groups.length === 1 ? 'barangay' : 'barangays'}
        </p>
        <button
          type="button"
          onClick={() => setOpened(allOpen ? new Set() : new Set(groups.map((g) => g.name)))}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          {allOpen ? 'Close all' : 'Open all'}
        </button>
      </div>
      <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {groups.map((group) => {
          const isOpen = opened.has(group.name);
          return (
            <li key={group.name} className="border-b border-slate-100 last:border-b-0">
              <button
                type="button"
                onClick={() => toggle(group.name)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <ChevronRight size={16} aria-hidden="true" className={`shrink-0 text-slate-500 transition ${isOpen ? 'rotate-90' : ''}`} />
                <span className="flex-1 text-sm font-bold text-slate-900">{group.name}</span>
                {group.waiting > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                    {group.waiting} nobody sent
                  </span>
                )}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {group.trees.length} {group.trees.length === 1 ? 'tree' : 'trees'}
                </span>
              </button>
              {isOpen && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th scope="col" className="w-14 px-3 py-2"><span className="sr-only">Photo</span></th>
                        <th scope="col" className="px-3 py-2">Tree</th>
                        <th scope="col" className="px-3 py-2">Problem</th>
                        <th scope="col" className="px-3 py-2">Assigned to</th>
                        <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.trees.map((tree) => (
                        <HazardRow
                          key={tree.id}
                          tree={tree}
                          onDispatch={() => onDispatch(tree)}
                          onIssuePermit={() => onIssuePermit(tree)}
                          onViewOnMap={() => onViewOnMap(tree)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One hazard tree: its photo, what is wrong, who is on it, and what to do. */
function HazardRow({ tree, onDispatch, onIssuePermit, onViewOnMap }) {
  const photo = photoOf(tree);
  const isAssigned = !!tree.assigned_to;
  const hasPermit = tree.has_cutting_permit || tree.hasCuttingPermit;
  return (
    <tr data-tree-id={tree.id} className="align-middle">
      <td className="px-3 py-2">
        {photo ? (
          <a href={photo} target="_blank" rel="noreferrer" title="Open the photo">
            <img src={photo} alt="" className="h-10 w-10 rounded-md object-cover ring-1 ring-slate-200" onError={(e) => { e.target.style.display = 'none'; }} />
          </a>
        ) : (
          <span className="block h-10 w-10 rounded-md bg-slate-100" aria-hidden="true" />
        )}
      </td>
      <th scope="row" className="px-3 py-2 font-semibold text-slate-900">{tree.species || 'Unknown species'}</th>
      <td className="px-3 py-2">
        <span className="flex flex-wrap gap-1">
          {hazardsOf(tree).map((h) => (
            <span key={h} className="rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">{h}</span>
          ))}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-slate-600">{tree.assigned_to ?? '—'}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap justify-end gap-1.5">
          {isAssigned ? (
            <button onClick={onDispatch} className="rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-600">
              Re-Assign
            </button>
          ) : (
            <button onClick={onDispatch} className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-900">
              Dispatch
            </button>
          )}
          {hasPermit ? (
            <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Permit Issued</span>
          ) : (
            <button onClick={onIssuePermit} className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-900">
              Issue Permit
            </button>
          )}
          <button onClick={onViewOnMap} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50">
            <MapPin size={12} aria-hidden="true" /> View on Map
          </button>
        </div>
      </td>
    </tr>
  );
}
