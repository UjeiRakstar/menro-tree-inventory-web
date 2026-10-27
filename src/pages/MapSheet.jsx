import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loadWoodDensities, withWoodDensities } from '../lib/woodDensities.js';
import { Download, Loader2, Printer, X } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { isPgenro, ROLES, roleOf } from '../lib/roles.js';
import { useMapLayers } from '../hooks/useMapLayers.js';
import { useSatelliteBasemap } from '../hooks/useSatellite.js';
import { useMapAreas } from '../hooks/useMapAreas.js';
import { useOfficeProfile } from '../hooks/useOfficeProfile.js';
import { LAGUNA_MUNICIPALITIES, LAGUNA_PROVINCE, MUNICIPALITY_LIST, containsPoint, municipalityAt, municipalityNamed } from '../lib/lagunaBoundaries.js';
import { centroidOf, formatArea, geometryAreaM2 } from '../lib/areaGeometry.js';
import { hazardAreaM2, seedlingCapacity, siteAreaM2 } from '../lib/mapSites.js';
import { PGENRO_OVERLAYS } from '../lib/mapLayers.js';
import { loadGrid, loadMeasuringLayers, repaintPicture } from '../lib/layers/browser.js';
import { slopeKey, slopePicture, terrainFacts } from '../lib/layers/terrain.js';
import { ECOLOGICAL_REPORT, buildEcologicalReport } from '../lib/reports/ecological.js';
import { buildIndexReport, indexReportFor } from '../lib/reports/biodiversityIndex.js';
import { GHG_REPORT, buildGreenhouseReport } from '../lib/reports/greenhouse.js';
import { loadCbiEvents } from '../lib/news.js';
import { loadVerifiedPlans } from '../lib/lccap.js';
import { loadCommunityCounts } from '../lib/community.js';
import { loadSelfAssessment } from '../lib/cbiSelf.js';
import { LAGUNA_GRID } from '../lib/layers/grid.js';
import { areaFacts } from '../lib/layers/measure.js';
import { groundOf } from '../lib/mapAreas.js';
import { layerKey, soilColourOf, soilColours } from '../lib/layers/palette.js';
import { PLANNING_ONLY } from '../lib/namriaCover.js';
import { PROVINCE_LOGO, logoFor } from '../lib/lguLogos.js';
import pgenroLogo from '../assets/lgu-thumbs/PGENRO_LGU_logo.png';
import lspuLogo from '../assets/lgu-thumbs/LSPU_LGU_logo.png';
import greenTagLogo from '../assets/GreenTag_Logo.png';
import philippines from '../data/Philippines.geojson';
import { barangayForTree, loadBarangayIndex } from '../lib/barangayLookup.js';
import { barangayTable, carbonTable, hazardTable, landCoverTable, plantingSiteTable, tablesWorkbook } from '../lib/attributeTables.js';
import { lguFacts, officialName } from '../lib/psgc.js';
import { reportDocx } from '../lib/reportDocx.js';
import TablesView from './sheet/TablesView.jsx';
import ChapterReportView from './sheet/ChapterReportView.jsx';
import { everyRow } from '../lib/everyRow.js';
import {
  PAPERS,
  sheetBasemapsWith,
  SURVEY_TITLES,
  TREE_COLOURINGS,
  defaultTitle,
  fitView,
  graticule,
  headingOf,
  pathOf,
  scaleBar,
  scaleLabel,
  sheetLayout,
  sourcesOf,
  tilesFor,
  treeClassOf,
} from '../lib/mapSheet.js';

/**
 * A map sheet to print or save — the CDRA layout, Santa Cruz's as the
 * template (src/lib/mapSheet.js) — of the office's own LGU, or for PGENRO any
 * LGU or the whole province, with the layers chosen on the map.
 *
 * The settings live in the address (/map-sheet?lgu=…&survey=…), so the map's
 * "Make a map" opens it as the map was, and a sheet can be sent to someone as
 * a link. Printed at 100% (or saved as PDF from the print dialog), the sheet
 * is at the scale written on it.
 */

const SURVEY_KINDS = Object.keys(SURVEY_TITLES);

// The tab's own icon, a folded map, so it is told apart from the app's tabs.
const SHEET_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#15803d"/>' +
      '<path d="M6 9l6-2.5 8 2.5 6-2.5v16.5l-6 2.5-8-2.5-6 2.5z" fill="#fff"/>' +
      '<path d="M12 6.5v16.5M20 9v16.5" stroke="#15803d" stroke-width="1.6"/></svg>'
  );

/** The tab's title and icon while the sheet is open, put back after. */
function useTabIdentity(title) {
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);
  useEffect(() => {
    const link = document.querySelector('link[rel~="icon"]');
    if (!link) return undefined;
    const before = { href: link.getAttribute('href'), type: link.getAttribute('type') };
    link.setAttribute('href', SHEET_ICON);
    link.setAttribute('type', 'image/svg+xml');
    return () => {
      link.setAttribute('href', before.href);
      if (before.type) link.setAttribute('type', before.type);
    };
  }, []);
}
const FONT = 'Arial, Helvetica, sans-serif';
const BOUNDARY = '#111827';

let barangaysOnce = null;
const loadBarangays = () => {
  barangaysOnce ??= import('../data/Laguna-Barangays.geojson').then((module) => module.default);
  return barangaysOnce;
};

/** A geometry's [[south, west], [north, east]]. */
function boundsOf(geometry) {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (c[1] < south) south = c[1];
      if (c[1] > north) north = c[1];
      if (c[0] < west) west = c[0];
      if (c[0] > east) east = c[0];
    } else c.forEach(walk);
  };
  walk(geometry?.coordinates ?? []);
  return [[south, west], [north, east]];
}

/** Words in lines of at most `width` characters. */
function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** Every <image> in the sheet inlined as data, so the SVG draws onto a canvas untainted. */
async function inlineImages(svg) {
  const cache = new Map();
  await Promise.all(
    [...svg.querySelectorAll('image')].map(async (image) => {
      const href = image.getAttribute('href');
      if (!href || href.startsWith('data:')) return;
      if (!cache.has(href)) {
        cache.set(
          href,
          fetch(href, { mode: 'cors' })
            .then((response) => (response.ok ? response.blob() : null))
            .then(
              (blob) =>
                blob &&
                new Promise((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result);
                  reader.onerror = () => resolve(null);
                  reader.readAsDataURL(blob);
                })
            )
            .catch(() => null)
        );
      }
      const data = await cache.get(href);
      if (data) image.setAttribute('href', data);
      else image.remove();
    })
  );
}

