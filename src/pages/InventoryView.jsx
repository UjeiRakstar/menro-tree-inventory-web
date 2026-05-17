import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabaseClient.js';
import { generateMenroExcel } from '../lib/excelExport.js';
import { X, Image, ArrowUpDown, MapPin, Download, Printer } from 'lucide-react';

const NULL_CELL_PLACEHOLDER = '—';

export default function InventoryView() {
  const [status, setStatus] = useState('loading');
  const [trees, setTrees] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  // Filter state
  const [filterSpeciesType, setFilterSpeciesType] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterBarangay, setFilterBarangay] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Export state
  const [isExporting, setIsExporting] = useState(false);

  // Sort state
  const [sortField, setSortField] = useState('dateCaptured');
  const [sortDir, setSortDir] = useState('desc');

  // Lightbox state — now stores the full tree for carousel
  const [lightboxTree, setLightboxTree] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Selected tree for "View on Map" prompt
  const [selectedTree, setSelectedTree] = useState(null);
  const navigate = useNavigate();

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
        setErrorMessage(e?.message ?? 'Unexpected error loading inventory.');
        setStatus('error');
      }
    }
    fetchTrees();
    return () => { cancelled = true; };
  }, []);

  // Derive unique filter options from data
  const speciesTypes = useMemo(() => {
    const set = new Set(trees.map(t => t.biodiversity_status || t.species_type).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [trees]);

  const categories = useMemo(() => {
    const set = new Set(trees.map(t => t.tree_category).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [trees]);

  const barangays = useMemo(() => {
    const set = new Set(trees.map(t => t.barangay).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [trees]);

  // Apply filters and sorting
  const filteredTrees = useMemo(() => {
    let result = [...trees];

    if (filterSpeciesType !== 'All') {
      result = result.filter(t => (t.biodiversity_status || t.species_type) === filterSpeciesType);
    }
    if (filterCategory !== 'All') {
      result = result.filter(t => t.tree_category === filterCategory);
    }
    if (filterBarangay !== 'All') {
      result = result.filter(t => t.barangay === filterBarangay);
    }

    // Date range filter — inclusive on both ends, parses ISO/date strings
    if (dateFrom) {
      const fromMs = new Date(dateFrom).getTime();
      if (Number.isFinite(fromMs)) {
        result = result.filter(t => {
          const ts = t.dateCaptured ? new Date(t.dateCaptured).getTime() : NaN;
          return Number.isFinite(ts) && ts >= fromMs;
        });
      }
    }
    if (dateTo) {
      // End of selected day so a trip captured at 17:00 on dateTo is included
      const toMs = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
      if (Number.isFinite(toMs)) {
        result = result.filter(t => {
          const ts = t.dateCaptured ? new Date(t.dateCaptured).getTime() : NaN;
          return Number.isFinite(ts) && ts <= toMs;
        });
      }
    }

    // Sort
    result.sort((a, b) => {
      let aVal = a[sortField] ?? '';
      let bVal = b[sortField] ?? '';

      if (sortField === 'dbh') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [trees, filterSpeciesType, filterCategory, filterBarangay, dateFrom, dateTo, sortField, sortDir]);

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  async function handleExportExcel() {
    if (isExporting || filteredTrees.length === 0) return;
    setIsExporting(true);
    try {
      await generateMenroExcel(filteredTrees);
    } finally {
      setIsExporting(false);
    }
  }

  function handlePrintQr() {
    window.print();
  }

  /** Bucket numeric height (in meters) into Small / Medium / Tall. */
  function classifyHeight(tree) {
    const raw = tree.total_height ?? tree.heightClass;
    const meters = parseFloat(raw);
    if (!Number.isFinite(meters) || meters <= 0) return null;
    if (meters < 5) return 'Small';
    if (meters < 15) return 'Medium';
    return 'Tall';
  }

  function SortableHeader({ field, children }) {
    const isActive = sortField === field;
    return (
      <th
        scope="col"
        onClick={() => handleSort(field)}
        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 cursor-pointer hover:text-slate-900 select-none"
      >
        <span className="inline-flex items-center gap-1">
          {children}
          <ArrowUpDown size={12} className={isActive ? 'text-green-700' : 'text-slate-400'} />
        </span>
      </th>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Inventory</h1>
        <p className="mt-2 text-slate-600">
          Master database of every captured tree.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={handlePrintQr} disabled={filteredTrees.length === 0}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
          <Printer size={14} />
          Print QR Codes
        </button>
        <button type="button" onClick={handleExportExcel} disabled={isExporting || filteredTrees.length === 0}
          className="inline-flex items-center gap-2 rounded-md border border-transparent bg-green-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50">
          <Download size={14} />
          {isExporting ? 'Exporting…' : 'Export to Excel'}
        </button>
      </div>

      {status === 'loading' && (
        <div role="status" data-testid="inventory-loading" className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Loading inventory…
        </div>
      )}

      {status === 'error' && (
        <div role="alert" data-testid="inventory-error" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load inventory: {errorMessage}
        </div>
      )}

      {status === 'loaded' && trees.length === 0 && (
        <div data-testid="inventory-empty" className="rounded border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          No tree records found.
        </div>
      )}

      {status === 'loaded' && trees.length > 0 && (
        <>
          {/* Filter Control Panel */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 uppercase">Biodiversity:</label>
                <select value={filterSpeciesType} onChange={(e) => setFilterSpeciesType(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20">
                  {speciesTypes.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 uppercase">Category:</label>
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20">
                  {categories.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              {barangays.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600 uppercase">Barangay:</label>
                  <select value={filterBarangay} onChange={(e) => setFilterBarangay(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20">
                    {barangays.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 uppercase">From:</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  max={dateTo || undefined}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 uppercase">To:</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || undefined}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Clear dates
                </button>
              )}
              <span className="ml-auto text-xs text-slate-500">
                Showing {filteredTrees.length} of {trees.length} records
              </span>
            </div>
          </div>

          {/* Data Table */}
          <section aria-label="Master Data Table" data-testid="inventory-table"
            className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Photo</th>
                    <SortableHeader field="species">Species</SortableHeader>
                    <SortableHeader field="barangay">Barangay</SortableHeader>
                    <SortableHeader field="dbh">DBH</SortableHeader>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Height</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Hazard</th>
                    <SortableHeader field="dateCaptured">Date Captured</SortableHeader>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Assigned To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredTrees.map((tree) => {
                    const hazardItems = [];
                    if (tree.isLeaning || tree.is_leaning) hazardItems.push({ label: 'Leaning', photos: tree.leaning_photos });
                    if (tree.hasPowerlineConflict || tree.has_powerline_conflict) hazardItems.push({ label: 'Powerline', photos: tree.powerline_photos });
                    if (tree.isDecayed || tree.is_decayed) hazardItems.push({ label: 'Decayed', photos: tree.decayed_photos });
                    if (tree.isRootProblem || tree.is_root_problem) hazardItems.push({ label: 'Root Problem', photos: tree.root_photos });

                    const photoUrl = tree.photo_url || tree.imageUrl;
                    const heightBucket = classifyHeight(tree);
                    const dbhValue = parseFloat(tree.dbh);

                    return (
                      <tr key={tree.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedTree(tree)}>
                        <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                          {photoUrl ? (
                            <img
                              src={photoUrl}
                              alt={tree.species}
                              onClick={() => { setLightboxTree(tree); setLightboxIndex(0); }}
                              className="w-10 h-10 object-cover rounded-md cursor-pointer hover:ring-2 hover:ring-green-500 transition"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center">
                              <Image size={14} className="text-slate-400" />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm font-semibold text-slate-900">{tree.species ?? NULL_CELL_PLACEHOLDER}</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{tree.barangay ?? NULL_CELL_PLACEHOLDER}</td>
                        <td className="px-4 py-2 text-sm text-slate-700">
                          {Number.isFinite(dbhValue) ? `${dbhValue} cm` : NULL_CELL_PLACEHOLDER}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {heightBucket ? (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                              {heightBucket}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">{NULL_CELL_PLACEHOLDER}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm" onClick={(e) => e.stopPropagation()}>
                          {hazardItems.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {hazardItems.map((item) => {
                                const hasPhoto = item.photos && (Array.isArray(item.photos) ? item.photos.length > 0 : typeof item.photos === 'string');
                                const firstPhoto = Array.isArray(item.photos) ? item.photos[0] : item.photos;
                                const photoStr = typeof firstPhoto === 'object' ? (firstPhoto?.url || firstPhoto) : firstPhoto;
                                return (
                                  <span
                                    key={item.label}
                                    onClick={() => {
                                      if (hasPhoto) {
                                        setLightboxTree({ _singleUrl: photoStr, species: tree.species, _label: item.label });
                                        setLightboxIndex(0);
                                      }
                                    }}
                                    className={`inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ${hasPhoto ? 'cursor-pointer hover:bg-red-100 hover:ring-1 hover:ring-red-300' : ''}`}
                                    title={hasPhoto ? `Click to view ${item.label} photo` : item.label}
                                  >
                                    {item.label}
                                    {hasPhoto && <span className="ml-1">📷</span>}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                              Safe
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-slate-500">
                          {tree.dateCaptured ? new Date(tree.dateCaptured).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-2 text-sm text-slate-700">{tree.assigned_to ?? NULL_CELL_PLACEHOLDER}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Photo Lightbox Modal — Carousel */}
      {lightboxTree && (() => {
        // Build carousel from all available photos
        let photos = [];
        if (lightboxTree._singleUrl) {
          // Hazard indicator click — single photo
          photos = [{ url: lightboxTree._singleUrl, label: lightboxTree._label || 'Photo' }];
        } else {
          // Tree thumbnail click — show all available photos
          if (lightboxTree.photo_url) photos.push({ url: lightboxTree.photo_url, label: 'Main Photo' });
          if (lightboxTree.imageUrl && !lightboxTree.photo_url) photos.push({ url: lightboxTree.imageUrl, label: 'Main Photo' });
          if (lightboxTree.leaves_url) photos.push({ url: lightboxTree.leaves_url, label: 'Leaves' });
          if (lightboxTree.bark_url) photos.push({ url: lightboxTree.bark_url, label: 'Bark' });
          if (lightboxTree.fruits_url) photos.push({ url: lightboxTree.fruits_url, label: 'Fruits' });
        }

        if (photos.length === 0) return null;
        const idx = lightboxIndex % photos.length;

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setLightboxTree(null)}>
            <div className="relative max-w-3xl max-h-[85vh] mx-4" onClick={(e) => e.stopPropagation()}>
              {/* Close button */}
              <button
                onClick={() => setLightboxTree(null)}
                className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-600 hover:text-slate-900 transition z-10"
              >
                <X size={16} />
              </button>

              {/* Image */}
              <img
                src={photos[idx].url}
                alt={`${lightboxTree.species || 'Tree'} - ${photos[idx].label}`}
                className="max-w-full max-h-[75vh] rounded-lg shadow-2xl object-contain mx-auto"
              />

              {/* Label + navigation */}
              <div className="mt-3 flex items-center justify-center gap-4">
                {photos.length > 1 && (
                  <button
                    onClick={() => setLightboxIndex((idx - 1 + photos.length) % photos.length)}
                    className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 transition"
                  >
                    ‹
                  </button>
                )}
                <span className="text-white text-sm font-medium">
                  {photos[idx].label} ({idx + 1}/{photos.length})
                </span>
                {photos.length > 1 && (
                  <button
                    onClick={() => setLightboxIndex((idx + 1) % photos.length)}
                    className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/40 transition"
                  >
                    ›
                  </button>
                )}
              </div>

              {/* Thumbnail strip */}
              {photos.length > 1 && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  {photos.map((p, i) => (
                    <img
                      key={i}
                      src={p.url}
                      alt={p.label}
                      onClick={() => setLightboxIndex(i)}
                      className={`w-12 h-12 object-cover rounded-md cursor-pointer transition ${
                        i === idx ? 'ring-2 ring-white opacity-100' : 'opacity-50 hover:opacity-80'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* View on Map Prompt */}
      {selectedTree && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedTree(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
                <MapPin size={24} className="text-green-700" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">{selectedTree.species || 'Unknown species'}</h3>
              <p className="text-sm text-slate-500 mb-4">
                {selectedTree.barangay || '—'}
                {selectedTree.dbh != null && selectedTree.dbh !== '' && (
                  <span> · DBH: {parseFloat(selectedTree.dbh)} cm</span>
                )}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedTree(null)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    navigate(`/map?lat=${selectedTree.latitude}&lng=${selectedTree.longitude}&tree=${selectedTree.id}`);
                    setSelectedTree(null);
                  }}
                  className="flex-1 py-2 rounded-lg bg-green-700 text-sm font-medium text-white hover:bg-green-800 transition"
                >
                  View on Map
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Sticker Sheet (print only) */}
      <div className="hidden print:block" data-testid="qr-sticker-sheet">
        <div className="grid grid-cols-[repeat(auto-fill,85mm)] gap-4">
          {filteredTrees.map((tree) => {
            const tagValue = tree.tree_id ?? tree.id;
            const tagDisplay = tree.tree_id ?? (tree.id ? String(tree.id).slice(0, 8).toUpperCase() : '—');
            return (
              <div key={tree.id} data-testid="qr-sticker" className="flex flex-col items-center justify-center border border-slate-300 p-2" style={{ width: '85mm', height: '54mm' }}>
                <div data-testid="lgu-logo-placeholder" className="mb-2 h-6 w-12" />
                <p className="mb-1 text-xs font-medium text-slate-800">Tag: {tagDisplay}</p>
                <QRCodeSVG value={String(tagValue ?? '')} size={80} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
