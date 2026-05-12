import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabaseClient.js';
import { classifyPinColor } from '../lib/pinColor.js';
import { buildTreeInventoryCsv } from '../lib/treeCsv.js';
import { X, Image, ArrowUpDown, MapPin } from 'lucide-react';

const NULL_CELL_PLACEHOLDER = '—';

export default function InventoryView() {
  const [status, setStatus] = useState('loading');
  const [trees, setTrees] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  // Filter state
  const [filterSpeciesType, setFilterSpeciesType] = useState('All');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterBarangay, setFilterBarangay] = useState('All');

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
  }, [trees, filterSpeciesType, filterCategory, filterBarangay, sortField, sortDir]);

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function handleExportCsv() {
    if (trees.length === 0) return;
    const csv = buildTreeInventoryCsv(trees);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tree-inventory.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function handlePrintQr() {
    window.print();
  }

  const isInventoryEmpty = trees.length === 0;

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
        <button type="button" onClick={handleExportCsv} disabled={isInventoryEmpty}
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
          Download CSV
        </button>
        <button type="button" onClick={handlePrintQr}
          className="inline-flex items-center rounded-md border border-transparent bg-green-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-800">
          Print QR Stickers (A4)
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
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Tree ID</th>
                    <SortableHeader field="species">Species</SortableHeader>
                    <SortableHeader field="dbh">DBH</SortableHeader>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Hazard</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Status</th>
                    <SortableHeader field="dateCaptured">Date Captured</SortableHeader>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Assigned To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredTrees.map((tree) => {
                    const pinColor = classifyPinColor(tree);
                    const hazardItems = [];
                    if (tree.isLeaning || tree.is_leaning) hazardItems.push({ label: 'Leaning', photos: tree.leaning_photos });
                    if (tree.hasPowerlineConflict || tree.has_powerline_conflict) hazardItems.push({ label: 'Powerline', photos: tree.powerline_photos });
                    if (tree.isDecayed || tree.is_decayed) hazardItems.push({ label: 'Decayed', photos: tree.decayed_photos });
                    if (tree.isRootProblem || tree.is_root_problem) hazardItems.push({ label: 'Root Problem', photos: tree.root_photos });

                    const STATUS_COLORS = { Red: 'bg-red-50 text-red-700', Orange: 'bg-orange-50 text-orange-700', Yellow: 'bg-amber-50 text-amber-700', Green: 'bg-emerald-50 text-emerald-700' };
                    const STATUS_LABELS = { Red: 'Hazard', Orange: 'Dispatched', Yellow: 'Permit', Green: 'Safe' };
                    const photoUrl = tree.photo_url || tree.imageUrl;

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
                        <td className="px-4 py-2 text-sm font-medium text-slate-900">{tree.tree_id ?? NULL_CELL_PLACEHOLDER}</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{tree.species}</td>
                        <td className="px-4 py-2 text-sm text-slate-700">{tree.dbh}</td>
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
                            <span className="text-slate-400 text-xs">None</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[pinColor]}`}>
                            {STATUS_LABELS[pinColor]}
                          </span>
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
              <h3 className="text-lg font-semibold text-slate-900 mb-1">{selectedTree.species}</h3>
              <p className="text-sm text-slate-500 mb-4">
                {selectedTree.tree_id || 'Untagged'} • DBH: {selectedTree.dbh}
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
          {trees.map((tree) => (
            <div key={tree.id} data-testid="qr-sticker" className="flex flex-col items-center justify-center border border-slate-300 p-2" style={{ width: '85mm', height: '54mm' }}>
              <div data-testid="lgu-logo-placeholder" className="mb-2 h-6 w-12" />
              <p className="mb-1 text-xs font-medium text-slate-800">Tree ID: {tree.tree_id ?? '—'}</p>
              <QRCodeSVG value={tree.tree_id ?? ''} size={80} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
