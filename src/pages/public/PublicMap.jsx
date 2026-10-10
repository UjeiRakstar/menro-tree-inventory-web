import { Fragment, useEffect, useMemo, useState, useRef, lazy, Suspense } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Popup,
  GeoJSON,
  Polygon,
  Polyline,
  useMap,
  useMapEvents,
  Circle,
} from 'react-leaflet';
import L from 'leaflet';
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
import { logoFor } from '../../lib/lguLogos.js';
import { matchesHighlight } from '../../lib/treeTraits.js';
import { groupBy, summarise } from '../../lib/dashboardMetrics.js';
import {
  barangayForTree,
  barangayIndexReady,
  loadBarangayIndex,
  needsBarangayIndex,
} from '../../lib/barangayLookup.js';
import {
  boundsOfCluster,
  clusterPins,
  crowdGroups,
  spiderPositions,
} from '../../lib/clusterPins.js';
import { landCoverById } from '../../lib/landCover.js';
import { MAP_SITES, siteById, siteTitle } from '../../lib/mapSites.js';
import { PUBLIC_MAP_COLUMNS, selectPublicTrees } from '../../lib/treeColumns.js';
/**
 * The tagging form carries a confetti animation for its success screen, which
 * is a quarter of a megabyte a visitor should not download for a button they
 * may never press. It arrives when tagging actually starts.
 */
const TaggingForm = lazy(() => import('../../components/public/TaggingForm.jsx'));
import TreeDetailPanel from '../../components/public/TreeDetailPanel.jsx';
import AreaDetailPanel from '../../components/public/AreaDetailPanel.jsx';
import SitePanel from '../../components/public/SitePanel.jsx';
import DataRequestModal from '../../components/public/DataRequestModal.jsx';

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
 * How far in the map will go, and how far the tiles actually exist.
 *
 * OpenStreetMap stops drawing at zoom 19 and Esri at 19 too; past that
 * `maxNativeZoom` keeps the last real tile and scales it up. The picture gets
 * soft, but the PINS keep separating, which is the point — at zoom 19 two trees
 * four metres apart are 20 px apart and still one bubble, and at 21 they are
 * 80 px apart and two trees.
 */
const MAX_MAP_ZOOM = 21;
const MAX_NATIVE_ZOOM = 19;

/**
 * Spaces, as against points.
 *
 * Land cover is drawn in the green of the thing it describes; a planting site
 * in the yellow of the mockup's hatching, because it is a place to DO something
 * rather than a report of what is there. Neither is colour alone: both carry a
 * tooltip naming what they are, and the panel says it again in words.
 */
const LAND_COVER_STYLE = { color: '#15803d', weight: 2, opacity: 0.9, fillColor: '#22c55e', fillOpacity: 0.22 };
const PLANTING_SITE_STYLE = { color: '#ca8a04', weight: 2, opacity: 0.95, fillColor: '#facc15', fillOpacity: 0.3 };
const SITE_HOVER_STYLE = { weight: 3, fillOpacity: 0.42 };
const SITE_SELECTED_STYLE = { weight: 4, fillOpacity: 0.5 };

const styleForSite = (feature) =>
  feature?.properties?.kind === 'planting-site' ? PLANTING_SITE_STYLE : LAND_COVER_STYLE;

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
  // Areas sit over the municipal outlines and under the trees: a forest should
  // never swallow a click meant for a tree standing in it.
  ['map-sites', 430],
  ['tree-points', 450],
  // The group bubbles sit over the pins they stand for.
  ['tree-clusters', 455],
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

/**
 * The spaces on the map: what is growing somewhere, and where to plant.
 *
 * Drawn under the trees so a pin standing inside a forest still takes the tap,
 * and with bubbling turned off so opening a forest does not also re-focus the
 * city it sits in.
 */
