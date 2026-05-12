import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient.js';
import { X, Image, Printer, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import CertificatePrint from '../components/CertificatePrint.jsx';

const PAGE_SIZE = 50;

export default function PermitsLog() {
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

  useEffect(() => {
    let cancelled = false;
    async function fetchPermits() {
      const { data, error } = await supabase.from('permits').select('*').order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) { console.error(error.message); setLoading(false); return; }
      setPermits(Array.isArray(data) ? data : []);
      setLoading(false);
    }
    fetchPermits();
    return () => { cancelled = true; };
  }, []);

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

  function handlePrint(permit) {
    setPrintPermit(permit);
    setTimeout(() => { window.print(); setPrintPermit(null); }, 300);
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Permit Logs</h1>
        <p className="mt-1 text-slate-600 text-sm">All walk-in and system-generated cutting permits.</p>
      </div>

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

      {!loading && paginatedPermits.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {paginatedPermits.map((permit) => {
                  const urls = Array.isArray(permit.requirements_urls) ? permit.requirements_urls : [];
                  const status = permit.status || 'Pending';
                  return (
                    <tr key={permit.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-sm font-medium text-slate-900">{permit.client_name || '—'}</td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
