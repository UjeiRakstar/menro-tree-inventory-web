import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { X, Image, Printer, Search, ChevronLeft, ChevronRight, Download, FileBarChart, Archive, RotateCcw, MapPin } from 'lucide-react';
import CertificatePrint from '../components/CertificatePrint.jsx';
import PermitReport from '../components/PermitReport.jsx';
import { groupPermits } from '../lib/permitReport.js';
import { saveAs } from 'file-saver';
import { useAuth } from '../context/AuthContext.jsx';
import { inOfficeLgu, isSuperAdmin } from '../lib/roles.js';
import { lguOfPermitRow } from '../lib/permitLogs.js';
import { MUNICIPALITY_LIST } from '../lib/lagunaBoundaries.js';

const PAGE_SIZE = 50;

const LGU_BY_NAME = new Map(MUNICIPALITY_LIST.map((item) => [item.name.toLowerCase(), item.psgc]));
const LGU_LABEL = new Map(MUNICIPALITY_LIST.map((item) => [item.psgc, item.label]));
/** The label of the LGU a permit is in, or null when it is in none. */
const lguLabelOf = (permit) => LGU_LABEL.get(lguOfPermitRow(permit, LGU_BY_NAME)) ?? null;

/**
 *   lgu       the office's LGU code — only its permits are listed; undefined
 *             for PGENRO. The database fences them too (permits_fence.sql);
 *             this keeps the list right before that file is run.
 *   embedded  shown as a tab of the Action Board (22 October): its title is
 *             the tab's, a level down.
 *
 * The super admin alone archives and restores a permit (super_admin.sql); an
 * archived permit stays in the list, marked. Everyone else only reads them.
 */
