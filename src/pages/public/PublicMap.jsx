import { useEffect, useMemo, useState, useRef, lazy, Suspense } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  GeoJSON,
  Polygon,
  Marker,
  useMap,
  useMapEvents,
  Circle,
  ImageOverlay,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Crosshair, Layers as LayersIcon, ListTree, Loader2, Locate, PencilRuler, Printer, Smartphone, X } from 'lucide-react';
import { supabase } from '../../supabaseClient.js';
import {
  LAGUNA_BOUNDS,
  LAGUNA_MUNICIPALITIES,
  LAGUNA_PROVINCE,
  MUNICIPALITY_LIST,
  OUTSIDE_LAGUNA_MASK,
  boundsOfMunicipality,
  containsPoint,
  maskOutsideMunicipality,
  municipalityAt,
  municipalityNamed,
} from '../../lib/lagunaBoundaries.js';
import { basemapById } from '../../lib/basemaps.js';
import { PIN_FILL, PIN_MEANING, URGENCY, mostUrgent, pinColorOf } from '../../lib/adminPins.js';
import { boundsOfCluster, clusterPins } from '../../lib/clusterPins.js';
import { PIN_COLOR } from '../../lib/pinColor.js';
import { EMPTY_SHAPE, undoLast } from '../../lib/drawing.js';
import { areaPermission, documentFolderOf, emptyAreaForm, formFromRow, geometryToShape } from '../../lib/mapAreas.js';
import { boundsOfShape, shapeFromGeometry } from '../../lib/areaImport.js';
import { ROLES, roleOf } from '../../lib/roles.js';
import { centroidOf } from '../../lib/areaGeometry.js';
import { parentTileOnError } from '../../lib/tileFallback.js';
import { useMapAreas } from '../../hooks/useMapAreas.js';
import { useMapLayers } from '../../hooks/useMapLayers.js';
import { useMeasuredSample } from '../../hooks/useMeasuredSample.js';
import { measureArea } from '../../lib/layers/facts.js';
import AreaActions from '../../components/map/AreaActions.jsx';
import { BasemapPicker, SurveyKey, SurveyPicker } from '../../components/map/MapPickers.jsx';
import { repaintPicture } from '../../lib/layers/browser.js';
import { soilColourOf, soilColours } from '../../lib/layers/palette.js';
import LayersPanel from '../../components/map/LayersPanel.jsx';
import ToolTile from '../../components/map/ToolTile.jsx';
import { DEFAULT_LAYERS, PGENRO_OVERLAYS } from '../../lib/mapLayers.js';
import DrawLayer from '../../components/map/DrawLayer.jsx';
import MeasureBox from '../../components/map/MeasureBox.jsx';
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
import { everyRow } from '../../lib/everyRow.js';
// The LGU map's two action dialogs: nobody on the public map can reach them,
// so the public map never downloads them.
const DispatchModal = lazy(() => import('../../components/DispatchModal.jsx'));
const IssuePermitModal = lazy(() => import('../../components/IssuePermitModal.jsx'));
const AreaForm = lazy(() => import('../../components/map/AreaForm.jsx'));

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
// The office map's: lines only, no wash of colour over the town. White reads
// on satellite and vanishes on the street map, so the line follows the base.
// fill stays on at zero opacity so the inside of a town still takes a click.
const outlineStyles = (color) => ({
  base: { color, weight: 1.5, opacity: 0.9, fill: true, fillOpacity: 0 },
  hover: { color, weight: 2.5, opacity: 1, fill: true, fillOpacity: 0 },
  chosen: { color, weight: 3.5, opacity: 1, fill: true, fillOpacity: 0 },
});

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

// A planting site only asked for, not yet approved, is drawn dashed and
// fainter: it is a request, seen by the office and PGENRO only.
const REQUESTED_STYLE = { dashArray: '6 5', fillOpacity: 0.12 };

const styleForSite = (feature) => {
  const props = feature?.properties;
  if (props?.kind !== 'planting-site') return LAND_COVER_STYLE;
  return props.approval && props.approval !== 'approved' ? { ...PLANTING_SITE_STYLE, ...REQUESTED_STYLE } : PLANTING_SITE_STYLE;
};

/**
 * Leaflet draws everything vector into one layer unless told otherwise, and
 * within it the last layer added wins — which is how selecting a municipality
 * used to bury the tree points: bringing the chosen boundary to the front put
 * it over them and it swallowed their clicks. Giving each kind of layer its own
 * pane fixes the stacking for good, whatever order things are added in.
 */
const PANES = [
  ['laguna-mask', 410],
  // PGENRO's survey layers — soil, elevation, flood — over the base map and
  // under everything that takes a click.
  ['layer-overlays', 415],
  // The barangays inside the LGU in focus, under the municipal outline.
  ['barangay-boundaries', 418],
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
  // The shape being drawn sits over everything it is drawn across.
  ['map-drawing', 470],
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

/** The middle of a [[south, west], [north, east]] box. */
const centreOf = ([[south, west], [north, east]]) => [(south + north) / 2, (west + east) / 2];

/** The public map's single colour, as a pin-colour function. */
const ONE_COLOUR = () => MARKER_COLOR;

/** The LGU map's colours: each tree by its state, each bubble by its most urgent. */
const adminPinFill = (pin) => PIN_FILL[pinColorOf(pin.tree)];
const adminBubbleFill = (pins) => PIN_FILL[mostUrgent(pins.map((pin) => pinColorOf(pin.tree)))];

/**
 * Flies to one point: a tree opened from "View on map" elsewhere, or the
 * office's hall. `target` is { position, zoom }, a new object each time it is
 * asked for, so asking twice flies twice.
 */
function FlyToPoint({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    // An imported area is framed whole; a tree or the hall is flown to.
    if (target.bounds) map.flyToBounds(target.bounds, { padding: [48, 48], duration: 1.2 });
    else map.flyTo(target.position, target.zoom ?? 19, { duration: 1.2 });
  }, [target, map]);
  return null;
}

/** Hands the page one map click — how the office pins its hall. */
function MapClick({ onClick }) {
  useMapEvents({ click: (event) => onClick([event.latlng.lat, event.latlng.lng]) });
  return null;
}

/**
 * The LGU's Municipal or City Hall, where the centre button flies.
 *
 * A building rather than a dot, so it is never read as a tree. Clicking it
 * opens a card from which the LGU's own office can move it.
 */
const HALL_ICON = L.divIcon({
  className: 'hall-marker',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  html:
    '<span style="display:flex;width:32px;height:32px;align-items:center;justify-content:center;' +
    'border-radius:9999px;background:#166534;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M3 22h18"/><path d="M6 18v-7"/>' +
    '<path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2l8 5H4z"/></svg></span>',
});

/**
 * Moves the camera when, and only when, something asks it to.
 *
 * `target` is a municipality name, the string 'province', or null for "leave
 * the view where it is". Clearing a selection is not a request to fly: someone
 * who has zoomed into their barangay and then dismisses the focus card wants
 * the card gone, not the whole province back.
 */