function SiteLayer({ sites, selectedId, onSelect }) {
  const groupRef = useRef(null);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  selectedRef.current = selectedId;
  onSelectRef.current = onSelect;

  const styleFor = (feature) => {
    const base = styleForSite(feature);
    return feature?.properties?.id === selectedRef.current
      ? { ...base, ...SITE_SELECTED_STYLE }
      : base;
  };

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.eachLayer((layer) => {
      layer.setStyle(styleFor(layer.feature));
      if (layer.feature?.properties?.id === selectedId) layer.bringToFront();
    });
    // styleFor reads a ref, so it does not need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <GeoJSON
      ref={groupRef}
      data={sites}
      pane="map-sites"
      style={styleFor}
      bubblingMouseEvents={false}
      onEachFeature={(feature, layer) => {
        const { id, kind, coverId } = feature.properties;
        const what =
          kind === 'planting-site'
            ? 'Tree planting site'
            : landCoverById(coverId)?.label ?? 'Land cover';
        layer.bindTooltip(`${siteTitle(feature)} — ${what}`, {
          sticky: true,
          direction: 'top',
          opacity: 0.95,
        });
        layer.on({
          click: () => onSelectRef.current(id),
          mouseover: (e) => {
            if (selectedRef.current !== id) {
              e.target.setStyle({ ...styleForSite(feature), ...SITE_HOVER_STYLE });
            }
          },
          mouseout: (e) => e.target.setStyle(styleFor(feature)),
        });
      }}
    />
  );
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

/** How big a group bubble is, by how many trees it stands for. */
function bubbleSize(count) {
  if (count < 10) return 34;
  if (count < 50) return 42;
  return 50;
}

/**
 * The bubble drawn in place of trees that would otherwise overlap.
 *
 * Built as a divIcon rather than a vector circle because the number has to sit
 * inside it, and Leaflet's SVG renderer has no text of its own.
 */
function bubbleIcon(count, color) {
  const size = bubbleSize(count);
  return L.divIcon({
    className: 'tree-bubble',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html:
      `<div style="width:${size}px;height:${size}px;border-radius:9999px;` +
      `background:${color};border:3px solid #ffffff;` +
      `box-shadow:0 1px 4px rgba(15,23,42,0.35);color:#ffffff;` +
      `font:700 ${count > 99 ? 11 : 13}px/1 system-ui,sans-serif;` +
      `display:flex;align-items:center;justify-content:center;">${count}</div>`,
  });
}

/**
 * The tagged trees, grouped while they would otherwise sit on top of
 * each other.
 *
 * Every tree in the inventory stands in Santa Cruz, so at province scale they
 * were one green smudge: no way to tell twelve from eighty, and the pin you
 * tapped was whichever happened to be drawn last. Pins within about 64 screen
 * pixels become one bubble carrying the count, which comes apart by itself as
 * the map is zoomed in. Tapping a bubble zooms to what is inside it.
 *
 * Zooming was not always enough. Two trees tagged three metres apart sit inside
 * one grid cell at EVERY zoom this map has, so the bubble used to stay put
 * however far in the visitor went — which read as the map being broken, and
 * fairly. No bubble survives the furthest zoom now: the pins inside it are
 * drawn as themselves, and the ones that would land on top of each other fan
 * out into a ring, each on a leg back to where the group stood.
 *
 * The open tree is always drawn as itself, never folded into a bubble —
 * otherwise opening a pin could make it disappear under a number.
 */
