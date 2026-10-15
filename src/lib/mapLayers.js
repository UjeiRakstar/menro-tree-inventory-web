/**
 * What can be laid over the base map.
 *
 * Street and satellite are the base maps — one at a time, chosen from the two
 * picture buttons. Everything here goes ON TOP of whichever is showing, and
 * any number can be on at once.
 *
 * Two kinds. The first are layers this system already has. The second are the
 * survey layers the PGENRO account will upload; they are listed now so the
 * office knows they are coming and where they come from, and they switch on
 * the day the upload exists. Until then they are shown, disabled, in amber —
 * the same "awaiting data" the rest of the site uses.
 */

/** Layers the map can draw today, all on by default. */
export const LIVE_LAYERS = Object.freeze([
  { id: 'trees', label: 'Tagged trees', detail: 'Coloured by what each needs', publicDetail: 'Every tree tagged in Laguna' },
  { id: 'sites', label: 'Land cover and planting sites', detail: 'As the offices saved them; samples until there are some' },
  { id: 'boundaries', label: 'City and municipal boundaries', detail: 'PSA / NAMRIA' },
]);

/** The PGENRO uploads, by the agency each comes from. */
export const PGENRO_OVERLAYS = Object.freeze([
  { id: 'soil', label: 'Soil type', source: 'DA–BSWM soil series' },
  { id: 'elevation', label: 'Elevation', source: 'Copernicus DEM' },
  { id: 'flood', label: 'Flood hazard', source: 'UP NOAH' },
  { id: 'landslide', label: 'Rain-induced landslide hazard', source: 'UP NOAH' },
]);

export const DEFAULT_LAYERS = Object.freeze(
  Object.fromEntries(LIVE_LAYERS.map((layer) => [layer.id, true]))
);
