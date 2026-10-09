import { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, Polygon, useMap, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, Locate, Smartphone, X } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import {
  LAGUNA_BOUNDS,
  LAGUNA_MUNICIPALITIES,
  LAGUNA_PROVINCE,
  MUNICIPALITY_LIST,
  OUTSIDE_LAGUNA_MASK,
  boundsOfMunicipality,
  containsPoint,
  municipalityAt,
  municipalityNamed,
} from '../../lib/lagunaBoundaries.js';
import { labelOf } from '../../lib/lguOptions.js';
import { matchesHighlight } from '../../lib/treeTraits.js';
import TaggingForm from '../../components/public/TaggingForm.jsx';
import TreeDetailPanel from '../../components/public/TreeDetailPanel.jsx';

/** Every tagged tree reads as one thing on this map, so they all share one colour. */
const MARKER_COLOR = '#16a34a';
const MARKER_SELECTED_COLOR = '#064e3b';
/** What the trees outside the highlighted set fade back to. */
const MARKER_MUTED_COLOR = '#94a3b8';

/** Laguna is the area of responsibility; everything beyond it is covered over. */
const MASK_STYLE = { color: 'transparent', weight: 0, fillColor: '#e2e8f0', fillOpacity: 0.75 };
const PROVINCE_STYLE = { color: '#0f172a', weight: 2.5, opacity: 0.9, fill: false };
const MUNICIPALITY_STYLE = { color: '#64748b', weight: 1, opacity: 0.85, fillColor: '#16a34a', fillOpacity: 0.04 };
const HOVER_STYLE = { color: '#15803d', weight: 2, opacity: 1, fillColor: '#22c55e', fillOpacity: 0.16 };
const SELECTED_STYLE = { color: '#15803d', weight: 3, opacity: 1, fillColor: '#22c55e', fillOpacity: 0.28 };

/**
 * Leaflet draws everything vector into one layer unless told otherwise, and
 * within it the last layer added wins — which is how selecting a municipality
 * used to bury the tree points: bringing the chosen boundary to the front put
 * it over them and it swallowed their clicks. Giving each kind of layer its own
 * pane fixes the stacking for good, whatever order things are added in.
 */
const PANES = [
  ['laguna-mask', 410],
  ['laguna-boundaries', 420],
  ['tree-points', 450],
  // Above the points: wherever the visitor is standing, that dot is the one
  // thing that must stay tappable — it is how tagging starts.
  ['user-location', 460],
];

function MapPanes() {
  const map = useMap();
  // During render, not in an effect: the layers naming these panes are created
  // by siblings that render after this one.
  for (const [name, zIndex] of PANES) {
    if (!map.getPane(name)) {
      map.createPane(name).style.zIndex = String(zIndex);
    }
  }
  return null;
}

/**
 * Is this the phone-sized view?
 *
 * Crowdsourced tagging happens here, in the mobile view: a resident standing at
 * the tree with their browser open, no app to install. The desktop view cannot
 * do it honestly — the GPS fix would be the computer's, not the tree's — so it
 * explains where to go instead. The breakpoint is the one the layout already
 * uses, and it follows a window being resized.
 */
const MOBILE_VIEW_QUERY = '(max-width: 639px)';

