import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ChevronDown, FileSpreadsheet, Loader2, MapPin, RotateCcw, Search } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import { downloadPermitReport, lguOfPermit, treesCovered } from '../../lib/permitLogs.js';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

/**
 * Every LGU's permit log, for PGENRO: grouped by LGU, read-only, with archive
 * and a report.
 *
 * Read-only means nothing here changes a permit's details — those are the
 * MENRO/CENRO's record. Archiving only moves a log out of this list; it is
 * kept, can be shown again, and can be restored (permit_archive.sql).
 */
export default function ProvincePermits({ permits: initial, trees, lgus, labelOf }) {
  const [permits, setPermits] = useState(initial);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');

  const context = useMemo(
    () => ({
      treesById: new Map(trees.map((tree) => [String(tree.id), tree])),
      lguByName: new Map(lgus.map((lgu) => [String(lgu.name).toLowerCase(), lgu.psgc])),
    }),
    [trees, lgus]
  );
  const lguOf = useMemo(() => {
    const cache = new Map();
    return (permit) => {
      if (!cache.has(permit.id)) cache.set(permit.id, lguOfPermit(permit, context));
      return cache.get(permit.id);
    };
  }, [context]);

  const archivedCount = permits.filter((permit) => permit.archived_at).length;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map();
    for (const permit of permits) {
      if (permit.archived_at && !showArchived) continue;
      if (
        q &&
        ![permit.client_name, permit.reason, permit.species, permit.address]
          .some((value) => String(value ?? '').toLowerCase().includes(q))
      ) {
        continue;
      }
      const lgu = lguOf(permit);
      if (!map.has(lgu)) map.set(lgu, []);
      map.get(lgu).push(permit);
    }
    return [...map.entries()]
      .map(([lgu, list]) => ({ lgu, label: labelOf(lgu), list }))
      .sort((a, b) => b.list.length - a.list.length || a.label.localeCompare(b.label));
  }, [permits, query, showArchived, lguOf, labelOf]);

  async function setArchived(permit, archived) {
    setBusyId(permit.id);
    setProblem('');
    const { error } = await supabase.rpc('archive_permit', { p_id: String(permit.id), p_archived: archived });
    setBusyId(null);
    if (error) {
      const missing = /could not find the function|does not exist/i.test(error.message ?? '');
      setProblem(
        missing
          ? 'Archiving needs supabase/permit_archive.sql, which has not been run yet.'
          : error.message
      );
      return;
    }
    setPermits((current) =>
      current.map((row) =>
        row.id === permit.id ? { ...row, archived_at: archived ? new Date().toISOString() : null } : row
      )
    );
    setNotice(
      archived
        ? `Permit for ${permit.client_name || 'this client'} archived. Tick “Show archived” to see it again.`
        : `Permit for ${permit.client_name || 'this client'} restored.`
    );
  }

  async function handleReport(event) {
    event.preventDefault();
    if (from && to && from > to) {
      setProblem('The report’s start date is after its end date.');
      return;
    }
    setReporting(true);
    setProblem('');
    try {
      const { permits: count } = await downloadPermitReport({ permits, lguOf, labelOf, from, to });
      setNotice(`Report downloaded: ${count} ${count === 1 ? 'permit' : 'permits'}, grouped by LGU.`);
    } catch (error) {
      setProblem(`The report could not be made: ${error.message}`);
    } finally {
      setReporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={handleReport}
        aria-label="Permit report"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <p className="w-full text-sm font-semibold text-slate-800">Generate a report</p>
        <label className="text-xs text-slate-600">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-slate-600">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </label>
        <button
          type="submit"
          disabled={reporting || permits.length === 0}
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {reporting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={15} aria-hidden="true" />}
          Download Excel report
        </button>
        <p className="w-full text-xs text-slate-500">
          A summary by LGU — permits and the trees they cover — and every permit in the period. Archived permits are
          included and marked. Leave the dates empty for everything.
        </p>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a client, reason, species or address"
            aria-label="Find a permit"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived ({archivedCount})
        </label>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-900">
          {notice}
        </p>
      )}
      {problem && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {problem}
        </p>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">
          {permits.length === 0 ? 'No permits issued yet.' : 'No permit matches.'}
        </p>
      ) : (
        groups.map((group) => (
          <details key={group.lgu ?? 'none'} open className="group rounded-2xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
              <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
              <h2 className="flex-1 text-base font-bold text-slate-900">{group.label}</h2>
              <span className="text-sm text-slate-500">
                {group.list.length} {group.list.length === 1 ? 'permit' : 'permits'} ·{' '}
                {group.list.reduce((sum, permit) => sum + treesCovered(permit), 0)} trees
              </span>
            </summary>
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-sm" aria-label={`Permits — ${group.label}`}>
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Issued</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Client</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Reason</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Species</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Trees</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Address</th>
                    <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.list.map((permit) => (
                    <tr key={permit.id} className={permit.archived_at ? 'bg-slate-50 text-slate-400' : ''}>
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(permit.created_at)}</td>
                      <td className="px-3 py-2 font-medium">
                        {permit.client_name || '—'}
                        {permit.archived_at && (
                          <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">Archived</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{permit.reason || '—'}</td>
                      <td className="px-3 py-2">{permit.species || '—'}</td>
                      <td className="px-3 py-2 text-right">{treesCovered(permit)}</td>
                      <td className="px-3 py-2">{permit.address || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {permit.tree_id && (
                          <Link
                            to={`/map?tree=${encodeURIComponent(permit.tree_id)}`}
                            className="mr-3 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800"
                          >
                            <MapPin size={12} aria-hidden="true" /> Tree
                          </Link>
                        )}
                        <button
                          type="button"
                          disabled={busyId === permit.id}
                          onClick={() => setArchived(permit, !permit.archived_at)}
                          aria-label={`${permit.archived_at ? 'Restore' : 'Archive'} the permit for ${permit.client_name || 'this client'}`}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {permit.archived_at ? <RotateCcw size={12} aria-hidden="true" /> : <Archive size={12} aria-hidden="true" />}
                          {permit.archived_at ? 'Restore' : 'Archive'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))
      )}
    </div>
  );
}
