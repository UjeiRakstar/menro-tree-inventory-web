import { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, ChevronLeft, ChevronRight, Locate } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient.js';
import santaCruzBoundary from '../../data/Santa-Cruz-Boundary.geojson';
import TaggingForm from '../../components/public/TaggingForm.jsx';

const SANTA_CRUZ_CENTER = [14.2823, 121.4163];
const SANTA_CRUZ_ZOOM = 13;

const CATEGORIES = ['All Trees', 'Fruit Tree', 'Timber', 'Ornamental'];

// Species-to-color mapping for marker symbology
const SPECIES_COLOR_MAP = {
  'Narra': '#16a34a',
  'Mahogany': '#7c3aed',
  'Mango': '#f59e0b',
  'Rambutan': '#dc2626',
  'Santol': '#ea580c',
  'Coconut': '#65a30d',
  'Acacia': '#84cc16',
  'Fig Tree': '#0891b2',
  'Areca Palm': '#14b8a6',
  'Sampaloc': '#a855f7',
  'Langka': '#eab308',
  'Lanzones': '#6366f1',
  'Bougainvillea': '#ec4899',
  'Kamagong': '#0f766e',
  'Molave': '#b45309',
  'Ipil-Ipil': '#22c55e',
  'Gmelina': '#06b6d4',
  'Talisay': '#059669',
  'Banaba': '#7c2d12',
  'Guava': '#4ade80',
  'Avocado': '#166534',
};

const DEFAULT_MARKER_COLOR = '#16a34a';

function getSpeciesColor(species) {
  if (!species) return DEFAULT_MARKER_COLOR;
  return SPECIES_COLOR_MAP[species] || DEFAULT_MARKER_COLOR;
}