function useIsMobileView() {
  const [isMobileView, setIsMobileView] = useState(
    () => globalThis.matchMedia?.(MOBILE_VIEW_QUERY).matches ?? false
  );

  useEffect(() => {
    const query = globalThis.matchMedia?.(MOBILE_VIEW_QUERY);
    if (!query) return undefined;
    const update = (event) => setIsMobileView(event.matches);
    setIsMobileView(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return isMobileView;
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

/**
 * Moves the camera when, and only when, something asks it to.
 *
 * `target` is a municipality name, the string 'province', or null for "leave
 * the view where it is". Clearing a selection is not a request to fly: someone
 * who has zoomed into their barangay and then dismisses the focus card wants
 * the card gone, not the whole province back.
 */
function FocusController({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const bounds = target === 'province' ? LAGUNA_BOUNDS : boundsOfMunicipality(target);
    if (!bounds) return;
    map.flyToBounds(bounds, {
      padding: [32, 32],
      maxZoom: target === 'province' ? 12 : 15,
      duration: 1.1,
    });
  }, [target, map]);
  return null;
}

/** The city and municipality outlines inside Laguna; click one to focus it. */
function MunicipalityLayer({ selected, onSelect }) {
  const groupRef = useRef(null);
  const selectedRef = useRef(selected);
  const onSelectRef = useRef(onSelect);
  selectedRef.current = selected;
  onSelectRef.current = onSelect;

  const styleFor = (name) => (name === selectedRef.current ? SELECTED_STYLE : MUNICIPALITY_STYLE);

  // Restyle the existing layers rather than re-mounting them: re-parsing the
  // boundaries on every selection would stutter.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.eachLayer((layer) => {
      const name = layer.feature?.properties?.municipality;
      layer.setStyle(styleFor(name));
      if (name === selected) layer.bringToFront();
    });
  }, [selected]);

  return (
    <GeoJSON
      ref={groupRef}
      data={LAGUNA_MUNICIPALITIES}
      pane="laguna-boundaries"
      style={(feature) => styleFor(feature.properties.municipality)}
      onEachFeature={(feature, layer) => {
        const { municipality, municipality_label: label } = feature.properties;
        layer.bindTooltip(label, { sticky: true, direction: 'top', opacity: 0.95 });
        layer.on({
          click: () => onSelectRef.current(municipality),
          mouseover: (e) => {
            if (selectedRef.current !== municipality) e.target.setStyle(HOVER_STYLE);
          },
          mouseout: (e) => e.target.setStyle(styleFor(municipality)),
        });
      }}
    />
  );
}

/**
 * Tracks the visitor's location and draws the blue dot.
 *
 * Tapping it is how a resident starts tagging the tree they are standing at.
 */
function UserLocationMarker({ onTagAttempt }) {
  const [position, setPosition] = useState(null);
  const [accuracy, setAccuracy] = useState(0);

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
        pane="user-location"
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
        pane="user-location"
        pathOptions={{
          color: 'transparent',
          fillColor: '#4285f4',
          fillOpacity: 0.15,
        }}
        eventHandlers={{ click: () => onTagAttempt(position) }}
      />
      {/* Inner blue dot */}
      <CircleMarker
        center={position}
        radius={8}
        pane="user-location"
        pathOptions={{
          color: '#ffffff',
          weight: 3,
          fillColor: '#4285f4',
          fillOpacity: 1,
        }}
        eventHandlers={{ click: () => onTagAttempt(position) }}
      >
        <Popup>
          <div className="text-center p-1">
            <p className="text-sm font-semibold text-gray-800">You are here</p>
            <p className="text-[11px] text-gray-500 mb-2">Tap below to tag a nearby tree</p>
            <button
              onClick={() => onTagAttempt(position)}
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
      className="map-side-control absolute bottom-24 left-4 z-[400] w-11 h-11 bg-white text-blue-600 rounded-full shadow-lg border border-slate-200 flex items-center justify-center hover:bg-blue-50 hover:text-blue-700 active:scale-95"
      aria-label="Go to my location"
      title="Go to my location"
    >
      <Locate size={20} />
    </button>
  );
}

