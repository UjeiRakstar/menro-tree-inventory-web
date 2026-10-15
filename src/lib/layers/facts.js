import { LAGUNA_GRID } from './grid.js';
import { areaFacts } from './measure.js';
import { layerVersions, loadMeasuringLayers } from './browser.js';

/**
 * An area's facts from the live layers, ready to store as `layer_facts`:
 * what measure.js finds, which layer versions it found it in, and when.
 * Null when no layer is live — nothing to say, rather than an empty answer.
 */
export function factsFor(grids, layers, { geometry, areaM2 }) {
  if (!grids || Object.keys(grids).length === 0) return null;
  return {
    ...areaFacts(LAGUNA_GRID, geometry, grids, { areaM2 }),
    layers: layerVersions(layers),
    measuredAt: new Date().toISOString(),
  };
}

/** Measure one area against whatever layers are live. */
export async function measureArea(supabase, layers, area) {
  const grids = await loadMeasuringLayers(supabase, layers);
  return factsFor(grids, layers, area);
}

/**
 * Every saved area measured again — after PGENRO replaces a layer. Through
 * set_area_layer_facts(), which PGENRO may call on any area and which touches
 * nothing but the facts. Returns { done, failed }.
 */
export async function refreshAllAreaFacts(supabase, layers, { onProgress = () => {} } = {}) {
  const { data: areas, error } = await supabase.from('map_areas').select('id, geometry, area_m2');
  if (error || !Array.isArray(areas)) return { done: 0, failed: 0 };
  const grids = await loadMeasuringLayers(supabase, layers);
  let done = 0;
  let failed = 0;
  for (const area of areas) {
    const facts = factsFor(grids, layers, { geometry: area.geometry, areaM2: area.area_m2 });
    const { error: rpcError } = await supabase.rpc('set_area_layer_facts', { p_area: area.id, p_facts: facts });
    if (rpcError) failed += 1;
    else done += 1;
    onProgress(done + failed, areas.length);
  }
  return { done, failed };
}
