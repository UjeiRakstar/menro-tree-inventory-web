/**
 * SAMPLE AREAS FOR THE PUBLIC MAP — NOT REAL MEASUREMENTS.
 *
 * Every field below except the geometry is invented. The panel that draws it
 * says so on its face, with a "Sample data" badge, because a page that shows a
 * soil series and a landslide figure with no such qualifier is making a claim
 * about somebody's land.
 *
 * What IS real is where these polygons sit: each one was fitted inside the
 * actual barangay boundary it names, from src/data/Laguna-Barangays.geojson,
 * and a test asserts it stays inside. So the shapes are in the right place even
 * while the numbers attached to them are placeholders.
 *
 * REPLACING THIS WITH REAL DATA
 * -----------------------------
 * Nothing imports this file but src/lib/mapSites.js. When the PGENRO account
 * can upload layers, `loadMapSites()` fetches them instead and this file is
 * deleted; no component changes, because the components only ever see the
 * shape below.
 *
 * Each feature is ordinary GeoJSON. Its properties:
 *
 *   id            stable key
 *   kind          'land-cover' | 'planting-site'
 *   name          what the panel titles it
 *   coverId       land cover only — an id from src/lib/landCover.js
 *   barangay, municipality, province
 *   elevationType, elevationM     Copernicus DEM, once uploaded
 *   soilType                      BSWM soil series shapefile
 *   rainfallMmPerYear, temperatureC   DOST-PAGASA CLIRAM, per LGU
 *   hazards       { landslide, flood } — each { share } of the area, or
 *                 { areaM2 } once the UPRI NOAH layer can be intersected
 *   updatedAt     ISO date the record was last touched
 *
 * Planting sites carry, in addition:
 *
 *   verifiedBy    the office that set the site
 *   status        'open' | 'full' | 'maintenance'
 *   plantingWindow, spacingM, accessNote, contact
 *   recommended   [{ common, scientific, why }]
 *
 * Area is NOT a property. It is measured from the polygon — see
 * src/lib/areaGeometry.js — so a corrected boundary corrects the figure.
 */