export default function PublicMap() {
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedLgu, setSelectedLgu] = useState('');
  // Where the camera was last asked to go; null means "stay put".
  const [focusTarget, setFocusTarget] = useState(null);
  const [selectedTree, setSelectedTree] = useState(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [speciesProfile, setSpeciesProfile] = useState(null);
  // The field app's most recent phenology visit for the open tree.
  const [observation, setObservation] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  // Which set of trees stands out: the open tree's species, or whatever trait
  // the visitor picked from the panel's badges.
  const [highlight, setHighlight] = useState(null);
  const [tileIndex, setTileIndex] = useState(0);
  const [showMobileOnlyNotice, setShowMobileOnlyNotice] = useState(false);
  const [showEthicsModal, setShowEthicsModal] = useState(false);
  const [ethicsAgreed, setEthicsAgreed] = useState(false);
  const [showTaggingForm, setShowTaggingForm] = useState(false);
  const [userTagPosition, setUserTagPosition] = useState(null);
  const isMobileView = useIsMobileView();
  const mapRef = useRef(null);
  // One lookup per species, not one per pin the visitor taps.
  const profileCache = useRef(new Map());

  // Fetch verified trees on mount.
  //
  // A failed read used to leave an empty map behind, which a visitor cannot
  // tell apart from a province where nothing has been tagged yet. It says so
  // now, and offers to try again.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchTrees() {
      setLoading(true);
      setLoadError('');
      try {
        const { data, error } = await supabase.from('trees').select('*');
        if (cancelled) return;
        if (error) {
          setLoadError(error.message || 'The tree data could not be loaded.');
        } else {
          setTrees(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        if (cancelled) return;
        setLoadError(e?.message || 'The tree data could not be loaded.');
      }
      if (!cancelled) setLoading(false);
    }
    fetchTrees();
    return () => { cancelled = true; };
  }, [reloadToken]);

  // The write-up behind the open panel. A species nobody has written up yet —
  // and a database without the table at all — both read as "not published".
  useEffect(() => {
    const species = selectedTree?.species?.trim();
    if (!species) {
      setSpeciesProfile(null);
      setProfileLoading(false);
      return;
    }
    if (profileCache.current.has(species)) {
      setSpeciesProfile(profileCache.current.get(species));
      setProfileLoading(false);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('species_profiles')
        .select('*')
        .eq('species', species)
        .maybeSingle();
      if (cancelled) return;
      const row = error ? null : (Array.isArray(data) ? data[0] ?? null : data ?? null);
      profileCache.current.set(species, row);
      setSpeciesProfile(row);
      setProfileLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedTree]);

  // What the tree was doing when someone last looked at it. The mobile app
  // writes one row per visit to phenology_records, so this takes the newest.
  useEffect(() => {
    const treeId = selectedTree?.id;
    if (!treeId) {
      setObservation(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('phenology_records')
        .select('*')
        .eq('tree_id', treeId)
        .order('observed_at', { ascending: false })
        .limit(1);
      if (cancelled) return;
      const rows = error ? [] : (Array.isArray(data) ? data : [data].filter(Boolean));
      setObservation(rows[0] ?? null);
    })();
    return () => { cancelled = true; };
  }, [selectedTree]);

  // Build map pins
  const mapPins = useMemo(() => {
    return trees
      .map((tree) => {
        const position = getLatLng(tree);
        if (!position) return null;
        return { id: tree.id, position, tree, highlighted: matchesHighlight(tree, highlight) };
      })
      .filter(Boolean);
  }, [trees, highlight]);

  const highlightedCount = useMemo(
    () => (highlight ? mapPins.filter((pin) => pin.highlighted).length : 0),
    [mapPins, highlight]
  );

  const selectedFeature = useMemo(() => municipalityNamed(selectedLgu), [selectedLgu]);
  const selectedLabel = selectedFeature?.properties.municipality_label || '';

  // Trees are stored with a barangay but no LGU, so the count comes from the geometry.
  const selectedTreeCount = useMemo(() => {
    if (!selectedFeature) return 0;
    return mapPins.filter((pin) => containsPoint(selectedFeature.geometry, pin.position)).length;
  }, [selectedFeature, mapPins]);

  // Trees carry a barangay but no city or municipality, so the panel's place
  // line and the species' spread both come from which boundary a point falls
  // in. Worked out once for the whole set rather than per pin tapped.
  const treeAreas = useMemo(() => {
    const areas = new Map();
    for (const tree of trees) {
      const position = getLatLng(tree);
      if (!position) continue;
      const name = municipalityAt(position);
      if (name) areas.set(tree.id, name);
    }
    return areas;
  }, [trees]);

  const selectedTreeMunicipality = useMemo(() => {
    const name = selectedTree ? treeAreas.get(selectedTree.id) : null;
    return name ? labelOf(name) : '';
  }, [selectedTree, treeAreas]);

  // Where else in Laguna this species has been tagged.
  const speciesDistribution = useMemo(() => {
    const species = selectedTree?.species?.trim();
    if (!species) return [];
    const counts = new Map();
    for (const tree of trees) {
      if ((tree.species || '').trim() !== species) continue;
      const name = treeAreas.get(tree.id);
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, label: labelOf(name), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [selectedTree, trees, treeAreas]);

  /** Opening a tree picks out the rest of its species. */
  function handleSelectTree(tree) {
    setSelectedTree(tree);
    setHighlight({ kind: 'species', value: (tree.species || '').trim() });
  }

  function handleCloseTree() {
    setSelectedTree(null);
    setPanelCollapsed(false);
    setHighlight(null);
  }

  /** A badge picks out everything sharing that trait; tapping it again goes back. */
  function handleHighlight(next) {
    setHighlight((current) => {
      const same = current && current.kind === next.kind && current.value === next.value;
      if (!same) return next;
      return selectedTree ? { kind: 'species', value: (selectedTree.species || '').trim() } : null;
    });
  }

  /**
   * Tapping the blue dot starts a crowdsourced tag — but only from the mobile
   * view, where the position under the visitor is the position of the tree.
   */
  function handleTagAttempt(position) {
    if (!isMobileView) {
      setShowMobileOnlyNotice(true);
      return;
    }
    setUserTagPosition(position);
    setEthicsAgreed(false);
    setShowEthicsModal(true);
  }

  function handleEthicsConfirm() {
    setShowEthicsModal(false);
    setShowTaggingForm(true);
  }

  function closeTagging() {
    setShowTaggingForm(false);
    setUserTagPosition(null);
  }

  /** Clicking the area already in focus clears the selection, and stays put. */
  function handleSelectLgu(name) {
    setSelectedLgu((current) => {
      const next = current === name ? '' : name;
      setFocusTarget(next || null);
      return next;
    });
  }

  /** The dropdown: picking an area flies to it, picking "All of Laguna" flies out. */
  function handleLguDropdown(name) {
    setSelectedLgu(name);
    setFocusTarget(name || 'province');
  }

  /** Dismissing the card drops the selection without moving the map. */
  function clearSelectedLgu() {
    setSelectedLgu('');
    setFocusTarget(null);
  }

  // The panel covers the left of the map, so the controls over there travel
  // with it rather than hiding underneath.
  const panelShowing = Boolean(selectedTree) && !panelCollapsed;

  return (
    <div
      className={`relative w-full h-[calc(100vh-56px)] sm:h-[calc(100vh-64px)] ${
        panelShowing ? 'panel-open' : ''
      }`}
    >
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/80">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 size={18} className="animate-spin text-green-700" />
            Loading map data…
          </div>
        </div>
      )}

      {/* Pulsing blue dot, and the slide the left-hand controls share with the
          detail panel. Leaflet owns the zoom control's markup, so it is moved
          from here rather than with a className on the element. On a phone the
          panel covers the whole map, so the zoom control steps aside entirely
          instead of sliding off-screen under it. */}
      <style>{`
        @keyframes pulse-blue {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.8); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        .leaflet-top.leaflet-left,
        .map-side-control {
          transition: transform 300ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease,
            visibility 200ms ease;
        }
        @media (min-width: 640px) {
          .panel-open .leaflet-top.leaflet-left,
          .panel-open .map-side-control {
            transform: translateX(380px);
          }
        }
        @media (max-width: 639px) {
          /* visibility, not just opacity: Leaflet sets pointer-events on the
             control itself, so a transparent zoom control still swallowed taps
             meant for the panel's close button underneath it. */
          .panel-open .leaflet-top.leaflet-left,
          .panel-open .map-side-control {
            opacity: 0;
            visibility: hidden;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .leaflet-top.leaflet-left,
          .map-side-control {
            transition: none;
          }
        }
      `}</style>

      {/* Map */}
      <MapContainer
        bounds={LAGUNA_BOUNDS}
        boundsOptions={{ padding: [32, 32] }}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        ref={mapRef}
      >
        <MapPanes />

        <TileLayer
          url={TILE_LAYERS[tileIndex].url}
          attribution="&copy; OpenStreetMap contributors"
        />

        {/* Everything outside Laguna is covered over, not detailed */}
        <Polygon
          positions={OUTSIDE_LAGUNA_MASK}
          pathOptions={MASK_STYLE}
          pane="laguna-mask"
          interactive={false}
        />

        {/* Cities and municipalities inside Laguna */}
        <MunicipalityLayer selected={selectedLgu} onSelect={handleSelectLgu} />

        {/* Province outline, drawn over the municipal lines */}
        <GeoJSON data={LAGUNA_PROVINCE} style={PROVINCE_STYLE} pane="laguna-boundaries" interactive={false} />

        <FocusController target={focusTarget} />

        {/* User location blue dot */}
        <UserLocationMarker onTagAttempt={handleTagAttempt} />

        {/* Tree markers — tapping one opens the side panel */}
        {mapPins.map((pin) => {
          const isOpen = pin.id === selectedTree?.id;
          const muted = Boolean(highlight) && !pin.highlighted;
          return (
            <CircleMarker
              key={pin.id}
              center={pin.position}
              radius={isOpen ? 10 : 7}
              pane="tree-points"
              pathOptions={{
                color: '#ffffff',
                weight: isOpen ? 3 : 2,
                fillColor: isOpen ? MARKER_SELECTED_COLOR : muted ? MARKER_MUTED_COLOR : MARKER_COLOR,
                fillOpacity: muted ? 0.55 : 0.95,
              }}
              eventHandlers={{ click: () => handleSelectTree(pin.tree) }}
            />
          );
        })}
      </MapContainer>

      {/* A map with no pins because the read failed, saying so */}
      {loadError && (
        <div
          role="alert"
          className="absolute top-3 left-1/2 z-[700] w-[min(26rem,90vw)] -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg"
        >
          <p className="text-sm font-semibold text-amber-900">The tagged trees could not be loaded</p>
          <p className="mt-0.5 text-xs text-amber-800">{loadError}</p>
          <button
            onClick={() => setReloadToken((n) => n + 1)}
            className="mt-2 rounded-md bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900 transition"
          >
            Try again
          </button>
        </div>
      )}

      {/* Fly-to-user button (outside map so clicks always work) */}
      <FlyToUserButton mapRef={mapRef} />

      {/* Tree detail panel. It stays mounted while the visitor moves from pin
          to pin, so the contents change without the panel sliding every time. */}
      {selectedTree && (
        <TreeDetailPanel
          tree={selectedTree}
          municipalityLabel={selectedTreeMunicipality}
          profile={speciesProfile}
          profileLoading={profileLoading}
          observation={observation}
          distribution={speciesDistribution}
          highlight={highlight}
          onHighlight={handleHighlight}
          onClose={handleCloseTree}
          onCollapsedChange={setPanelCollapsed}
        />
      )}

      {/* Area in focus */}
      {selectedLabel && (
        <div className="map-side-control absolute top-3 left-14 z-[400] bg-white/95 rounded-lg shadow border border-slate-200 px-3 py-2 max-w-[55vw]">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">In focus</p>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-900 truncate">{selectedLabel}</p>
            <button
              onClick={clearSelectedLgu}
              className="text-slate-400 hover:text-slate-700 transition"
              aria-label="Clear selected area"
              title="Show all of Laguna"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-[11px] text-slate-600">
            {selectedTreeCount} tagged {selectedTreeCount === 1 ? 'tree' : 'trees'}
          </p>
        </div>
      )}

      {/* Top-right controls */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2 items-end">
        {/* City / municipality selector */}
        <select
          value={selectedLgu}
          onChange={(e) => handleLguDropdown(e.target.value)}
          aria-label="Zoom to a city or municipality"
          className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm focus:outline-none"
        >
          <option value="">All of Laguna</option>
          {MUNICIPALITY_LIST.map((lgu) => (
            <option key={lgu.name} value={lgu.name}>{lgu.label}</option>
          ))}
        </select>

        {/* Tile layer selector */}
        <select
          value={tileIndex}
          onChange={(e) => setTileIndex(Number(e.target.value))}
          aria-label="Base map"
          className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm focus:outline-none"
        >
          {TILE_LAYERS.map((layer, i) => (
            <option key={i} value={i}>{layer.label}</option>
          ))}
        </select>
      </div>

      {/* Legend */}
      <div className="absolute bottom-24 right-3 z-[400] bg-white/95 rounded-lg shadow border border-slate-200 px-3 py-2">
        <p className="text-[10px] font-semibold text-slate-700 mb-1">Legend</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full border-2 border-white shadow-sm flex-shrink-0"
              style={{ backgroundColor: MARKER_COLOR }}
            />
            <span className="text-[10px] text-slate-600">
              {highlight ? `Highlighted (${highlightedCount})` : 'Tagged tree'}
            </span>
          </div>
          {highlight && (
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                style={{ backgroundColor: MARKER_MUTED_COLOR }}
              />
              <span className="text-[10px] text-slate-600">Other trees</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0 border border-green-700 bg-green-500/30" />
            <span className="text-[10px] text-slate-600">Area in focus</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0 border border-slate-400 bg-white" />
            <span className="text-[10px] text-slate-600">City / municipality</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0 border border-slate-300 bg-slate-200" />
            <span className="text-[10px] text-slate-600">Outside Laguna</span>
          </div>
        </div>
      </div>

      {/* Tagging needs the phone that is standing at the tree */}
      {showMobileOnlyNotice && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                <Smartphone size={20} />
              </span>
              <h2 className="text-lg font-bold text-gray-900">Tag a Tree 🌳</h2>
            </div>
            <div className="text-sm text-gray-600 space-y-2 mb-5">
              <p>
                Tagging is available on a <strong>phone</strong>. Open this map on your phone, stand
                beside the tree, and tap the blue dot.
              </p>
              <p>
                A tag takes the tree&apos;s position from where you are standing, so it has to be
                recorded there — a computer would only record where the computer is.
              </p>
            </div>
            <button
              onClick={() => setShowMobileOnlyNotice(false)}
              className="w-full px-4 py-2 text-sm font-semibold text-white bg-green-700 rounded-lg hover:bg-green-800 transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* What to know before tagging */}
      {showEthicsModal && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Tag a Tree 🌳</h2>
            <div className="text-sm text-gray-600 space-y-2 mb-4">
              <p>
                Your current GPS location will be used as the tree&apos;s coordinates.
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

      {/* The tag itself. It lands in pending_trees for the field team to verify
          through the Green Tag mobile app, which is why nothing here writes to
          the trees table. */}
      {showTaggingForm && (
        <TaggingForm
          initialPosition={userTagPosition}
          onClose={closeTagging}
          onSuccess={closeTagging}
        />
      )}

    </div>
  );
}
