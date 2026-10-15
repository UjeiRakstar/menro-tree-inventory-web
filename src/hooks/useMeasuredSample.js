import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';
import { sampleWithGround } from '../lib/mapAreas.js';
import { MUNICIPALITY_LIST } from '../lib/lagunaBoundaries.js';
import { factsFor } from '../lib/layers/facts.js';
import { loadMeasuringLayers } from '../lib/layers/browser.js';
import { siteAreaM2 } from '../lib/mapSites.js';

const psgcOf = (municipality) => MUNICIPALITY_LIST.find((lgu) => lgu.name === municipality)?.psgc ?? null;

/**
 * The area in the panel, with PGENRO's layers under it when it is a sample.
 *
 * A saved area was measured when it was saved and carries its facts; a sample
 * carries invented ones. Measured here, when it is opened — not on load, so a
 * visitor who never opens one never downloads the grids — and the layers'
 * answers replace what was made up (mapAreas.sampleWithGround).
 *
 *   feature   the selected area, or null
 *   mapLayers useMapLayers()
 */
export function useMeasuredSample(feature, mapLayers) {
  const [measured, setMeasured] = useState(null);
  const sample = Boolean(feature) && !feature.properties?.saved;
  const id = feature?.properties?.id;
  const { layers, climateByLgu } = mapLayers;

  useEffect(() => {
    setMeasured(null);
    if (!sample) return undefined;
    const climate = climateByLgu.get(psgcOf(feature.properties.municipality)) ?? null;
    const live = Object.values(layers).some(Boolean);
    if (!live) {
      if (climate) setMeasured({ id, feature: sampleWithGround(feature, null, climate) });
      return undefined;
    }
    let cancelled = false;
    loadMeasuringLayers(supabase, layers).then((grids) => {
      if (cancelled) return;
      const facts = factsFor(grids, layers, { geometry: feature.geometry, areaM2: siteAreaM2(feature) });
      setMeasured({ id, feature: sampleWithGround(feature, facts, climate) });
    });
    return () => {
      cancelled = true;
    };
    // The feature is the same while its id is; it is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sample, layers, climateByLgu]);

  if (!feature) return null;
  return sample && measured?.id === id ? measured.feature : feature;
}
