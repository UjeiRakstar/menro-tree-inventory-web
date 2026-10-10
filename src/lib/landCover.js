/**
 * Mean annual increment of above-ground biomass, by land cover.
 *
 * Every figure here is a published Philippine measurement, each with the place
 * it was measured and the study it came from. A land cover's MAI multiplied by
 * the area it covers is how much biomass that area adds in a year.
 *
 * The unit written in the source tables is "t/ha". It is a RATE — tonnes per
 * hectare PER YEAR — and the field is named for that, because an area total in
 * "t/ha" is a unit that cannot be right: multiply tonnes per hectare by
 * hectares and the hectares cancel, leaving tonnes a year.
 *
 * Four covers are shown to the public: the ones common in Laguna. The rest are
 * species plantations, kept here in full because they are the same table and
 * splitting it would invite the two halves to drift. They are not shown until
 * the PGENRO account can turn them on — see PARKED.md.
 */

/**
 * The published table, in full.
 *
 * `id` is ours, not the study's: four entries are Swietenia macrophylla
 * measured in four places, so the species name alone does not identify a row.
 * A blank `source` is a blank in the table as it was given to us, not a figure
 * somebody made up — the panel says so rather than quietly leaving it out.
 */
export const LAND_COVER_TYPES = [
  // Shown to the public: what actually covers ground in Laguna.
  {
    id: 'secondary-forest',
    label: 'Secondary forest',
    maiTPerHaYear: 3.5,
    location: 'Leyte',
    source: 'Lasco et al., 1999',
    publicVisible: true,
  },
  {
    id: 'brushlands',
    label: 'Brushlands',
    maiTPerHaYear: 9.5,
    location: 'Leyte',
    source: 'Lasco et al., 1999',
    publicVisible: true,
  },
  {
    id: 'dipterocarps',
    label: 'Dipterocarps',
    maiTPerHaYear: 6.2326755,
    location: 'Makiling',
    source: 'Racelis, 2000',
    publicVisible: true,
  },
  {
    id: 'fallow-agroforestry',
    label: 'Fallow system (agroforestry)',
    maiTPerHaYear: 10.6,
    location: 'Cebu',
    source: 'Lasco and Suson, 1989',
    publicVisible: true,
  },

  // Species plantations — waiting on the PGENRO account.
  { id: 'swietenia-makiling-racelis', label: 'Swietenia macrophylla', maiTPerHaYear: 14.24, location: 'Makiling', source: 'Racelis, 2000' },
  { id: 'acacia-auriculiformis-necija-lasco2000', label: 'Acacia auriculiformis', maiTPerHaYear: 9.08, location: 'N. Ecija', source: 'Lasco et al., 2000' },
  { id: 'swietenia-leyte', label: 'Swietenia macrophylla', maiTPerHaYear: 8.39, location: 'Leyte', source: 'Lasco et al., 1999' },
  { id: 'gmelina-leyte', label: 'Gmelina arborea', maiTPerHaYear: 15.055, location: 'Leyte', source: 'Lasco et al., 1999; Kawahara et al., 1981; Buante, 1997; Lasco, 2001' },
  { id: 'paraserianthes-mindanao', label: 'Paraserianthes falcataria', maiTPerHaYear: 8.5, location: 'Mindanao', source: 'Kawahara et al., 1981' },
  { id: 'swietenia-mindanao', label: 'Swietenia macrophylla', maiTPerHaYear: 19.6, location: 'Mindanao', source: 'Kawahara et al., 1981' },
  { id: 'acacia-auriculiformis-necija-lasco2001', label: 'Acacia auriculiformis', maiTPerHaYear: 3.451785667, location: 'N. Ecija', source: 'Lasco, 2001; Sakurai et al., 1994' },
  { id: 'tectona-necija', label: 'Tectona grandis', maiTPerHaYear: 1.192558, location: 'N. Ecija', source: '' },
  { id: 'gmelina-necija', label: 'Gmelina arborea', maiTPerHaYear: 2.0771235, location: 'N. Ecija', source: '' },
  { id: 'pinus-kesiya-necija', label: 'Pinus kesiya', maiTPerHaYear: 8.29455, location: 'N. Ecija', source: '' },
  { id: 'pinus-kesiya-broadleaf-necija', label: 'Pinus kesiya + broadleaf spp.', maiTPerHaYear: 6.403308, location: 'N. Ecija', source: '' },
  { id: 'acacia-mangium-leyte', label: 'Acacia mangium', maiTPerHaYear: 14.225, location: 'Leyte', source: 'Buante, 1997; Lasco, 2001' },
  { id: 'acacia-auriculiformis-leyte', label: 'Acacia auriculiformis', maiTPerHaYear: 15.875, location: 'Leyte', source: 'Buante, 1997; Lasco, 2001' },
  { id: 'acacia-neriifolia-iloilo', label: 'Acacia neriifolia', maiTPerHaYear: 21.78127, location: 'Iloilo', source: 'Lasco, 2001' },
  { id: 'acacia-holosericea-iloilo', label: 'Acacia holosericea', maiTPerHaYear: 8.599975, location: 'Iloilo', source: 'Lachica-Lustica, 1997' },
  { id: 'acacia-crassicarpa-iloilo', label: 'Acacia crassicarpa', maiTPerHaYear: 38.94815, location: 'Iloilo', source: '' },
  { id: 'acacia-aulacocarpa-iloilo', label: 'Acacia aulacocarpa', maiTPerHaYear: 14.09045, location: 'Iloilo', source: '' },
  { id: 'leucaena-diversifolia-iloilo', label: 'Leucaena diversifolia', maiTPerHaYear: 0.164304, location: 'Iloilo', source: '' },
  { id: 'casuarina-cunninghamiana-iloilo', label: 'Casuarina cunninghamiana', maiTPerHaYear: 0.802636, location: 'Iloilo', source: '' },
  { id: 'casuarina-equisetifolia-iloilo', label: 'Casuarina equisetifolia', maiTPerHaYear: 3.886252, location: 'Iloilo', source: '' },
  { id: 'eucalyptus-citriodora-iloilo', label: 'Eucalyptus citriodora', maiTPerHaYear: 13.10143, location: 'Iloilo', source: '' },
  { id: 'eucalyptus-cloeziana-iloilo', label: 'Eucalyptus cloeziana', maiTPerHaYear: 12.06799, location: 'Iloilo', source: '' },
  { id: 'eucalyptus-pellita-iloilo', label: 'Eucalyptus pellita', maiTPerHaYear: 8.498015, location: 'Iloilo', source: '' },
  { id: 'eucalyptus-tereticornis-iloilo', label: 'Eucalyptus tereticornis', maiTPerHaYear: 12.46637, location: 'Iloilo', source: '' },
  { id: 'swietenia-makiling-lasco', label: 'Swietenia macrophylla', maiTPerHaYear: 7.499412, location: 'Makiling', source: 'Lasco, 2001; Sakurai et al., 1994' },
];