/** The sheet as a PNG at 200 dpi: { blob, width, height }. */
async function sheetPng(svgElement, paper) {
  const clone = svgElement.cloneNode(true);
  await inlineImages(clone);
  const dpi = 200;
  const width = Math.round((paper.width / 25.4) * dpi);
  const height = Math.round((paper.height / 25.4) * dpi);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Hands the browser a file to save. */
function saveFile(blob, fileName) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

async function downloadPng(svgElement, paper, fileName) {
  const { blob } = await sheetPng(svgElement, paper);
  saveFile(blob, fileName);
}

/** Text safe inside a CSS string ("…"), for the printed report's running head. */
const cssString = (text) => String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

export default function MapSheet() {
  const { profile, lgu: ownLgu } = useAuth();
  const pgenro = isPgenro(profile);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const mapLayers = useMapLayers();
  const set = (key, value) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === null || value === '') next.delete(key);
      else next.set(key, String(value));
      return next;
    }, { replace: true });

  // A sheet of one saved area (?area=…): framed on it, the LGU it is in round
  // it. An office maps its own LGU's areas; PGENRO any.
  const areas = useMapAreas();
  const areaId = params.get('area');
  const ownLguName = roleOf(profile) === ROLES.LGU_ADMIN ? ownLgu?.name ?? null : null;
  const focusArea = useMemo(() => {
    const found = areaId ? areas.features.find((f) => f.properties.id === areaId && f.properties.saved) : null;
    if (!found || !found.geometry) return null;
    return pgenro || found.properties.municipality === ownLguName ? found : null;
  }, [areaId, areas.features, pgenro, ownLguName]);

  // Whose sheet: an office's own LGU, always; PGENRO's choice, or the province;
  // the area's own LGU when the sheet is of one area.
  const lguName = focusArea
    ? focusArea.properties.municipality
    : pgenro
      ? params.get('lgu') || null
      : ownLguName;
  const lgu = MUNICIPALITY_LIST.find((item) => item.name === lguName) ?? null;
  const place = lgu ? municipalityNamed(lgu.name) : LAGUNA_PROVINCE.features[0];
  const survey = SURVEY_KINDS.includes(params.get('survey')) ? params.get('survey') : null;
  const show = {
    trees: params.get('trees') !== '0',
    sites: params.get('sites') !== '0',
    barangays: params.get('barangays') !== '0',
  };
  const treeColour = TREE_COLOURINGS[params.get('treeColour')] ? params.get('treeColour') : 'one';
  const colouring = TREE_COLOURINGS[treeColour];
  const paper = PAPERS[params.get('paper')] ?? PAPERS.a4;
  const satellite = useSatelliteBasemap();
  const sheetBasemaps = useMemo(() => sheetBasemapsWith(satellite), [satellite]);
  const basemap = sheetBasemaps.find((b) => b.id === params.get('basemap')) ?? sheetBasemaps[0];
  const [title, setTitle] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  // A layer named in the link but not uploaded is not on the sheet, nor in its title.
  const layerFor = (kind) => (kind === 'slope' ? mapLayers.layers.elevation : mapLayers.layers[kind]);
  const shownSurvey = survey && layerFor(survey) ? survey : null;
  const areaTitle = focusArea
    ? `${focusArea.properties.name.toUpperCase()}${focusArea.properties.kind === 'planting-site' ? ' TREE PLANTING SITE' : ''}${
        shownSurvey ? ` — ${SURVEY_TITLES[shownSurvey].legend.toUpperCase()}` : ''
      }`
    : null;
  const titleText = title || areaTitle || defaultTitle({ survey: shownSurvey, ...show, treeColour });
  // What the office saved in Settings: its seal, its own logo, its head.
  const saved = useOfficeProfile(lgu ? lgu.psgc : pgenro ? 'pgenro' : null);
  const officeName = pgenro && !lgu
    ? 'Provincial Government Environment and Natural Resources Office (PGENRO), Laguna'
    : `${lgu?.label ?? ''} MENRO / CENRO`;
  const preparedText = preparedBy || (saved?.office_head ? `${officeName} — ${saved.office_head}` : officeName);
  // The report's letterhead: the LGU's seal (its own from Settings, else the built-in one), and the office's logo.
  const reportSeal = saved?.lgu_logo_url || (lgu ? logoFor(lgu.name) : PROVINCE_LOGO) || null;
  const reportOfficeLogo = lgu ? saved?.office_logo_url || null : null;

  // ---- What goes on it -------------------------------------------------------------
  const surveyLayer = survey ? layerFor(survey) : null;
  const [picture, setPicture] = useState(null);
  const [slopeBounds, setSlopeBounds] = useState(null);
  const [soil, setSoil] = useState(null);
  const [trees, setTrees] = useState([]);
  const [barangays, setBarangays] = useState(null);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef(null);

  useEffect(() => {
    setPicture(null);
    if (survey === 'slope' && surveyLayer) {
      // The slope map, worked out from the elevation grid over the place.
      let cancelled = false;
      const [[south, west], [north, east]] = boundsOf(place.geometry);
      loadGrid(supabase, surveyLayer)
        .then((heights) => {
          if (cancelled || !heights) return;
          const drawn = slopePicture(LAGUNA_GRID, heights, [[south, west], [north, east]]);
          setSlopeBounds(drawn.bounds);
          setPicture(drawn.url);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    if (!surveyLayer?.pictureUrl || survey === 'soil') return undefined;
    let cancelled = false;
    repaintPicture(surveyLayer.pictureUrl, survey, surveyLayer.meta?.legend).then((url) => !cancelled && setPicture(url));
    return () => {
      cancelled = true;
    };
  }, [surveyLayer, survey, place]);

  useEffect(() => {
    setSoil(null);
    if (survey !== 'soil' || !surveyLayer?.shapesUrl) return undefined;
    let cancelled = false;
    fetch(surveyLayer.shapesUrl)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => !cancelled && setSoil(json))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [surveyLayer, survey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await everyRow(() =>
        supabase
          .from('trees')
          .select('id, species, scientific_name, latitude, longitude, biodiversity_status, species_type, tree_category, dbh, merchantable_height, total_height, task_status, source')
      );
      // Each species' own wood density, for the carbon table and the GHG report.
      const densities = await loadWoodDensities(supabase);
      if (cancelled || !Array.isArray(data)) return;
      setTrees(
        withWoodDensities(data, densities)
          .map((tree) => ({ ...tree, lat: Number(tree.latitude), lng: Number(tree.longitude) }))
          .filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng) && containsPoint(place.geometry, [lat, lng]))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [place]);

  useEffect(() => {
    if (!lgu) return undefined;
    let cancelled = false;
    loadBarangays()
      .then((data) => !cancelled && setBarangays(data.features.filter((f) => f.properties.municipality === lgu.name)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lgu]);

  // ---- Layout ------------------------------------------------------------------------
  const { frame, column } = useMemo(() => sheetLayout(paper), [paper]);
  // On one area, room round it to see where it sits.
  const view = useMemo(
    () => (focusArea ? fitView(focusArea.geometry, frame, { room: 2.4 }) : fitView(place.geometry, frame)),
    [focusArea, place, frame]
  );
  const placePath = useMemo(() => pathOf(place.geometry, view.toPaper), [place, view]);
  const tiles = useMemo(() => tilesFor(view, frame, basemap), [view, frame, basemap]);
  const ticks = useMemo(() => graticule(view, frame), [view, frame]);
  const bar = scaleBar(view.scale, Math.min(40, frame.width / 4));
  const framePath = `M${frame.x} ${frame.y}h${frame.width}v${frame.height}h${-frame.width}Z`;

  // Inside lines: barangays for an LGU sheet, the towns for the province's.
  const innerLines = lgu ? (show.barangays ? barangays ?? [] : []) : LAGUNA_MUNICIPALITIES.features;
  const innerName = (feature) => (lgu ? feature.properties.barangay : feature.properties.municipality_label);
  const sites = show.sites
    ? areas.features.filter(
        (f) => f.properties.approval !== 'requested' && f.properties.approval !== 'declined' &&
          (!lgu || f.properties.municipality === lgu.name)
      )
    : [];
  const soilColour = useMemo(() => soilColours(surveyLayer?.meta?.classes ?? []), [surveyLayer]);

  // The sheet is ready to be taken as a picture once its layer is drawn.
  const loading = !mapLayers.loaded || Boolean(surveyLayer && !picture && !soil);

  // Picture placed by its bounds: [[south, west], [north, east]].
  const pictureBox = useMemo(() => {
    const bounds = survey === 'slope' ? slopeBounds : surveyLayer?.meta?.bounds;
    if (!bounds) return null;
    const [x1, y1] = view.toPaper([bounds[0][1], bounds[1][0]]);
    const [x2, y2] = view.toPaper([bounds[1][1], bounds[0][0]]);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }, [surveyLayer, view, survey, slopeBounds]);

  // ---- The tables and the report ------------------------------------------------------
  const [tab, setTab] = useState('map');
  const [indexReady, setIndexReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadBarangayIndex()
      .then(() => !cancelled && setIndexReady(true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const [brgyStats, setBrgyStats] = useState(() => new Map());
  useEffect(() => {
    if (!lgu) return undefined;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('barangay_stats').select('*').eq('lgu_psgc', lgu.psgc);
      if (!cancelled && !error && Array.isArray(data)) setBrgyStats(new Map(data.map((row) => [Number(row.barangay_psgc), row])));
    })();
    return () => {
      cancelled = true;
    };
  }, [lgu]);
  // Each tree with where it stands and where it comes from.
  const tableTrees = useMemo(
    () =>
      trees.map((tree) => ({
        ...tree,
        barangay: barangayForTree(tree),
        municipality: lgu ? lgu.name : municipalityAt([tree.lat, tree.lng]),
        origin: treeClassOf(tree, 'origin'),
      })),
    // indexReady re-runs this once the barangay boundaries are in hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trees, indexReady, lgu]
  );

  // The places the hazard and carbon tables go by: an LGU's barangays, or the
  // province's cities and municipalities.
  const places = useMemo(() => {
    if (lgu) {
      return (barangays ?? []).map((feature) => ({
        name: feature.properties.barangay,
        areaHa: (Number(feature.properties.area_km2) || 0) * 100,
        geometry: feature.geometry,
      }));
    }
    return LAGUNA_MUNICIPALITIES.features.map((feature) => ({
      name: feature.properties.municipality_label,
      key: feature.properties.municipality,
      areaHa: geometryAreaM2(feature.geometry) / 10000,
      geometry: feature.geometry,
    }));
  }, [lgu, barangays]);
  // Each place measured against PGENRO's layers — once the tables or the
  // report are first opened, so a sheet only printed never downloads the grids.
  const [measured, setMeasured] = useState({ status: 'idle', facts: null });
  const wantsFigures = tab !== 'map';
  useEffect(() => {
    if (!wantsFigures || !mapLayers.loaded || places.length === 0) return undefined;
    if (!Object.values(mapLayers.layers).some(Boolean)) {
      setMeasured({ status: 'none', facts: null });
      return undefined;
    }
    let cancelled = false;
    setMeasured((current) => (current.facts ? current : { status: 'measuring', facts: null }));
    loadMeasuringLayers(supabase, mapLayers.layers).then((grids) => {
      if (cancelled) return;
      const facts = new Map(
        places.map((placeRow) => [
          placeRow.name,
          {
            ...areaFacts(LAGUNA_GRID, placeRow.geometry, grids, { areaM2: placeRow.areaHa * 10000 }),
            terrain: grids.elevation ? terrainFacts(LAGUNA_GRID, placeRow.geometry, grids.elevation, { areaM2: placeRow.areaHa * 10000 }) : null,
          },
        ])
      );
      setMeasured({ status: 'done', facts, grids });
    });
    return () => {
      cancelled = true;
    };
  }, [wantsFigures, mapLayers.loaded, mapLayers.layers, places]);
  const scopeAreas = useMemo(
    () => areas.features.filter((f) => f.properties.saved && (!lgu || f.properties.municipality === lgu.name)),
    [areas.features, lgu]
  );
  // A saved area with no layer facts — saved before the layers were uploaded,
  // or put in straight from the database, as the training data is — is
  // measured here against the same grids, as saving it would have done, so
  // its exposure is shown rather than a dash and a narrative reading 0 ha.
  const measuredAreas = useMemo(() => {
    if (!measured.grids) return scopeAreas;
    return scopeAreas.map((feature) => {
      const props = feature.properties;
      if (props.hazards || props.elevationRange || props.soilType) return feature;
      const facts = areaFacts(LAGUNA_GRID, feature.geometry, measured.grids, { areaM2: siteAreaM2(feature) });
      return { ...feature, properties: { ...props, ...groundOf(facts, null) } };
    });
  }, [scopeAreas, measured.grids]);
  const tables = useMemo(() => {
    const placeLabel = lgu ? 'Barangay' : 'City / municipality';
    const labelOf = new Map(places.map((placeRow) => [placeRow.key ?? placeRow.name, placeRow.name]));
    return [
      lgu ? barangayTable({ barangays: barangays ?? [], stats: brgyStats, trees: tableTrees, areas: scopeAreas }) : null,
      hazardTable({ places, measured: measured.facts, placeLabel }),
      carbonTable({
        places,
        trees: tableTrees,
        placeLabel,
        placeOf: lgu ? (tree) => tree.barangay : (tree) => labelOf.get(tree.municipality),
      }),
      landCoverTable(measuredAreas),
      plantingSiteTable(measuredAreas),
    ].filter(Boolean);
  }, [lgu, barangays, brgyStats, tableTrees, scopeAreas, measuredAreas, places, measured.facts]);
  const TABLE_NAMES = { 'land-cover': 'landCover', 'planting-sites': 'plantingSites' };
  const tablesByKey = Object.fromEntries(tables.map((table) => [TABLE_NAMES[table.key] ?? table.key, table]));
  const climate = lgu ? mapLayers.climateByLgu.get(lgu.psgc) ?? null : null;
  // The one report (27 October): the Ecological Profile and Tree Inventory
  // Report, in place of the six the sheet offered. Its phenology needs each
  // species' months (the RISE profiles) and what the field officers observed.
  const [phenologyData, setPhenologyData] = useState({ profiles: [], records: [] });
  useEffect(() => {
    if (tab !== 'report') return undefined;
    let cancelled = false;
    (async () => {
      const [profiles, records] = await Promise.all([
        supabase.from('species_profiles').select('species, scientific_name, flowering_months, fruiting_months'),
        everyRow(() => supabase.from('phenology_records').select('tree_id, flowering_status, fruiting_status, observed_at')),
      ]);
      if (cancelled) return;
      setPhenologyData({
        profiles: Array.isArray(profiles?.data) ? profiles.data : [],
        records: Array.isArray(records?.data) ? records.data : [],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);
  const placeLabel = lgu ? 'Barangay' : 'City / municipality';
  const populationOf = useMemo(() => {
    if (lgu) {
      const byName = new Map((tablesByKey.barangays?.rows ?? []).map((row) => [row.name, row.population]));
      return (name) => byName.get(name) ?? null;
    }
    const byLabel = new Map(places.map((p) => [p.name, MUNICIPALITY_LIST.find((item) => item.name === p.key)?.psgc]));
    return (name) => lguFacts(byLabel.get(name))?.population2024 ?? null;
    // tablesByKey is rebuilt from tables each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lgu, tables, places]);
  const urbanOf = useMemo(() => {
    const byName = new Map((tablesByKey.barangays?.rows ?? []).map((row) => [row.name, row.urban]));
    return (name) => byName.get(name) ?? null;
    // tablesByKey is rebuilt from tables each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);
  const placeOf = useMemo(() => {
    if (lgu) return (tree) => tree.barangay;
    const labelOf = new Map(places.map((placeRow) => [placeRow.key ?? placeRow.name, placeRow.name]));
    return (tree) => labelOf.get(tree.municipality);
  }, [lgu, places]);
  const ecoReport = useMemo(
    () =>
      buildEcologicalReport({
        place: lgu,
        places,
        measured: measured.facts,
        grids: measured.grids ?? null,
        placeLabel,
        tables: tablesByKey,
        trees: tableTrees,
        placeOf,
        climate,
        populationOf,
        urbanOf,
        profiles: phenologyData.profiles,
        phenology: phenologyData.records,
      }),
    // tablesByKey is rebuilt from tables each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lgu, places, measured.facts, measured.grids, placeLabel, tables, tableTrees, placeOf, climate, populationOf, urbanOf, phenologyData]
  );

  // Which report (27 October): the Ecological Profile; the City Biodiversity
  // Index for a city, the Urban Biodiversity Index for a municipality, each
  // with the Ecological Profile as its introduction (an LGU's sheet only);
  // or the greenhouse gas report.
  const [reportKind, setReportKind] = useState('ecological');
  const reportChoices = [
    ECOLOGICAL_REPORT,
    ...(lgu ? [indexReportFor(lgu)] : []),
    GHG_REPORT,
  ];
  const chosenKind = reportChoices.some((choice) => choice.id === reportKind) ? reportKind : 'ecological';
  const indexKind = chosenKind === 'cbi' || chosenKind === 'ubi';
  const reportYear = new Date().getFullYear();
  const lguPsgc = lgu?.psgc ?? null;
  const [indexData, setIndexData] = useState({ newsPosts: null, climatePlans: null, communityScientists: null, self: {}, selfMissing: false });
  useEffect(() => {
    if (tab !== 'report' || !indexKind || !lguPsgc) return undefined;
    let cancelled = false;
    Promise.all([loadCbiEvents(), loadVerifiedPlans(), loadCommunityCounts(lguPsgc), loadSelfAssessment(lguPsgc, reportYear)]).then(
      ([newsPosts, climatePlans, counts, self]) => {
        if (cancelled) return;
        setIndexData({
          newsPosts,
          climatePlans,
          communityScientists: counts ? Number(counts.taggers ?? counts.residents) : null,
          self: self.entries,
          selfMissing: self.missing,
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [tab, indexKind, lguPsgc, reportYear]);
  // The place's cutting permits, for the GHG report's losses.
  const [permits, setPermits] = useState([]);
  useEffect(() => {
    if (tab !== 'report' || chosenKind !== 'ghg') return undefined;
    let cancelled = false;
    (async () => {
      const { data } = await everyRow(() =>
        supabase.from('permits').select('id, tree_id, status, created_at, number_of_trees, lgu_psgc')
      );
      if (cancelled) return;
      const rows = Array.isArray(data) ? data : [];
      setPermits(lguPsgc ? rows.filter((permit) => Number(permit.lgu_psgc) === lguPsgc) : rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, chosenKind, lguPsgc]);
  const report = useMemo(() => {
    if (chosenKind === 'ecological') return ecoReport;
    const ctx = {
      place: lgu,
      places,
      measured: measured.facts,
      grids: measured.grids ?? null,
      placeLabel,
      tables: tablesByKey,
      trees: tableTrees,
      placeOf,
      climate,
      populationOf,
      urbanOf,
      profiles: phenologyData.profiles,
      phenology: phenologyData.records,
      features: measuredAreas,
      year: reportYear,
    };
    if (chosenKind === 'ghg') return buildGreenhouseReport({ ...ctx, permits });
    return buildIndexReport({ ...ctx, ...indexData });
    // tablesByKey is rebuilt from tables each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenKind, ecoReport, lgu, places, measured.facts, measured.grids, placeLabel, tables, tableTrees, placeOf, climate, populationOf, urbanOf, phenologyData, measuredAreas, reportYear, permits, indexData]);

  // The office's edits, by report and section; a section not edited follows the figures.
  const [edits, setEdits] = useState({});
  const [reportNote, setReportNote] = useState(null);
  const [reportBusy, setReportBusy] = useState('');
  const editKey = (key) => `${report.kind}/${key}`;
  const sections = report.sections.map((section) => ({ ...section, text: edits[editKey(section.key)] ?? section.text }));
  const reportTitle = report.title;

  async function improveReport() {
    setReportBusy('improve');
    setReportNote(null);
    const placeName = officialName(lgu);
    const { data, error } = await supabase.functions.invoke('improve-report', { body: { place: placeName, sections } });
    setReportBusy('');
    if (error || !Array.isArray(data?.sections)) {
      setReportNote({
        ok: false,
        text: /not found|404|Failed to send/i.test(error?.message ?? '')
          ? 'Improve with AI is not deployed yet: deploy supabase/functions/improve-report.'
          : data?.error ?? error?.message ?? 'The AI could not improve it.',
      });
      return;
    }
    setEdits((current) => ({ ...current, ...Object.fromEntries(data.sections.map((section) => [editKey(section.key), section.text])) }));
    setReportNote({ ok: true, text: 'Improved by Gemini. Read it through before you use it: every figure should still match the tables.' });
  }

  // The report's maps: the sheet drawn with each one's layer in turn —
  // elevation, slope, the trees, flood, landslide — the trees and the areas
  // on or off as each map asks, each taken as a picture, and the sheet put
  // back as the office left it.
  const [mapImages, setMapImages] = useState({});
  const [capture, setCapture] = useState(null);
  useEffect(() => {
    // A different sheet — paper, place or base map — needs its maps drawn again.
    setMapImages((current) => {
      Object.values(current).forEach((image) => image?.url && URL.revokeObjectURL(image.url));
      return {};
    });
  }, [paper, lguName, areaId, basemap.id]);
  useEffect(() => {
    if (tab !== 'report' || capture || !mapLayers.loaded) return;
    const missing = report.maps.filter((map) => !mapImages[map.key]);
    if (missing.length === 0) return;
    // A layer not uploaded has no map to draw; the report says so.
    const unavailable = missing.filter((map) => map.survey && !layerFor(map.survey));
    if (unavailable.length) {
      setMapImages((current) => ({ ...current, ...Object.fromEntries(unavailable.map((map) => [map.key, { unavailable: true }])) }));
      return;
    }
    setCapture({
      queue: missing,
      restore: { survey: params.get('survey'), treeColour: params.get('treeColour'), trees: params.get('trees'), sites: params.get('sites') },
    });
    // layerFor and params are read as they are now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, report, mapImages, capture, mapLayers.loaded]);
  useEffect(() => {
    if (!capture) return undefined;
    const [map] = capture.queue;
    const putBack = (next, key, value) => (value === null || value === undefined ? next.delete(key) : next.set(key, value));
    if (!map) {
      setParams((current) => {
        const next = new URLSearchParams(current);
        putBack(next, 'survey', capture.restore.survey);
        putBack(next, 'treeColour', capture.restore.treeColour);
        putBack(next, 'trees', capture.restore.trees);
        putBack(next, 'sites', capture.restore.sites);
        return next;
      }, { replace: true });
      setCapture(null);
      return undefined;
    }
    const wantSurvey = map.survey ?? null;
    const wantColour = map.treeColour ?? null;
    // Trees: shown when the map colours them, hidden when it says so, else as the office left them.
    const wantTrees = map.trees === false ? '0' : wantColour ? null : params.get('trees');
    const wantSites = map.sites === false ? '0' : map.sites === true ? null : params.get('sites');
    if (
      (params.get('survey') ?? null) !== wantSurvey ||
      (params.get('treeColour') ?? null) !== wantColour ||
      (params.get('trees') ?? null) !== (wantTrees ?? null) ||
      (params.get('sites') ?? null) !== (wantSites ?? null)
    ) {
      setParams((current) => {
        const next = new URLSearchParams(current);
        putBack(next, 'survey', wantSurvey);
        putBack(next, 'treeColour', wantColour);
        putBack(next, 'trees', wantTrees);
        putBack(next, 'sites', wantSites);
        return next;
      }, { replace: true });
      return undefined;
    }
    if (loading || !sheetRef.current) return undefined;
    let cancelled = false;
    // A moment for the sheet to draw with its new layer before it is taken.
    const timer = setTimeout(async () => {
      let image;
      try {
        const png = await sheetPng(sheetRef.current, paper);
        image = { url: URL.createObjectURL(png.blob), width: png.width, height: png.height };
      } catch {
        image = { failed: true };
      }
      if (cancelled) return;
      setMapImages((current) => ({ ...current, [map.key]: image }));
      setCapture((current) => current && { ...current, queue: current.queue.slice(1) });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [capture, params, loading, paper]);

  async function downloadDocx() {
    setReportBusy('docx');
    setReportNote(null);
    try {
      const figuresByKey = {};
      for (const spec of report.maps) {
        const image = mapImages[spec.key];
        figuresByKey[spec.key] = image?.url
          ? { data: await (await fetch(image.url)).arrayBuffer(), width: image.width, height: image.height, caption: spec.caption }
          : { caption: spec.caption };
      }
      const textOf = new Map(sections.map((section) => [section.key, section.text]));
      // The letterhead's pictures; one that cannot be fetched is left out, not the report.
      const logos = [];
      for (const url of [reportSeal, reportOfficeLogo]) {
        if (!url) continue;
        try {
          logos.push(await (await fetch(url)).arrayBuffer());
        } catch {
          // Left out.
        }
      }
      const blob = await reportDocx({
        logos,
        heading: headingOf(lgu),
        title: reportTitle,
        preparedBy: preparedText,
        chapters: report.chapters,
        figuresByKey,
        textOf: (section) => textOf.get(section.key) ?? section.text,
      });
      const reportName = report.title.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/\s+/g, '-');
      saveFile(blob, `${fileStem}_${reportName}.docx`);
    } catch (failure) {
      setReportNote({ ok: false, text: `The document could not be made: ${failure.message}` });
    } finally {
      setReportBusy('');
    }
  }

  // The report's tables as an Excel file.
  async function downloadReportExcel() {
    setReportBusy('xlsx');
    setReportNote(null);
    try {
      const blob = await tablesWorkbook(report.tables, { lgu, preparedBy: preparedText });
      saveFile(blob, `${fileStem}_Report-tables.xlsx`);
    } catch (failure) {
      setReportNote({ ok: false, text: `The Excel file could not be made: ${failure.message}` });
    } finally {
      setReportBusy('');
    }
  }

  const [excelBusy, setExcelBusy] = useState(false);
  async function downloadExcel() {
    setExcelBusy(true);
    try {
      const blob = await tablesWorkbook(tables, { lgu, preparedBy: preparedText });
      saveFile(blob, `${fileStem}_Tables.xlsx`);
    } finally {
      setExcelBusy(false);
    }
  }

  // ---- The column ----------------------------------------------------------------------
  const pad = 3;
  const inner = { x: column.x + pad, width: column.width - pad * 2 };
  const textMid = column.x + column.width / 2;
  const big = paper.id === 'a3' ? 1.35 : 1;
  const chars = Math.floor(column.width / (1.9 * big));

  const legend = [];
  legend.push({ kind: 'line', label: lgu ? `${lgu.isCity ? 'City' : 'Municipal'} boundary` : 'Provincial boundary', stroke: BOUNDARY, width: 0.6 });
  if (innerLines.length) legend.push({ kind: 'line', label: lgu ? 'Barangay boundary' : 'City / municipal boundary', stroke: '#475569', width: 0.25, dash: '1 0.8' });
  if (show.sites) {
    legend.push({ kind: 'area', label: 'Land cover', stroke: '#15803d', fill: 'rgba(34,197,94,0.25)' });
    legend.push({ kind: 'area', label: 'Tree planting site', stroke: '#ca8a04', fill: 'rgba(250,204,21,0.35)' });
  }
  if (show.trees) {
    // Each class with a tree in it, and how many, in the legend.
    const counts = new Map();
    for (const tree of trees) {
      const id = treeClassOf(tree, treeColour);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const cls of colouring.classes) {
      if (treeColour !== 'one' && !counts.get(cls.id)) continue;
      legend.push({ kind: 'dot', label: treeColour === 'one' ? cls.label : `${cls.label} (${counts.get(cls.id)})`, fill: cls.fill });
    }
  }
  const surveyKey = surveyLayer ? (survey === 'slope' ? slopeKey() : layerKey(survey, surveyLayer.meta)) : [];

  // Running down the column.
  let y = column.y + pad;
  const blocks = [];
  const seal = saved?.lgu_logo_url || (lgu ? logoFor(lgu.name) : PROVINCE_LOGO);
  const sealSize = 17 * big;
  if (seal) {
    blocks.push(<image key="seal" href={seal} x={textMid - sealSize / 2} y={y} width={sealSize} height={sealSize} />);
    y += sealSize + 2.5;
  }
  headingOf(lgu).forEach((line, i) => {
    blocks.push(
      <text key={`h${i}`} x={textMid} y={y + 2.4 * big} textAnchor="middle" fontSize={(i === 0 ? 2.6 : 2.1) * big} fontWeight={i === 0 ? 700 : 400}>
        {line}
      </text>
    );
    y += (i === 0 ? 3.3 : 2.8) * big;
  });
  y += 4 * big;
  const titleLines = wrap(titleText.toUpperCase(), Math.floor(chars * 0.62));
  titleLines.forEach((line, i) => {
    blocks.push(
      <text key={`t${i}`} x={textMid} y={y + 3.4 * big} textAnchor="middle" fontSize={3.4 * big} fontWeight={700}>
        {line}
      </text>
    );
    y += 4.3 * big;
  });
  y += 4 * big;

  // Legend.
  blocks.push(<text key="lg" x={inner.x} y={y + 2.4 * big} fontSize={2.3 * big} fontWeight={700}>LEGEND</text>);
  y += 4 * big;
  const row = 3 * big;
  const half = inner.width / 2;
  const legendRows = [...legend];
  legendRows.forEach((item, i) => {
    const lx = inner.x + (i % 2) * half;
    const ly = y + Math.floor(i / 2) * row;
    blocks.push(
      <g key={`l${i}`}>
        {item.kind === 'line' && <line x1={lx} y1={ly + 1.1} x2={lx + 4} y2={ly + 1.1} stroke={item.stroke} strokeWidth={item.width} strokeDasharray={item.dash} />}
        {item.kind === 'area' && <rect x={lx} y={ly} width={4} height={2.2} fill={item.fill} stroke={item.stroke} strokeWidth={0.3} />}
        {item.kind === 'dot' && <circle cx={lx + 2} cy={ly + 1.1} r={0.8} fill={item.fill} stroke="#fff" strokeWidth={0.2} />}
        <text x={lx + 5} y={ly + 1.8} fontSize={1.8 * big}>{item.label}</text>
      </g>
    );
  });
  y += Math.ceil(legendRows.length / 2) * row + 1.5;
  if (surveyKey.length) {
    blocks.push(
      <text key="sk" x={inner.x} y={y + 2} fontSize={1.9 * big} fontWeight={700}>
        {SURVEY_TITLES[survey].legend}
      </text>
    );
    y += 3.2 * big;
    const perColumn = Math.ceil(surveyKey.length / 2);
    surveyKey.forEach((item, i) => {
      const lx = inner.x + Math.floor(i / perColumn) * half;
      const ly = y + (i % perColumn) * row;
      blocks.push(
        <g key={`s${i}`}>
          <rect x={lx} y={ly} width={4} height={2.2} fill={item.colour} stroke="#64748b" strokeWidth={0.15} />
          <text x={lx + 5} y={ly + 1.8} fontSize={1.7 * big}>{wrap(item.label, Math.floor(chars / 2.3))[0]}</text>
        </g>
      );
    });
    y += perColumn * row + 1.5;
  }

  // The area itself, when the sheet is of one: what the layers say of it.
  if (focusArea) {
    const props = focusArea.properties;
    const areaM2 = siteAreaM2(focusArea);
    const exposure = (kind) => {
      const m2 = hazardAreaM2(focusArea, kind);
      if (m2 === null) return 'Not assessed';
      return m2 <= 0 ? 'None mapped' : `${formatArea(m2, m2 >= 10000 ? 'ha' : 'm2')} (${Math.round((m2 / areaM2) * 100)}%)`;
    };
    const seedlings = props.kind === 'planting-site' ? seedlingCapacity(areaM2, props.spacingM) : null;
    const facts = [
      ['Area', formatArea(areaM2, areaM2 >= 10000 ? 'ha' : 'm2')],
      [props.kind === 'planting-site' ? 'Kind' : 'Land cover', props.kind === 'planting-site' ? 'Tree planting site' : props.coverLabel ?? '—'],
      ['Barangay', props.barangay ?? '—'],
      ['Soil', props.soilType ?? 'Not recorded'],
      ['Elevation', props.elevationRange ? `${props.elevationType ?? ''} ${props.elevationRange.min}–${props.elevationRange.max} m`.trim() : props.elevationType ?? 'Not recorded'],
      ['Flood exposure', exposure('flood')],
      ['Landslide exposure', exposure('landslide')],
      ...(props.kind === 'planting-site'
        ? [
            ['Recommended', (props.recommended ?? []).map((tree) => tree.common).join(', ') || '—'],
            ['Room for', seedlings ? `about ${seedlings.toLocaleString('en-US')} seedlings at ${props.spacingM} m` : '—'],
          ]
        : []),
    ];
    blocks.push(<text key="af" x={inner.x} y={y + 2.4 * big} fontSize={2.3 * big} fontWeight={700}>THE AREA</text>);
    y += 4 * big;
    facts.forEach(([name, value], i) => {
      const lines = wrap(value, Math.floor(chars * 0.62));
      blocks.push(
        <g key={`fact${i}`}>
          <text x={inner.x} y={y + 1.8 * big} fontSize={1.8 * big} fontWeight={700}>{name}</text>
          {lines.map((line, j) => (
            <text key={j} x={inner.x + inner.width * 0.36} y={y + 1.8 * big + j * 2.3 * big} fontSize={1.8 * big}>{line}</text>
          ))}
        </g>
      );
      y += Math.max(1, lines.length) * 2.3 * big + 0.6;
    });
    y += 2;
  }

  // Locator maps: Laguna with the LGU, and the Philippines with Laguna.
  const locatorSize = (inner.width - 2) / 2;
  const locators = [
    { key: 'laguna', box: { x: inner.x, y, width: locatorSize, height: locatorSize }, geometry: LAGUNA_PROVINCE.features[0].geometry },
    { key: 'ph', box: { x: inner.x + locatorSize + 2, y, width: locatorSize, height: locatorSize }, geometry: philippines.features[0].geometry },
  ];
  const locatorBlocks = locators.map(({ key, box, geometry }) => {
    const small = fitView(geometry, { ...box, x: box.x + 1, y: box.y + 1, width: box.width - 2, height: box.height - 2 });
    return (
      <g key={key}>
        <defs>
          <clipPath id={`clip-${key}`}>
            <rect x={box.x} y={box.y} width={box.width} height={box.height} />
          </clipPath>
        </defs>
        <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="#eaf4fb" stroke="#334155" strokeWidth={0.25} />
        <g clipPath={`url(#clip-${key})`}>
          {key === 'laguna' ? (
            <>
              {LAGUNA_MUNICIPALITIES.features.map((f) => (
                <path key={f.properties.municipality} d={pathOf(f.geometry, small.toPaper)} fillRule="evenodd"
                  fill={lgu && f.properties.municipality === lgu.name ? '#f97316' : '#e9d5ff'} stroke="#7c3aed" strokeWidth={0.1} />
              ))}
              {!lgu && <path d={pathOf(LAGUNA_PROVINCE.features[0].geometry, small.toPaper)} fill="#f97316" fillOpacity={0.8} stroke="#111" strokeWidth={0.2} />}
            </>
          ) : (
            <>
              <path d={pathOf(geometry, small.toPaper)} fill="#f1f5f9" stroke="#64748b" strokeWidth={0.12} fillRule="evenodd" />
              <path d={pathOf(LAGUNA_PROVINCE.features[0].geometry, small.toPaper)} fill="#f97316" stroke="#c2410c" strokeWidth={0.2} />
              {(() => {
                const [cx, cy] = small.toPaper([121.35, 14.25]);
                return <rect x={cx - 1.2} y={cy - 1.2} width={2.4} height={2.4} fill="none" stroke="#dc2626" strokeWidth={0.3} />;
              })()}
            </>
          )}
        </g>
        <text x={box.x + box.width / 2} y={box.y + box.height + 2} textAnchor="middle" fontSize={1.6 * big}>
          {key === 'laguna' ? (lgu ? `${lgu.label} in Laguna` : 'Laguna') : 'Laguna in the Philippines'}
        </text>
      </g>
    );
  });
  y += locatorSize + 4.5;

  // Who made it, and from what — pinned to the foot of the column.
  const footLines = [
    'Projection: WGS 84 / Pseudo-Mercator (EPSG:3857)',
    'Datum: WGS 84',
    ...wrap(`Data sources: ${sourcesOf({ survey: surveyLayer ? survey : null, trees: show.trees, sites: show.sites, basemap: basemap.id })}`, Math.floor(chars * 1.15)),
    ...wrap(PLANNING_ONLY, Math.floor(chars * 1.15)),
  ];
  const footHeight = footLines.length * 2.3 * big + 3;
  const footY = column.y + column.height - footHeight;
  const preparedLines = wrap(preparedText, Math.floor(chars * 1.1));
  const preparedHeight = 9 * big + 3 + preparedLines.length * 2.4 * big + 6;
  const preparedY = footY - preparedHeight;
  const logos = [
    PROVINCE_LOGO,
    pgenroLogo,
    ...(lgu ? [saved?.lgu_logo_url || logoFor(lgu.name)].filter(Boolean) : []),
    ...(lgu && saved?.office_logo_url ? [saved.office_logo_url] : []),
    lspuLogo,
    greenTagLogo,
  ];
  const logoSize = 8 * big;
  const logoGap = Math.min(3, (inner.width - logos.length * logoSize) / Math.max(1, logos.length - 1));
  const logosWidth = logos.length * logoSize + (logos.length - 1) * logoGap;
  const generated = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const crowded = y > preparedY;

  // ---- Controls ------------------------------------------------------------------------
  const control = 'mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm';
  const label = 'block text-xs font-semibold text-slate-600';
  const fileStem = `${(lgu?.label ?? 'Laguna').replace(/\s+/g, '-')}_${titleText.replace(/[^A-Za-z]+/g, '-').replace(/^-|-$/g, '')}`;
  const fileName = `${fileStem}.png`;
  const titleCase = (text) => text.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  useTabIdentity(`${titleCase(titleText)} — ${lgu?.label ?? 'Laguna'} · Green Tag`);

  /**
   * Back to the work it was opened from: the tab closes. A tab the page did
   * not open itself cannot be closed by it, and then it goes to the map.
   */
  function closeSheet() {
    window.close();
    setTimeout(() => {
      if (!window.closed) navigate('/map');
    }, 200);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-green-800 px-4 py-2.5 text-white shadow-md">
        <img src={greenTagLogo} alt="" aria-hidden="true" className="h-7 w-7" />
        <span className="text-sm font-extrabold tracking-wide">GREEN TAG</span>
        <h1 className="text-sm font-normal text-green-100">Make a map</h1>
        <span className="flex-1" />
        <button
          type="button"
          onClick={closeSheet}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X size={16} aria-hidden="true" /> Close
        </button>
      </header>
      <div role="tablist" aria-label="Map, tables and report" className="flex gap-1 border-b border-slate-200 bg-white px-4 print:hidden">
        {[
          ['map', 'Map'],
          ['tables', 'Attribute tables'],
          ['report', 'Report'],
        ].map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === id ? 'border-green-700 text-green-800' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
      <style>{tab === 'map'
        ? `@media print {
            @page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }
            body * { visibility: hidden !important; }
            .map-sheet, .map-sheet * { visibility: visible !important; }
            .map-sheet { position: fixed; left: 0; top: 0; width: ${paper.width}mm; height: ${paper.height}mm; box-shadow: none !important; }
          }`
        : tab === 'report'
        ? // The report flows over as many A4 pages as it needs; the margins
          // carry the running head, the planning line and the page number.
          `@media print {
            @page {
              size: 210mm 297mm;
              margin: 16mm 15mm 18mm 15mm;
              @top-left { content: "${cssString(`${headingOf(lgu)[0]} · ${reportTitle}`)}"; font: 7.5pt sans-serif; color: #64748b; }
              @bottom-left { content: "For planning purposes only. Not a land title, survey plan or proof of ownership."; font: 7pt sans-serif; color: #94a3b8; }
              @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7pt sans-serif; color: #94a3b8; }
            }
            @page :first { @top-left { content: none; } }
            body * { visibility: hidden !important; }
            .print-target, .print-target * { visibility: visible !important; }
            .print-target { position: absolute; left: 0; top: 0; width: 100%; }
            .print-target * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }`
        : `@media print {
            @page { size: ${tab === 'tables' ? '297mm 210mm' : '210mm 297mm'}; margin: 0; }
            body * { visibility: hidden !important; }
            .print-target, .print-target * { visibility: visible !important; }
            .print-target { position: absolute; left: 0; top: 0; width: 100%; }
            .paper { break-after: page; min-height: calc(${tab === 'tables' ? 210 : 297}mm - 1mm) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .paper:last-child { break-after: auto; }
          }`}</style>
      {tab === 'tables' && (
        <div className="p-6">
          <TablesView
            heading={headingOf(lgu)}
            title={titleText}
            preparedBy={preparedText}
            tables={tables}
            chooseLgu={!lgu}
            measuring={measured.status}
            onExcel={downloadExcel}
            exporting={excelBusy}
          />
        </div>
      )}
      {tab === 'report' && (
        <div className="p-6">
          <div role="radiogroup" aria-label="Which report" className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 print:hidden">
            <span className="text-sm font-semibold text-slate-600">Report:</span>
            {reportChoices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                role="radio"
                aria-checked={chosenKind === choice.id}
                onClick={() => {
                  setReportKind(choice.id);
                  setReportNote(null);
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${
                  chosenKind === choice.id ? 'bg-green-700 text-white ring-green-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {choice.id === 'ecological' ? 'Ecological profile and tree inventory' : choice.label}
              </button>
            ))}
            {indexKind && indexData.selfMissing && (
              <span className="text-xs text-amber-800">The self-assessment needs supabase/cbi_ubi.sql to be run (step 38).</span>
            )}
            {indexKind && !indexData.selfMissing && (
              <span className="text-xs text-slate-500">The office&apos;s self-assessment is in Settings.</span>
            )}
          </div>
          <ChapterReportView
            heading={headingOf(lgu)}
            title={reportTitle}
            preparedBy={preparedText}
            report={report}
            sections={sections}
            mapImages={Object.fromEntries(Object.entries(mapImages).map(([key, image]) => [key, image?.url ?? null]))}
            unavailable={Object.keys(mapImages).filter((key) => mapImages[key]?.unavailable)}
            failed={Object.keys(mapImages).filter((key) => mapImages[key]?.failed)}
            capturing={capture?.queue?.[0]?.key ?? null}
            measuring={measured.status}
            lgu={Boolean(lgu)}
            onChange={(key, text) => setEdits((current) => ({ ...current, [editKey(key)]: text }))}
            onRewrite={() => {
              setEdits({});
              setReportNote(null);
            }}
            onImprove={improveReport}
            onDocx={downloadDocx}
            onXlsx={downloadReportExcel}
            busy={reportBusy}
            note={reportNote}
            seal={reportSeal}
            officeLogo={reportOfficeLogo}
          />
        </div>
      )}
    {/* The map stays mounted behind the other tabs: the report takes its picture. */}
    <div className={tab === 'map' ? 'flex flex-1 flex-col gap-4 p-6 lg:flex-row lg:items-start' : 'hidden'}>

      <aside aria-label="Map sheet settings" className="w-full space-y-3 rounded-xl border border-slate-200 bg-white p-4 lg:w-72 lg:shrink-0">
        <h2 className="text-lg font-bold text-slate-900">Map settings</h2>
        <p className="text-xs text-slate-500">
          The CDRA map layout, Santa Cruz&apos;s as the template. Print it at 100%, or choose “Save as PDF” in the print
          dialog, and it is at the scale written on it.
        </p>
        {focusArea && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-900 ring-1 ring-green-200">
            A map of <strong>{focusArea.properties.name}</strong>, {focusArea.properties.municipality}.{' '}
            <button type="button" onClick={() => set('area', null)} className="font-semibold underline">
              Map the whole LGU instead
            </button>
          </p>
        )}
        {pgenro && !focusArea && (
          <label className={label}>
            City / municipality
            <select value={lguName ?? ''} onChange={(e) => set('lgu', e.target.value || null)} className={control}>
              <option value="">All of Laguna (the province)</option>
              {MUNICIPALITY_LIST.map((item) => (
                <option key={item.name} value={item.name}>{item.label}</option>
              ))}
            </select>
          </label>
        )}
        <label className={label}>
          Survey layer
          <select value={survey ?? ''} onChange={(e) => set('survey', e.target.value || null)} className={control}>
            <option value="">None</option>
            {PGENRO_OVERLAYS.map((overlay) => (
              <option key={overlay.id} value={overlay.id} disabled={!mapLayers.layers[overlay.id]}>
                {overlay.label}{mapLayers.layers[overlay.id] ? '' : ' — not uploaded yet'}
              </option>
            ))}
            <option value="slope" disabled={!mapLayers.layers.elevation}>
              Slope (FLUP classes){mapLayers.layers.elevation ? '' : ' — needs the elevation layer'}
            </option>
          </select>
        </label>
        <fieldset className="space-y-1">
          <legend className={label}>On the map</legend>
          {[
            ['trees', 'Tagged trees'],
            ['sites', 'Land cover and planting sites'],
            ...(lgu ? [['barangays', 'Barangay boundaries']] : []),
          ].map(([key, text]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={show[key]} onChange={() => set(key, show[key] ? '0' : null)} />
              {text}
            </label>
          ))}
        </fieldset>
        {show.trees && (
          <label className={label}>
            Colour the trees by
            <select value={treeColour} onChange={(e) => set('treeColour', e.target.value === 'one' ? null : e.target.value)} className={control}>
              {Object.entries(TREE_COLOURINGS).map(([id, c]) => (
                <option key={id} value={id}>{c.label}</option>
              ))}
            </select>
          </label>
        )}
        <label className={label}>
          Base map
          <select value={basemap.id} onChange={(e) => set('basemap', e.target.value)} className={control}>
            {sheetBasemaps.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Paper
          <select value={paper.id} onChange={(e) => set('paper', e.target.value)} className={control}>
            {Object.values(PAPERS).map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Title
          <input value={title} placeholder={areaTitle || defaultTitle({ survey: shownSurvey, ...show, treeColour })} onChange={(e) => setTitle(e.target.value)} className={control} />
        </label>
        <label className={label}>
          Prepared by
          <textarea rows={2} value={preparedBy} placeholder={preparedText} onChange={(e) => setPreparedBy(e.target.value)} className={control} />
        </label>
        {crowded && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            The legend is long for this paper. A3 gives it room.
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => window.print()}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-700 px-3 py-2 text-sm font-bold text-white hover:bg-green-800">
            <Printer size={15} aria-hidden="true" /> Print / PDF
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await downloadPng(sheetRef.current, paper, fileName);
              } finally {
                setSaving(false);
              }
            }}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-green-800 ring-1 ring-green-300 hover:bg-green-50 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />} PNG
          </button>
        </div>
        {loading && (
          <p role="status" className="flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Drawing the layers…
          </p>
        )}
      </aside>

      <div className="min-w-0 flex-1 overflow-auto">
        <svg
          ref={sheetRef}
          className="map-sheet bg-white shadow-xl"
          xmlns="http://www.w3.org/2000/svg"
          width={`${paper.width}mm`}
          height={`${paper.height}mm`}
          viewBox={`0 0 ${paper.width} ${paper.height}`}
          fontFamily={FONT}
          role="img"
          aria-label={`${titleText} — ${lgu?.label ?? 'Laguna'}`}
        >
          <defs>
            <clipPath id="sheet-frame">
              <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} />
            </clipPath>
            <clipPath id="sheet-place">
              <path d={placePath} clipRule="evenodd" />
            </clipPath>
          </defs>
          <rect width={paper.width} height={paper.height} fill="#fff" />

          {/* The map */}
          <g clipPath="url(#sheet-frame)">
            <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill={basemap.url ? '#f8fafc' : '#fff'} />
            {tiles.map((tile) => (
              <image key={tile.key} href={tile.url} x={tile.x} y={tile.y} width={tile.size + 0.05} height={tile.size + 0.05} preserveAspectRatio="none" />
            ))}
            <g clipPath="url(#sheet-place)">
              {picture && pictureBox && (
                <image href={picture} x={pictureBox.x} y={pictureBox.y} width={pictureBox.width} height={pictureBox.height} preserveAspectRatio="none" opacity={0.85} />
              )}
              {soil?.features?.map((feature, i) => {
                const colour = soilColourOf(soilColour, feature.properties);
                return colour ? (
                  <path key={i} d={pathOf(feature.geometry, view.toPaper)} fill={colour} fillOpacity={0.55} stroke={colour} strokeWidth={0.1} fillRule="evenodd" />
                ) : null;
              })}
            </g>
            {/* Outside the LGU, faded: the eye stays on the place the map is of. */}
            <path d={framePath + placePath} fill="#fff" fillOpacity={0.5} fillRule="evenodd" />
            {innerLines.map((feature, i) => (
              <path key={i} d={pathOf(feature.geometry, view.toPaper)} fill="none" stroke="#475569" strokeWidth={0.18} strokeDasharray="1 0.8" />
            ))}
            {sites.map((feature) => (
              <path key={feature.properties.id} d={pathOf(feature.geometry, view.toPaper)} fillRule="evenodd"
                fill={feature.properties.kind === 'planting-site' ? 'rgba(250,204,21,0.35)' : 'rgba(34,197,94,0.25)'}
                stroke={feature.properties.kind === 'planting-site' ? '#ca8a04' : '#15803d'} strokeWidth={0.3} />
            ))}
            {show.trees &&
              trees.map((tree, i) => {
                const [cx, cy] = view.toPaper([tree.lng, tree.lat]);
                const fill = colouring.classes.find((cls) => cls.id === treeClassOf(tree, treeColour))?.fill ?? '#16a34a';
                return <circle key={tree.id ?? i} cx={cx} cy={cy} r={0.55} fill={fill} stroke="#fff" strokeWidth={0.15} />;
              })}
            <path d={pathOf(place.geometry, view.toPaper, { rings: 'outer' })} fill="none" stroke={BOUNDARY} strokeWidth={0.6} strokeLinejoin="round" />
            {focusArea && (
              <path
                d={pathOf(focusArea.geometry, view.toPaper)}
                fillRule="evenodd"
                fill={focusArea.properties.kind === 'planting-site' ? 'rgba(250,204,21,0.25)' : 'rgba(34,197,94,0.2)'}
                stroke={focusArea.properties.kind === 'planting-site' ? '#a16207' : '#166534'}
                strokeWidth={0.9}
                strokeLinejoin="round"
              />
            )}
            <path d={pathOf(place.geometry, view.toPaper, { rings: 'holes' })} fill="none" stroke={BOUNDARY} strokeWidth={0.15} />
            {innerLines.map((feature, i) => {
              const centre = centroidOf(feature.geometry);
              if (!centre) return null;
              const [cx, cy] = view.toPaper([centre[1], centre[0]]);
              return (
                <text key={`n${i}`} x={cx} y={cy} textAnchor="middle" fontSize={1.5 * big} fill="#1e293b"
                  stroke="#fff" strokeWidth={0.35} paintOrder="stroke">
                  {innerName(feature)}
                </text>
              );
            })}

            {/* North arrow, scale bar, and the scale written out */}
            <g transform={`translate(${frame.x + frame.width - bar.mm - 10} ${frame.y + frame.height - 26 * big})`}>
              <rect x={-3} y={-2} width={bar.mm + 9} height={24 * big} fill="#fff" fillOpacity={0.85} rx={1} />
              <g transform={`translate(${bar.mm / 2} 0) scale(${big})`}>
                <polygon points="0,2 3.5,12 0,9.5" fill="#111" />
                <polygon points="0,2 -3.5,12 0,9.5" fill="#fff" stroke="#111" strokeWidth={0.3} />
                <text x={0} y={1.6} textAnchor="middle" fontSize={2.8} fontWeight={700}>N</text>
              </g>
              {(() => {
                const top = 15 * big;
                return (
                  <g>
                    <rect x={0} y={top} width={bar.mm / 2} height={1.2} fill="#111" />
                    <rect x={bar.mm / 2} y={top} width={bar.mm / 2} height={1.2} fill="#fff" stroke="#111" strokeWidth={0.25} />
                    <rect x={0} y={top} width={bar.mm} height={1.2} fill="none" stroke="#111" strokeWidth={0.25} />
                    {bar.ticks.map((tick, i) => (
                      <text key={i} x={(bar.mm / 2) * i} y={top - 0.8} textAnchor="middle" fontSize={1.8 * big}>
                        {i === 2 ? `${tick} ${bar.unit}` : tick}
                      </text>
                    ))}
                    <text x={bar.mm / 2} y={top + 4.2 * big} textAnchor="middle" fontSize={2 * big}>
                      {scaleLabel(view.scale)}
                    </text>
                  </g>
                );
              })()}
            </g>
          </g>

          {/* The double frame, and the graticule round it */}
          <rect x={frame.x - 1.2} y={frame.y - 1.2} width={frame.width + 2.4} height={frame.height + 2.4} fill="none" stroke="#111" strokeWidth={0.25} />
          <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="none" stroke="#111" strokeWidth={0.7} />
          {ticks.longitudes.map((tick) => (
            <g key={`lon${tick.value}`}>
              <line x1={tick.at} y1={frame.y - 1.2} x2={tick.at} y2={frame.y + 1.2} stroke="#111" strokeWidth={0.25} />
              <line x1={tick.at} y1={frame.y + frame.height - 1.2} x2={tick.at} y2={frame.y + frame.height + 1.2} stroke="#111" strokeWidth={0.25} />
              <text x={tick.at} y={frame.y - 2.2} textAnchor="middle" fontSize={1.9 * big}>{tick.label}</text>
              <text x={tick.at} y={frame.y + frame.height + 4} textAnchor="middle" fontSize={1.9 * big}>{tick.label}</text>
            </g>
          ))}
          {ticks.latitudes.map((tick) => (
            <g key={`lat${tick.value}`}>
              <line x1={frame.x - 1.2} y1={tick.at} x2={frame.x + 1.2} y2={tick.at} stroke="#111" strokeWidth={0.25} />
              <line x1={frame.x + frame.width - 1.2} y1={tick.at} x2={frame.x + frame.width + 1.2} y2={tick.at} stroke="#111" strokeWidth={0.25} />
              <text transform={`translate(${frame.x - 2.2} ${tick.at}) rotate(-90)`} textAnchor="middle" fontSize={1.9 * big}>{tick.label}</text>
              <text transform={`translate(${frame.x + frame.width + 3.6} ${tick.at}) rotate(-90)`} textAnchor="middle" fontSize={1.9 * big}>{tick.label}</text>
            </g>
          ))}

          {/* The column */}
          <rect x={column.x} y={column.y} width={column.width} height={column.height} fill="none" stroke="#111" strokeWidth={0.4} />
          {blocks}
          {locatorBlocks}

          <line x1={column.x} y1={preparedY} x2={column.x + column.width} y2={preparedY} stroke="#111" strokeWidth={0.3} />
          {logos.map((logo, i) => (
            <image key={i} href={logo} x={textMid - logosWidth / 2 + i * (logoSize + logoGap)} y={preparedY + 2} width={logoSize} height={logoSize} />
          ))}
          <text x={textMid} y={preparedY + logoSize + 5} textAnchor="middle" fontSize={1.9 * big} fontWeight={700}>PREPARED BY:</text>
          {preparedLines.map((line, i) => (
            <text key={i} x={textMid} y={preparedY + logoSize + 7.6 + i * 2.4 * big} textAnchor="middle" fontSize={1.8 * big}>{line}</text>
          ))}
          <text x={textMid} y={footY - 1.5} textAnchor="middle" fontSize={1.5 * big} fill="#475569">
            {`Generated ${generated} · Green Tag Tree Inventory System`}
          </text>
          <line x1={column.x} y1={footY} x2={column.x + column.width} y2={footY} stroke="#111" strokeWidth={0.3} />
          {footLines.map((line, i) => (
            <text key={i} x={textMid} y={footY + 2.8 + i * 2.3 * big} textAnchor="middle" fontSize={1.6 * big}>{line}</text>
          ))}
        </svg>
      </div>
    </div>
    </div>
  );
}
