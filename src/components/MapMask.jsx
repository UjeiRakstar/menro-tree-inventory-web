import { Polygon } from 'react-leaflet';
import boundaryData from '../data/Santa-Cruz-Boundary.geojson';

// World bounds covering the entire globe
const worldBounds = [
  [90, -180],
  [90, 180],
  [-90, 180],
  [-90, -180],
];

/**
 * Parse GeoJSON MultiPolygon coordinates into Leaflet-compatible [lat, lng] arrays.
 * GeoJSON stores [longitude, latitude] — Leaflet expects [latitude, longitude].
 */
function parseGeoJSONRings() {
  const geometry = boundaryData.features[0]?.geometry;
  if (!geometry) return [];

  // MultiPolygon: coordinates is [polygon][ring][point]
  // We take all rings from all polygons and reverse [lng, lat] → [lat, lng]
  const rings = [];
  for (const polygon of geometry.coordinates) {
    for (const ring of polygon) {
      rings.push(ring.map(([lng, lat]) => [lat, lng]));
    }
  }
  return rings;
}

const parsedRings = parseGeoJSONRings();

// Combine world bounds (outer) with municipality boundary rings (holes)
const maskPositions = [worldBounds, ...parsedRings];

/**
 * MapMask — Inverted polygon mask that dims all areas outside the
 * municipality boundary, focusing attention on the LGU area.
 */
export default function MapMask() {
  return (
    <Polygon
      positions={maskPositions}
      stroke={false}
      fillColor="#14532d"
      fillOpacity={0.4}
    />
  );
}
