import { useEffect, useState } from 'react';
import { User, X } from 'lucide-react';
import { supabase } from '../supabaseClient.js';

/**
 * Dispatch Field Worker modal — lists all arborists with their pending task
 * count and allows assigning/re-assigning a tree to an arborist.
 */
export default function DispatchModal({ tree, onClose, onDispatched }) {
  const [arborists, setArborists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingCounts, setPendingCounts] = useState({});

  useEffect(() => {
    async function loadArborists() {
      // Fetch arborists
      const { data: arbData } = await supabase.from('arborists').select('*');
      const arbList = Array.isArray(arbData) ? arbData : [];
      setArborists(arbList);

      // Count pending tasks per arborist (trees assigned to them)
      const { data: treesData } = await supabase.from('trees').select('assigned_to');
      const counts = {};
      if (Array.isArray(treesData)) {
        treesData.forEach((t) => {
          if (t.assigned_to) {
            counts[t.assigned_to] = (counts[t.assigned_to] || 0) + 1;
          }
        });
      }
      setPendingCounts(counts);
      setLoading(false);
    }

    loadArborists();
  }, []);

  async function handleDispatch(arboristEmail) {
    // Update the tree's assigned_to in Supabase
    await supabase
      .from('trees')
      .update({ assigned_to: arboristEmail })
      .eq('id', tree.id);

    // Show WebSocket notification
    alert(`⚡ Ticket dispatched instantly to ${arboristEmail} via WebSockets!`);

    // Notify parent
    onDispatched?.(arboristEmail);
    onClose();
  }

  const currentAssignee = tree.assigned_to || null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Dispatch Field Worker</h2>
            <p className="text-sm text-slate-500">
              Assigning ticket for: <strong className="text-slate-700">{tree.species}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Arborist list */}
        <div className="px-6 py-4 space-y-3 max-h-80 overflow-y-auto">
          {loading && (
            <p className="text-sm text-slate-500 text-center py-4">Loading arborists…</p>
          )}

          {!loading && arborists.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">No arborists found.</p>
          )}

          {!loading && arborists.map((arb) => {
            const arbIdentifier = arb.email || arb.name;
            const isAssigned = currentAssignee && arbIdentifier && currentAssignee === arbIdentifier;
            const taskCount = pendingCounts[arbIdentifier] || 0;

            return (
              <div
                key={arb.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                    <User size={16} className="text-slate-500" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {arbIdentifier || '—'}
                    </div>
                    <div className="text-xs text-orange-600 font-medium">
                      {taskCount} Pending Tasks
                    </div>
                  </div>
                </div>

                {isAssigned ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold">
                    ✓ Assigned
                  </span>
                ) : (
                  <button
                    onClick={() => handleDispatch(arbIdentifier)}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition"
                  >
                    Dispatch
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