export default function PermitsLog({ lgu = undefined, embedded = false }) {
  const { profile } = useAuth();
  const canArchive = isSuperAdmin(profile);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);
  // The letterhead's LGU, by the office's code; PGENRO's file is the province's.
  const officeLgu = lgu ? MUNICIPALITY_LIST.find((item) => item.psgc === Number(lgu)) ?? null : null;
  const [permits, setPermits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [printPermit, setPrintPermit] = useState(null);

  // Search & filters
  const [search, setSearch] = useState('');
  const [filterBarangay, setFilterBarangay] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  // The province's permits by city or municipality (21 October), each opened
  // when wanted; an office's own are one list, in pages.
  const province = lgu === undefined;
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchPermits() {
      const { data, error } = await supabase.from('permits').select('*').order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) { console.error(error.message); setLoading(false); return; }
      setPermits((Array.isArray(data) ? data : []).filter((permit) => inOfficeLgu(lgu, lguOfPermitRow(permit, LGU_BY_NAME))));
      setLoading(false);
    }
    fetchPermits();
    return () => { cancelled = true; };
  }, [lgu]);

  // Derive unique barangays/addresses for filter
  const barangays = useMemo(() => {
    const set = new Set(permits.map(p => p.address).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [permits]);

  // Apply search, filters, and date range
  const filteredPermits = useMemo(() => {
    let result = [...permits];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.client_name || '').toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q) ||
        (p.contact_info || '').toLowerCase().includes(q)
      );
    }

    // Barangay/address filter
    if (filterBarangay !== 'All') {
      result = result.filter(p => p.address === filterBarangay);
    }

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter(p => p.created_at && new Date(p.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter(p => p.created_at && new Date(p.created_at) <= to);
    }

    return result;
  }, [permits, search, filterBarangay, dateFrom, dateTo]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredPermits.length / PAGE_SIZE));
  const paginatedPermits = filteredPermits.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [search, filterBarangay, dateFrom, dateTo]);

  async function setArchived(permit, archived) {
    setBusyId(permit.id);
    setNotice(null);
    const { error } = await supabase.rpc('archive_permit', { p_id: String(permit.id), p_archived: archived });
    setBusyId(null);
    if (error) {
      setNotice({ ok: false, text: error.message });
      return;
    }
    setPermits((current) =>
      current.map((row) => (row.id === permit.id ? { ...row, archived_at: archived ? new Date().toISOString() : null } : row))
    );
    setNotice({ ok: true, text: `Permit for ${permit.client_name || 'this client'} ${archived ? 'archived' : 'restored'}.` });
  }

  function handlePrint(permit) {
    setPrintPermit(permit);
    setTimeout(() => { window.print(); setPrintPermit(null); }, 300);
  }

  // In the standard look (workbookLook.js), under the office's own letterhead.
  async function exportPermitsToExcel(data) {
    const { addTableSheet, createWorkbook, workbookBlob } = await import('../lib/workbookLook.js');
    const workbook = await createWorkbook();
    const issuedOn = (p) => (p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : '');
    await addTableSheet(workbook, {
      name: 'Permit Logs',
      lgu: officeLgu,
      title: 'CUTTING PERMIT LOGBOOK',
      subtitle: dateFrom || dateTo ? `Issued ${dateFrom || 'from the start'} to ${dateTo || 'today'}` : '',
      preparedBy: profile?.full_name || '',
      landscape: true,
      columns: [
        { label: 'Client name', width: 22 },
        { label: 'Contact', width: 18 },
        { label: 'Address', width: 26 },
        { label: 'Species', width: 16 },
        { label: 'Quantity', kind: 'number', width: 9 },
        { label: 'Reason', width: 32 },
        { label: 'Status', width: 11 },
        { label: 'Date issued', width: 12 },
      ],
      rows: data.map((p) => [p.client_name || '', p.contact_info || '', p.address || '', p.species || '', p.number_of_trees || 1, p.reason || '', p.status || 'Pending', issuedOn(p)]),
      totals: [`${data.length} ${data.length === 1 ? 'permit' : 'permits'}`, null, null, null, data.reduce((sum, p) => sum + (Number(p.number_of_trees) || 1), 0), null, null, null],
    });
    saveAs(await workbookBlob(workbook), `Permit_Logs_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const byLgu = province ? groupPermits(filteredPermits, 'lgu', { lguOf: lguLabelOf }) : [];
  const toggleGroup = (name) =>
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  /** The permits as a table: the page's, or one city or municipality's. */
  const renderTable = (rows) => (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Client Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Coordinates</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Species</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Docs</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Cert</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {rows.map((permit) => {
                  const urls = Array.isArray(permit.requirements_urls) ? permit.requirements_urls : [];
                  const status = permit.status || 'Pending';
                  return (
                    <tr key={permit.id} className={permit.archived_at ? 'bg-slate-50 text-slate-400' : 'hover:bg-slate-50'}>
                      <td className="px-4 py-2 text-sm font-medium text-slate-900">
                        {permit.client_name || '—'}
                        {permit.archived_at && (
                          <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">Archived</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-700">{permit.contact_info || '—'}</td>
                      <td className="px-4 py-2 text-sm text-slate-700 max-w-[140px] truncate" title={permit.address}>{permit.address || '—'}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {permit.latitude && permit.longitude ? `${Number(permit.latitude).toFixed(4)}, ${Number(permit.longitude).toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-700">{permit.species || '—'}</td>
                      <td className="px-4 py-2 text-sm text-slate-700">{permit.number_of_trees || 1}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {permit.created_at ? new Date(permit.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          status === 'Cut' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>{status}</span>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {urls.length > 0 ? (
                          <div className="flex gap-1">
                            {urls.slice(0, 3).map((url, i) => (
                              <img key={i} src={url} alt={`Req ${i + 1}`} onClick={() => setLightboxUrl(url)}
                                className="w-7 h-7 object-cover rounded cursor-pointer hover:ring-2 hover:ring-green-500 transition"
                                onError={(e) => { e.target.style.display = 'none'; }} />
                            ))}
                            {urls.length > 3 && <span className="text-[10px] text-slate-400 self-center">+{urls.length - 3}</span>}
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded bg-slate-100 flex items-center justify-center">
                            <Image size={10} className="text-slate-400" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <button onClick={() => handlePrint(permit)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50 transition">
                          <Printer size={10} /> Print
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-sm">
                        {permit.tree_id && (
                          <Link
                            to={`/map?tree=${encodeURIComponent(permit.tree_id)}`}
                            className="mr-3 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800"
                          >
                            <MapPin size={12} aria-hidden="true" /> Tree
                          </Link>
                        )}
                        {canArchive && (
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
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {embedded ? (
            <h2 className="text-lg font-semibold text-slate-900">Permit Logs</h2>
          ) : (
            <h1 className="text-2xl font-semibold text-slate-900">Permit Logs</h1>
          )}
          <p className="mt-1 text-slate-600 text-sm">
            {lgu === undefined
              ? 'Every city and municipality’s walk-in and system-generated cutting permits. Each is its MENRO / CENRO’s record.'
              : 'All walk-in and system-generated cutting permits.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            disabled={permits.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 transition disabled:opacity-50"
          >
            <FileBarChart size={14} />
            Report
          </button>
          <button
            onClick={() => exportPermitsToExcel(permits)}
            disabled={permits.length === 0}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-green-800 ring-1 ring-green-300 hover:bg-green-50 transition disabled:opacity-50"
          >
            <Download size={14} />
            Export to Excel
          </button>
        </div>
      </div>
      <PermitReport
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        permits={permits}
        lgu={officeLgu}
        lguOf={lguLabelOf}
        preparedBy={profile?.full_name || ''}
      />

      {notice && (
        <p role={notice.ok ? 'status' : 'alert'} className={`text-sm ${notice.ok ? 'text-green-800' : 'text-red-700'}`}>{notice.text}</p>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, address, contact…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </div>

          {/* Barangay filter */}
          {barangays.length > 2 && (
            <select value={filterBarangay} onChange={(e) => setFilterBarangay(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20">
              {barangays.map(b => <option key={b} value={b}>{b === 'All' ? 'All Addresses' : b}</option>)}
            </select>
          )}

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" />
            <span className="text-slate-400 text-xs">to</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20" />
          </div>

          <span className="text-xs text-slate-500">
            {filteredPermits.length} result{filteredPermits.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {loading && (
        <div className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">Loading permits…</div>
      )}

      {!loading && filteredPermits.length === 0 && (
        <div className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">No permits found.</div>
      )}

      {!loading && province && byLgu.length > 0 && (
        <div className="space-y-2" aria-label="Permits by city and municipality">
          {byLgu.map((group) => {
            const isOpen = openGroups.has(group.name);
            return (
              <section key={group.name} aria-label={group.name} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.name)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <ChevronRight size={16} className={`text-slate-400 transition ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
                  <span className="flex-1 font-semibold text-slate-900">{group.name}</span>
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">
                    {group.permits.length} {group.permits.length === 1 ? 'permit' : 'permits'}
                  </span>
                  <span className="w-20 text-right text-xs text-slate-500">
                    {group.trees} {group.trees === 1 ? 'tree' : 'trees'}
                  </span>
                </button>
                {isOpen && <div className="border-t border-slate-200">{renderTable(group.permits)}</div>}
              </section>
            );
          })}
        </div>
      )}

      {!loading && !province && paginatedPermits.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          {renderTable(paginatedPermits)}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
              <span className="text-xs text-slate-500">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page;
                  if (totalPages <= 5) { page = i + 1; }
                  else if (currentPage <= 3) { page = i + 1; }
                  else if (currentPage >= totalPages - 2) { page = totalPages - 4 + i; }
                  else { page = currentPage - 2 + i; }
                  return (
                    <button key={page} onClick={() => setCurrentPage(page)}
                      className={`w-7 h-7 rounded text-xs font-medium transition ${
                        page === currentPage ? 'bg-green-700 text-white' : 'border border-slate-200 text-slate-600 hover:bg-white'
                      }`}>
                      {page}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Photo Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setLightboxUrl(null)}>
          <div className="relative max-w-3xl max-h-[85vh] mx-4" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-600 hover:text-slate-900 transition z-10">
              <X size={16} />
            </button>
            <img src={lightboxUrl} alt="Requirement document" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain" />
          </div>
        </div>
      )}

      {/* Certificate Print */}
      {printPermit && (
        <CertificatePrint
          walkInData={{
            species: printPermit.species || 'Unknown',
            scientificName: '',
            address: printPermit.address || '',
            latitude: printPermit.latitude,
            longitude: printPermit.longitude,
            clientName: printPermit.client_name,
            numberOfTrees: printPermit.number_of_trees || 1,
          }}
        />
      )}
    </section>
  );
}
