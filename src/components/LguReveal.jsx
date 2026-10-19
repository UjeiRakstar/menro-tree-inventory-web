import { useEffect, useState } from 'react';
import { LAGUNA_BOUNDS, LAGUNA_MUNICIPALITIES, boundsOfMunicipality } from '../lib/lagunaBoundaries.js';

const W = 320;
const H = 200;
const PAD = 10;

// Laguna, flat: longitude squeezed by the cosine of its latitude so the
// province keeps its shape. Worked out once, the first time a code is checked.
const [[SOUTH, WEST], [NORTH, EAST]] = LAGUNA_BOUNDS;
const SQUEEZE = Math.cos((((SOUTH + NORTH) / 2) * Math.PI) / 180);
const SCALE = Math.min((W - 2 * PAD) / ((EAST - WEST) * SQUEEZE), (H - 2 * PAD) / (NORTH - SOUTH));
const OFFSET_X = (W - (EAST - WEST) * SQUEEZE * SCALE) / 2;
const OFFSET_Y = (H - (NORTH - SOUTH) * SCALE) / 2;
const x = (lng) => OFFSET_X + (lng - WEST) * SQUEEZE * SCALE;
const y = (lat) => OFFSET_Y + (NORTH - lat) * SCALE;

let pathsOnce = null;
function paths() {
  pathsOnce ??= LAGUNA_MUNICIPALITIES.features.map((feature) => {
    const { geometry, properties } = feature;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    const d = polygons
      .flatMap((polygon) => polygon.map((ring) => `M${ring.map(([lng, lat]) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`).join('L')}Z`))
      .join('');
    return { name: properties.municipality, d };
  });
  return pathsOnce;
}

/** The transform that brings one LGU to fill the picture. */
export function zoomTo(name) {
  const bounds = boundsOfMunicipality(name);
  if (!bounds) return { scale: 1, tx: 0, ty: 0 };
  const [[south, west], [north, east]] = bounds;
  const left = x(west);
  const right = x(east);
  const top = y(north);
  const bottom = y(south);
  const scale = Math.min(4, (W - 4 * PAD) / Math.max(1, right - left), (H - 4 * PAD) / Math.max(1, bottom - top));
  return { scale, tx: W / 2 - ((left + right) / 2) * scale, ty: H / 2 - ((top + bottom) / 2) * scale };
}

/**
 * Laguna's thirty cities and municipalities, then the one an account code is
 * for, lit and brought forward: the officer sees whose account they are
 * setting up before typing anything else. Plain SVG, no map tiles; with
 * reduced motion it simply appears zoomed.
 */
export default function LguReveal({ name, label }) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    setZoomed(false);
    const timer = setTimeout(() => setZoomed(true), 350);
    return () => clearTimeout(timer);
  }, [name]);

  const { scale, tx, ty } = zoomed ? zoomTo(name) : { scale: 1, tx: 0, ty: 0 };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of Laguna, ${label ?? name} highlighted`}
      className="block h-auto w-full rounded-lg bg-sky-50">
      <g
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: '0 0' }}
        className="transition-transform duration-1000 ease-out motion-reduce:transition-none"
      >
        {/* The lit one last, so its outline is drawn over its neighbours'. */}
        {[...paths()].sort((a, b) => (a.name === name) - (b.name === name)).map((path) => {
          const lit = path.name === name;
          return (
            <path key={path.name} d={path.d} data-lgu={path.name} data-lit={lit || undefined}
              vectorEffect="non-scaling-stroke"
              className={`transition-colors duration-700 motion-reduce:transition-none ${lit && zoomed ? 'fill-green-600 stroke-green-900' : lit ? 'fill-green-200 stroke-white' : 'fill-slate-200 stroke-white'}`}
              strokeWidth={lit ? 1.5 : 0.75} />
          );
        })}
      </g>
    </svg>
  );
}
