import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { classifyHazard, HAZARD_STATUS } from '../lib/hazardStatus.js';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import DispatchModal from '../components/DispatchModal.jsx';
import IssuePermitModal from '../components/IssuePermitModal.jsx';
import WalkInPermitForm from '../components/WalkInPermitForm.jsx';
import PermitsLog from './PermitsLog.jsx';

// Inline wrapper so PermitsLog renders as a tab without its own page heading
function PermitsLogTab() {
  return <PermitsLog />;
}

export default function ActionBoard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [trees, setTrees] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('hazards');
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
          🚨 Hazard Management & Permits
        </button>
        <button type="button" onClick={() => setActiveTab('walkins')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'walkins' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          📋 Public Walk-in Requests
        </button>
        <button type="button" onClick={() => setActiveTab('permits')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'permits' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          📄 Permit Logs
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {hazardTrees.map((tree) => (
                <HazardCard
                  key={tree.id}
                  tree={tree}
                  onDispatch={() => setDispatchTree(tree)}
                  onIssuePermit={() => handleIssuePermit(tree)}
                  onViewOnMap={() => handleViewOnMap(tree)}
                />
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'walkins' ? (
        <WalkInPermitForm />
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

/** Hazard Card — shows tree info, hazard indicators, photo carousel, and action buttons */
function HazardCard({ tree, onDispatch, onIssuePermit, onViewOnMap }) {
  const [slideIndex, setSlideIndex] = useState(0);

  // Collect all available hazard evidence photos
  const photos = [
    tree.photo_url && { url: tree.photo_url, label: 'Main' },
    ...(Array.isArray(tree.leaning_photos) ? tree.leaning_photos.map(p => ({ url: typeof p === 'string' ? p : p?.url, label: 'Leaning' })) : []),
    ...(Array.isArray(tree.powerline_photos) ? tree.powerline_photos.map(p => ({ url: typeof p === 'string' ? p : p?.url, label: 'Powerline' })) : []),
    ...(Array.isArray(tree.decayed_photos) ? tree.decayed_photos.map(p => ({ url: typeof p === 'string' ? p : p?.url, label: 'Decayed' })) : []),
    ...(Array.isArray(tree.root_photos) ? tree.root_photos.map(p => ({ url: typeof p === 'string' ? p : p?.url, label: 'Root' })) : []),
  ].filter(Boolean).filter(p => p.url);

  const hasPhotos = photos.length > 0;
  const hasMultiple = photos.length > 1;
  const isAssigned = !!tree.assigned_to;
  const hasPermit = tree.has_cutting_permit || tree.hasCuttingPermit;

  // Hazard flags
  const hazards = [];
  if (tree.isLeaning || tree.is_leaning) hazards.push('Leaning');
  if (tree.hasPowerlineConflict || tree.has_powerline_conflict) hazards.push('Powerline');
  if (tree.isDecayed || tree.is_decayed) hazards.push('Decayed');
  if (tree.isRootProblem || tree.is_root_problem) hazards.push('Root Problem');

  return (
    <article className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden flex">
      {/* Left content */}
      <div className="flex-1 p-4 flex flex-col justify-between">
        {/* Tree ID */}
        <div className="text-sm font-bold text-slate-900 mb-1">{tree.tree_id ?? '—'}</div>

        {/* Species + Hazard label */}
        <div className="mb-2">
          <span className="text-xs text-slate-500">Species</span>
          <span className="ml-2 text-sm font-medium text-slate-800">{tree.species}</span>
        </div>

        {/* Hazard indicators */}
        <div className="flex flex-wrap gap-1 mb-2">
          <span className="text-xs font-medium text-red-700">Hazard</span>
          {hazards.map(h => (
            <span key={h} className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">{h}</span>
          ))}
        </div>

        {/* Assigned to */}
        <div className="text-xs text-slate-500 mb-3">
          Assigned To <span className="ml-1 text-slate-700 font-medium">{tree.assigned_to ?? '—'}</span>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {isAssigned ? (
            <button onClick={onDispatch} className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 transition">
              Re-Assign
            </button>
          ) : (
            <button onClick={onDispatch} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 transition">
              Dispatch
            </button>
          )}
          {hasPermit ? (
            <span className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700">
              Permit Issued
            </span>
          ) : (
            <button onClick={onIssuePermit} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 transition">
              Issue Permit
            </button>
          )}
        </div>
      </div>

      {/* Right: Photo thumbnail + View on Map */}
      <div className="w-36 flex flex-col border-l border-slate-100">
        {/* Photo carousel — fixed square */}
        <div className="relative w-36 h-36 bg-slate-100">
          {hasPhotos ? (
            <>
              <img
                src={photos[slideIndex % photos.length].url}
                alt={photos[slideIndex % photos.length].label}
                className="w-36 h-36 object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              {hasMultiple && (
                <>
                  <button onClick={() => setSlideIndex(i => (i - 1 + photos.length) % photos.length)}
                    className="absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/40 text-white flex items-center justify-center text-xs">
                    ‹
                  </button>
                  <button onClick={() => setSlideIndex(i => (i + 1) % photos.length)}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/40 text-white flex items-center justify-center text-xs">
                    ›
                  </button>
                </>
              )}
              <span className="absolute bottom-0.5 right-0.5 bg-black/50 text-white text-[8px] px-1 rounded">
                {photos[slideIndex % photos.length].label}
              </span>
            </>
          ) : (
            <div className="w-36 h-36 flex items-center justify-center text-slate-400 text-xs">
              No photo
            </div>
          )}
        </div>

        {/* View on Map button */}
        <button
          onClick={onViewOnMap}
          className="flex items-center justify-center gap-1 py-2 bg-green-700 text-white text-xs font-medium hover:bg-green-800 transition"
        >
          <MapPin size={12} />
          View on Map
        </button>
      </div>
    </article>
  );
}
