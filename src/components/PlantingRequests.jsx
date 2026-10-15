import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MapPinned } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { formatArea } from '../lib/areaGeometry.js';

/**
 * Tree planting sites the MENRO / CENRO offices asked for
 * (supabase/planting_requests.sql), as a table.
 *
 *   decides  PGENRO: every office's requests, to approve or decline here or
 *            on the map
 *   else     an office: its own requests, and what PGENRO said
 *
 * Waiting first, then declined, then the ones approved, newest first in each.
 * The database decides which rows each account sees; nothing is filtered by
 * LGU here.
 */
const STATUS = {
  requested: { label: 'Waiting', tone: 'bg-amber-100 text-amber-900' },
  declined: { label: 'Declined', tone: 'bg-red-100 text-red-800' },
  approved: { label: 'Approved', tone: 'bg-green-100 text-green-800' },
};
const ORDER = { requested: 0, declined: 1, approved: 2 };

const dateOf = (value) =>
  value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const isMissing = (error) =>
  Boolean(error) && (error.code === '42703' || error.code === 'PGRST204' || /approval.*does not exist|column .*approval/i.test(error.message ?? ''));

export default function PlantingRequests({ decides = false }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [declining, setDeclining] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('map_areas')
      .select('*')
      .eq('kind', 'planting-site')
      .order('created_at', { ascending: false });
    if (loadError) {
      setError(
        isMissing(loadError)
          ? 'Planting site requests need supabase/planting_requests.sql, which has not been run yet.'
          : loadError.message
      );
      setRows([]);
      return;
    }
    setError('');
    // A request is any planting site an office asked for: waiting, declined,
    // or approved by PGENRO (it then carries who reviewed it).
    setRows((data ?? []).filter((row) => row.approval && (row.approval !== 'approved' || row.reviewed_at)));
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('planting-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'map_areas' }, () => load())
      .subscribe();
    return () => supabase.removeChannel?.(channel);
  }, [load]);

  const sorted = useMemo(
    () => [...(rows ?? [])].sort((a, b) => (ORDER[a.approval] ?? 3) - (ORDER[b.approval] ?? 3)),
    [rows]
  );

  async function decide(row, approve) {
    setBusy(row.id);
    setActionError('');
    const { error: failure } = await supabase.rpc('decide_planting_request', {
      p_id: row.id,
      p_approve: approve,
      p_note: approve ? null : note.trim() || null,
    });
    setBusy(null);
    if (failure) {
      setActionError(failure.message ?? 'That did not go through.');
      return;
    }
    setDeclining(null);
    setNote('');
    load();
  }

  if (rows === null) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin text-green-700" aria-hidden="true" /> Loading the requests…
      </p>
    );
  }

  const waiting = sorted.filter((row) => row.approval === 'requested').length;

  return (
    <section aria-label="Planting site requests" className="space-y-3">
      <p className="text-sm text-slate-600">
        {decides
          ? 'Tree planting sites are PGENRO’s. A MENRO / CENRO asks for one by drawing it on its map; approved, it goes on the public map.'
          : 'Tree planting sites are PGENRO’s. Draw one on your map and save it to ask; it goes on the public map once PGENRO approves it.'}
        {waiting > 0 && (
          <strong className="ml-1 text-slate-800">
            {waiting} waiting for {decides ? 'your' : 'PGENRO’s'} decision.
          </strong>
        )}
      </p>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {actionError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}

      {!error && sorted.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {decides ? 'No office has asked for a planting site yet.' : 'Your office has not asked for a planting site yet.'}
        </p>
      ) : (
        sorted.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Planting site</th>
                  {decides && <th scope="col" className="px-3 py-2">City / municipality</th>}
                  <th scope="col" className="px-3 py-2">Barangay</th>
                  <th scope="col" className="px-3 py-2">Area</th>
                  <th scope="col" className="px-3 py-2">Asked</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">PGENRO&apos;s note</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((row) => {
                  const status = STATUS[row.approval] ?? STATUS.requested;
                  const open = declining === row.id;
                  return (
                    <tr key={row.id} className="align-top">
                      <th scope="row" className="px-3 py-2 font-semibold text-slate-800">{row.name}</th>
                      {decides && <td className="px-3 py-2 text-slate-600">{row.municipality ?? '—'}</td>}
                      <td className="px-3 py-2 text-slate-600">{row.barangay ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                        {row.area_m2 ? formatArea(row.area_m2, row.area_m2 >= 10000 ? 'ha' : 'm2') : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{dateOf(row.created_at)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${status.tone}`}>{status.label}</span>
                      </td>
                      <td className="max-w-[16rem] px-3 py-2 text-slate-600">{row.review_note ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Link
                            to={`/map?area=${encodeURIComponent(row.id)}`}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50"
                          >
                            <MapPinned size={13} aria-hidden="true" /> On the map
                          </Link>
                          {decides && row.approval === 'requested' && !open && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeclining(row.id);
                                  setNote('');
                                }}
                                className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                              >
                                Decline…
                              </button>
                              <button
                                type="button"
                                onClick={() => decide(row, true)}
                                disabled={busy === row.id}
                                aria-label={`Approve ${row.name}`}
                                className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-2 py-1 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                              >
                                {busy === row.id && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                                Approve
                              </button>
                            </>
                          )}
                        </div>
                        {open && (
                          <div className="mt-2 w-64 space-y-2">
                            <label className="block text-xs font-semibold text-slate-700">
                              Why not? The office sees this.
                              <textarea
                                rows={2}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-normal"
                              />
                            </label>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setDeclining(null)}
                                className="flex-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                                Back
                              </button>
                              <button
                                type="button"
                                onClick={() => decide(row, false)}
                                disabled={busy === row.id}
                                aria-label={`Decline ${row.name}`}
                                className="flex-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}
