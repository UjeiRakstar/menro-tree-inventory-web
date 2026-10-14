import { useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Polygon, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  boundsOfMunicipality,
  containsPoint,
  maskOutsideMunicipality,
  municipalityNamed,
} from '../../lib/lagunaBoundaries.js';
import { BASEMAPS, basemapById } from '../../lib/basemaps.js';

const MASK_STYLE = { color: 'transparent', weight: 0, fillColor: '#e2e8f0', fillOpacity: 0.75 };

function ClickToPin({ onPick }) {
  useMapEvents({ click: (event) => onPick([event.latlng.lat, event.latlng.lng]) });
  return null;
}

/**
 * Pick one point inside one LGU — where its hall is.
 *
 * Everything outside the LGU is covered over, as on the office map, and a
 * click there is refused with a sentence rather than silently ignored.
 * Satellite by default: a hall is easier to find from above than on a street
 * map, where it is a label among labels.
 */
export default function PinPicker({ municipality, value, onChange, placeLabel }) {
  const [basemapId, setBasemapId] = useState('satellite');
  const [notice, setNotice] = useState('');
  const feature = municipalityNamed(municipality);
  const bounds = boundsOfMunicipality(municipality);
  const mask = maskOutsideMunicipality(municipality);

  if (!feature || !bounds) return null;

  function pick(point) {
    if (!containsPoint(feature.geometry, point)) {
      setNotice(`That is outside ${feature.properties.municipality_label}.`);
      return;
    }
    setNotice('');
    onChange(point);
  }

  return (
    <div>
      <div className="relative h-64 overflow-hidden rounded-xl border border-slate-200">
        <MapContainer bounds={bounds} boundsOptions={{ padding: [12, 12] }} style={{ height: '100%', width: '100%' }} maxZoom={19}>
          <TileLayer key={basemapId} url={basemapById(basemapId).url} attribution={basemapById(basemapId).attribution} />
          {mask && <Polygon positions={mask} pathOptions={MASK_STYLE} interactive={false} />}
          <GeoJSON data={feature} style={{ color: '#ffffff', weight: 2, fill: false }} interactive={false} />
          <ClickToPin onPick={pick} />
          {value && (
            <CircleMarker
              center={value}
              radius={9}
              pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#166534', fillOpacity: 1 }}
            />
          )}
        </MapContainer>
        <div className="absolute right-2 top-2 z-[400] flex overflow-hidden rounded-lg border border-slate-200 bg-white text-[11px] font-semibold shadow">
          {BASEMAPS.map((basemap) => (
            <button
              key={basemap.id}
              type="button"
              onClick={() => setBasemapId(basemap.id)}
              aria-pressed={basemapId === basemap.id}
              className={`px-2 py-1 ${basemapId === basemap.id ? 'bg-green-700 text-white' : 'text-slate-600'}`}
            >
              {basemap.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500" aria-live="polite">
        {notice || (value ? `${placeLabel} pinned. Click elsewhere to move it.` : `Click the map where the ${placeLabel} stands.`)}
      </p>
    </div>
  );
}
