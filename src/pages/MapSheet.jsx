import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Loader2, Printer, X } from 'lucide-react';
import { supabase } from '../supabaseClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { isPgenro, ROLES, roleOf } from '../lib/roles.js';
import { useMapLayers } from '../hooks/useMapLayers.js';
import { useMapAreas } from '../hooks/useMapAreas.js';
import { useOfficeProfile } from '../hooks/useOfficeProfile.js';
import { LAGUNA_MUNICIPALITIES, LAGUNA_PROVINCE, MUNICIPALITY_LIST, containsPoint, municipalityNamed } from '../lib/lagunaBoundaries.js';
import { centroidOf } from '../lib/areaGeometry.js';
import { PGENRO_OVERLAYS } from '../lib/mapLayers.js';
import { repaintPicture } from '../lib/layers/browser.js';
import { layerKey, soilColourOf, soilColours } from '../lib/layers/palette.js';
import { PLANNING_ONLY } from '../lib/namriaCover.js';
import { PROVINCE_LOGO, logoFor } from '../lib/lguLogos.js';
import pgenroLogo from '../assets/lgu-thumbs/PGENRO_LGU_logo.png';
import lspuLogo from '../assets/lgu-thumbs/LSPU_LGU_logo.png';
import greenTagLogo from '../assets/GreenTag_Logo.png';
import philippines from '../data/Philippines.geojson';
import {
  PAPERS,
  SHEET_BASEMAPS,
  SURVEY_TITLES,
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

async function downloadPng(svgElement, paper, fileName) {
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
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(png);
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  } finally {
    URL.revokeObjectURL(url);
  }
}

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

  // Whose sheet: an office's own LGU, always; PGENRO's choice, or the province.
  const lguName = pgenro ? params.get('lgu') || null : roleOf(profile) === ROLES.LGU_ADMIN ? ownLgu?.name ?? null : null;
  const lgu = MUNICIPALITY_LIST.find((item) => item.name === lguName) ?? null;
  const place = lgu ? municipalityNamed(lgu.name) : LAGUNA_PROVINCE.features[0];
  const survey = SURVEY_KINDS.includes(params.get('survey')) ? params.get('survey') : null;
  const show = {
    trees: params.get('trees') !== '0',
    sites: params.get('sites') !== '0',
    barangays: params.get('barangays') !== '0',
  };
  const paper = PAPERS[params.get('paper')] ?? PAPERS.a4;
  const basemap = SHEET_BASEMAPS.find((b) => b.id === params.get('basemap')) ?? SHEET_BASEMAPS[0];
  const [title, setTitle] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  // A layer named in the link but not uploaded is not on the sheet, nor in its title.
  const shownSurvey = survey && mapLayers.layers[survey] ? survey : null;
  const titleText = title || defaultTitle({ survey: shownSurvey, ...show });
  // What the office saved in Settings: its seal, its own logo, its head.
  const saved = useOfficeProfile(lgu ? lgu.psgc : pgenro ? 'pgenro' : null);
  const officeName = pgenro && !lgu
    ? 'Provincial Government Environment and Natural Resources Office (PGENRO), Laguna'
    : `${lgu?.label ?? ''} MENRO / CENRO`;
  const preparedText = preparedBy || (saved?.office_head ? `${officeName} — ${saved.office_head}` : officeName);

  // ---- What goes on it -------------------------------------------------------------
  const areas = useMapAreas();
  const surveyLayer = survey ? mapLayers.layers[survey] : null;
  const [picture, setPicture] = useState(null);
  const [soil, setSoil] = useState(null);
  const [trees, setTrees] = useState([]);
  const [barangays, setBarangays] = useState(null);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef(null);

  useEffect(() => {
    setPicture(null);
    if (!surveyLayer?.pictureUrl || survey === 'soil') return undefined;
    let cancelled = false;
    repaintPicture(surveyLayer.pictureUrl, survey, surveyLayer.meta?.legend).then((url) => !cancelled && setPicture(url));
    return () => {
      cancelled = true;
    };
  }, [surveyLayer, survey]);

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
      const { data } = await supabase.from('trees').select('id, latitude, longitude');
      if (cancelled || !Array.isArray(data)) return;
      setTrees(
        data
          .map((tree) => [Number(tree.latitude), Number(tree.longitude)])
          .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && containsPoint(place.geometry, [lat, lng]))
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
  const view = useMemo(() => fitView(place.geometry, frame), [place, frame]);
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

  // Picture placed by its bounds: [[south, west], [north, east]].
  const pictureBox = useMemo(() => {
    const bounds = surveyLayer?.meta?.bounds;
    if (!bounds) return null;
    const [x1, y1] = view.toPaper([bounds[0][1], bounds[1][0]]);
    const [x2, y2] = view.toPaper([bounds[1][1], bounds[0][0]]);
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }, [surveyLayer, view]);

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
  if (show.trees) legend.push({ kind: 'dot', label: 'Tagged tree', fill: '#16a34a' });
  const surveyKey = surveyLayer ? layerKey(survey, surveyLayer.meta) : [];

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
  const fileName = `${(lgu?.label ?? 'Laguna').replace(/\s+/g, '-')}_${titleText.replace(/[^A-Za-z]+/g, '-').replace(/^-|-$/g, '')}.png`;
  const loading = !mapLayers.loaded || Boolean(surveyLayer && !picture && !soil);
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
    <div className="flex flex-1 flex-col gap-4 p-6 lg:flex-row lg:items-start">
      <style>{`
        @media print {
          @page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }
          body * { visibility: hidden !important; }
          .map-sheet, .map-sheet * { visibility: visible !important; }
          .map-sheet { position: fixed; left: 0; top: 0; width: ${paper.width}mm; height: ${paper.height}mm; box-shadow: none !important; }
        }
      `}</style>

      <aside aria-label="Map sheet settings" className="w-full space-y-3 rounded-xl border border-slate-200 bg-white p-4 lg:w-72 lg:shrink-0">
        <h2 className="text-lg font-bold text-slate-900">Map settings</h2>
        <p className="text-xs text-slate-500">
          The CDRA map layout, Santa Cruz&apos;s as the template. Print it at 100%, or choose “Save as PDF” in the print
          dialog, and it is at the scale written on it.
        </p>
        {pgenro && (
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
        <label className={label}>
          Base map
          <select value={basemap.id} onChange={(e) => set('basemap', e.target.value)} className={control}>
            {SHEET_BASEMAPS.map((b) => (
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
          <input value={title} placeholder={defaultTitle({ survey: shownSurvey, ...show })} onChange={(e) => setTitle(e.target.value)} className={control} />
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
              trees.map(([lat, lng], i) => {
                const [cx, cy] = view.toPaper([lng, lat]);
                return <circle key={i} cx={cx} cy={cy} r={0.55} fill="#16a34a" stroke="#fff" strokeWidth={0.15} />;
              })}
            <path d={pathOf(place.geometry, view.toPaper, { rings: 'outer' })} fill="none" stroke={BOUNDARY} strokeWidth={0.6} strokeLinejoin="round" />
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
