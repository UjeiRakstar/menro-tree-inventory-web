import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, TreePine, MapPin, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';

export default function WikiTrees() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpecies, setSelectedSpecies] = useState(searchParams.get('species') || '');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch all trees on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchTrees() {
      setLoading(true);
      const { data, error } = await supabase.from('trees').select('*');
      if (cancelled) return;
      if (!error && Array.isArray(data)) {
        setTrees(data);
      }
      setLoading(false);
    }
    fetchTrees();
    return () => { cancelled = true; };
  }, []);

  // Sync URL param to state
  useEffect(() => {
    const sp = searchParams.get('species');
    if (sp && sp !== selectedSpecies) {
      setSelectedSpecies(sp);
    }
  }, [searchParams]);

  // Build species list with counts
  const speciesList = useMemo(() => {
    const map = new Map();
    for (const tree of trees) {
      const name = (tree.species || '').trim();
      if (!name) continue;
      if (!map.has(name)) {
        map.set(name, { name, count: 0, trees: [] });
      }
      const entry = map.get(name);
      entry.count += 1;
      entry.trees.push(tree);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [trees]);

  // Filtered species list for search
  const filteredSpeciesList = useMemo(() => {
    if (!searchQuery.trim()) return speciesList;
    const q = searchQuery.toLowerCase();
    return speciesList.filter((s) => s.name.toLowerCase().includes(q));
  }, [speciesList, searchQuery]);

  // Selected species data
  const speciesData = useMemo(() => {
    if (!selectedSpecies) return null;
    return speciesList.find((s) => s.name === selectedSpecies) || null;
  }, [speciesList, selectedSpecies]);

  // Collect all images for the selected species
  const speciesImages = useMemo(() => {
    if (!speciesData) return [];
    const imgs = [];
    for (const tree of speciesData.trees) {
      if (tree.photo_url) imgs.push({ url: tree.photo_url, label: 'Tree', barangay: tree.barangay });
      if (tree.leaves_url) imgs.push({ url: tree.leaves_url, label: 'Leaves', barangay: tree.barangay });
      if (tree.bark_url) imgs.push({ url: tree.bark_url, label: 'Bark', barangay: tree.barangay });
      if (tree.fruits_url) imgs.push({ url: tree.fruits_url, label: 'Fruits', barangay: tree.barangay });
      // camelCase variants
      if (!tree.photo_url && tree.imageUrl) imgs.push({ url: tree.imageUrl, label: 'Tree', barangay: tree.barangay });
      if (!tree.leaves_url && tree.leavesUrl) imgs.push({ url: tree.leavesUrl, label: 'Leaves', barangay: tree.barangay });
      if (!tree.bark_url && tree.barkUrl) imgs.push({ url: tree.barkUrl, label: 'Bark', barangay: tree.barangay });
      if (!tree.fruits_url && tree.fruitsUrl) imgs.push({ url: tree.fruitsUrl, label: 'Fruits', barangay: tree.barangay });
    }
    return imgs;
  }, [speciesData]);

  // Barangays where this species is found
  const speciesBarangays = useMemo(() => {
    if (!speciesData) return [];
    const set = new Set();
    for (const tree of speciesData.trees) {
      if (tree.barangay) set.add(tree.barangay);
    }
    return Array.from(set).sort();
  }, [speciesData]);

  // Category and biodiversity status (take from first tree that has them)
  const speciesMeta = useMemo(() => {
    if (!speciesData) return { category: '', biodiversityStatus: '', scientificName: '' };
    let category = '';
    let biodiversityStatus = '';
    let scientificName = '';
    for (const tree of speciesData.trees) {
      if (!category && tree.tree_category) {
        category = tree.tree_category.replace(/\s*Trees$/i, '').trim();
      }
      if (!biodiversityStatus && (tree.biodiversity_status || tree.species_type)) {
        biodiversityStatus = tree.biodiversity_status || tree.species_type;
      }
      if (!scientificName && tree.scientific_name) {
        scientificName = tree.scientific_name;
      }
      if (category && biodiversityStatus && scientificName) break;
    }
    return { category, biodiversityStatus, scientificName };
  }, [speciesData]);

  function handleSelectSpecies(name) {
    setSelectedSpecies(name);
    setSearchParams({ species: name });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={18} className="animate-spin text-green-700" />
          Loading species data…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <TreePine className="text-green-700" size={28} />
            Wiki Trees
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Encyclopedia of tree species found in Santa Cruz, Laguna
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Species List Sidebar */}
          <div className="w-full lg:w-72 flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-20">
              {/* Search */}
              <div className="p-3 border-b border-gray-100">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search species…"
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                  />
                </div>
              </div>

              {/* Species list */}
              <div className="max-h-[60vh] overflow-y-auto">
                {filteredSpeciesList.length === 0 ? (
                  <p className="p-4 text-sm text-gray-400 text-center">No species found</p>
                ) : (
                  filteredSpeciesList.map((sp) => (
                    <button
                      key={sp.name}
                      onClick={() => handleSelectSpecies(sp.name)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 transition hover:bg-green-50 ${
                        selectedSpecies === sp.name
                          ? 'bg-green-50 border-l-4 border-l-green-600'
                          : ''
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-800">{sp.name}</p>
                      <p className="text-[11px] text-gray-400">{sp.count} tree{sp.count > 1 ? 's' : ''} logged</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {!selectedSpecies ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 sm:p-12 text-center">
                <TreePine className="mx-auto text-gray-300 mb-4" size={48} />
                <h2 className="text-lg font-semibold text-gray-700 mb-2">Select a Species</h2>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  Choose a tree species from the list to view its photos, distribution data, and ecological information.
                </p>
              </div>
            ) : !speciesData ? (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
                <p className="text-sm text-gray-500">
                  Species "{selectedSpecies}" not found in the database.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Photo Gallery */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {speciesImages.length > 0 ? (
                    <ImageGallery images={speciesImages} speciesName={speciesData.name} />
                  ) : (
                    <div className="h-64 flex items-center justify-center bg-gray-100">
                      <div className="text-center">
                        <TreePine className="mx-auto text-gray-300 mb-2" size={36} />
                        <p className="text-sm text-gray-400">No photos available yet</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Species Info */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6">
                  {/* Title & Badges */}
                  <div className="mb-4">
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {speciesData.name}
                    </h2>
                    {speciesMeta.scientificName && (
                      <p className="text-sm italic text-gray-500 mt-0.5">
                        {speciesMeta.scientificName}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {speciesMeta.category && (
                        <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-green-100 text-green-800 border border-green-200">
                          {speciesMeta.category}
                        </span>
                      )}
                      {speciesMeta.biodiversityStatus && (
                        <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                          {speciesMeta.biodiversityStatus}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                      <p className="text-xs font-medium text-green-700 uppercase tracking-wide">
                        Total Count in Santa Cruz
                      </p>
                      <p className="text-2xl font-bold text-green-800 mt-1">
                        {speciesData.count}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                        Found in Barangays
                      </p>
                      <p className="text-lg font-bold text-gray-800 mt-1">
                        {speciesBarangays.length}
                      </p>
                    </div>
                  </div>

                  {/* Barangay list */}
                  {speciesBarangays.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                        <MapPin size={14} className="text-green-600" />
                        Distribution by Barangay
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {speciesBarangays.map((brgy) => (
                          <span
                            key={brgy}
                            className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md border border-gray-200"
                          >
                            {brgy}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Phenology & Characteristics placeholder */}
                  <div className="border-t border-gray-100 pt-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      Phenology &amp; Characteristics
                    </h3>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <p className="text-sm text-amber-800">
                        Detailed phenological data, growth characteristics, ecological role, and
                        traditional uses for <strong>{speciesData.name}</strong> will be added here
                        by MENRO Arborists. This section will include flowering and fruiting
                        seasons, average height and canopy spread, preferred soil conditions, and
                        conservation notes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Image gallery with carousel for the selected species */
function ImageGallery({ images, speciesName }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset index when images change
  useEffect(() => {
    setCurrentIndex(0);
  }, [images]);

  const current = images[currentIndex];
  const hasMultiple = images.length > 1;

  function next() {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }
  function prev() {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }

  return (
    <div>
      {/* Main image */}
      <div className="relative h-64 sm:h-80 md:h-96 bg-gray-900">
        <img
          src={current.url}
          alt={`${speciesName} - ${current.label}`}
          className="w-full h-full object-contain"
          onError={(e) => { e.target.src = ''; e.target.alt = 'Image unavailable'; }}
        />

        {/* Navigation */}
        {hasMultiple && (
          <>
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* Label badge */}
        <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-md">
          {current.label}
          {current.barangay && <span className="text-white/70"> · {current.barangay}</span>}
        </div>

        {/* Counter */}
        {hasMultiple && (
          <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-md">
            {currentIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {hasMultiple && (
        <div className="flex gap-1 p-2 bg-gray-100 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`flex-shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition ${
                i === currentIndex ? 'border-green-600' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img
                src={img.url}
                alt={`${speciesName} ${img.label} thumbnail`}
                className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
