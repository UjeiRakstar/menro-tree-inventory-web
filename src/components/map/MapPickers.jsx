import { Ban } from 'lucide-react';
import { BASEMAPS, thumbnailTile } from '../../lib/basemaps.js';
import { PGENRO_OVERLAYS } from '../../lib/mapLayers.js';
import { ELEVATION_PALETTE, HAZARD_PALETTES, SOIL_PALETTE, layerKey } from '../../lib/layers/palette.js';
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
  const palette = HAZARD_PALETTES[kind];
  if (!palette) return null;
  const [low, medium, high] = [palette[1], palette[2], palette[3]].map((c) => rgba(c, 1.4));
  const blob = (at) => `radial-gradient(circle at ${at}, ${high} 0 14%, ${medium} 14% 28%, ${low} 28% 44%, transparent 44%)`;
  return <span className="absolute inset-0" style={{ background: `${blob('30% 65%')}, ${blob('78% 28%')}` }} />;
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

export function BasemapPicker({ current, onChange, centre, open, onOpenChange }) {
  const options = BASEMAPS.map((basemap) => ({
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
export function SurveyPicker({ current, onChange, available = {}, basemap, centre, open, onOpenChange }) {
  const base = BASEMAPS.find((b) => b.id === basemap) ?? BASEMAPS[0];
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
