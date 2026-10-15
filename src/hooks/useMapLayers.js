import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { layerUrl } from '../lib/layers/browser.js';

/**
 * PGENRO's live layers and the CLIRAM figures (supabase/map_layers.sql).
 *
 *   layers       { soil, elevation, flood, landslide } — the live row of each
 *                kind, or null, with `pictureUrl` / `shapesUrl` added
 *   climateByLgu Map(lgu psgc → { temperature, rainfall, scenario, … })
 *   missing      map_layers.sql has not been run: no layers, not an error
 *   reload()
 */
const isMissingTable = (error) =>
  Boolean(error) && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message ?? ''));

export function useMapLayers() {
  const [rows, setRows] = useState([]);
  const [climate, setClimate] = useState([]);
  const [missing, setMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [layers, climates] = await Promise.all([
      supabase.from('map_layers').select('*').eq('active', true),
      supabase.from('lgu_climate').select('*'),
    ]);
    setMissing(isMissingTable(layers.error));
    setRows(!layers.error && Array.isArray(layers.data) ? layers.data : []);
    setClimate(!climates.error && Array.isArray(climates.data) ? climates.data : []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const layers = useMemo(() => {
    const byKind = { soil: null, elevation: null, flood: null, landslide: null };
    for (const row of rows) {
      if (row?.kind in byKind) {
        byKind[row.kind] = {
          ...row,
          pictureUrl: layerUrl(supabase, row.picture_path),
          shapesUrl: layerUrl(supabase, row.shapes_path),
        };
      }
    }
    return byKind;
  }, [rows]);

  const climateByLgu = useMemo(() => new Map(climate.map((row) => [Number(row.lgu_psgc), row])), [climate]);

  return { layers, climateByLgu, missing, loaded, reload };
}
