/**
 * What can be laid over the base map.
 *
 * Street and satellite are the base maps — one at a time, chosen from the
 * stacked base map picture. Everything here goes ON TOP of whichever is
 * showing.
 *
 * Two kinds. The first are layers this system already has, any number of them
 * on at once, from the Layers panel. The second are PGENRO's survey layers,
 * one at a time, from the stacked survey picture (components/map/MapPickers):
 * each colours the whole ground, and two together would be a muddle. Those
 * not uploaded yet are shown greyed, saying so.
 */

/** Layers the map can draw today, all on by default. */
export const LIVE_LAYERS = Object.freeze([
  { id: 'trees', label: 'Tagged trees', detail: 'Coloured by what each needs', publicDetail: 'Every tree tagged in Laguna' },
  { id: 'sites', label: 'Land cover and planting sites', detail: 'As the offices saved them; samples until there are some' },
  { id: 'boundaries', label: 'City and municipal boundaries', detail: 'PSA / NAMRIA' },
  { id: 'barangays', label: 'Barangay boundaries', detail: 'Inside the city or municipality in focus — PSA' },
]);

/** The PGENRO uploads, by the agency each comes from. */
export const PGENRO_OVERLAYS = Object.freeze([
  { id: 'soil', label: 'Soil type', short: 'Soil', source: 'DA–BSWM soil series' },
  { id: 'elevation', label: 'Elevation', short: 'Elevation', source: 'Copernicus DEM' },
  { id: 'flood', label: 'Flood hazard', short: 'Flood', source: 'UP NOAH' },
  { id: 'landslide', label: 'Rain-induced landslide hazard', short: 'Landslide', source: 'UP NOAH' },
]);

export const DEFAULT_LAYERS = Object.freeze(
  Object.fromEntries(LIVE_LAYERS.map((layer) => [layer.id, true]))
);
