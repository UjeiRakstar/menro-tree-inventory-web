import { LAGUNA_GRID, cellAreaM2, columnsOf, rasterize } from './grid.js';
import { ELEVATION_BANDS, bandOf, elevationGrid } from './elevation.js';
import { drawPicture } from './picture.js';
import { pictureColour, soilColourOf, soilColours } from './palette.js';

/**
 * Turning an uploaded file into a layer: checked, laid on the grid, drawn.
 *
 * Pure — no browser, no network — so it runs the same in the upload page's
 * background thread and in the tests. Each prepare* returns
 *
 *   grid      the measuring grid (grid.js), a typed array
 *   picture   RGBA for the map, when the layer is drawn as an image
 *   shapes    GeoJSON for the map, when it is drawn as shapes
 *   meta      what the page shows PGENRO before publishing, kept with it
 *
 * A file that is not what it says throws an Error whose message says why, in
 * words PGENRO can act on.
 */

/** The map picture is drawn at the DEM's own 1 arc-second, about 30 m. */
export const DISPLAY_GRID = Object.freeze({ ...LAGUNA_GRID, cell: 1 / 3600 });

const LAGUNA_BOX = { west: 120.8, east: 121.8, south: 13.8, north: 14.8 };

/** A GeoJSON file's text, checked: polygons, in degrees, over Laguna. */
export function readGeoJson(text, { what = 'This file' } = {}) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${what} is not GeoJSON: it could not be read as JSON.`);
  }
  const features = Array.isArray(data?.features) ? data.features : null;
  if (!features || features.length === 0) throw new Error(`${what} has no features in it.`);

  const crs = String(data.crs?.properties?.name ?? '');
  if (crs && !/CRS84|4326/.test(crs)) {
    throw new Error(
      `${what} is in ${crs}. Export it from QGIS as WGS 84 (EPSG:4326), longitude and latitude in degrees.`
    );
  }

  const polygons = features.filter((f) => /Polygon$/.test(f?.geometry?.type ?? ''));
  if (polygons.length === 0) throw new Error(`${what} has no polygons; a map layer here is areas, not points or lines.`);

  // The first coordinate of the first polygon, to catch metres posing as degrees.
  const first = polygons[0].geometry.type === 'Polygon'
    ? polygons[0].geometry.coordinates[0]?.[0]
    : polygons[0].geometry.coordinates[0]?.[0]?.[0];
  const [lng, lat] = first ?? [];
  if (!(lng >= LAGUNA_BOX.west && lng <= LAGUNA_BOX.east && lat >= LAGUNA_BOX.south && lat <= LAGUNA_BOX.north)) {
    throw new Error(`${what} is not over Laguna, or not in longitude and latitude: its first point is ${lng}, ${lat}.`);
  }
  return { ...data, features: polygons };
}

/** The first property that every feature has and that fits `test`. */
export function findField(features, candidates, test = () => true) {
  for (const name of candidates) {
    if (features.every((f) => f.properties && name in f.properties && test(f.properties[name]))) return name;
  }
  return null;
}

const HAZARD_FIELDS = ['Var', 'var', 'VAR', 'HAZ', 'Haz', 'haz', 'Hazard', 'HAZARD', 'hazard', 'LH', 'level', 'Level', 'GRIDCODE', 'gridcode'];
const isLevel = (v) => [1, 2, 3].includes(Number(v));

const hectaresByValue = (grid, cells, values) => {
  const cols = columnsOf(grid);
  const totals = Object.fromEntries(values.map((v) => [v, 0]));
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] in totals) totals[cells[i]] += cellAreaM2(grid, Math.floor(i / cols)) / 10000;
  }
  return Object.fromEntries(Object.entries(totals).map(([v, ha]) => [v, Math.round(ha)]));
};

/** NOAH flood, or landslide: levels 1 low, 2 medium, 3 high. */
export function prepareHazard(data, { kind = 'flood' } = {}) {
  const field = findField(data.features, HAZARD_FIELDS, isLevel);
  if (!field) {
    throw new Error(
      `No property in every shape gives a hazard level of 1, 2 or 3 (NOAH calls it "Var"). Properties found: ${Object.keys(data.features[0].properties ?? {}).join(', ') || 'none'}.`
    );
  }
  const level = (f) => Number(f.properties[field]);
  const grid = rasterize(LAGUNA_GRID, data.features, level);
  const display = rasterize(DISPLAY_GRID, data.features, level);
  const picture = drawPicture(DISPLAY_GRID, display, (v) => pictureColour(kind, v));
  const ha = hectaresByValue(LAGUNA_GRID, grid, [1, 2, 3]);
  return {
    grid,
    picture,
    meta: {
      kind,
      field,
      grid: LAGUNA_GRID,
      bounds: picture.bounds,
      shapes: data.features.length,
      hectares: { low: ha[1], medium: ha[2], high: ha[3] },
      legend: [
        { value: 1, label: 'Low', colour: pictureColour(kind, 1) },
        { value: 2, label: 'Medium', colour: pictureColour(kind, 2) },
        { value: 3, label: 'High', colour: pictureColour(kind, 3) },
      ],
    },
  };
}

const SERIES_FIELDS = ['SoilSeries', 'SOIL_SERIES', 'SOILSERIES', 'Series', 'series', 'SOILNAME', 'SoilName'];
const DESCRIPTION_FIELDS = ['SOILDESC', 'SoilDesc', 'SOIL_DESC', 'Description', 'DESCRIPTION', 'description'];
const ZONE_FIELDS = ['AEZ', 'Aez', 'ZONE', 'Zone', 'zone'];

/** BSWM soil series: shapes for the map, and the series under every cell. */
export function prepareSoil(data) {
  const present = (v) => v !== null && v !== undefined && String(v).trim() !== '';
  const seriesField = findField(data.features, SERIES_FIELDS);
  const descriptionField = findField(data.features, DESCRIPTION_FIELDS);
  if (!seriesField && !descriptionField) {
    throw new Error(
      `No property names the soil (BSWM calls it "SoilSeries" or "SOILDESC"). Properties found: ${Object.keys(data.features[0].properties ?? {}).join(', ') || 'none'}.`
    );
  }
  const zoneField = findField(data.features, ZONE_FIELDS);
  if (data.features.length > 250) {
    throw new Error(`This has ${data.features.length} shapes; a soil layer here is at most 250 (one per soil unit).`);
  }

  const named = data.features.map((f) => {
    const p = f.properties ?? {};
    const series = present(p[seriesField]) ? String(p[seriesField]).trim() : null;
    const description = present(p[descriptionField]) ? String(p[descriptionField]).trim() : series;
    return {
      series: series ?? description,
      description: description ?? series,
      zone: zoneField && present(p[zoneField]) ? String(p[zoneField]).trim() : null,
    };
  });
  // One colour per series (palette.js); the lake gets none.
  const colours = soilColours(named);
  const classes = named.map((soil) => ({ ...soil, colour: soilColourOf(colours, soil) }));
  const grid = rasterize(LAGUNA_GRID, data.features.map((f, i) => ({ ...f, cls: i + 1 })), (f) => f.cls);
  // The map's copy: just what it shows, coordinates to 6 places (10 cm).
  const round = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6] : c.map(round));
  const shapes = {
    type: 'FeatureCollection',
    features: data.features.map((f, i) => ({
      type: 'Feature',
      properties: { cls: i + 1, ...classes[i] },
      geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
    })),
  };
  return {
    grid,
    shapes,
    meta: {
      kind: 'soil',
      fields: { series: seriesField, description: descriptionField, zone: zoneField },
      grid: LAGUNA_GRID,
      shapes: data.features.length,
      classes,
    },
  };
}

/** The Copernicus DEM: heights on the grid, and elevation bands as a picture. */
export function prepareElevation(values, raster) {
  const [west, south, east, north] = raster.bbox ?? [];
  if (!(west < 121.5 && east > 121.1 && south < 14.2 && north > 14.3)) {
    throw new Error(
      `This elevation model does not cover Laguna, or is not in longitude and latitude (it spans ${raster.bbox?.map((n) => Number(n).toFixed(3)).join(', ')}).`
    );
  }
  const grid = elevationGrid(LAGUNA_GRID, values, raster);
  const display = elevationGrid(DISPLAY_GRID, values, raster);
  const bands = new Uint8Array(display.length);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < display.length; i += 1) {
    bands[i] = bandOf(display[i]);
    if (bands[i]) {
      if (display[i] < min) min = display[i];
      if (display[i] > max) max = display[i];
    }
  }
  const picture = drawPicture(DISPLAY_GRID, bands, (b) => (b ? pictureColour('elevation', b) : null));
  return {
    grid,
    picture,
    meta: {
      kind: 'elevation',
      grid: LAGUNA_GRID,
      bounds: picture.bounds,
      range: { min, max },
      legend: ELEVATION_BANDS.map((band, i) => ({ value: i + 1, label: band.label, colour: pictureColour('elevation', i + 1) })),
    },
  };
}
