import { useEffect, useState } from 'react';
import { Loader2, Trash2, CheckCircle2, User, X, MapPin, Calendar, TreePine, Upload } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { everyRow } from '../../lib/everyRow.js';
import { MUNICIPALITY_LIST } from '../../lib/lagunaBoundaries.js';
import { loadFieldOfficers } from '../../lib/fieldTeam.js';

/**
 * Community tags waiting on their LGU: verify (dispatch a field officer),
 * reject, and publish once checked. `readOnly` is PGENRO's view — the
 * province's tags, without the buttons: that work is the MENRO / CENRO's.
 *
 * Trees from an office's inventory spreadsheet (community.sql) are not
 * residents' tags and are not shown as cards: a city's inventory runs to
 * thousands. They are counted by barangay instead, and a field officer is
 * sent to a barangay's at once. They have no Publish here — they are
 * verified in the field, with photos.
 */

const UPDATE_BATCH = 200;
const isImport = (row) => row?.source === 'import';
export default function PendingTreesTable({ onCountChange, readOnly = false }) {
  const [pendingTrees, setPendingTrees] = useState([]);
  // Submissions an arborist is out verifying. They used to vanish from this
  // screen the moment they were dispatched, with nothing to bring them back.
  const [dispatchedTrees, setDispatchedTrees] = useState([]);
  const [publishError, setPublishError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // What is being dispatched: { label, ids }, one tag or a barangay's inventory trees.
  const [dispatchModal, setDispatchModal] = useState(null);
  const [imports, setImports] = useState([]);
  const [arborists, setArborists] = useState([]);
  const [arboristsLoading, setArboristsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // id of tree being acted on

  // Fetch pending trees
  useEffect(() => {
    fetchPending();
  }, []);

  async function fetchPending() {
    setLoading(true);
    const { data, error: err } = await everyRow(() =>
      supabase.from('pending_trees').select('*').order('submitted_at', { ascending: false })
    );

    if (err) {
      setError(err.message);
      setPendingTrees([]);
      setDispatchedTrees([]);
    } else {
      const all = Array.isArray(data) ? data : [];
      const statusOf = (t) => (t.status || '').toLowerCase();
      const rows = all.filter((t) => !isImport(t));
      const list = rows.filter((t) => statusOf(t) === 'pending' || statusOf(t) === '');
      setPendingTrees(list);
      setDispatchedTrees(rows.filter((t) => statusOf(t) === 'dispatched'));
      setImports(all.filter((t) => isImport(t) && ['pending', 'dispatched', ''].includes(statusOf(t))));
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

  /**
   * Publish a verified submission to the map.
   *
   * The database does the work in one call — create the tree, mark it
   * crowdsourced, mark the submission verified and point it at the tree — so a
   * half-finished publish is not a state this can leave behind. The mobile app
   * calls the same function when an arborist finishes in the field.
   */
  async function handlePublish(tree) {
    setPublishError('');
    setActionLoading(tree.id);
    const { error: rpcError } = await supabase.rpc('promote_pending_tree', {
      p_pending_id: String(tree.id),
    });
    if (rpcError) {
      setPublishError(rpcError.message || 'The submission could not be published.');
    } else {
      setDispatchedTrees((prev) => prev.filter((t) => t.id !== tree.id));
    }
    setActionLoading(null);
  }

  // Open dispatch modal
  async function handleOpenDispatch(tree) {
    openDispatch({ label: `${tree.species} — ${tree.barangay || 'Unknown location'}`, ids: [tree.id] });
  }

  async function openDispatch(target) {
    setDispatchModal(target);
    setArboristsLoading(true);
    // The office's own field officers, from their accounts (fenced by LGU).
    const { officers } = await loadFieldOfficers();
    setArborists(officers);
    setArboristsLoading(false);
  }

  // Dispatch to arborist
  async function handleDispatch(arboristEmail) {
    if (!dispatchModal) return;
    const { ids } = dispatchModal;
    setActionLoading(ids[0]);

    // Only the pending_trees rows change — no insert into trees. A barangay's
    // inventory trees go in batches, so the request stays a sensible size.
    for (let i = 0; i < ids.length; i += UPDATE_BATCH) {
      const { error: updateError } = await supabase
        .from('pending_trees')
        .update({ status: 'dispatched', assigned_to: arboristEmail })
        .in('id', ids.slice(i, i + UPDATE_BATCH));
      if (updateError) {
        console.error('Failed to update pending_trees:', updateError);
        alert(`Error dispatching: ${updateError.message}`);
        setActionLoading(null);
        return;
      }
    }

    const sent = new Set(ids);
    const dispatched = (t) => (sent.has(t.id) ? { ...t, status: 'dispatched', assigned_to: arboristEmail } : t);
    setPendingTrees((prev) => {
      const next = prev.filter((t) => !sent.has(t.id));
      onCountChange?.(next.length);
      return next;
    });
    setDispatchedTrees((prev) => [...pendingTrees.filter((t) => sent.has(t.id)).map(dispatched), ...prev]);
    setImports((prev) => prev.map(dispatched));

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

  if (pendingTrees.length === 0 && dispatchedTrees.length === 0 && imports.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <CheckCircle2 className="mx-auto text-green-500 mb-3" size={36} />
        <p className="text-sm font-medium text-slate-700">All caught up!</p>
        <p className="text-xs text-slate-500 mt-1">No pending crowdsourced submissions to review.</p>
      </div>
    );
  }

  // By city or municipality (19 October): PGENRO reads Laguna's tags one LGU
  // at a time; an office has only its own, shown without the extra fold.
  const groups = groupByLgu(pendingTrees, dispatchedTrees, imports);
  const single = groups.length === 1;
  const region = (name, group) => (single ? name : `${name}, ${group.label}`);

  const queue = (group) => (
    <>
          {group.pending.length > 0 && (
            <section aria-label={region('Awaiting review', group)} className="space-y-4">
              <p className="text-sm text-slate-600">
                {group.pending.length} submission{group.pending.length > 1 ? 's' : ''} awaiting review
              </p>

              {/* Cards layout — works well on mobile and desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {group.pending.map((tree) => (
                  <PendingCard
                    key={tree.id}
                    tree={tree}
                    isLoading={actionLoading === tree.id}
                    onReject={readOnly ? null : () => handleReject(tree.id)}
                    onVerify={readOnly ? null : () => handleOpenDispatch(tree)}
                  />
                ))}
              </div>
            </section>
          )}

          {group.imports.length > 0 && (
            <ImportedInventory
              imports={group.imports}
              label={region('Inventory trees to verify', group)}
              readOnly={readOnly}
              busy={Boolean(actionLoading)}
              onSend={(barangay, ids) => openDispatch({ label: `${ids.length.toLocaleString('en-US')} inventory trees in ${barangay}`, ids })}
            />
          )}

          {/* Out with an arborist. Publishing is what finally puts a community tag
              on the public map, and nothing did it before this. */}
          {group.dispatched.length > 0 && (
            <section aria-label={region('Out for verification', group)} className="space-y-4">
              <p className="text-sm text-slate-600">
                {group.dispatched.length} submission{group.dispatched.length > 1 ? 's' : ''} out for verification
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {group.dispatched.map((tree) => (
                  <article
                    key={tree.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2"
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {tree.species || 'Unidentified'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {tree.barangay || 'Unknown location'}
                      {tree.assigned_to ? ` — with ${tree.assigned_to}` : ''}
                    </p>
                    {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handlePublish(tree)}
                      disabled={actionLoading === tree.id}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800 transition disabled:opacity-50"
                    >
                      {actionLoading === tree.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      Publish to map
                    </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
    </>
  );

  return (
    <div className="space-y-6">
      {readOnly && (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
          The tags and inventory trees waiting across Laguna, by city and municipality. Verifying, rejecting and
          publishing them is done by the MENRO / CENRO of each one&apos;s city or municipality.
        </p>
      )}
      {publishError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {publishError}
        </div>
      )}

      {groups.length === 1 ? (
        queue(groups[0])
      ) : (
        groups.map((group) => (
          <details key={group.key} className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50">
              <span className="font-semibold text-slate-800">{group.label}</span>
              <span className="text-xs text-slate-500">{groupSummary(group)}</span>
              <span className="ml-auto text-xs font-semibold text-green-700 group-open:hidden">Show</span>
              <span className="ml-auto hidden text-xs font-semibold text-green-700 group-open:inline">Hide</span>
            </summary>
            <div className="space-y-6 border-t border-slate-100 p-5">{queue(group)}</div>
          </details>
        ))
      )}

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
              <p className="text-sm font-medium text-slate-800">{dispatchModal.label}</p>
            </div>

            <div className="p-5">
              {arboristsLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  Loading arborists…
                </div>
              ) : arborists.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  No approved field officers in your LGU yet. Add or approve them on the Field team page.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {arborists.map((arb) => (
                    <button
                      key={arb.id || arb.email}
                      onClick={() => handleDispatch(arb.email)}
                      disabled={actionLoading === dispatchModal.ids[0]}
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

/**
 * The office's inventory trees still to verify, by barangay: how many wait,
 * how many are out with whom, and a field officer sent to the rest at once.
 */
function ImportedInventory({ imports, readOnly, busy, onSend, label = 'Inventory trees to verify' }) {
  const byBarangay = new Map();
  for (const tree of imports) {
    const name = tree.barangay || 'No barangay';
    if (!byBarangay.has(name)) byBarangay.set(name, { waiting: [], out: new Map() });
    const entry = byBarangay.get(name);
    const who = tree.assigned_to || 'someone';
    if (tree.status === 'dispatched') entry.out.set(who, (entry.out.get(who) ?? 0) + 1);
    else entry.waiting.push(tree.id);
  }
  const rows = [...byBarangay].sort((a, b) => b[1].waiting.length - a[1].waiting.length || a[0].localeCompare(b[0]));
  const waiting = imports.filter((t) => t.status !== 'dispatched').length;

  return (
    <section aria-label={label} className="space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-800">Inventory trees to verify — from the spreadsheet</h3>
        <p className="text-xs text-slate-500">
          {imports.length.toLocaleString('en-US')} trees brought in from the office&apos;s inventory, grey on the map;{' '}
          {waiting.toLocaleString('en-US')} not yet sent to a field officer. Each joins the inventory once a field officer
          checks it and takes its photos in the app.
        </p>
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows.map(([name, entry]) => (
          <li key={name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            <span className="min-w-[10rem] font-semibold text-slate-800">{name}</span>
            <span className="text-slate-600">{entry.waiting.length.toLocaleString('en-US')} waiting</span>
            {[...entry.out].map(([who, n]) => (
              <span key={who} className="text-xs text-slate-500">{n.toLocaleString('en-US')} with {who}</span>
            ))}
            {!readOnly && entry.waiting.length > 0 && (
              <button type="button" disabled={busy} onClick={() => onSend(name, entry.waiting)}
                aria-label={`Send a field officer to ${name}`}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50">
                <User size={13} aria-hidden="true" /> Send a field officer
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
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

        {/* Actions — none in PGENRO's read-only view */}
        {onReject && onVerify && (
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
        )}
      </div>
    </div>
  );
}

/** The Tags tab's rows by LGU, alphabetical, with tags not placed in an LGU last. */
export function groupByLgu(pending, dispatched, imports) {
  const groups = new Map();
  const groupOf = (row) => {
    const code = Number(row?.lgu_psgc) || null;
    if (!groups.has(code)) {
      const label = code ? MUNICIPALITY_LIST.find((item) => item.psgc === code)?.label ?? String(code) : 'Not placed in an LGU';
      groups.set(code, { key: String(code), label, pending: [], dispatched: [], imports: [] });
    }
    return groups.get(code);
  };
  pending.forEach((row) => groupOf(row).pending.push(row));
  dispatched.forEach((row) => groupOf(row).dispatched.push(row));
  imports.forEach((row) => groupOf(row).imports.push(row));
  return [...groups.values()].sort((a, b) => (a.key === 'null') - (b.key === 'null') || a.label.localeCompare(b.label));
}

/** One LGU's line: what waits there. */
function groupSummary(group) {
  const n = (count, one, many) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
  const waiting = group.imports.filter((t) => t.status !== 'dispatched').length;
  return [
    group.pending.length ? n(group.pending.length, 'tag awaiting review', 'tags awaiting review') : null,
    group.dispatched.length ? n(group.dispatched.length, 'out for verification', 'out for verification') : null,
    group.imports.length ? `${n(group.imports.length, 'inventory tree', 'inventory trees')} to verify${waiting ? ` (${waiting.toLocaleString('en-US')} not yet sent)` : ''}` : null,
  ].filter(Boolean).join(' · ');
}
