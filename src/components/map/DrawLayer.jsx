import { Fragment, useMemo } from 'react';
import { Marker, Polygon, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  addPoint,
  canClose,
  clickPoint,
  formatLength,
  insertPoint,
  movePoint,
  segments,
  selfIntersects,
} from '../../lib/drawing.js';

/**
 * The shape being drawn, on the map, with its handles.
 *
 * Google Maps' measuring gestures, which the spec asked for by name:
 *   click the map        add a point
 *   drag a point         move it
 *   click a point        remove it — or, for the first point, close the shape
 *   drag an edge's dot   bend the edge with a new point
 *
 * Every edge carries its length, turned to lie along it. All the rules live in
 * src/lib/drawing.js; this only turns gestures into calls to them.
 *
 * `refusePoint(latlng)` returns a sentence when a point may not go there — an
 * LGU account cannot draw outside its LGU — or null when it may.
 */

const WHITE = '#ffffff';
const CROSSED = '#f87171';

function vertexIcon({ closer }) {
  // The first point grows a green ring once clicking it would close the
  // shape, so the way to finish is visible rather than remembered.
  const size = closer ? 18 : 13;
  return L.divIcon({
    className: 'draw-vertex',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html:
      `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;` +
      `background:${WHITE};border:${closer ? '4px solid #16a34a' : '3px solid #0f172a'};` +
      'box-shadow:0 1px 3px rgba(0,0,0,.45);cursor:pointer"></span>',
  });
}

const MIDPOINT_ICON = L.divIcon({
  className: 'draw-midpoint',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
  html:
    `<span style="display:block;width:10px;height:10px;border-radius:9999px;` +
    `background:rgba(255,255,255,.6);border:1.5px solid rgba(15,23,42,.55);cursor:grab"></span>`,
});

/** An edge's length, turned along the edge and lifted just clear of it. */
function labelIcon(text, angle) {
  return L.divIcon({
    className: 'draw-label',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    html:
      `<span style="position:absolute;left:0;top:0;transform-origin:0 0;` +
      `transform:rotate(${angle}deg) translate(-50%,-140%);white-space:nowrap;` +
      'font:600 12px/1 system-ui,sans-serif;color:#fff;' +
      'text-shadow:0 0 3px #000,0 0 3px #000,0 1px 2px #000;pointer-events:none">' +
      `${text}</span>`,
  });
}

const latLngOf = (event) => {
  const { lat, lng } = event.target.getLatLng();
  return [lat, lng];
};

export default function DrawLayer({ shape, onChange, refusePoint, onRefused }) {
  const refuse = (point) => {
    const reason = refusePoint?.(point) ?? null;
    if (reason) onRefused?.(reason);
    return Boolean(reason);
  };

  useMapEvents({
    click(event) {
      if (shape.closed) return;
      const point = [event.latlng.lat, event.latlng.lng];
      if (refuse(point)) return;
      onChange(addPoint(shape, point));
    },
  });

  const edges = useMemo(() => segments(shape), [shape]);
  const crossed = useMemo(() => shape.closed && selfIntersects(shape), [shape]);
  const closer = canClose(shape);
  const outline = { color: crossed ? CROSSED : WHITE, weight: 2.5, opacity: 1 };

  return (
    <>
      {shape.closed ? (
        <Polygon
          positions={shape.points}
          pane="map-drawing"
          interactive={false}
          pathOptions={{ ...outline, fillColor: crossed ? CROSSED : '#facc15', fillOpacity: 0.2 }}
        />
      ) : (
        shape.points.length > 1 && (
          <Polyline positions={shape.points} pane="map-drawing" interactive={false} pathOptions={outline} />
        )
      )}

      {edges.map((edge) => (
        <Fragment key={`edge-${edge.index}`}>
          <Marker
            position={edge.mid}
            icon={labelIcon(formatLength(edge.lengthM), edge.angle)}
            interactive={false}
            keyboard={false}
          />
          <Marker
            position={edge.mid}
            icon={MIDPOINT_ICON}
            draggable
            title="Drag to bend this edge"
            eventHandlers={{
              click: (event) => {
                if (event) L.DomEvent.stopPropagation(event);
                if (!refuse(edge.mid)) onChange(insertPoint(shape, edge.index, edge.mid));
              },
              dragend: (event) => {
                const point = latLngOf(event);
                if (refuse(point)) {
                  event.target.setLatLng(edge.mid);
                  return;
                }
                onChange(insertPoint(shape, edge.index, point));
              },
            }}
          />
        </Fragment>
      ))}

      {shape.points.map((point, index) => (
        <Marker
          // Keyed by position in the outline: removing a point shifts the rest
          // down, and each marker simply takes its new neighbour's place.
          key={`vertex-${index}`}
          position={point}
          icon={vertexIcon({ closer: index === 0 && closer })}
          draggable
          title={index === 0 && closer ? 'Click to close the shape' : 'Drag to move · click to remove'}
          eventHandlers={{
            click: (event) => {
              if (event) L.DomEvent.stopPropagation(event);
              onChange(clickPoint(shape, index));
            },
            dragend: (event) => {
              const moved = latLngOf(event);
              if (refuse(moved)) {
                // Leaflet has already drawn the point where it was dropped;
                // put it back where it is allowed to be.
                event.target.setLatLng(point);
                return;
              }
              onChange(movePoint(shape, index, moved));
            },
          }}
        />
      ))}
    </>
  );
}