export const MOCK_MAP_SITES = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 'lc-labuin-secondary-forest',
        kind: 'land-cover',
        name: 'Labuin Secondary Forest',
        coverId: 'secondary-forest',
        barangay: 'Labuin',
        municipality: 'Santa Cruz',
        province: 'Laguna',
        elevationType: 'Lowland',
        elevationM: 38,
        soilType: 'Macolod clay loam',
        rainfallMmPerYear: 2145,
        temperatureC: 27.3,
        hazards: { landslide: { share: 0.08 }, flood: { share: 0.21 } },
        updatedAt: '2026-09-18',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [121.39743, 14.24797], [121.39694, 14.24912], [121.39588, 14.24989],
          [121.39483, 14.24915], [121.39418, 14.24845], [121.3938, 14.24735],
          [121.39485, 14.24681], [121.39582, 14.24636], [121.39706, 14.24672],
          [121.39743, 14.24797],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'lc-gatid-brushland',
        kind: 'land-cover',
        name: 'Gatid Brushland',
        coverId: 'brushlands',
        barangay: 'Gatid',
        municipality: 'Santa Cruz',
        province: 'Laguna',
        elevationType: 'Lowland',
        elevationM: 52,
        soilType: 'Lipa clay loam',
        rainfallMmPerYear: 2145,
        temperatureC: 27.3,
        hazards: { landslide: { share: 0.14 }, flood: { share: 0.05 } },
        updatedAt: '2026-09-18',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [121.38457, 14.26643], [121.38395, 14.2672], [121.38316, 14.26784],
          [121.38229, 14.26728], [121.382, 14.26643], [121.38231, 14.2656],
          [121.38316, 14.26518], [121.38397, 14.26565], [121.38457, 14.26643],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'lc-calios-fallow',
        kind: 'land-cover',
        name: 'Calios Agroforestry Fallow',
        coverId: 'fallow-agroforestry',
        barangay: 'Calios',
        municipality: 'Santa Cruz',
        province: 'Laguna',
        elevationType: 'Lowland',
        elevationM: 24,
        soilType: 'Bay sandy loam',
        rainfallMmPerYear: 2145,
        temperatureC: 27.5,
        hazards: { landslide: { share: 0 }, flood: { share: 0.37 } },
        updatedAt: '2026-09-18',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [121.40591, 14.28104], [121.40536, 14.28182], [121.40455, 14.28179],
          [121.40395, 14.2814], [121.40374, 14.28058], [121.40446, 14.27992],
          [121.40533, 14.2803], [121.40591, 14.28104],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'lc-bubukal-dipterocarp',
        kind: 'land-cover',
        name: 'Bubukal Dipterocarp Stand',
        coverId: 'dipterocarps',
        barangay: 'Bubukal',
        municipality: 'Santa Cruz',
        province: 'Laguna',
        elevationType: 'Lowland',
        elevationM: 61,
        soilType: 'Macolod clay loam',
        rainfallMmPerYear: 2145,
        temperatureC: 27.1,
        hazards: { landslide: { share: 0.11 }, flood: { share: 0.02 } },
        updatedAt: '2026-09-18',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [121.4036, 14.25936], [121.40301, 14.25988], [121.40241, 14.26009],
          [121.40181, 14.25972], [121.40195, 14.25906], [121.40236, 14.2584],
          [121.40306, 14.25877], [121.4036, 14.25936],
        ]],
      },
    },

    {
      type: 'Feature',
      properties: {
        id: 'ps-labuin',
        kind: 'planting-site',
        name: 'Labuin',
        barangay: 'Labuin',
        municipality: 'Santa Cruz',
        province: 'Laguna',
        verifiedBy: 'PGENRO Forestry Division',
        status: 'open',
        elevationType: 'Lowland',
        elevationM: 33,
        soilType: 'Macolod clay loam',
        rainfallMmPerYear: 2145,
        temperatureC: 27.3,
        hazards: { landslide: { share: 0.01 }, flood: { share: 0.0003 } },
        plantingWindow: 'June to September, with the rains',
        spacingM: 3,
        accessNote: 'Reached by the barangay road off the Santa Cruz–Lumban highway; the last 400 m is unpaved.',
        contact: 'PGENRO Forestry Division · pgenro@laguna.gov.ph · 049 557 1531',
        recommended: [
          { common: 'Santol', scientific: 'Sandoricum koetjape', why: 'Fruiting, thrives on clay loam below 300 m' },
          { common: 'Atis', scientific: 'Annona squamosa', why: 'Fruiting, tolerates the dry months here' },
          { common: 'Kaimito', scientific: 'Chrysophyllum cainito', why: 'Fruiting, deep-rooting on well-drained ground' },
          { common: 'Narra', scientific: 'Pterocarpus indicus', why: 'Native hardwood, the Philippine national tree' },
          { common: 'Marang', scientific: 'Artocarpus odoratissimus', why: 'Fruiting, wants the rainfall this site gets' },
          { common: 'Mangga', scientific: 'Mangifera indica', why: 'Fruiting, long-lived and widely planted in Laguna' },
        ],
        updatedAt: '2026-09-30',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [121.40196, 14.24347], [121.40156, 14.24447], [121.40053, 14.24512],
          [121.39941, 14.24456], [121.39906, 14.24347], [121.39952, 14.24248],
          [121.40053, 14.24221], [121.40165, 14.24238], [121.40196, 14.24347],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'ps-pagsawitan',
        kind: 'planting-site',
        name: 'Pagsawitan Riverbank',
        barangay: 'Pagsawitan',
        municipality: 'Santa Cruz',
        province: 'Laguna',
        verifiedBy: 'PGENRO Forestry Division',
        status: 'open',
        elevationType: 'Lowland',
        elevationM: 8,
        soilType: 'Bay sandy loam',
        rainfallMmPerYear: 2145,
        temperatureC: 27.6,
        hazards: { landslide: { share: 0 }, flood: { share: 0.62 } },
        plantingWindow: 'June to September, with the rains',
        spacingM: 4,
        accessNote: 'Along the Santa Cruz River bank; park at the barangay hall and walk in.',
        contact: 'PGENRO Forestry Division · pgenro@laguna.gov.ph · 049 557 1531',
        recommended: [
          { common: 'Bani', scientific: 'Pongamia pinnata', why: 'Riverbank native, holds the bank and takes flooding' },
          { common: 'Talisay', scientific: 'Terminalia catappa', why: 'Tolerates waterlogging and salt spray' },
          { common: 'Molave', scientific: 'Vitex parviflora', why: 'Native hardwood for the drier upper bank' },
          { common: 'Bamboo (Kawayan tinik)', scientific: 'Bambusa blumeana', why: 'Binds a bank that floods six months a year' },
        ],
        updatedAt: '2026-09-30',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [121.42456, 14.26983], [121.42441, 14.27053], [121.42369, 14.27048],
          [121.42316, 14.27015], [121.4232, 14.26953], [121.42364, 14.269],
          [121.42435, 14.2692], [121.42456, 14.26983],
        ]],
      },
    },
  ],
};

export default MOCK_MAP_SITES;