function TreePins({ pins, openTreeId, highlighting, onSelect }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom?.() ?? 11);
  useMapEvents({ zoomend: () => setZoom(map.getZoom?.() ?? zoom) });

  const maxZoom = map.getMaxZoom?.() ?? MAX_MAP_ZOOM;

  const openPin = useMemo(
    () => (openTreeId ? pins.find((pin) => pin.id === openTreeId) ?? null : null),
    [pins, openTreeId]
  );
  const groupable = useMemo(
    () => (openPin ? pins.filter((pin) => pin.id !== openPin.id) : pins),
    [pins, openPin]
  );
  /**
   * At the furthest zoom the grid stops being the right question.
   *
   * It cuts at fixed lines, so two pins twenty pixels apart end up in separate
   * cells whenever a boundary falls between them — drawn one on top of the
   * other, with nothing done about it. Grouping by how far apart they are
   * actually drawn catches those, and leaves alone the pins that share a cell
   * but have plenty of room.
   */
  const clusters = useMemo(
    () => (zoom >= maxZoom ? crowdGroups(groupable, zoom) : clusterPins(groupable, zoom)),
    [groupable, zoom, maxZoom]
  );

  const drawPin = (pin, isOpen, position = pin.position) => {
    const muted = highlighting && !pin.highlighted;
    return (
      <CircleMarker
        key={pin.id}
        center={position}
        radius={isOpen ? 10 : 7}
        pane="tree-points"
        pathOptions={{
          // A pin that has just come out of a bubble is a new element, so this
          // plays once, there, and not on pins that were already standing alone.
          className: 'tree-pin',
          color: '#ffffff',
          weight: isOpen ? 3 : 2,
          fillColor: isOpen ? MARKER_SELECTED_COLOR : muted ? MARKER_MUTED_COLOR : MARKER_COLOR,
          fillOpacity: muted ? 0.55 : 0.95,
        }}
        eventHandlers={{ click: () => onSelect(pin.tree) }}
      />
    );
  };

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.count === 1) return drawPin(cluster.pins[0], false);

        // At the furthest zoom there is nothing left to zoom into, so a bubble
        // here is a dead end — the visitor has done everything the map asked of
        // them and is still looking at a number. Every group comes apart.
        if (zoom >= maxZoom) {
          // Grouped by distance up there, so anything still together is
          // genuinely on top of itself and every one of them gets fanned.
          return (
            <Fragment key={cluster.key}>
              {spiderPositions(cluster, zoom).map(({ pin, position, anchor }) => (
                <Fragment key={pin.id}>
                  <Polyline
                    positions={[anchor, position]}
                    pane="tree-points"
                    interactive={false}
                    pathOptions={{
                      className: 'tree-spider-leg',
                      color: MARKER_COLOR,
                      weight: 1.5,
                      opacity: 0.55,
                    }}
                  />
                  {drawPin(pin, pin.id === openTreeId, position)}
                </Fragment>
              ))}
            </Fragment>
          );
        }

        // A group is only faded when nothing inside it is picked out.
        const muted = highlighting && !cluster.pins.some((pin) => pin.highlighted);
        const label = `${cluster.count} tagged trees — zoom in to see them`;
        return (
          <Marker
            key={cluster.key}
            position={cluster.position}
            pane="tree-clusters"
            icon={bubbleIcon(cluster.count, muted ? MARKER_MUTED_COLOR : MARKER_COLOR)}
            title={label}
            alt={label}
            eventHandlers={{
              click: () => {
                const bounds = boundsOfCluster(cluster);
                if (!bounds) return;
                // Trees tagged on the same spot give a bounds with no size at
                // all, and Leaflet answers that by going as far in as it is
                // allowed — which is exactly right, because the furthest zoom
                // is where the group fans itself out.
                map.fitBounds(bounds, { padding: [48, 48], maxZoom });
              },
            }}
          />
        );
      })}

      {openPin && drawPin(openPin, true)}
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
  // The area panel is shown by picking a place, and hidden by opening a tree:
  // both live in the same strip down the left of the map.
  const [areaPanelOpen, setAreaPanelOpen] = useState(false);
  const [areaPanelCollapsed, setAreaPanelCollapsed] = useState(false);
  // Drawn areas open on the RIGHT, so a visitor can hold a tree and the forest
  // it stands in on screen at once instead of watching one replace the other.
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [sitePanelCollapsed, setSitePanelCollapsed] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
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
        const { data, error } = await selectPublicTrees(supabase, PUBLIC_MAP_COLUMNS);
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

  // A tree's barangay is worked out from where it stands rather than from the
  // name someone typed, so the boundaries have to arrive before the panel's
  // list is right. Until then the written names carry it.
  const [barangaysReady, setBarangaysReady] = useState(barangayIndexReady);
  useEffect(() => {
    // Only when some tree still needs working out. Every row the database has
    // settled already carries its barangay, so there is nothing to fetch.
    if (!needsBarangayIndex(trees)) return undefined;
    let cancelled = false;
    loadBarangayIndex()
      .then(() => !cancelled && setBarangaysReady(true))
      .catch(() => {
        // Nothing to say: the written names still work.
      });
    return () => { cancelled = true; };
  }, [trees]);

  // What the area panel reports. Same module as the BioDashboard, so the two
  // surfaces cannot drift apart, and the same geometry-derived LGU as the rest
  // of this page.
  const areaTrees = useMemo(
    () => (selectedLgu ? trees.filter((tree) => treeAreas.get(tree.id) === selectedLgu) : []),
    [trees, treeAreas, selectedLgu]
  );
  const areaTotals = useMemo(() => summarise(areaTrees), [areaTrees]);
  const areaBarangays = useMemo(
    // barangaysReady is not read here; it is what re-runs this once the
    // boundaries are in hand.
    () => groupBy(areaTrees, barangayForTree),
    [areaTrees, barangaysReady]
  );

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
    // One panel at a time: the tree takes the strip, and the place it stands in
    // stays highlighted on the map behind it.
    setAreaPanelOpen(false);
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

  /**
   * Picking a city or municipality — on the map or from the dropdown — opens
   * its panel. Clicking the one already in focus clears it, and stays put.
   */
  function handleSelectLgu(name) {
    setSelectedLgu((current) => {
      const next = current === name ? '' : name;
      setFocusTarget(next || null);
      setAreaPanelOpen(Boolean(next));
      setAreaPanelCollapsed(false);
      if (next) {
        setSelectedTree(null);
        setHighlight(null);
      }
      return next;
    });
  }

  /** The dropdown: picking an area flies to it, picking "All of Laguna" flies out. */
  function handleLguDropdown(name) {
    setSelectedLgu(name);
    setFocusTarget(name || 'province');
    setAreaPanelOpen(Boolean(name));
    setAreaPanelCollapsed(false);
    if (name) {
      setSelectedTree(null);
      setHighlight(null);
    }
  }

  /**
   * Opening a drawn area. Tapping the one already open closes it, which is how
   * every other selection on this map behaves.
   */
  function handleSelectSite(id) {
    setSelectedSiteId((current) => (current === id ? null : id));
    setSitePanelCollapsed(false);
  }

  function clearSelectedSite() {
    setSelectedSiteId(null);
    setSitePanelCollapsed(false);
  }

  /** Dismissing the area drops the selection without moving the map. */
  function clearSelectedLgu() {
    setSelectedLgu('');
    setFocusTarget(null);
    setAreaPanelOpen(false);
    setAreaPanelCollapsed(false);
  }

  // Either panel covers the left of the map, so the controls over there travel
  // with whichever is showing rather than hiding underneath.
  const treePanelShowing = Boolean(selectedTree) && !panelCollapsed;
  const areaPanelShowing = areaPanelOpen && Boolean(selectedLgu) && !areaPanelCollapsed;
  const panelShowing = treePanelShowing || areaPanelShowing;

  const selectedSite = useMemo(() => siteById(selectedSiteId), [selectedSiteId]);
  const sitePanelShowing = Boolean(selectedSite) && !sitePanelCollapsed;

  return (
    <div
      className={`relative w-full h-[calc(100vh-56px)] sm:h-[calc(100vh-64px)] ${
        panelShowing ? 'panel-open' : ''
      } ${sitePanelShowing ? 'site-panel-open' : ''}`}
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
        /* The right-hand controls do the same for the area panel, which opens
           on the other side. The legend and the two selectors would otherwise
           sit underneath it. */
        .map-right-control {
          transition: transform 300ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease,
            visibility 200ms ease;
        }
        @media (min-width: 640px) {
          .site-panel-open .map-right-control {
            transform: translateX(-380px);
          }
        }
        @media (max-width: 639px) {
          .site-panel-open .map-right-control {
            opacity: 0;
            visibility: hidden;
          }
        }

        /* A pin that has just come out of a group is a brand new element, so
           this plays exactly when something de-clusters — on the pins that
           appeared, and not on the ones that were already standing alone. */
        @keyframes tree-pin-in {
          from { opacity: 0; transform: scale(0.3); }
          to   { opacity: 1; transform: scale(1); }
        }
        .tree-pin {
          transform-box: fill-box;
          transform-origin: center;
          animation: tree-pin-in 260ms cubic-bezier(0.2, 0, 0, 1) both;
        }
        .tree-bubble {
          animation: tree-pin-in 220ms cubic-bezier(0.2, 0, 0, 1) both;
        }
        /* The legs draw themselves outward from the point the group stood at. */
        @keyframes spider-leg-in {
          from { opacity: 0; stroke-dasharray: 0 120; }
          to   { opacity: 0.55; stroke-dasharray: 120 0; }
        }
        .tree-spider-leg {
          animation: spider-leg-in 300ms cubic-bezier(0.2, 0, 0, 1) both;
        }

        @media (prefers-reduced-motion: reduce) {
          .leaflet-top.leaflet-left,
          .map-side-control,
          .map-right-control {
            transition: none;
          }
          .tree-pin,
          .tree-bubble,
          .tree-spider-leg {
            animation: none;
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
        maxZoom={MAX_MAP_ZOOM}
        ref={mapRef}
      >
        <MapPanes />

        <TileLayer
          url={TILE_LAYERS[tileIndex].url}
          attribution="&copy; OpenStreetMap contributors"
          maxZoom={MAX_MAP_ZOOM}
          maxNativeZoom={MAX_NATIVE_ZOOM}
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

        {/* Land cover and tree planting sites — the spaces, as against the points */}
        <SiteLayer sites={MAP_SITES} selectedId={selectedSiteId} onSelect={handleSelectSite} />

        {/* Province outline, drawn over the municipal lines */}
        <GeoJSON data={LAGUNA_PROVINCE} style={PROVINCE_STYLE} pane="laguna-boundaries" interactive={false} />

        <FocusController target={focusTarget} />

        {/* User location blue dot */}
        <UserLocationMarker onTagAttempt={handleTagAttempt} />

        {/* Tagged trees — tapping one opens the side panel, and the ones that
            would overlap are grouped into a bubble until the map zooms in */}
        <TreePins
          pins={mapPins}
          openTreeId={selectedTree?.id}
          highlighting={Boolean(highlight)}
          onSelect={handleSelectTree}
        />
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

      {/* The place in focus, in full */}
      {areaPanelOpen && selectedLgu && (
        <AreaDetailPanel
          municipality={selectedLgu}
          label={selectedLabel || labelOf(selectedLgu)}
          logo={logoFor(selectedLgu)}
          totals={areaTotals}
          barangays={areaBarangays}
          onClose={clearSelectedLgu}
          onCollapsedChange={setAreaPanelCollapsed}
          onRequestData={() => setRequestOpen(true)}
        />
      )}

      {/* The drawn area in focus: land cover, or somewhere to plant */}
      {selectedSite && (
        <SitePanel
          feature={selectedSite}
          onClose={clearSelectedSite}
          onCollapsedChange={setSitePanelCollapsed}
        />
      )}

      {/* Area in focus — the short badge, for when its panel is out of the way */}
      {selectedLabel && !areaPanelShowing && (
        <div className="map-side-control absolute top-3 left-14 z-[400] bg-white/95 rounded-lg shadow border border-slate-200 px-3 py-2 max-w-[55vw]">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">In focus</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setAreaPanelOpen(true); setAreaPanelCollapsed(false); }}
              className="truncate text-sm font-bold text-slate-900 hover:text-green-800 transition"
              title={`Show the figures for ${selectedLabel}`}
            >
              {selectedLabel}
            </button>
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
      <div className="map-right-control absolute top-3 right-3 z-[400] flex flex-col gap-2 items-end">
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
      <div className="map-right-control absolute bottom-24 right-3 z-[400] bg-white/95 rounded-lg shadow border border-slate-200 px-3 py-2">
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
          <div className="flex items-center gap-2">
            <span
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 border-white text-[7px] font-bold text-white shadow-sm"
              style={{ backgroundColor: MARKER_COLOR }}
            >
              9
            </span>
            <span className="text-[10px] text-slate-600">Several — tap to zoom in</span>
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
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0 border-2"
              style={{ borderColor: LAND_COVER_STYLE.color, backgroundColor: 'rgba(34,197,94,0.22)' }}
            />
            <span className="text-[10px] text-slate-600">Land cover — tap for details</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0 border-2"
              style={{ borderColor: PLANTING_SITE_STYLE.color, backgroundColor: 'rgba(250,204,21,0.3)' }}
            />
            <span className="text-[10px] text-slate-600">Tree planting site</span>
          </div>
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
        <Suspense fallback={null}>
          <TaggingForm
            initialPosition={userTagPosition}
            onClose={closeTagging}
            onSuccess={closeTagging}
          />
        </Suspense>
      )}

      {/* Asking for the data behind the place in focus */}
      <DataRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} />

    </div>
  );
}
