import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { satelliteBasemap } from '../lib/satellite.js';

/**
 * The live satellite snapshot as a base map (src/lib/satellite.js), or null
 * while there is none — or before supabase/satellite.sql has run. Read once a
 * page; a snapshot PGENRO takes shows on the next load.
 */
let loading = null;

export function loadSatelliteBasemap() {
  loading ??= Promise.resolve(
    supabase.from('satellite_snapshots').select('id, imagery_from, imagery_to, min_zoom, max_zoom').eq('status', 'live').maybeSingle()
  )
    .then(({ data, error }) => (error || !data || Array.isArray(data) ? null : satelliteBasemap(supabase, data)))
    .catch(() => null);
  return loading;
}

/** For the tests, and for the Map layers page once a snapshot goes live. */
export function forgetSatelliteBasemap() {
  loading = null;
}

export function useSatelliteBasemap() {
  const [basemap, setBasemap] = useState(null);
  useEffect(() => {
    let live = true;
    loadSatelliteBasemap().then((found) => live && setBasemap(found));
    return () => {
      live = false;
    };
  }, []);
  return basemap;
}
