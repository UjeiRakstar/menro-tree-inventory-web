import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient.js';
import { classifyPinColor } from '../lib/pinColor.js';
import { iconForPinColor, buildBiodiversityIcon } from '../lib/markerIcons.js';
import TreePinPopup from '../components/TreePinPopup.jsx';
import DispatchModal from '../components/DispatchModal.jsx';
import IssuePermitModal from '../components/IssuePermitModal.jsx';
import MapMask from '../components/MapMask.jsx';
import { Navigation } from 'lucide-react';

const MAP_CENTER = [14.2623372660516, 121.39762408705232];
const MAP_ZOOM = 17;

const TILE_LAYERS = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    label: 'Standard Street Map (Fastest)',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    label: 'Satellite Imagery (High Detail)',
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap contributors',
    label: 'Topographic Terrain (Elevation)',
  },
};

const isFinitePair = (tree) =>
  Number.isFinite(tree?.latitude) && Number.isFinite(tree?.longitude);

/** Helper component to fly the map back to center */
function FlyToCenter({ trigger }) {
  const map = useMap();
  useEffect(() => {
    if (trigger > 0) {
      map.flyTo(MAP_CENTER, MAP_ZOOM, { duration: 1.5 });
    }
  }, [trigger, map]);
  return null;
}

/** Helper component to fly to a specific tree from URL params */
function FlyToTree({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], 17, { duration: 1.5 });
    }
  }, [lat, lng, map]);
  return null;
}

/** Helper component to change tile layer */
function DynamicTileLayer({ layerKey }) {
  const layer = TILE_LAYERS[layerKey] || TILE_LAYERS.street;
  return <TileLayer url={layer.url} attribution={layer.attribution} />;
}