function FocusController({ target, nonce = 0 }) {
  const map = useMap();
  // `nonce` makes asking twice for the same place fly twice: the LGU map's
  // centre button asks for the same LGU every time it is pressed.
  useEffect(() => {
    if (!target) return;
    const bounds = target === 'province' ? LAGUNA_BOUNDS : boundsOfMunicipality(target);
    if (!bounds) return;
    map.flyToBounds(bounds, {
      padding: [32, 32],
      maxZoom: target === 'province' ? 12 : 15,
      duration: 1.1,
    });
  }, [target, nonce, map]);
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
        const { id, kind, coverId, coverLabel, approval } = feature.properties;
        const what =
          kind === 'planting-site'
            ? approval === 'requested'
              ? 'Planting site requested, waiting for PGENRO'
              : approval === 'declined'
                ? 'Planting site request, declined'
                : 'Tree planting site'
            : coverLabel ?? landCoverById(coverId)?.label ?? 'Land cover';
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

/**
 * The city and municipality outlines inside Laguna; click one to focus it.
 *
 * `data` narrows it: an LGU account's map draws its own LGU's outline only,
 * since everything outside it is covered over anyway.
 *
 * `outlinesOnly` is the office map's version: no green wash on a selected or
 * hovered town, only a heavier line. An office draws areas over this map, and
 * a translucent green over the whole LGU muddied every other layer under it.
 */
function MunicipalityLayer({
  selected,
  onSelect,
  data = LAGUNA_MUNICIPALITIES,
  outlinesOnly = false,
  outlineColor = '#ffffff',
}) {
  const groupRef = useRef(null);
  const selectedRef = useRef(selected);
  const onSelectRef = useRef(onSelect);
  selectedRef.current = selected;
  onSelectRef.current = onSelect;

  const outline = outlineStyles(outlineColor);
  const base = outlinesOnly ? outline.base : MUNICIPALITY_STYLE;
  const hover = outlinesOnly ? outline.hover : HOVER_STYLE;
  const chosen = outlinesOnly ? outline.chosen : SELECTED_STYLE;
  const styleFor = (name) => (name === selectedRef.current ? chosen : base);

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
    // styleFor reads refs and props; these two are what change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, outlineColor]);

  return (
    <GeoJSON
      ref={groupRef}
      data={data}
      pane="laguna-boundaries"
      style={(feature) => styleFor(feature.properties.municipality)}
      onEachFeature={(feature, layer) => {
        const { municipality, municipality_label: label } = feature.properties;
        layer.bindTooltip(label, { sticky: true, direction: 'top', opacity: 0.95 });
        layer.on({
          click: () => onSelectRef.current(municipality),
          mouseover: (e) => {
            if (selectedRef.current !== municipality) e.target.setStyle(hover);
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
 * Without `onTagAttempt` — the LGU map, whose staff tag from the field app —
 * it is only the dot.
 */
function UserLocationMarker({ onTagAttempt = null }) {
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
        eventHandlers={{ click: () => onTagAttempt?.(position) }}
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
        eventHandlers={{ click: () => onTagAttempt?.(position) }}
      >
        <Popup>
          <div className="text-center p-1">
            <p className="text-sm font-semibold text-gray-800">You are here</p>
            {onTagAttempt && (
              <>
                <p className="text-[11px] text-gray-500 mb-2">Tap below to tag a nearby tree</p>
                <button
                  onClick={() => onTagAttempt(position)}
                  className="w-full bg-green-700 text-white text-xs font-semibold py-2 px-3 rounded-lg hover:bg-green-800 transition"
                >
                  🌳 Tag a Tree Here
                </button>
              </>
            )}
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}

/**
 * BSWM soil units as coloured shapes, fetched when switched on, one colour
 * per series (palette.js) and nothing over the lake. Not clickable: the
 * colours are keyed in the legend, and a click here belongs to the town, the
 * area or the tree above it.
 */
function SoilOverlay({ url, classes }) {
  const colours = useMemo(() => soilColours(classes), [classes]);
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => !cancelled && setData(json))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (!data) return null;
  return (
    <GeoJSON
      key={url}
      data={data}
      pane="layer-overlays"
      interactive={false}
      style={(feature) => {
        const colour = soilColourOf(colours, feature.properties);
        return colour
          ? { color: colour, weight: 0.6, opacity: 0.7, fillColor: colour, fillOpacity: 0.45 }
          : { stroke: false, fill: false };
      }}
    />
  );
}

/**
 * Elevation or a hazard, as its published picture in today's colours
 * (palette.js) — repainted in the browser when it was published in older
 * ones, which is only done once it is switched on.
 */
function PictureOverlay({ layer, kind }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    repaintPicture(layer.pictureUrl, kind, layer.meta?.legend).then((painted) => {
      if (!cancelled) setUrl(painted);
    });
    return () => {
      cancelled = true;
    };
  }, [layer.pictureUrl, layer.meta, kind]);
  if (!url) return null;
  return <ImageOverlay url={url} bounds={layer.meta.bounds} pane="layer-overlays" opacity={0.9} />;
}

// The barangay boundaries are 800 kB, so they are fetched the first time an
// LGU is in focus, not with the page.
let barangaysOnce = null;
const loadBarangays = () => {
  barangaysOnce ??= import('../../data/Laguna-Barangays.geojson').then((module) => module.default);
  return barangaysOnce;
};

/**
 * The barangays of the city or municipality in focus: thin dashed lines, and
 * their names once the map is close enough to read them. Not clickable — the
 * areas and trees over them are what take a click.
 */
function BarangayLayer({ municipality, color, onSelect = null }) {
  const map = useMap();
  const [all, setAll] = useState(null);
  const [zoom, setZoom] = useState(() => map.getZoom?.() ?? 11);
  useEffect(() => {
    let cancelled = false;
    loadBarangays()
      .then((data) => !cancelled && setAll(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!map.on) return undefined;
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => map.off('zoomend', onZoom);
  }, [map]);

  const data = useMemo(
    () =>
      all && {
        type: 'FeatureCollection',
        name: 'barangays',
        features: all.features.filter((feature) => feature.properties.municipality === municipality),
      },
    [all, municipality]
  );
  if (!data) return null;
  const named = zoom >= BARANGAY_NAMES_ZOOM;
  return (
    <GeoJSON
      key={`${municipality}-${color}-${named}`}
      data={data}
      pane="barangay-boundaries"
      interactive={false}
      style={{ color, weight: 1, opacity: 0.75, dashArray: '4 4', fill: false }}
      onEachFeature={(feature, layer) => {
        if (named) {
          layer.bindTooltip(feature.properties.barangay, {
            permanent: true,
            direction: 'center',
            className: onSelect ? 'barangay-label barangay-label-link' : 'barangay-label',
            // The name takes the click, not the area under it: areas and
            // trees above the barangay lines keep theirs.
            interactive: Boolean(onSelect),
          });
          if (onSelect) layer.getTooltip?.()?.on?.('click', () => onSelect(feature.properties));
        }
      }}
    />
  );
}

/** Close enough to the ground for barangay names not to pile on each other. */
const BARANGAY_NAMES_ZOOM = 14;

/** How big a group bubble is: bigger for more trees, without saying how many. */
function bubbleSize(count) {
  if (count < 10) return 26;
  if (count < 50) return 32;
  return 38;
}

/**
 * The bubble drawn in place of trees that would otherwise overlap.
 *
 * No number on it: the count read as a precise figure on a map that is about
 * where trees are, not how many. It is still in the bubble's label, for a
 * screen reader and on hover. The soft halo is what tells a bubble from a
 * single pin at a glance.
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
      `box-shadow:0 0 0 5px ${color}55,0 1px 4px rgba(15,23,42,0.35);"></div>`,
  });
}

/**
 * The tagged trees, grouped while they would otherwise sit on top of each
 * other.
 *
 * At province scale the trees of a town are one smudge, and the pin a visitor
 * taps is whichever happens to be on top. Pins within about 64 screen pixels
 * become one bubble, which comes apart by itself as the map is zoomed in.
 * Tapping a bubble zooms to what is inside it.
 *
 * Grouping was taken out once because the bubble stood at the AVERAGE of its
 * trees — often empty ground — and the furthest zoom fanned trees into a ring
 * away from where they stand. Neither is back: a bubble stands on one of its
 * own trees (see clusterPins), and at the furthest zoom there are no bubbles at
 * all, every pin at its own coordinates.
 *
 * The open tree is always drawn as itself, never folded into a bubble —
 * otherwise opening a pin could make it disappear into a group.
 */
function TreePins({
  pins,
  openTreeId,
  highlighting,
  onSelect,
  pinFill = ONE_COLOUR,
  bubbleFill = ONE_COLOUR,
  stateColours = false,
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom?.() ?? 11);
  useMapEvents({ zoomend: () => setZoom(map.getZoom?.() ?? zoom) });

  const maxZoom = map.getMaxZoom?.() ?? MAX_MAP_ZOOM;

  const openPin = useMemo(
    () => (openTreeId ? pins.find((pin) => pin.id === openTreeId) ?? null : null),
    [pins, openTreeId]
  );
  const others = useMemo(
    () => (openPin ? pins.filter((pin) => pin.id !== openPin.id) : pins),
    [pins, openPin]
  );
  // At the furthest zoom there is nothing left to zoom into, so a bubble would
  // be a dead end. Every tree stands alone there, where it was tagged.
  const clusters = useMemo(
    () =>
      zoom >= maxZoom
        ? others.map((pin) => ({ key: pin.id, position: pin.position, pins: [pin], count: 1 }))
        : clusterPins(others, zoom),
    [others, zoom, maxZoom]
  );

  const drawPin = (pin, isOpen) => {
    const muted = highlighting && !pin.highlighted;
    return (
      <CircleMarker
        key={pin.id}
        center={pin.position}
        radius={isOpen ? 10 : 7}
        pane="tree-points"
        pathOptions={{
          className: 'tree-pin',
          // On the LGU map an open tree keeps its colour — turning a red
          // hazard dark green the moment it is opened would hide the very
          // thing it was opened for — and is marked by a dark ring instead.
          color: isOpen && stateColours ? '#0f172a' : '#ffffff',
          weight: isOpen ? 3 : 2,
          fillColor:
            isOpen && !stateColours ? MARKER_SELECTED_COLOR : muted ? MARKER_MUTED_COLOR : pinFill(pin),
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

        // A group is only faded when nothing inside it is picked out.
        const muted = highlighting && !cluster.pins.some((pin) => pin.highlighted);
        const label = `${cluster.count} tagged trees — zoom in to see them`;
        return (
          <Marker
            key={cluster.key}
            position={cluster.position}
            pane="tree-clusters"
            icon={bubbleIcon(cluster.count, muted ? MARKER_MUTED_COLOR : bubbleFill(cluster.pins))}
            title={label}
            alt={label}
            eventHandlers={{
              click: () => {
                const bounds = boundsOfCluster(cluster);
                if (!bounds) return;
                // Trees tagged on the same spot give bounds with no size, and
                // Leaflet answers that by going as far in as allowed — where
                // every tree is drawn on its own.
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

/**
 * What an open tree needs, and the buttons to do it — the Command Center's
 * Dispatch / Re-assign and Permit, at the foot of the tree panel.
 *
 * The rules are the Command Center's: only a hazard is dispatched, a hazard
 * somebody is already on is re-assigned rather than dispatched twice, and a
 * permit is issued once. A button that cannot be used says why on hover and to
 * a screen reader, rather than just greying out.
 */
function TreeActions({ tree, onDispatch, onPermit, canAct = true }) {
  const color = pinColorOf(tree);
  const hazard = color === PIN_COLOR.RED || color === PIN_COLOR.ORANGE;
  const permitted = Boolean(tree.has_cutting_permit || tree.hasCuttingPermit);
  const assignedTo = tree.assigned_to ?? tree.assignedTo ?? null;

  const button =
    'flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';

  return (
    <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: PIN_FILL[color] }} />
        {PIN_MEANING[color]}
        {assignedTo && <span className="truncate font-normal text-slate-500">· {assignedTo}</span>}
      </p>

      {tree.__pending ? (
        <p className="mt-2 text-xs text-slate-500">
          {tree.source === 'import'
            ? `From the office's inventory spreadsheet${tree.details?.dbh_cm ? ` (DBH ${tree.details.dbh_cm} cm${tree.details.height_m ? `, ${tree.details.height_m} m tall` : ''})` : ''}. Unverified: it joins the inventory once a field officer checks it and takes its photos.`
            : 'A resident tagged this. It joins the inventory once the field officer checks it in the app.'}
        </p>
      ) : !canAct ? (
        // PGENRO watches the province; the work on a tree is its LGU's.
        <p className="mt-2 text-xs text-slate-500">
          Dispatching an arborist and issuing a cutting permit are done by the MENRO / CENRO of the
          tree&apos;s city or municipality.
        </p>
      ) : (
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={onDispatch}
            disabled={!hazard}
            title={hazard ? undefined : 'Only a tree with a hazard is dispatched.'}
            aria-describedby={hazard ? undefined : 'tree-action-why'}
            className={`${button} ${
              color === PIN_COLOR.ORANGE
                ? 'bg-orange-500 text-white hover:bg-orange-600 focus-visible:ring-orange-500'
                : 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600'
            }`}
          >
            {color === PIN_COLOR.ORANGE ? 'Re-assign' : 'Dispatch'}
          </button>
          <button
            type="button"
            onClick={onPermit}
            disabled={permitted}
            className={`${button} bg-green-700 text-white hover:bg-green-800 focus-visible:ring-green-600`}
          >
            {permitted ? 'Permit issued' : 'Issue permit'}
          </button>
        </div>
      )}
      {!tree.__pending && canAct && !hazard && (
        <p id="tree-action-why" className="sr-only">
          Only a tree with a hazard is dispatched.
        </p>
      )}
    </div>
  );
}

/** The public map: every tagged tree in Laguna, in one colour, for anyone. */
export default function PublicMap() {
  return <TreeMap />;
}

/**
 * The map, for the public and for the LGU offices.
 *
 * One component, so the LGU map behaves exactly as the public one does — the
 * same panels, the same clustering, the same phone rules — and an improvement
 * to either is an improvement to both. `mode="admin"` adds what an office
 * needs on top:
 *
 *   - pins coloured by what needs doing, as the Command Center had them;
 *   - Dispatch / Re-assign and Issue Permit on the tree panel;
 *   - a button to centre the map on the office's own area;
 *   - street and satellite as picture buttons;
 *   - drawing and measuring an area.
 *
 * `fence` is the LGU an account belongs to. Everything outside it is covered
 * over, its trees are not shown, and nothing can be drawn there — the same
 * treatment the public map gives everything outside Laguna. PGENRO has no
 * fence: the whole province is its area.
 *
 * `profile` is the signed-in office's, on the LGU map: it decides whether a
 * drawn area can be saved, and what the office may do to a saved one.
 */
export function TreeMap({ mode = 'public', fence = null, hall = null, canPinHall = false, onPinHall = null, profile = null }) {
  const admin = mode === 'admin';
  const [trees, setTrees] = useState([]);
  // Crowdsourced tags a field officer has been sent to check: grey pins.
  const [pendingTrees, setPendingTrees] = useState([]);
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
  // A barangay opened from its name on the map: { psgc, name, municipality, areaKm2 }.
  const [selectedBarangay, setSelectedBarangay] = useState(null);
  const [barangayFigures, setBarangayFigures] = useState(null);
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
  const [basemapId, setBasemapId] = useState(admin ? 'satellite' : 'street');
  // Asking the camera to go somewhere it already is: see FocusController.
  const [focusNonce, setFocusNonce] = useState(0);
  // A single tree to fly to — one opened from "View on map" elsewhere.
  const [pointTarget, setPointTarget] = useState(null);
  // The LGU map's dialogs, and its drawing.
  const [dispatchTree, setDispatchTree] = useState(null);
  const [permitTree, setPermitTree] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [shape, setShape] = useState(EMPTY_SHAPE);
  const [drawNotice, setDrawNotice] = useState('');
  // An area brought in from a file in Settings: what went wrong with it, and
  // the name it came with.
  const [importError, setImportError] = useState('');
  const [importedName, setImportedName] = useState('');
  // Saving what is drawn: { mode: 'new' | 'edit' | 'propose', featureId }.
  const [areaEditor, setAreaEditor] = useState(null);
  // Areas offices have saved; the samples stand in until there are some.
  const savedAreas = useMapAreas({ withProposals: admin });
  // PGENRO's survey layers, drawn when switched on in the Layers panel.
  const mapLayers = useMapLayers();
  // What is drawn over the base map, and which corner panel is open.
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  // The one survey layer laid over the map, if any: 'soil', 'elevation', …
  const [survey, setSurvey] = useState(null);
  const surveyLayer = survey ? mapLayers.layers[survey] ?? null : null;
  const [openTool, setOpenTool] = useState(null);
  // Pinning the hall: the prompt, the mode, and what went wrong.
  const [pinningHall, setPinningHall] = useState(false);
  const [hallCardOpen, setHallCardOpen] = useState(false);
  const [hallPromptDismissed, setHallPromptDismissed] = useState(false);
  const [hallNotice, setHallNotice] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [showMobileOnlyNotice, setShowMobileOnlyNotice] = useState(false);
  const [showEthicsModal, setShowEthicsModal] = useState(false);
  const [ethicsAgreed, setEthicsAgreed] = useState(false);
  const [showTaggingForm, setShowTaggingForm] = useState(false);
  const [userTagPosition, setUserTagPosition] = useState(null);
  const isMobileView = useIsMobileView();
  // Which side opened most recently, so a window narrowed to phone width with
  // both panels open keeps the one the visitor reached for last.
  const lastPanelSide = useRef(null);
  useEffect(() => {
    if (!isMobileView) return;
    const leftOpen = Boolean(selectedTree) || areaPanelOpen;
    if (!leftOpen || !selectedSiteId) return;
    if (lastPanelSide.current === 'right') {
      setSelectedTree(null);
      setPanelCollapsed(false);
      setHighlight(null);
      setAreaPanelOpen(false);
    } else {
      setSelectedSiteId(null);
    }
    // Only a change of viewport should trigger this; the handlers keep the
    // rule themselves once the page is already at phone width.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileView]);
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
        // The office needs every column — hazards, assignment, permit — that
        // the public map deliberately does not download.
        const { data, error } = admin
          ? await everyRow(() => supabase.from('trees').select('*'))
          : await selectPublicTrees(supabase, PUBLIC_MAP_COLUMNS);
        if (cancelled) return;
        if (error) {
          setLoadError(error.message || 'The tree data could not be loaded.');
        } else {
          setTrees(Array.isArray(data) ? data : []);
        }

        if (admin) {
          // Tags out for field checking, and the trees an office brought in
          // from its inventory spreadsheet, waiting for theirs (community.sql).
          const { data: pending } = await everyRow(() =>
            supabase.from('pending_trees').select('*').in('status', ['dispatched', 'pending'])
          );
          if (!cancelled) {
            setPendingTrees(
              (Array.isArray(pending) ? pending : []).filter((tag) => tag.status === 'dispatched' || tag.source === 'import')
            );
          }
        }
      } catch (e) {
        if (cancelled) return;
        setLoadError(e?.message || 'The tree data could not be loaded.');
      }
      if (!cancelled) setLoading(false);
    }
    fetchTrees();
    return () => { cancelled = true; };
  }, [reloadToken, admin]);

  // The office's map follows the inventory live: a dispatch from another desk,
  // or a tree a field officer has just finished, changes the pin while it is
  // being looked at.
  useEffect(() => {
    if (!admin || !supabase.channel) return undefined;
    const channel = supabase
      .channel('lgu-map-trees')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trees' }, (payload) => {
        const row = payload?.new;
        if (!row?.id) return;
        setTrees((current) =>
          current.some((tree) => tree.id === row.id)
            ? current.map((tree) => (tree.id === row.id ? { ...tree, ...row } : tree))
            : [...current, row]
        );
      })
      .subscribe();
    return () => supabase.removeChannel?.(channel);
  }, [admin]);

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

  // Every tree the map knows about. On the office's map that includes the
  // crowdsourced tags out for field checking, and leaves out trees already
  // cut down — a stump is not something to dispatch anybody to.
  const allTrees = useMemo(() => {
    if (!admin) return trees;
    return [
      ...trees.filter((tree) => tree.task_status !== 'Cut'),
      ...pendingTrees.map((tag) => ({ ...tag, id: `pending-${tag.id}`, __pending: true })),
    ];
  }, [admin, trees, pendingTrees]);

  // Trees carry a barangay but no city or municipality, so the panel's place
  // line and the species' spread both come from which boundary a point falls
  // in. Worked out once for the whole set rather than per pin tapped.
  const treeAreas = useMemo(() => {
    const areas = new Map();
    for (const tree of allTrees) {
      const position = getLatLng(tree);
      if (!position) continue;
      const name = municipalityAt(position);
      if (name) areas.set(tree.id, name);
    }
    return areas;
  }, [allTrees]);

  // What this account may see: everything, or its own LGU and nothing else.
  const shownTrees = useMemo(
    () => (fence ? allTrees.filter((tree) => treeAreas.get(tree.id) === fence) : allTrees),
    [allTrees, treeAreas, fence]
  );

  // Build map pins
  const mapPins = useMemo(() => {
    return shownTrees
      .map((tree) => {
        const position = getLatLng(tree);
        if (!position) return null;
        return { id: tree.id, position, tree, highlighted: matchesHighlight(tree, highlight) };
      })
      .filter(Boolean);
  }, [shownTrees, highlight]);

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

  // A tree's barangay is worked out from where it stands rather than from the
  // name someone typed, so the boundaries have to arrive before the panel's
  // list is right. Until then the written names carry it.
  const [barangaysReady, setBarangaysReady] = useState(barangayIndexReady);
  useEffect(() => {
    // Only when some tree still needs working out. Every row the database has
    // settled already carries its barangay, so there is nothing to fetch.
    if (!needsBarangayIndex(shownTrees)) return undefined;
    let cancelled = false;
    loadBarangayIndex()
      .then(() => !cancelled && setBarangaysReady(true))
      .catch(() => {
        // Nothing to say: the written names still work.
      });
    return () => { cancelled = true; };
  }, [shownTrees]);

  // What the area panel reports. Same module as the BioDashboard, so the two
  // surfaces cannot drift apart, and the same geometry-derived LGU as the rest
  // of this page.
  const areaTrees = useMemo(
    () => (selectedLgu ? shownTrees.filter((tree) => treeAreas.get(tree.id) === selectedLgu) : []),
    [shownTrees, treeAreas, selectedLgu]
  );
  const areaTotals = useMemo(() => summarise(areaTrees), [areaTrees]);

  // ---- A barangay, opened from its name ----------------------------------------
  const barangayTrees = useMemo(
    () =>
      selectedBarangay
        ? shownTrees.filter(
            (tree) => treeAreas.get(tree.id) === selectedBarangay.municipality && barangayForTree(tree) === selectedBarangay.name
          )
        : [],
    // barangaysReady re-runs this once the boundaries are in hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shownTrees, treeAreas, selectedBarangay, barangaysReady]
  );
  const barangayTotals = useMemo(() => summarise(barangayTrees), [barangayTrees]);
  useEffect(() => {
    setBarangayFigures(null);
    if (!selectedBarangay) return undefined;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('barangay_stats')
        .select('population, households')
        .eq('barangay_psgc', selectedBarangay.psgc)
        .maybeSingle();
      if (!cancelled && !error) setBarangayFigures(Array.isArray(data) ? data[0] ?? null : data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedBarangay]);
  const barangayFacts = selectedBarangay
    ? [
        {
          label: 'Area',
          value: selectedBarangay.areaKm2 != null
            ? `${(selectedBarangay.areaKm2 * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })} ha`
            : '—',
          note: 'From the PSA boundary',
        },
        {
          label: 'Population',
          value: barangayFigures?.population != null ? Number(barangayFigures.population).toLocaleString('en-US') : 'Not recorded',
        },
        {
          label: 'Households',
          value: barangayFigures?.households != null ? Number(barangayFigures.households).toLocaleString('en-US') : 'Not recorded',
        },
      ]
    : [];

  // Another town chosen: the barangay of the last one is not what is in focus.
  useEffect(() => {
    if (selectedBarangay && !fence && selectedLgu !== selectedBarangay.municipality) setSelectedBarangay(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLgu]);

  function selectBarangay(properties) {
    setSelectedBarangay({
      psgc: Number(properties.barangay_psgc),
      name: properties.barangay,
      municipality: properties.municipality,
      municipalityLabel: properties.municipality_label ?? properties.municipality,
      areaKm2: properties.area_km2 ?? null,
    });
    setAreaPanelOpen(false);
    setAreaPanelCollapsed(false);
  }
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
    for (const tree of shownTrees) {
      if ((tree.species || '').trim() !== species) continue;
      const name = treeAreas.get(tree.id);
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, label: labelOf(name), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [selectedTree, shownTrees, treeAreas]);

  /** Opening a tree picks out the rest of its species. */
  function handleSelectTree(tree) {
    setSelectedTree(tree);
    setHighlight({ kind: 'species', value: (tree.species || '').trim() });
    // One panel at a time: the tree takes the strip, and the place it stands in
    // stays highlighted on the map behind it.
    setAreaPanelOpen(false);
    lastPanelSide.current = 'left';
    if (isMobileView) clearSelectedSite();
  }

  /**
   * A phone has room for one panel, not two.
   *
   * On a desktop the tree or city opens on the left and a drawn area on the
   * right, so a visitor can hold a tree and the forest it stands in at once.
   * On a phone every panel is the full width of the screen, so the second one
   * simply lay on top of the first. There, opening one closes the other.
   */
  function closeLeftPanels() {
    setSelectedTree(null);
    setPanelCollapsed(false);
    setHighlight(null);
    setAreaPanelOpen(false);
    setAreaPanelCollapsed(false);
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
   *
   * It also closes a land cover or planting site panel, on every screen: the
   * town's figures and one small area's details side by side read as if the
   * area were the town. A tree can still stay open beside a forest.
   */
  function handleSelectLgu(name) {
    if (selectedLgu !== name) {
      lastPanelSide.current = 'left';
      clearSelectedSite();
    }
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
    if (name) {
      lastPanelSide.current = 'left';
      clearSelectedSite();
    }
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
    const opening = selectedSiteId !== id;
    setSelectedSiteId(opening ? id : null);
    setSitePanelCollapsed(false);
    if (opening) {
      lastPanelSide.current = 'right';
      if (isMobileView) closeLeftPanels();
    }
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
  const areaPanelShowing =
    ((areaPanelOpen && Boolean(selectedLgu)) || Boolean(selectedBarangay)) && !areaPanelCollapsed;
  const panelShowing = treePanelShowing || areaPanelShowing;

  // ---- The fence ----------------------------------------------------------
  const fenceFeature = useMemo(() => (fence ? municipalityNamed(fence) : null), [fence]);
  const fenceLabel = fenceFeature?.properties.municipality_label ?? '';
  const mask = useMemo(
    () => (fence ? maskOutsideMunicipality(fence) ?? OUTSIDE_LAGUNA_MASK : OUTSIDE_LAGUNA_MASK),
    [fence]
  );
  const initialBounds = useMemo(
    () => (fence ? boundsOfMunicipality(fence) ?? LAGUNA_BOUNDS : LAGUNA_BOUNDS),
    [fence]
  );
  const municipalityData = useMemo(
    () => (fenceFeature ? { type: 'FeatureCollection', features: [fenceFeature] } : LAGUNA_MUNICIPALITIES),
    [fenceFeature]
  );
  // Saved areas once there are any; until then the samples, marked as such.
  const sites = useMemo(() => {
    const all = savedAreas.features.length > 0
      ? { type: 'FeatureCollection', features: savedAreas.features }
      : MAP_SITES;
    return fence ? { ...all, features: all.features.filter((f) => f.properties.municipality === fence) } : all;
  }, [fence, savedAreas.features]);

  const tileHandlers = useMemo(() => {
    const basemap = basemapById(basemapId);
    return basemap.fallbackToParent ? { tileerror: parentTileOnError(basemap.url) } : undefined;
  }, [basemapId]);

  const sitesKey = useMemo(
    () => sites.features.map((f) => `${f.properties.id}@${f.properties.version ?? ''}`).join('|'),
    [sites]
  );
  const selectedSite = useMemo(() => siteById(selectedSiteId, sites), [selectedSiteId, sites]);
  // What the panel shows: a sample measured against the live layers.
  const panelSite = useMeasuredSample(selectedSite, mapLayers);
  // The save form opens where the area panel does, and moves the same controls.
  const sitePanelShowing = (Boolean(selectedSite) && !sitePanelCollapsed) || Boolean(areaEditor);
  const canSaveAreas = admin && [ROLES.PGENRO, ROLES.LGU_ADMIN].includes(roleOf(profile));

  const hallLabel = fenceFeature?.properties.is_city ? 'City Hall' : 'Municipal Hall';

  /**
   * Back to the office: its hall once pinned, otherwise its whole LGU, or the
   * province for PGENRO.
   */
  function handleCentre() {
    if (hall) {
      setPointTarget({ position: [...hall], zoom: 17 });
      return;
    }
    setFocusTarget(fence || 'province');
    setFocusNonce((n) => n + 1);
  }

  function startPinningHall() {
    setHallCardOpen(false);
    setHallNotice('');
    setPinningHall(true);
    if (drawing) stopDrawing();
  }

  async function handleHallClick(point) {
    const refusal = refusePoint(point);
    if (refusal) {
      setHallNotice(refusal);
      return;
    }
    setHallNotice('Saving…');
    const { error } = (await onPinHall?.(point)) ?? {};
    if (error) {
      setHallNotice(error.message ?? 'The pin could not be saved.');
      return;
    }
    setHallNotice('');
    setPinningHall(false);
  }

  const toggleLayer = (id) => setLayers((current) => ({ ...current, [id]: !current[id] }));
  const toggleTool = (tool) => setOpenTool((current) => (current === tool ? null : tool));

  // ---- Drawing --------------------------------------------------------------
  /**
   * Whether a point may go where it was put, and if not, why not — in words,
   * because a click that silently does nothing reads as a click that did not
   * register.
   */
  function refusePoint(point) {
    if (fenceFeature && !containsPoint(fenceFeature.geometry, point)) {
      return `That is outside ${fenceLabel}. An LGU account draws only inside its own LGU.`;
    }
    if (!fenceFeature && !containsPoint(LAGUNA_PROVINCE.features[0].geometry, point)) {
      return 'That is outside Laguna.';
    }
    return null;
  }

  function handleShapeChange(next) {
    setShape(next);
    setDrawNotice('');
  }

  function startDrawing() {
    setDrawing(true);
    setDrawNotice('');
    // A phone has room for the map or a panel, and drawing needs the map.
    if (isMobileView) {
      closeLeftPanels();
      clearSelectedSite();
    }
  }

  function stopDrawing() {
    setDrawing(false);
    setShape(EMPTY_SHAPE);
    setDrawNotice('');
    setAreaEditor(null);
    setImportedName('');
  }

  // ---- A printed map ------------------------------------------------------------
  /**
   * The map sheet (pages/MapSheet.jsx) of this LGU — or, for PGENRO, of the
   * town in focus or the province — with the layers switched on here. In a
   * new tab, so the map stays as it was.
   */
  function openMapSheet() {
    const params = new URLSearchParams();
    const place = fence || selectedLgu;
    if (place) params.set('lgu', place);
    if (survey && mapLayers.layers[survey]) params.set('survey', survey);
    if (!layers.trees) params.set('trees', '0');
    if (!layers.sites) params.set('sites', '0');
    if (!layers.barangays) params.set('barangays', '0');
    // The base map is left to the sheet: light grey, as the CDRA sheets are,
    // whichever the office happens to be looking at.
    window.open(`/map-sheet?${params}`, '_blank', 'noopener');
  }

  // ---- Bringing an area in from a file ----------------------------------------
  /** One area from a file, on the map as a drawing and in the save form. */
  function bringIn(candidate) {
    const { shape: imported, notes } = shapeFromGeometry(candidate.geometry);
    // The same rule as drawing: an LGU account's area is inside its LGU.
    const outside = imported.points.filter((point) => refusePoint(point)).length;
    if (outside > imported.points.length * 0.1) {
      setImportError(
        fenceFeature
          ? `That area is outside ${fenceLabel}: ${outside} of its ${imported.points.length} points fall beyond the boundary. An LGU account brings in areas inside its own LGU only.`
          : `That area is outside Laguna: ${outside} of its ${imported.points.length} points fall beyond the boundary.`
      );
      return;
    }
    setImportError('');
    startDrawing();
    setShape(imported);
    setImportedName(candidate.name);
    setPointTarget({ bounds: boundsOfShape(imported) });
    openAreaEditor('new');
    setDrawNotice(['Brought in from the file. Move any point that is not right.', ...notes].join(' '));
  }

  // An area handed over from Settings → Import areas, as { name, geometry }.
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const handedOver = routerLocation.state?.importArea ?? null;
  useEffect(() => {
    if (!handedOver || !canSaveAreas) return;
    // Taken once: a refresh, or Back, does not bring it in again.
    navigate(`${routerLocation.pathname}${routerLocation.search}`, { replace: true, state: null });
    bringIn(handedOver);
    // bringIn reads the fence and the drawing as they are now; the hand-over is
    // what should run it, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handedOver, canSaveAreas]);

  // ---- Saving what is drawn ------------------------------------------------------
  /**
   * The save form. A new area takes what is drawn now; editing or proposing
   * puts the saved boundary back on the map to be moved, and the form opens
   * with the saved details.
   */
  function openAreaEditor(editMode, feature = null) {
    if (feature) {
      const saved = geometryToShape(feature.geometry);
      setShape(saved);
      // An area of several parts keeps its outline: its details are edited, not its boundary.
      setDrawing(!saved.geometry);
      setDrawNotice('');
    }
    setAreaEditor({ mode: editMode, featureId: feature?.properties.id ?? null });
    clearSelectedSite();
    lastPanelSide.current = 'right';
    if (isMobileView) closeLeftPanels();
  }

  function cancelAreaEditor() {
    // A new drawing stays on the map to keep working on; an edit puts the
    // saved boundary back as it was.
    if (areaEditor?.mode === 'new') setAreaEditor(null);
    else stopDrawing();
  }

  async function handleAreaSaved({ id }) {
    await savedAreas.reload();
    stopDrawing();
    setSelectedSiteId(id);
    setSitePanelCollapsed(false);
  }

  /** An area measured again against the live layers — after an approval moved it. */
  async function remeasureArea(id) {
    const { data } = await supabase.from('map_areas').select('id, geometry, area_m2').eq('id', id).single();
    if (!data?.geometry) return;
    const facts = await measureArea(supabase, mapLayers.layers, { geometry: data.geometry, areaM2: data.area_m2 });
    if (!facts) return;
    await supabase.rpc('set_area_layer_facts', { p_area: id, p_facts: facts });
    savedAreas.reload();
  }

  const editingRow = areaEditor?.featureId ? savedAreas.rowsById.get(areaEditor.featureId) ?? null : null;

  // ---- "View on map" ----------------------------------------------------------
  // The Action Board and the inventory send a tree here as ?tree=…&lat=…&lng=…:
  // fly to it and open it, once the trees are in, then tidy the address.
  const targetTreeId = admin ? searchParams.get('tree') : null;
  useEffect(() => {
    if (!targetTreeId || loading) return;
    const tree = allTrees.find((candidate) => String(candidate.id) === targetTreeId);
    if (tree) {
      handleSelectTree(tree);
      const position = getLatLng(tree);
      if (position) setPointTarget({ position, zoom: 19 });
    }
    setSearchParams({}, { replace: true });
    // Once per request: the handlers and setSearchParams are fresh every
    // render, and re-running on them would re-open the tree after it closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetTreeId, loading]);

  // The header's "Proposals from PGENRO" sends an area here as ?area=…: open
  // it, where the proposal waits, once the saved areas are in.
  const targetAreaId = admin ? searchParams.get('area') : null;
  useEffect(() => {
    if (!targetAreaId) return;
    const area = savedAreas.features.find((feature) => feature.properties.id === targetAreaId);
    if (!area) return;
    setSelectedSiteId(area.properties.id);
    setSitePanelCollapsed(false);
    lastPanelSide.current = 'right';
    const middle = centroidOf(area.geometry);
    if (middle) setPointTarget({ position: middle, zoom: 17 });
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetAreaId, savedAreas.features]);

  /** The survey layer laid over the map, keyed — in both maps' legends. */
  const surveyOverlay = PGENRO_OVERLAYS.find((overlay) => overlay.id === survey);
  const surveyLegend =
    surveyLayer && surveyOverlay ? (
      <div className="border-t border-slate-100 pt-1.5">
        <p className="text-[11px] font-semibold text-slate-700">
          {surveyOverlay.label} <span className="font-normal text-slate-400">· {surveyOverlay.source}</span>
        </p>
        <SurveyKey kind={survey} meta={surveyLayer.meta} className="mt-1 max-h-40 overflow-y-auto pr-1" />
      </div>
    ) : null;

  // Where the base map and survey pictures are cut from.
  const pickerCentre = centreOf((fence && boundsOfMunicipality(fence)) || LAGUNA_BOUNDS);
  const pickerProps = (tool) => ({
    centre: pickerCentre,
    open: openTool === tool,
    // Closing leaves another panel alone if choosing just opened it.
    onOpenChange: (open) => setOpenTool((current) => (open ? tool : current === tool ? null : current)),
  });
  // A coloured layer means nothing without its key: on the office map, whose
  // legend is shut until asked for, choosing one opens it.
  const chooseSurvey = (kind) => {
    setSurvey(kind);
    if (admin && kind) setOpenTool('legend');
  };

  /**
   * The office map's legend, for its corner panel: the Command Center's
   * colours, most urgent first — the order the eye should take them in.
   */
  const officeLegend = (
    <>
      {URGENCY.map((color) => (
        <div key={color} className="flex items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full border-2 border-white shadow-sm"
            style={{ backgroundColor: PIN_FILL[color] }}
          />
          <span className="text-[11px] text-slate-600">{PIN_MEANING[color]}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 border-t border-slate-100 pt-1.5">
        <span
          className="h-3 w-3 shrink-0 rounded-sm border-2"
          style={{ borderColor: LAND_COVER_STYLE.color, backgroundColor: 'rgba(34,197,94,0.22)' }}
        />
        <span className="text-[11px] text-slate-600">Land cover</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-sm border-2"
          style={{ borderColor: PLANTING_SITE_STYLE.color, backgroundColor: 'rgba(250,204,21,0.3)' }}
        />
        <span className="text-[11px] text-slate-600">Tree planting site</span>
      </div>
      {hall && (
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full bg-green-800 ring-2 ring-white" />
          <span className="text-[11px] text-slate-600">{hallLabel}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-sm border border-slate-300 bg-slate-200" />
        <span className="text-[11px] text-slate-600">Outside {fenceLabel || 'Laguna'}</span>
      </div>
      {surveyLegend}
    </>
  );

  /** Shown under an open tree on the office's map: what it needs, and the buttons to do it. */
  const treeActions =
    admin && selectedTree ? (
      <TreeActions
        tree={selectedTree}
        onDispatch={() => setDispatchTree(selectedTree)}
        onPermit={() => setPermitTree(selectedTree)}
        canAct={roleOf(profile) === ROLES.LGU_ADMIN}
      />
    ) : null;

  /** Keep the open tree and the list in step after a dispatch or a permit. */
  function updateTree(id, changes) {
    setTrees((current) => current.map((tree) => (tree.id === id ? { ...tree, ...changes } : tree)));
    setSelectedTree((current) => (current?.id === id ? { ...current, ...changes } : current));
  }

  return (
    <div
      // Both maps fill what their shell leaves under its header. Clipped,
      // not scrollable: the panels slide in from beyond the edges, and
      // nothing here should ever scroll the map out of the way.
      className={`relative h-full w-full overflow-clip ${panelShowing ? 'panel-open' : ''} ${sitePanelShowing ? 'site-panel-open' : ''} ${
        selectedSite && sitePanelCollapsed && !areaEditor ? 'site-panel-collapsed' : ''
      } ${
        drawing || pinningHall ? 'map-drawing-on' : ''
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
        /* The right-hand controls step aside while the area panel is open on
           that side, at every width. Sliding them out beside the panel left a
           column of tools floating mid-map over the very area being read;
           they come back as the panel closes. visibility as well as opacity,
           so a hidden tile cannot take a click. */
        .map-right-control {
          transition: transform 300ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease,
            visibility 200ms ease;
        }
        .site-panel-open .map-right-control {
          opacity: 0;
          visibility: hidden;
        }
        /* The area panel tucked away leaves its handle on the right edge,
           level with the column: the column steps left of it. */
        .site-panel-collapsed .map-right-control {
          transform: translateX(-2.25rem);
        }

        /* Barangay names: lettering on the map, not a box over it. */
        .leaflet-tooltip.barangay-label {
          background: transparent;
          border: 0;
          box-shadow: none;
          padding: 0;
          font-size: 10.5px;
          font-weight: 600;
          color: #334155;
          text-shadow: 0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff;
          white-space: nowrap;
        }
        .leaflet-tooltip.barangay-label::before {
          display: none;
        }
        .leaflet-tooltip.barangay-label-link {
          cursor: pointer;
          pointer-events: auto;
        }
        .leaflet-tooltip.barangay-label-link:hover {
          color: #166534;
          text-decoration: underline;
        }

        /* A pin that has just come out of a group is a new element, so this
           plays exactly when something de-clusters — on the pins that appeared,
           and not on the ones that were already standing alone. */
        @keyframes tree-pin-in {
          from { opacity: 0; transform: scale(0.3); }
          to   { opacity: 1; transform: scale(1); }
        }
        .tree-pin {
          transform-box: fill-box;
          transform-origin: center;
          animation: tree-pin-in 260ms cubic-bezier(0.2, 0, 0, 1) both;
        }
        /* Leaflet positions the icon element with a transform of its own, so
           the animation goes on the circle inside it. */
        .tree-bubble > div {
          animation: tree-pin-in 220ms cubic-bezier(0.2, 0, 0, 1) both;
        }

        /* While drawing, every click belongs to the drawing. Trees, areas and
           town outlines stop taking them, so a point placed on top of a tree
           is a point, not the tree opening. */
        .map-drawing-on .leaflet-tree-points-pane .leaflet-interactive,
        .map-drawing-on .leaflet-tree-clusters-pane .leaflet-interactive,
        .map-drawing-on .leaflet-map-sites-pane .leaflet-interactive,
        .map-drawing-on .leaflet-laguna-boundaries-pane .leaflet-interactive {
          pointer-events: none !important;
        }
        .map-drawing-on .leaflet-container {
          cursor: crosshair;
        }

        @media (prefers-reduced-motion: reduce) {
          .leaflet-top.leaflet-left,
          .map-side-control,
          .map-right-control {
            transition: none;
          }
          .tree-pin,
          .tree-bubble > div {
            animation: none;
          }
        }
      `}</style>

      {/* Map */}
      <MapContainer
        bounds={initialBounds}
        boundsOptions={{ padding: [32, 32] }}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        maxZoom={MAX_MAP_ZOOM}
        ref={mapRef}
      >
        <MapPanes />

        <TileLayer
          // Keyed so a change of basemap swaps the layer rather than leaving
          // the old tiles under the new attribution.
          key={basemapId}
          url={basemapById(basemapId).url}
          attribution={basemapById(basemapId).attribution}
          maxZoom={MAX_MAP_ZOOM}
          maxNativeZoom={MAX_NATIVE_ZOOM}
          // Where Esri has no imagery this deep, the level above, enlarged.
          eventHandlers={tileHandlers}
        />

        {/* Everything outside the area of responsibility is covered over, not
            detailed: outside Laguna for the public and PGENRO, outside the
            LGU for an LGU account. */}
        <Polygon
          positions={mask}
          pathOptions={MASK_STYLE}
          pane="laguna-mask"
          interactive={false}
        />

        {/* The PGENRO survey layer chosen, if any */}
        {surveyLayer && survey === 'soil' && surveyLayer.shapesUrl && (
          <SoilOverlay key={surveyLayer.id} url={surveyLayer.shapesUrl} classes={surveyLayer.meta?.classes} />
        )}
        {surveyLayer && survey !== 'soil' && surveyLayer.pictureUrl && surveyLayer.meta?.bounds && (
          <PictureOverlay key={surveyLayer.id} layer={surveyLayer} kind={survey} />
        )}

        {/* The barangays of the LGU in focus */}
        {layers.barangays && (fence || selectedLgu) && (
          <BarangayLayer
            municipality={fence || selectedLgu}
            color={basemapId === 'satellite' ? '#ffffff' : '#475569'}
            onSelect={selectBarangay}
          />
        )}

        {/* Cities and municipalities inside Laguna */}
        {layers.boundaries && (
          <MunicipalityLayer
            data={municipalityData}
            selected={selectedLgu}
            onSelect={handleSelectLgu}
            outlinesOnly={admin}
            outlineColor={basemapId === 'satellite' ? '#ffffff' : '#334155'}
          />
        )}

        {/* Land cover and tree planting sites — the spaces, as against the points */}
        {layers.sites && (
          <SiteLayer
            // Leaflet's GeoJSON layer is drawn once from its data; a new key
            // redraws it when an area is saved, edited or deleted.
            key={sitesKey}
            sites={sites}
            selectedId={selectedSiteId}
            onSelect={handleSelectSite}
          />
        )}

        {/* Province outline, drawn over the municipal lines */}
        <GeoJSON data={LAGUNA_PROVINCE} style={PROVINCE_STYLE} pane="laguna-boundaries" interactive={false} />

        <FocusController target={focusTarget} nonce={focusNonce} />
        <FlyToPoint target={pointTarget} />

        {/* The visitor's blue dot, and tagging from it, are for residents. The
            office map has no "where am I": it flies to the office's hall. */}
        {!admin && <UserLocationMarker onTagAttempt={handleTagAttempt} />}

        {admin && hall && (
          <Marker
            position={hall}
            icon={HALL_ICON}
            title={hallLabel}
            alt={hallLabel}
            eventHandlers={{ click: () => setHallCardOpen(true) }}
          />
        )}
        {pinningHall && <MapClick onClick={handleHallClick} />}

        {drawing && (
          <DrawLayer
            shape={shape}
            onChange={handleShapeChange}
            refusePoint={refusePoint}
            onRefused={setDrawNotice}
          />
        )}

        {/* Tagged trees, each where it was tagged; tapping one opens its panel */}
        {layers.trees && (
          <TreePins
            pins={mapPins}
            openTreeId={selectedTree?.id}
            highlighting={Boolean(highlight)}
            onSelect={handleSelectTree}
            {...(admin && { pinFill: adminPinFill, bubbleFill: adminBubbleFill, stateColours: true })}
          />
        )}
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

      {/* Fly-to-user button (outside map so clicks always work). Public only. */}
      {!admin && <FlyToUserButton mapRef={mapRef} />}

      {/* Back to the office's own area — the Command Center's centre button. */}
      {admin && (
        <button
          type="button"
          onClick={handleCentre}
          className="map-side-control absolute bottom-24 left-4 z-[400] flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-green-700 shadow-lg hover:bg-green-50 active:scale-95"
          aria-label={
            hall
              ? `Centre the map on the ${hallLabel}`
              : fenceLabel
                ? `Centre the map on ${fenceLabel}`
                : 'Centre the map on Laguna'
          }
          title={hall ? `Go to the ${hallLabel}` : fenceLabel ? `Centre on ${fenceLabel}` : 'Centre on Laguna'}
        >
          <Crosshair size={20} />
        </button>
      )}

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
          footer={treeActions}
        />
      )}

      {/* The place in focus, in full */}
      {selectedBarangay && (
        <AreaDetailPanel
          key={selectedBarangay.psgc}
          municipality={selectedBarangay.municipality}
          label={`Brgy. ${selectedBarangay.name}`}
          placeKind={`Barangay of ${selectedBarangay.municipalityLabel}`}
          facts={barangayFacts}
          totals={barangayTotals}
          showBarangays={false}
          onClose={() => setSelectedBarangay(null)}
          onCollapsedChange={setAreaPanelCollapsed}
          onRequestData={() => setRequestOpen(true)}
        />
      )}

      {!selectedBarangay && areaPanelOpen && selectedLgu && (
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
      {selectedSite && !areaEditor && (
        <SitePanel
          feature={panelSite}
          onClose={clearSelectedSite}
          onCollapsedChange={setSitePanelCollapsed}
          footer={
            admin && selectedSite.properties.saved ? (
              <div className="space-y-2">
              {areaPermission(profile, selectedSite) && (
              <AreaActions
                feature={selectedSite}
                row={savedAreas.rowsById.get(selectedSite.properties.id)}
                permission={areaPermission(profile, selectedSite)}
                proposal={savedAreas.proposals.get(selectedSite.properties.id) ?? null}
                onEdit={() => openAreaEditor('edit', selectedSite)}
                onPropose={() => openAreaEditor('propose', selectedSite)}
                onChanged={(what) => {
                  savedAreas.reload();
                  // An approved proposal may have moved the boundary: measure it again.
                  if (what === 'approved') remeasureArea(selectedSite.properties.id);
                }}
                onDeleted={() => {
                  clearSelectedSite();
                  savedAreas.reload();
                }}
              />
              )}
              {/* A sheet of this one area, with the survey layer shown now. */}
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams({ area: selectedSite.properties.id });
                  if (survey && mapLayers.layers[survey]) params.set('survey', survey);
                  window.open(`/map-sheet?${params}`, '_blank', 'noopener');
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-bold text-green-800 ring-1 ring-green-300 hover:bg-green-50"
              >
                <Printer size={14} aria-hidden="true" /> Make a map of this area
              </button>
              </div>
            ) : null
          }
        />
      )}

      {/* Saving what is drawn: the form opens where the area panel does */}
      {admin && areaEditor && (
        <Suspense fallback={null}>
          <AreaForm
            key={areaEditor.featureId ?? 'new'}
            mode={areaEditor.mode}
            initial={editingRow ? formFromRow(editingRow) : { ...emptyAreaForm(), name: importedName }}
            existing={editingRow}
            shape={shape}
            trees={trees}
            documentFolder={documentFolderOf(profile)}
            layers={mapLayers.layers}
            climateByLgu={mapLayers.climateByLgu}
            requestsPlantingSites={roleOf(profile) === ROLES.LGU_ADMIN}
            onSaved={handleAreaSaved}
            onCancel={cancelAreaEditor}
          />
        </Suspense>
      )}

      {/* Area in focus — the short badge, for when its panel is out of the way */}
      {selectedLabel && !areaPanelShowing && !admin && (
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
        {/* City / municipality selector. An LGU account has one LGU, so
            there is nothing to choose between. */}
        {!fence && (
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
        )}

        {/* What is drawn over the base map — the same list the offices have.
            The base map and the survey layer are the pictures in the bottom
            corner. */}
        {!admin && (
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleTool('layers')}
              aria-expanded={openTool === 'layers'}
              aria-controls="public-map-layers"
              className="flex w-48 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <LayersIcon size={14} aria-hidden="true" /> Map layers
            </button>
            {openTool === 'layers' && (
              <div className="absolute right-0 top-full mt-2">
                <LayersPanel
                  id="public-map-layers"
                  audience="public"
                  layers={layers}
                  onToggle={toggleLayer}
                  onClose={() => setOpenTool(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* The office's tools, in the bottom-right corner where Google Maps keeps
          them — one size for all of them. Legend and Layers open a panel to
          the left; Draw starts measuring; the two pictures are the base maps. */}
      {admin && (
        <div className="map-right-control absolute bottom-6 right-3 z-[400] flex flex-col items-end gap-2">
          <div>
            <ToolTile
              icon={ListTree}
              label="Legend"
              description="Show the legend"
              onClick={() => toggleTool('legend')}
              expanded={openTool === 'legend'}
              controls="map-legend"
            />
            {openTool === 'legend' && (
              <div className="absolute bottom-0 right-full mr-2">
                <div
                  id="map-legend"
                  role="dialog"
                  aria-label="Legend"
                  className="max-h-[calc(100vh-13rem)] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
                >
                  <div className="flex items-start">
                    <h2 className="flex-1 text-sm font-bold text-slate-800">Legend</h2>
                    <button
                      type="button"
                      onClick={() => setOpenTool(null)}
                      aria-label="Close legend"
                      className="-mr-1 -mt-1 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-2 space-y-1.5">{officeLegend}</div>
                </div>
              </div>
            )}
          </div>
          <div>
            <ToolTile
              icon={LayersIcon}
              label="Layers"
              description="Choose map layers"
              onClick={() => toggleTool('layers')}
              expanded={openTool === 'layers'}
              controls="map-layers"
            />
            {openTool === 'layers' && (
              <div className="absolute bottom-0 right-full mr-2">
                <LayersPanel
                  id="map-layers"
                  layers={layers}
                  onToggle={toggleLayer}
                  onClose={() => setOpenTool(null)}
                />
              </div>
            )}
          </div>
          <ToolTile
            icon={PencilRuler}
            label={drawing ? 'Stop' : 'Draw'}
            description={drawing ? 'Stop drawing' : 'Draw and measure an area'}
            tone="yellow"
            onClick={drawing ? stopDrawing : startDrawing}
            pressed={drawing}
          />
          {canSaveAreas && !drawing && (
            <ToolTile
              icon={Printer}
              label="Make map"
              description="Make a printable map of the layers shown"
              onClick={openMapSheet}
            />
          )}
          <SurveyPicker
            current={survey}
            onChange={chooseSurvey}
            available={mapLayers.layers}
            basemap={basemapId}
            {...pickerProps('survey')}
          />
          <BasemapPicker current={basemapId} onChange={setBasemapId} {...pickerProps('basemap')} />
        </div>
      )}

      {/* The public map's two pictures, in the same corner */}
      {!admin && (
        <div className="map-right-control absolute bottom-6 right-3 z-[400] flex flex-col items-end gap-3">
          <SurveyPicker
            current={survey}
            onChange={setSurvey}
            available={mapLayers.layers}
            basemap={basemapId}
            {...pickerProps('survey')}
          />
          <BasemapPicker current={basemapId} onChange={setBasemapId} {...pickerProps('basemap')} />
        </div>
      )}

      {/* Bringing an area in: what went wrong, or which of several to take */}
      {admin && importError && (
        <div
          role="alert"
          className="absolute bottom-6 left-1/2 z-[650] flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 items-start gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-800 shadow-2xl"
        >
          <p className="flex-1">{importError}</p>
          <button type="button" onClick={() => setImportError('')} aria-label="Dismiss" className="rounded-full p-0.5 text-red-400 hover:bg-red-50">
            <X size={16} />
          </button>
        </div>
      )}
      {/* The measurement, live, while an area is drawn */}
      {admin && drawing && (
        <div className="absolute bottom-6 left-1/2 z-[650] -translate-x-1/2">
          <MeasureBox
            shape={shape}
            notice={drawNotice}
            onUndo={() => handleShapeChange(undoLast(shape))}
            onClear={() => handleShapeChange(EMPTY_SHAPE)}
            onClose={stopDrawing}
            onSave={canSaveAreas ? () => openAreaEditor('new') : null}
            saving={Boolean(areaEditor)}
          />
        </div>
      )}

      {/* Legend — the public map's, beside the two pictures, and out of the
          way while any corner panel is open over it. The office's is behind
          the Legend tile in the corner column. */}
      {!admin && openTool === null && (
      <div className="map-right-control absolute bottom-6 right-[5.5rem] z-[400] max-w-[13rem] bg-white/95 rounded-lg shadow border border-slate-200 px-3 py-2 sm:right-24">
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
          {surveyLegend}
        </div>
      </div>
      )}

      {/* The hall: a prompt to pin it, the pinning itself, and its card */}
      {admin && canPinHall && !hall && !pinningHall && !hallPromptDismissed && (
        <div
          role="status"
          className="absolute left-1/2 top-3 z-[650] flex w-[min(30rem,calc(100%-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg"
        >
          <p className="flex-1 text-xs leading-snug text-amber-900">
            <strong>Pin your {hallLabel}.</strong> The centre button flies there once it is pinned —
            until then it shows the whole of {fenceLabel || 'your LGU'}.
          </p>
          <button
            type="button"
            onClick={startPinningHall}
            className="shrink-0 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-800"
          >
            Pin it now
          </button>
          <button
            type="button"
            onClick={() => setHallPromptDismissed(true)}
            aria-label="Later"
            className="shrink-0 rounded-full p-1 text-amber-700 hover:bg-amber-100"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {admin && pinningHall && (
        <div
          role="status"
          className="absolute left-1/2 top-3 z-[650] w-[min(30rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-green-200 bg-white px-4 py-3 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <p className="flex-1 text-xs leading-snug text-slate-700">
              <strong>Click the map where the {hallLabel} stands.</strong> Zoom in first if you need to.
            </p>
            <button
              type="button"
              onClick={() => { setPinningHall(false); setHallNotice(''); }}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
          {hallNotice && <p className="mt-2 text-xs text-amber-800">{hallNotice}</p>}
        </div>
      )}
      {admin && hall && hallCardOpen && (
        <div
          role="dialog"
          aria-label={hallLabel}
          className="absolute left-1/2 top-3 z-[650] flex w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg"
        >
          <p className="flex-1 text-xs text-slate-700">
            <strong>{fenceLabel} {hallLabel}</strong> — where the centre button flies.
          </p>
          {canPinHall && (
            <button
              type="button"
              onClick={startPinningHall}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-200 hover:bg-green-50"
            >
              Move pin
            </button>
          )}
          <button
            type="button"
            onClick={() => setHallCardOpen(false)}
            aria-label="Close"
            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

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

      {/* The office's two actions on a tree, from the Command Center */}
      {admin && dispatchTree && (
        <Suspense fallback={null}>
          <DispatchModal
            tree={dispatchTree}
            onClose={() => setDispatchTree(null)}
            onDispatched={(email) => updateTree(dispatchTree.id, { assigned_to: email })}
          />
        </Suspense>
      )}
      {admin && permitTree && (
        <Suspense fallback={null}>
          <IssuePermitModal
            isOpen
            tree={permitTree}
            onClose={() => setPermitTree(null)}
            onIssue={(tree) => updateTree(tree.id, { has_cutting_permit: true })}
          />
        </Suspense>
      )}

    </div>
  );
}
