import { prepareElevation, prepareHazard, prepareSoil, readGeoJson } from './prepare.js';

/**
 * The browser's half of the map layers: files in, files out.
 *
 * prepare.js does the work and knows nothing of browsers. This reads the
 * uploaded file, hands it over, and turns what comes back into the files that
 * are stored: the picture as a PNG, the grid gzipped, the soil shapes as
 * GeoJSON. It runs in a background thread when the browser has one (a
 * 111 MB flood map would otherwise freeze the page), and on the page itself
 * when it does not.
 */
export const LAYER_BUCKET = 'map-layers';

export const LAYER_KINDS = Object.freeze([
  { id: 'soil', label: 'Soil type', source: 'DA–BSWM soil series', accepts: '.geojson,.json', format: 'GeoJSON' },
  { id: 'elevation', label: 'Elevation', source: 'Copernicus DEM', accepts: '.tif,.tiff', format: 'GeoTIFF' },
  { id: 'flood', label: 'Flood hazard', source: 'UP NOAH', accepts: '.geojson,.json', format: 'GeoJSON' },
  { id: 'landslide', label: 'Rain-induced landslide hazard', source: 'UP NOAH', accepts: '.geojson,.json', format: 'GeoJSON' },
]);

export const layerKindById = (id) => LAYER_KINDS.find((kind) => kind.id === id) ?? null;

// ---- Encoding ---------------------------------------------------------------------

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob().then((blob) => new Blob([blob], { type: 'application/gzip' }));
}

export async function gunzip(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function encodePng({ width, height, data }) {
  const image = new ImageData(data, width, height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').putImageData(image, 0, 0);
    return canvas.convertToBlob({ type: 'image/png' });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(image, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// ---- Preparing ----------------------------------------------------------------------

/** Read and prepare one file; returns { meta, files: { name: Blob } }. */
export async function prepareFile(kind, file) {
  let layer;
  if (kind === 'elevation') {
    const { fromArrayBuffer } = await import('geotiff');
    let image;
    try {
      image = await (await fromArrayBuffer(await file.arrayBuffer())).getImage();
    } catch {
      throw new Error('This is not a GeoTIFF the page can read. Export the elevation model from QGIS as GeoTIFF.');
    }
    const [band] = await image.readRasters();
    layer = prepareElevation(band, { width: image.getWidth(), height: image.getHeight(), bbox: image.getBoundingBox() });
  } else {
    const data = readGeoJson(await file.text(), { what: file.name });
    layer = kind === 'soil' ? prepareSoil(data) : prepareHazard(data, { kind });
  }

  const gridBytes = new Uint8Array(layer.grid.buffer, layer.grid.byteOffset, layer.grid.byteLength);
  const files = { 'grid.bin.gz': await gzip(gridBytes) };
  if (layer.picture) files['picture.png'] = await encodePng(layer.picture);
  if (layer.shapes) {
    files['shapes.geojson'] = new Blob([JSON.stringify(layer.shapes)], { type: 'application/geo+json' });
  }
  return { meta: { ...layer.meta, gridType: layer.grid instanceof Int16Array ? 'int16' : 'uint8' }, files };
}

/**
 * The same, in a background thread when there is one.
 */
export async function prepareInBackground(kind, file) {
  if (typeof Worker === 'undefined') return prepareFile(kind, file);
  const worker = new Worker(new URL('./prepare.worker.js', import.meta.url), { type: 'module' });
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data.result));
      worker.onerror = (event) => reject(new Error(event.message || 'The file could not be prepared.'));
      worker.postMessage({ kind, file });
    });
  } finally {
    worker.terminate();
  }
}

// ---- Publishing and loading ----------------------------------------------------------

/** Store the prepared files and make the layer live. Returns the new row. */
export async function publishLayer(supabase, kind, prepared, fileName) {
  const folder = `${kind}/${Date.now()}`;
  const paths = {};
  for (const [name, blob] of Object.entries(prepared.files)) {
    const path = `${folder}/${name}`;
    const { error } = await supabase.storage
      .from(LAYER_BUCKET)
      .upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: false });
    if (error) {
      throw new Error(
        /bucket not found/i.test(error.message ?? '')
          ? 'The layer files bucket is not there yet. Run supabase/map_layers.sql, then publish again.'
          : `The layer could not be stored: ${error.message}`
      );
    }
    paths[name] = path;
  }
  const { data, error } = await supabase
    .from('map_layers')
    .insert({
      kind,
      file_name: fileName,
      source: layerKindById(kind)?.source ?? null,
      picture_path: paths['picture.png'] ?? null,
      shapes_path: paths['shapes.geojson'] ?? null,
      grid_path: paths['grid.bin.gz'],
      meta: prepared.meta,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export const layerUrl = (supabase, path) => (path ? supabase.storage.from(LAYER_BUCKET).getPublicUrl(path).data.publicUrl : null);

const gridCache = new Map();

/** A layer's measuring grid, fetched once per page. */
export function loadGrid(supabase, layer) {
  if (!layer?.grid_path) return Promise.resolve(null);
  if (!gridCache.has(layer.id)) {
    gridCache.set(
      layer.id,
      fetch(layerUrl(supabase, layer.grid_path))
        .then((response) => {
          if (!response.ok) throw new Error(`The ${layer.kind} layer could not be loaded.`);
          return response.arrayBuffer();
        })
        .then(gunzip)
        .then((bytes) => (layer.meta?.gridType === 'int16' ? new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2) : bytes))
        .catch((error) => {
          gridCache.delete(layer.id);
          throw error;
        })
    );
  }
  return gridCache.get(layer.id);
}

/**
 * Everything an area is measured against, from the live layers — in the shape
 * measure.js's areaFacts wants. Layers that fail to load are left out rather
 * than failing the save.
 */
export async function loadMeasuringLayers(supabase, layers) {
  const out = {};
  await Promise.all(
    Object.entries(layers ?? {}).map(async ([kind, layer]) => {
      if (!layer) return;
      try {
        const cells = await loadGrid(supabase, layer);
        if (!cells) return;
        out[kind] = kind === 'soil' ? { cells, classes: layer.meta?.classes ?? [] } : cells;
      } catch {
        // Left out: the area is saved without this one fact.
      }
    })
  );
  return out;
}

/** Which layer versions a set of facts came from, kept with them. */
export const layerVersions = (layers) =>
  Object.fromEntries(Object.entries(layers ?? {}).filter(([, l]) => l).map(([kind, l]) => [kind, l.id]));
