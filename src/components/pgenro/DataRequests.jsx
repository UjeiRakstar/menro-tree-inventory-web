import { useEffect, useState } from 'react';
import { ChevronDown, Download, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';

/** PostgREST's "no such table": data_requests.sql has not been run yet. */
const isMissingTable = (error) => /does not exist|Could not find the table/i.test(error?.message ?? '');

const when = (value) =>
  new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Who downloaded the inventory, and what for (supabase/data_requests.sql):
 * PGENRO's to read and to remove, folded under its Inbox. The newest first.
 */
export default function DataRequests() {
  const [rows, setRows] = useState(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: loadError } = await supabase
        .from('data_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      setMissing(isMissingTable(loadError));
      setError(loadError && !isMissingTable(loadError) ? loadError.message : '');
      setRows(Array.isArray(data) ? data : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(row) {
    if (!window.confirm(`Remove ${row.first_name} ${row.last_name}'s request? It cannot be brought back.`)) return;
    const { error: deleteError } = await supabase.from('data_requests').delete().eq('id', row.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setRows((current) => current.filter((r) => r.id !== row.id));
  }

  return (
    <section aria-label="Data requests" className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Download size={18} className="text-green-700" aria-hidden="true" />
        <span className="flex-1">
          <span className="block text-sm font-bold text-slate-900">Data requests</span>
          <span className="block text-xs text-slate-500">Who downloaded the inventory from the public pages, and what for</span>
        </span>
        {rows === null ? (
          <Loader2 size={15} className="animate-spin text-slate-400" aria-hidden="true" />
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{rows.length}</span>
        )}
        <ChevronDown size={16} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          {missing ? (
            <p role="note" className="text-sm text-amber-800">The list needs supabase/data_requests.sql, which has not been run yet.</p>
          ) : error ? (
            <p role="alert" className="text-sm text-red-700">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">No one has asked yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">When</th>
                    <th className="py-2 pr-3 font-semibold">Who</th>
                    <th className="py-2 pr-3 font-semibold">Affiliation</th>
                    <th className="py-2 pr-3 font-semibold">Purpose</th>
                    <th className="py-2 pr-3 font-semibold">Trees of</th>
                    <th className="py-2 pr-3 font-semibold">Files</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="whitespace-nowrap py-2 pr-3 text-xs text-slate-500">{when(row.created_at)}</td>
                      <td className="py-2 pr-3">
                        <span className="block font-medium text-slate-900">{row.first_name} {row.last_name}</span>
                        <a href={`mailto:${row.email}`} className="text-xs text-green-800 underline">{row.email}</a>
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{row.affiliation}</td>
                      <td className="py-2 pr-3 text-slate-700">{row.purpose}</td>
                      <td className="py-2 pr-3 text-slate-700">{row.place}</td>
                      <td className="py-2 pr-3 text-xs uppercase text-slate-500">{(row.formats ?? []).join(', ')}</td>
                      <td className="py-2">
                        <button type="button" onClick={() => remove(row)} aria-label={`Remove ${row.first_name} ${row.last_name}'s request`}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700">
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
