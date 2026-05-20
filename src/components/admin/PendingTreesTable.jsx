import { useEffect, useState } from 'react';
import { Loader2, Trash2, CheckCircle2, User, X, MapPin, Calendar, TreePine } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';

export default function PendingTreesTable({ onCountChange }) {
  const [pendingTrees, setPendingTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dispatchModal, setDispatchModal] = useState(null); // holds the pending tree being dispatched
  const [arborists, setArborists] = useState([]);
  const [arboristsLoading, setArboristsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // id of tree being acted on

  // Fetch pending trees
  useEffect(() => {
    fetchPending();
  }, []);

  async function fetchPending() {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('pending_trees')
      .select('*')
      .order('submitted_at', { ascending: false });

    if (err) {
      setError(err.message);
      setPendingTrees([]);
    } else {
      // Filter for pending status (case-insensitive) and exclude dispatched
      const list = (Array.isArray(data) ? data : []).filter((t) => {
        const s = (t.status || '').toLowerCase();
        return s === 'pending' || s === '';
      });
      setPendingTrees(list);
      onCountChange?.(list.length);
    }
    setLoading(false);
  }

  // Reject (delete) a pending tree
  async function handleReject(id) {
    if (!confirm('Are you sure you want to reject and delete this submission?')) return;
    setActionLoading(id);
    await supabase.from('pending_trees').delete().eq('id', id);
    setPendingTrees((prev) => {
      const next = prev.filter((t) => t.id !== id);
      onCountChange?.(next.length);
      return next;
    });
    setActionLoading(null);
  }

  // Open dispatch modal
  async function handleOpenDispatch(tree) {
    setDispatchModal(tree);
    setArboristsLoading(true);
    const { data } = await supabase.from('arborists').select('*');
    setArborists(Array.isArray(data) ? data : []);
    setArboristsLoading(false);
  }

  // Dispatch to arborist
  async function handleDispatch(arboristEmail) {
    if (!dispatchModal) return;
    setActionLoading(dispatchModal.id);

    // Insert into trees table with all required fields
    const { error: insertError } = await supabase.from('trees').insert({
      latitude: dispatchModal.latitude,
      longitude: dispatchModal.longitude,
      barangay: dispatchModal.barangay || null,
      species: dispatchModal.species || 'Unknown',
      photo_url: dispatchModal.photo_url || null,
      leaves_url: dispatchModal.leaves_url || null,
      bark_url: dispatchModal.bark_url || null,
      fruits_url: dispatchModal.fruits_url || null,
      assigned_to: arboristEmail,
      task_status: 'Pending',
      source: 'crowdsourced',
      dbh: null,
      scientific_name: null,
      species_type: null,
      tree_category: null,
      is_leaning: false,
      has_powerline_conflict: false,
      is_decayed: false,
      is_root_problem: false,
      has_cutting_permit: false,
    });

    if (insertError) {
      console.error('Failed to insert into trees:', insertError);
      alert(`Error creating tree record: ${insertError.message}`);
      setActionLoading(null);
      return;
    }

    // Update pending_trees status to dispatched
    const { error: updateError } = await supabase
      .from('pending_trees')
      .update({ status: 'dispatched', assigned_to: arboristEmail })
      .eq('id', dispatchModal.id);

    if (updateError) {
      console.error('Failed to update pending_trees:', updateError);
    }

    // Remove from local list
    setPendingTrees((prev) => {
      const next = prev.filter((t) => t.id !== dispatchModal.id);
      onCountChange?.(next.length);
      return next;
    });

    setDispatchModal(null);
    setActionLoading(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-12 text-sm text-slate-600 shadow-sm">
        <Loader2 size={18} className="animate-spin text-green-700" />
        Loading pending submissions…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load pending trees: {error}
      </div>
    );
  }

  if (pendingTrees.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <CheckCircle2 className="mx-auto text-green-500 mb-3" size={36} />
        <p className="text-sm font-medium text-slate-700">All caught up!</p>
        <p className="text-xs text-slate-500 mt-1">No pending crowdsourced submissions to review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {pendingTrees.length} submission{pendingTrees.length > 1 ? 's' : ''} awaiting review
      </p>

      {/* Cards layout — works well on mobile and desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {pendingTrees.map((tree) => (
          <PendingCard
            key={tree.id}
            tree={tree}
            isLoading={actionLoading === tree.id}
            onReject={() => handleReject(tree.id)}
            onVerify={() => handleOpenDispatch(tree)}
          />
        ))}
      </div>

      {/* Dispatch Modal */}
      {dispatchModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-800">
                Assign to Arborist
              </h3>
              <button
                onClick={() => setDispatchModal(null)}
                className="p-1 hover:bg-slate-100 rounded-full"
              >
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-50 bg-slate-50">
              <p className="text-xs text-slate-500">Dispatching verification for:</p>
              <p className="text-sm font-medium text-slate-800">
                {dispatchModal.species} — {dispatchModal.barangay || 'Unknown location'}
              </p>
            </div>

            <div className="p-5">
              {arboristsLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  Loading arborists…
                </div>
              ) : arborists.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  No arborists found. Add arborists in the Manage Arborists page.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {arborists.map((arb) => (
                    <button
                      key={arb.id || arb.email}
                      onClick={() => handleDispatch(arb.email)}
                      disabled={actionLoading === dispatchModal.id}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 hover:border-green-400 hover:bg-green-50 transition text-left disabled:opacity-50"
                    >
                      <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <User size={16} className="text-green-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {arb.name || arb.email}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{arb.email}</p>
                      </div>
                      <span className="text-xs font-medium text-green-700">Assign</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Individual pending tree card */
function PendingCard({ tree, isLoading, onReject, onVerify }) {
  // Collect thumbnail images
  const thumbs = [
    tree.photo_url,
    tree.leaves_url,
    tree.bark_url,
    tree.fruits_url,
  ].filter(Boolean);

  const submittedDate = tree.submitted_at
    ? new Date(tree.submitted_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : 'Unknown date';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Photo thumbnails */}
      {thumbs.length > 0 ? (
        <div className="flex gap-0.5 h-28 bg-slate-100">
          {thumbs.slice(0, 4).map((url, i) => (
            <div key={i} className="flex-1 overflow-hidden">
              <img
                src={url}
                alt={`Submission photo ${i + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="h-20 bg-slate-100 flex items-center justify-center">
          <TreePine className="text-slate-300" size={24} />
        </div>
      )}

      {/* Info */}
      <div className="p-4">
        <h4 className="text-sm font-semibold text-slate-800 mb-1">
          {tree.species || 'Unknown Species'}
        </h4>

        <div className="space-y-1 mb-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin size={12} className="text-slate-400" />
            {tree.barangay || 'No barangay'}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Calendar size={12} className="text-slate-400" />
            {submittedDate}
          </div>
        </div>

        {/* Coordinates */}
        <p className="text-[10px] text-slate-400 mb-3">
          GPS: {tree.latitude?.toFixed(5)}, {tree.longitude?.toFixed(5)}
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onReject}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
          >
            <Trash2 size={13} />
            Reject
          </button>
          <button
            onClick={onVerify}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-green-700 rounded-lg hover:bg-green-800 transition disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Verify Tree
          </button>
        </div>
      </div>
    </div>
  );
}
