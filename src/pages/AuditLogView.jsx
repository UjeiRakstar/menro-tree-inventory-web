import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';

/** Visible placeholder rendered for null `assigned_to` cells. */
const NULL_CELL_PLACEHOLDER = '—';

/** Tailwind class tokens for the Cancelled_Badge red palette. */
const CANCELLED_BADGE_CLASS =
  'inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700';

/**
 * Audit_Log_View — Phase 7 page at `/audit-log` that displays cancelled
 * tree records in a Ghost_Log_Table.
 *
 * Owns the fetch-on-mount state machine that drives the Ghost_Log_Table
 * and the loading / error / empty render branches. Follows the same pattern
 * as InventoryView.
 *
 * State shape (discriminated by `status`):
 *   status        : 'loading' | 'error' | 'loaded'
 *   trees         : TreeRecord[]  — always defined, initially []
 *   errorMessage  : string        — always defined, '' outside 'error'
 *
 * Empty_State is derived from `status === 'loaded' && trees.length === 0`
 * rather than a fourth status value so the union stays tight.
 *
 * Fetch contract: exactly one `supabase.from('trees').select('*').eq('task_status', 'Cancelled')`
 * on mount; zero mutations against Supabase.
 */
export default function AuditLogView() {
  const [status, setStatus] = useState('loading');
  const [trees, setTrees] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchCancelledTrees() {
      try {
        const { data, error } = await supabase
          .from('trees')
          .select('*')
          .eq('task_status', 'Cancelled');
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
        setErrorMessage(e?.message ?? 'Unexpected error loading audit log.');
        setStatus('error');
      }
    }

    fetchCancelledTrees();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Audit Log</h1>
        <p className="mt-2 text-slate-600">
          Cancelled tree records and task audit trail.
        </p>
      </div>

      {status === 'loading' && (
        <div
          role="status"
          data-testid="audit-log-loading"
          className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm"
        >
          Loading audit log…
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          data-testid="audit-log-error"
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Failed to load audit log: {errorMessage}
        </div>
      )}

      {status === 'loaded' && trees.length === 0 && (
        <div
          data-testid="audit-log-empty"
          className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm"
        >
          No cancelled records found.
        </div>
      )}

      {status === 'loaded' && trees.length > 0 && (
        <section
          aria-label="Ghost Log Table"
          data-testid="ghost-log-table"
          className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"
        >
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Tree ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Species
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Assigned Arborist
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Date Captured/Cancelled
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {trees.map((tree) => (
                <tr key={tree.id}>
                  <td className="px-4 py-2 text-sm font-medium text-slate-900">
                    {tree.tree_id ?? NULL_CELL_PLACEHOLDER}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-700">
                    {tree.species}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-700">
                    {tree.assigned_to ?? NULL_CELL_PLACEHOLDER}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-700">
                    {tree.dateCaptured}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <span className={CANCELLED_BADGE_CLASS} data-testid="cancelled-badge">
                      Cancelled
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