export default function CommandCenter() {
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [dispatchTree, setDispatchTree] = useState(null);
  const [permitModalOpen, setPermitModalOpen] = useState(false);
  const [permitTree, setPermitTree] = useState(null);
  const [flyTrigger, setFlyTrigger] = useState(0);
  const [tileLayer, setTileLayer] = useState('street');
  const [cinematicFlyby, setCinematicFlyby] = useState(true);
  const [mapMode, setMapMode] = useState('action'); // 'action' or 'biodiversity'

  // URL params for "View on Map" from Inventory
  const [searchParams, setSearchParams] = useSearchParams();
  const targetTreeId = searchParams.get('tree');
  const targetLat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')) : null;
  const targetLng = searchParams.get('lng') ? parseFloat(searchParams.get('lng')) : null;
  const markerRefs = useRef({});

  function handleDispatch(tree) {
    setDispatchTree(tree);
  }

  function handleIssuePermit(tree) {
    setPermitTree(tree);
    setPermitModalOpen(true);
  }

  function handleFlyToCenter() {
    setFlyTrigger((prev) => prev + 1);
  }

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('trees')
      .select('*')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setErrorMessage(error.message ?? 'Unknown error');
          setTrees([]);
        } else {
          setTrees(Array.isArray(data) ? data : []);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function handleRealtimePayload(payload) {
    if (!payload?.new) return;
    if (payload.eventType === 'UPDATE') {
      setTrees(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
    } else if (payload.eventType === 'INSERT') {
      setTrees(prev => [...prev, payload.new]);
    }
  }

  useEffect(() => {
    const channel = supabase
      .channel('custom-all-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trees' }, handleRealtimePayload)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const visibleTrees = trees.filter(t => isFinitePair(t) && t.task_status !== 'Cut');

  // Auto-open popup for targeted tree from Inventory "View on Map"
  useEffect(() => {
    if (targetTreeId && !loading && trees.length > 0) {
      // Wait for the fly animation to complete, then open the popup
      const timer = setTimeout(() => {
        const markerRef = markerRefs.current[targetTreeId];
        if (markerRef) {
          markerRef.openPopup();
        }
        // Clear the URL params after opening
        setSearchParams({}, { replace: true });
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [targetTreeId, loading, trees]);

  // Biodiversity color mapping based on tree_category.
  // Tolerant to both singular ("Fruit") and plural ("Fruit Trees") shapes,
  // case differences, and surrounding whitespace — Supabase rows have
  // historically mixed these.
  function getBiodiversityColor(tree) {
    const raw = (tree.tree_category || '').toString().trim().toLowerCase();
    if (raw.includes('fruit')) return '#4ade80'; // apple green
    if (raw.includes('timber')) return '#92400e'; // brown
    if (raw.includes('ornamental')) return '#f472b6'; // pink
    return '#6b7280'; // grey fallback for uncategorized
  }

  // Detect invasive species across the same biodiversity_status / species_type
  // fallback used by the rest of the app. Case-insensitive so "invasive",
  // "Invasive", and " INVASIVE " all match.
  function isInvasive(tree) {
    const status = (tree.biodiversity_status || tree.species_type || '')
      .toString()
      .trim()
      .toLowerCase();
    return status === 'invasive';
  }

  return (
    <div className="relative h-full w-full">
      <h1 className="sr-only">Command Center</h1>

      <MapContainer
        center={MAP_CENTER}
        zoom={MAP_ZOOM}
        className="h-full w-full"
      >
        <DynamicTileLayer layerKey={tileLayer} />
        <MapMask />
        <FlyToCenter trigger={flyTrigger} />
        {targetLat && targetLng && <FlyToTree lat={targetLat} lng={targetLng} />}
        <MapMask />
        {visibleTrees.map((tree) => {
          const color = classifyPinColor(tree);
          const icon = mapMode === 'biodiversity'
            ? buildBiodiversityIcon(
                getBiodiversityColor(tree),
                isInvasive(tree)
              )
            : iconForPinColor(color);
          return (
            <Marker
              key={tree.id}
              position={[tree.latitude, tree.longitude]}
              icon={icon}
              ref={(ref) => { if (ref) markerRefs.current[tree.id] = ref; }}
            >
              <Popup>
                <TreePinPopup tree={tree} color={color} onDispatch={handleDispatch} onIssuePermit={handleIssuePermit} />
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {loading && (
        <div
          data-testid="map-loading"
          className="absolute inset-0 z-[400] flex items-center justify-center bg-white/60 backdrop-blur-sm text-slate-700 text-sm font-medium"
        >
          Loading tree data…
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          data-testid="map-error"
          className="absolute top-4 left-4 z-[500] max-w-sm rounded bg-red-50 border border-red-300 text-red-800 px-4 py-3 shadow"
        >
          Failed to load tree data: {errorMessage}
        </div>
      )}

      {/* Map controls — top right */}
      <div className="absolute top-4 right-4 z-[500] flex flex-col gap-2">
        {/* Layer selector */}
        <select
          value={tileLayer}
          onChange={(e) => setTileLayer(e.target.value)}
          className="bg-white rounded-lg shadow-md px-3 py-2 text-sm font-medium text-slate-700 border-0 focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer"
        >
          {Object.entries(TILE_LAYERS).map(([key, layer]) => (
            <option key={key} value={key}>{layer.label}</option>
          ))}
        </select>

        {/* Map mode toggles */}
        <button
          type="button"
          onClick={() => setMapMode('action')}
          className={`px-3 py-2 rounded-lg shadow-md text-sm font-medium transition ${
            mapMode === 'action'
              ? 'bg-green-700 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Action Map
        </button>
        <button
          type="button"
          onClick={() => setMapMode('biodiversity')}
          className={`px-3 py-2 rounded-lg shadow-md text-sm font-medium transition ${
            mapMode === 'biodiversity'
              ? 'bg-green-700 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Biodiversity Map
        </button>
      </div>

      {/* Fly to center button — bottom left */}
      <button
        onClick={handleFlyToCenter}
        className="absolute bottom-4 left-4 z-[400] bg-white rounded-full shadow-lg p-3 hover:bg-slate-50 transition group"
        title="Fly back to center"
      >
        <Navigation size={20} className="text-green-700 group-hover:text-green-800" />
      </button>

      {/* Map legend panel */}
      <div className="absolute bottom-4 right-4 z-[400] bg-white rounded-lg shadow-md p-4">
        {mapMode === 'action' ? (
          <>
            <div className="text-sm font-semibold text-slate-700 mb-2">Universal Map Legend</div>
            <ul className="space-y-1 text-sm text-slate-600">
              <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-600 inline-block"></span> Safe / Tagged</li>
              <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-600 inline-block"></span> Urgent Hazard</li>
              <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block"></span> Dispatched</li>
              <li className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span> Permit Issued</li>
            </ul>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-slate-700 mb-2">Biodiversity Legend</div>
            <ul className="space-y-1.5 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px]" style={{background: '#4ade80', border: '2px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'}}>🌳</span>
                Fruit Trees (Endemic)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px]" style={{background: '#4ade80', border: '2px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'}}>⚠️</span>
                Fruit Trees (Invasive)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px]" style={{background: '#92400e', border: '2px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'}}>🌳</span>
                Timber Trees (Endemic)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px]" style={{background: '#92400e', border: '2px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'}}>⚠️</span>
                Timber Trees (Invasive)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px]" style={{background: '#f472b6', border: '2px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'}}>🌳</span>
                Ornamental Trees (Endemic)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px]" style={{background: '#f472b6', border: '2px solid white', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'}}>⚠️</span>
                Ornamental Trees (Invasive)
              </li>
            </ul>
          </>
        )}
      </div>

      {/* Dispatch Modal */}
      {dispatchTree && (
        <DispatchModal
          tree={dispatchTree}
          onClose={() => setDispatchTree(null)}
          onDispatched={(email) => {
            setTrees(prev =>
              prev.map(t => t.id === dispatchTree.id ? { ...t, assigned_to: email } : t)
            );
          }}
        />
      )}

      {/* Issue Permit Modal */}
      <IssuePermitModal
        isOpen={permitModalOpen}
        tree={permitTree}
        onClose={() => { setPermitModalOpen(false); setPermitTree(null); }}
        onIssue={(tree) => {
          setTrees(prev => prev.map(t => t.id === tree.id ? { ...t, has_cutting_permit: true } : t));
        }}
      />
    </div>
  );
}