/** Coerce latitude/longitude to a finite number pair, or null. */
function getLatLng(tree) {
  const lat = Number(tree?.latitude);
  const lng = Number(tree?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

/** Map tile options */
const TILE_LAYERS = [
  { label: 'Standard Street Map (Fastest)', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' },
  { label: 'Satellite (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
];

/** Fly map to bounds of visible pins on initial load only */
function InitialFit({ pins, hasRun }) {
  const map = useMap();
  useEffect(() => {
    if (hasRun.current) return;
    if (!pins || pins.length === 0) return;
    hasRun.current = true;
    if (pins.length === 1) {
      map.flyTo(pins[0].position, 17, { duration: 1.2 });
    } else {
      const bounds = pins.map((p) => p.position);
      map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 16, duration: 1.2 });
    }
  }, [pins, map, hasRun]);
  return null;
}

/** Component that tracks user location and renders the blue dot on the map */
function UserLocationMarker({ onLocationClick }) {
  const [position, setPosition] = useState(null);
  const [accuracy, setAccuracy] = useState(0);
  const map = useMap();

  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const latlng = [pos.coords.latitude, pos.coords.longitude];
        setPosition(latlng);
        setAccuracy(pos.coords.accuracy);
      },
      () => {
        // Silently fail — user may deny permission
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  if (!position) return null;

  return (
    <>
      {/* Accuracy radius - light blue transparent circle */}
      <Circle
        center={position}
        radius={accuracy}
        pathOptions={{
          color: '#4285f4',
          weight: 1,
          fillColor: '#4285f4',
          fillOpacity: 0.08,
        }}
      />
      {/* Outer glow ring */}
      <CircleMarker
        center={position}
        radius={16}
        pathOptions={{
          color: 'transparent',
          fillColor: '#4285f4',
          fillOpacity: 0.15,
        }}
        eventHandlers={{
          click: () => onLocationClick(position),
        }}
      />
      {/* Inner blue dot */}
      <CircleMarker
        center={position}
        radius={8}
        pathOptions={{
          color: '#ffffff',
          weight: 3,
          fillColor: '#4285f4',
          fillOpacity: 1,
        }}
        eventHandlers={{
          click: () => onLocationClick(position),
        }}
      >
        <Popup>
          <div className="text-center p-1">
            <p className="text-sm font-semibold text-gray-800">You are here</p>
            <p className="text-[11px] text-gray-500 mb-2">Tap below to tag a nearby tree</p>
            <button
              onClick={() => onLocationClick(position)}
              className="w-full bg-green-700 text-white text-xs font-semibold py-2 px-3 rounded-lg hover:bg-green-800 transition"
            >
              🌳 Tag a Tree Here
            </button>
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}

/** Button to fly to user's current location — rendered OUTSIDE MapContainer */
function FlyToUserButton({ mapRef }) {
  function handleClick() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const map = mapRef.current;
        if (map) {
          map.flyTo([pos.coords.latitude, pos.coords.longitude], 18, { duration: 1.2 });
        }
      },
      (err) => {
        alert(`Unable to get your location: ${err.message}. Please enable location access in your browser settings.`);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  return (
    <button
      onClick={handleClick}
      className="absolute bottom-24 left-4 z-[400] w-11 h-11 bg-white text-blue-600 rounded-full shadow-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 transition active:scale-95"
      aria-label="Go to my location"
      title="Go to my location"
    >
      <Locate size={20} />
    </button>
  );
}

/** Public popup with image carousel */
function PublicTreePopup({ tree }) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const images = [
    tree.photo_url && { url: tree.photo_url, label: 'Main' },
    tree.leaves_url && { url: tree.leaves_url, label: 'Leaves' },
    tree.bark_url && { url: tree.bark_url, label: 'Bark' },
    tree.fruits_url && { url: tree.fruits_url, label: 'Fruits' },
  ].filter(Boolean);

  if (images.length === 0) {
    const altImages = [
      tree.imageUrl && { url: tree.imageUrl, label: 'Main' },
      tree.leavesUrl && { url: tree.leavesUrl, label: 'Leaves' },
      tree.barkUrl && { url: tree.barkUrl, label: 'Bark' },
      tree.fruitsUrl && { url: tree.fruitsUrl, label: 'Fruits' },
    ].filter(Boolean);
    images.push(...altImages);
  }

  const hasImages = images.length > 0;
  const hasMultiple = images.length > 1;

  function nextSlide() {
    setCurrentSlide((prev) => (prev + 1) % images.length);
  }
  function prevSlide() {
    setCurrentSlide((prev) => (prev - 1 + images.length) % images.length);
  }

  const category = (tree.tree_category || '').replace(/\s*Trees$/i, '').trim();
  const biodiversityStatus = tree.biodiversity_status || tree.species_type || '';

  return (
    <div className="w-60">
      <div className="relative w-full h-32 rounded-t-lg overflow-hidden bg-slate-100 mb-3">
        {hasImages ? (
          <>
            <img
              src={images[currentSlide].url}
              alt={`${tree.species} - ${images[currentSlide].label}`}
              className="object-cover w-full h-full"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            {hasMultiple && (
              <>
                <button
                  onClick={prevSlide}
                  className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={nextSlide}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60"
                >
                  <ChevronRight size={14} />
                </button>
              </>
            )}
            <span className="absolute top-1 right-1 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded">
              {images[currentSlide].label}
            </span>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
            No photo available
          </div>
        )}
      </div>

      <div className="px-1 pb-1">
        <h3 className="text-lg font-bold text-slate-900">{tree.species || 'Unknown'}</h3>
        <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
          {category && (
            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-200">
              {category}
            </span>
          )}
          {biodiversityStatus && (
            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
              {biodiversityStatus}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {tree.barangay ? `Barangay ${tree.barangay}` : 'Location not specified'}
        </p>
        <Link
          to={`/wiki-trees?species=${encodeURIComponent(tree.species || '')}`}
          className="block w-full text-center bg-green-700 text-white text-xs font-semibold py-2 rounded-lg hover:bg-green-800 transition"
        >
          Learn More
        </Link>
      </div>
    </div>
  );
}

export default function PublicMap() {
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All Trees');
  const [tileIndex, setTileIndex] = useState(0);
  const [showEthicsModal, setShowEthicsModal] = useState(false);
  const [ethicsAgreed, setEthicsAgreed] = useState(false);
  const [showTaggingForm, setShowTaggingForm] = useState(false);
  const [userTagPosition, setUserTagPosition] = useState(null);
  const initialFitDone = useRef(false);
  const mapRef = useRef(null);

  // Fetch verified trees on mount
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

  // Filter by category
  const filteredTrees = useMemo(() => {
    if (activeCategory === 'All Trees') return trees;
    return trees.filter((t) => {
      const cat = (t?.tree_category || '').replace(/\s*Trees$/i, '').trim().toLowerCase();
      return cat === activeCategory.toLowerCase();
    });
  }, [trees, activeCategory]);

  // Build map pins
  const mapPins = useMemo(() => {
    return filteredTrees
      .map((tree) => {
        const position = getLatLng(tree);
        if (!position) return null;
        return {
          id: tree.id,
          position,
          color: getSpeciesColor(tree.species),
          tree,
        };
      })
      .filter(Boolean);
  }, [filteredTrees]);

  // Build legend from visible species
  const legendEntries = useMemo(() => {
    const seen = new Map();
    for (const pin of mapPins) {
      const sp = pin.tree.species || 'Unknown';
      if (!seen.has(sp)) {
        seen.set(sp, pin.color);
      }
    }
    return Array.from(seen.entries()).slice(0, 10);
  }, [mapPins]);

  // When user taps their blue dot, show ethics modal
  function handleUserLocationClick(position) {
    setUserTagPosition(position);
    setShowEthicsModal(true);
    setEthicsAgreed(false);
  }

  function handleEthicsConfirm() {
    setShowEthicsModal(false);
    setShowTaggingForm(true);
  }

  function handleTaggingSuccess() {
    setShowTaggingForm(false);
    setUserTagPosition(null);
  }

  return (
    <div className="relative w-full h-[calc(100vh-56px)] sm:h-[calc(100vh-64px)]">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/80">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 size={18} className="animate-spin text-green-700" />
            Loading map data…
          </div>
        </div>
      )}

      {/* Pulsing blue dot CSS animation */}
      <style>{`
        @keyframes pulse-blue {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.8); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>

      {/* Map */}
      <MapContainer
        center={SANTA_CRUZ_CENTER}
        zoom={SANTA_CRUZ_ZOOM}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        ref={mapRef}
      >
        <TileLayer
          url={TILE_LAYERS[tileIndex].url}
          attribution="&copy; OpenStreetMap contributors"
        />
        <GeoJSON
          data={santaCruzBoundary}
          style={{
            color: '#16a34a',
            weight: 2,
            fillColor: '#16a34a',
            fillOpacity: 0.03,
          }}
        />
        <InitialFit pins={mapPins} hasRun={initialFitDone} />

        {/* User location blue dot */}
        <UserLocationMarker onLocationClick={handleUserLocationClick} />

        {/* Tree markers */}
        {mapPins.map((pin) => (
          <CircleMarker
            key={pin.id}
            center={pin.position}
            radius={8}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: pin.color,
              fillOpacity: 0.9,
            }}
          >
            <Popup maxWidth={280} className="public-tree-popup">
              <PublicTreePopup tree={pin.tree} />
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Fly-to-user button (outside map so clicks always work) */}
      <FlyToUserButton mapRef={mapRef} />

      {/* Top-right controls */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2 items-end">
        {/* Tile layer selector */}
        <select
          value={tileIndex}
          onChange={(e) => setTileIndex(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm focus:outline-none"
        >
          {TILE_LAYERS.map((layer, i) => (
            <option key={i} value={i}>{layer.label}</option>
          ))}
        </select>

        {/* Category filter pills */}
        <div className="flex flex-col gap-1.5">
          {CATEGORIES.filter(c => c !== 'All Trees').map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? 'All Trees' : cat)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold shadow transition whitespace-nowrap ${
                activeCategory === cat
                  ? 'bg-green-700 text-white'
                  : 'bg-white text-green-800 border border-green-600 hover:bg-green-50'
              }`}
            >
              {cat === 'Fruit Tree' ? 'Fruit Trees' : cat === 'Timber' ? 'Timber Trees' : `${cat} Trees`}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      {legendEntries.length > 0 && (
        <div className="absolute bottom-24 right-3 z-[400] bg-white/95 rounded-lg shadow border border-slate-200 px-3 py-2 max-w-[160px]">
          <p className="text-[10px] font-semibold text-slate-700 mb-1">
            {activeCategory === 'All Trees' ? 'Species' : activeCategory} Legend
          </p>
          <div className="space-y-0.5">
            {legendEntries.map(([sp, color]) => (
              <div key={sp} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] text-slate-600 truncate">{sp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ethics Modal */}
      {showEthicsModal && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Tag a Tree 🌳</h2>
            <div className="text-sm text-gray-600 space-y-2 mb-4">
              <p>
                Your current GPS location will be used as the tree's coordinates.
                Please make sure you are <strong>standing as close to the tree as possible</strong> for accurate tagging.
              </p>
              <p>Ensure good lighting for clear photos. Take pictures of the full tree, leaves, bark, and fruits if available.</p>
              <p className="font-medium text-amber-700">
                Do not harm the tree — do not pick leaves, fruits, or bark without consent from the property owner.
              </p>
            </div>

            <label className="flex items-start gap-2 mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={ethicsAgreed}
                onChange={(e) => setEthicsAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm text-gray-700">
                I understand and agree. I am standing near the tree.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowEthicsModal(false); setUserTagPosition(null); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleEthicsConfirm}
                disabled={!ethicsAgreed}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-green-700 rounded-lg hover:bg-green-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Start Tagging
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tagging Form — passes the user's GPS position directly */}
      {showTaggingForm && (
        <TaggingForm
          initialPosition={userTagPosition}
          onClose={() => { setShowTaggingForm(false); setUserTagPosition(null); }}
          onSuccess={handleTaggingSuccess}
        />
      )}
    </div>
  );
}
