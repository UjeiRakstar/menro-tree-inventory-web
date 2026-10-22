import { Ban } from 'lucide-react';
import { BASEMAPS, thumbnailTile } from '../../lib/basemaps.js';
import { PGENRO_OVERLAYS } from '../../lib/mapLayers.js';
import { CDRA_COLOURS, ELEVATION_PALETTE, SOIL_PALETTE, layerKey } from '../../lib/layers/palette.js';
import StackedPicker from './StackedPicker.jsx';

/**
 * The map's two stacks of pictures: what the map is drawn on (street or
 * satellite), and which of PGENRO's survey layers is laid over it.
 *
 * One survey layer at a time. Soil, elevation and the hazards are each a
 * full-cover colouring of the same ground; two at once is a third colour
 * that means nothing, under pins that are coloured too.
 */

const rgba = ([r, g, b, a = 255], boost = 1) => `rgba(${r},${g},${b},${Math.min(1, (a / 255) * boost)})`;

/** What a survey layer looks like, drawn in its own palette over the place. */
function SurveyArt({ kind }) {
  if (kind === 'soil') {
    return (
      <span className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-80">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <span key={i} style={{ background: SOIL_PALETTE[(i * 5) % SOIL_PALETTE.length] }} />
        ))}
      </span>
    );
  }
  if (kind === 'elevation') {
    const stops = ELEVATION_PALETTE.map((c) => rgba(c, 1.6)).join(', ');
    return <span className="absolute inset-0" style={{ background: `linear-gradient(35deg, ${stops})` }} />;
  }
  if (kind === 'flood') return <FloodArt />;
  if (kind === 'landslide') return <LandslideArt />;
  return null;
}

// The hazards as pictures (22 October), in the DHSUD CDRA colours the map
// draws them in: low, moderate, high, very high.
const CDRA = Object.fromEntries(Object.entries(CDRA_COLOURS).map(([level, [r, g, b]]) => [level, `rgb(${r},${g},${b})`]));
const INK = '#1e293b';

/** A wave across the picture at height y, filled down to the bottom. */
const wave = (y) => `M-2 ${y} q4.5 -2.2 9 0 t9 0 t9 0 t9 0 t9 0 t9 0 t9 0 t9 0 t9 0 L80 70 L-2 70Z`;

/** Flood: a house standing in water, deeper water the higher the level. */
function FloodArt() {
  return (
    <svg viewBox="0 0 72 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 h-full w-full">
      <rect width="72" height="64" fill="rgba(255,255,255,.18)" />
      <g stroke={INK} strokeWidth="1.6" strokeLinejoin="round">
        <path d="M22 30 L36 17 L50 30" fill="#f8fafc" />
        <rect x="25.5" y="29" width="21" height="17" fill="#f8fafc" />
        <rect x="32.5" y="36" width="7" height="10" fill="#94a3b8" strokeWidth="1.2" />
      </g>
      <path d={wave(37)} fill={CDRA.low} fillOpacity=".9" />
      <path d={wave(44)} fill={CDRA.moderate} fillOpacity=".92" />
      <path d={wave(51)} fill={CDRA.high} fillOpacity=".92" />
      <path d={wave(58)} fill={CDRA.veryHigh} />
    </svg>
  );
}

const HILL = 'M-2 58 C10 54 20 44 30 32 C38 22 44 12 50 9 C56 7 62 14 74 24';

/** Landslide: a slope, riskier toward its steep top, with rock sliding off it. */
function LandslideArt() {
  return (
    <svg viewBox="0 0 72 64" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="absolute inset-0 h-full w-full">
      <defs>
        <clipPath id="survey-art-hill">
          <path d={`${HILL} L74 66 L-2 66Z`} />
        </clipPath>
      </defs>
      <rect width="72" height="64" fill="rgba(255,255,255,.18)" />
      <g clipPath="url(#survey-art-hill)">
        <rect x="-2" y="0" width="76" height="70" fill={CDRA.low} />
        <path d="M-2 56 C20 52 40 46 74 42 L74 0 L-2 0Z" fill={CDRA.moderate} />
        <path d="M-2 40 C22 36 42 30 74 30 L74 0 L-2 0Z" fill={CDRA.high} />
        <path d="M-2 26 C22 22 42 18 74 18 L74 0 L-2 0Z" fill={CDRA.veryHigh} />
        <path d="M47 12 C43 20 38 27 33 34 C29 40 25 46 20 53 C26 54 31 50 35 45 C40 38 45 28 50 15Z" fill="#7c4a24" fillOpacity=".9" />
      </g>
      <path d={HILL} fill="none" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <g fill="#57534e" stroke={INK} strokeWidth="1">
        <circle cx="16" cy="55" r="3.2" />
        <circle cx="23" cy="58.5" r="2.4" />
        <circle cx="10" cy="60" r="2" />
      </g>
      <path d="M27 47 q-3 4 -7 5 M30 50 q-2 3 -5 4" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function PlaceTile({ basemap, centre }) {
  return (
    <img
      src={thumbnailTile(basemap, centre)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

export function BasemapPicker({ current, onChange, centre, open, onOpenChange, basemaps = BASEMAPS }) {
  const options = basemaps.map((basemap) => ({
    id: basemap.id,
    label: basemap.label,
    thumb: <PlaceTile basemap={basemap} centre={centre} />,
  }));
  return (
    <StackedPicker
      id="basemap-picker"
      label="Base map"
      options={options}
      current={current}
      onChange={onChange}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

/** A layer's colour key: [{ label, colour, detail }] as a list. */
export function SurveyKey({ kind, meta, className = '' }) {
  const items = layerKey(kind, meta);
  if (items.length === 0) return null;
  return (
    <ul className={`space-y-0.5 ${className}`}>
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-1.5 text-[10.5px] leading-snug text-slate-600">
          <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10" style={{ background: item.colour }} />
          <span className="min-w-0">
            <span className="font-medium text-slate-700">{item.label}</span>
            {item.detail && <span className="block text-[9.5px] text-slate-400">{item.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Which survey layer is laid over the map, or none. Layers PGENRO has not
 * uploaded are shown, greyed, saying so. Its colour key is in the map's
 * legend, not here: this row closes the moment a layer is chosen.
 */
export function SurveyPicker({ current, onChange, available = {}, basemap, basemaps = BASEMAPS, centre, open, onOpenChange }) {
  const base = basemaps.find((b) => b.id === basemap) ?? basemaps[0];
  const options = [
    {
      id: null,
      label: 'No layer',
      thumb: (
        <>
          <PlaceTile basemap={base} centre={centre} />
          <span className="absolute inset-0 flex items-center justify-center bg-white/30">
            <Ban size={22} className="text-slate-700/80" aria-hidden="true" />
          </span>
        </>
      ),
    },
    ...PGENRO_OVERLAYS.map((overlay) => ({
      id: overlay.id,
      label: overlay.short ?? overlay.label,
      disabled: !available[overlay.id],
      note: available[overlay.id] ? overlay.source : 'Not uploaded yet',
      thumb: (
        <>
          <PlaceTile basemap={base} centre={centre} />
          <SurveyArt kind={overlay.id} />
        </>
      ),
    })),
  ];
  const live = current && available[current];
  return (
    <StackedPicker
      id="survey-picker"
      label="Survey layer"
      options={options}
      current={live ? current : null}
      onChange={onChange}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