/** The four a visitor can meet today. */
export const PUBLIC_LAND_COVER = LAND_COVER_TYPES.filter((cover) => cover.publicVisible);

/** One cover by id, or null. */
export const landCoverById = (id) => LAND_COVER_TYPES.find((cover) => cover.id === id) ?? null;

/**
 * How much above-ground biomass an area adds in a year, in tonnes.
 *
 * Null rather than zero when the cover is unknown: an unclassified area has an
 * unknown increment, not an increment of nothing.
 */
export function annualBiomassTonnes(coverId, hectares) {
  const cover = landCoverById(coverId);
  const area = Number(hectares);
  if (!cover || !Number.isFinite(area) || area < 0) return null;
  return cover.maiTPerHaYear * area;
}

/**
 * What the ⓘ beside the MAI figure says.
 *
 * The rate was measured somewhere else — Leyte, Makiling, Cebu — and applied
 * here, which is a real assumption and is named as one rather than buried.
 */
export function maiSourceNote(coverId) {
  const cover = landCoverById(coverId);
  if (!cover) {
    return 'No land cover has been classified for this area yet, so there is no rate to apply.';
  }

  const study = cover.source
    ? `${cover.source}, measured in ${cover.location}`
    : `measured in ${cover.location}; the source table records no citation for this figure`;

  return (
    `Area × ${cover.maiTPerHaYear} tonnes per hectare per year, the published mean annual ` +
    `increment of above-ground biomass for ${cover.label.toLowerCase()} (${study}). ` +
    'No equivalent has been measured in Laguna, so a rate from elsewhere in the Philippines ' +
    'is applied here — read it as an order of magnitude, not as a survey of this ground.'
  );
}

/** Tonnes a year, written for reading. */
export function formatTonnesPerYear(tonnes) {
  if (tonnes === null || tonnes === undefined || !Number.isFinite(Number(tonnes))) return '—';
  const value = Number(tonnes);
  const decimals = value < 100 ? 1 : 0;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
