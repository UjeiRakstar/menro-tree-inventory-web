/**
 * Timber volume and carbon, the way the DENR computes them.
 *
 * SOURCE
 * FMB Technical Bulletin No. 3, "Measurement Standards and Procedures in the
 * Conduct of Inventory for Standing Trees (Timber)", Forest Management Bureau,
 * DENR, April 2014. The Regional Volume Equation on page 6:
 *
 *     V = c × D² × H
 *
 * where V is cubic metres, D is diameter at breast height in centimetres and
 * H is MERCHANTABLE height in metres — the bole from the stump to the first
 * major branch, not the top of the crown. The coefficient c depends on the
 * region and on whether the species is a dipterocarp.
 *
 * Laguna is Region IV-A, which the bulletin groups under Southern Luzon.
 *
 * WHAT THIS REPLACES
 * The first version of the dashboard multiplied DBH by a flat 2.5 kg of CO₂
 * per centimetre. That had no source; it was a stand-in. This has one, and it
 * uses the two measurements the field team is already trained to take.
 *
 * WHAT IS STILL AN ASSUMPTION
 * The bulletin stops at volume. Turning cubic metres of wood into kilograms of
 * carbon needs three more numbers, and those are NOT in it — see CARBON below.
 * They are kept separate and named so they can be replaced with figures PGENRO
 * or ERDB will stand behind, rather than buried in a multiplication.
 */

/**
 * Southern Luzon (Region 4 and 5 except Palawan), FMB Technical Bulletin No. 3
 * page 6. Laguna is Region IV-A.
 */
export const VOLUME_COEFFICIENT = {
  dipterocarp: 0.00005171,
  nonDipterocarp: 0.00005204,
};

/**
 * The dipterocarps of the Philippines, by the names a tagger would write.
 *
 * Family Dipterocarpaceae: the lauans, apitong, yakal, guijo, tangile and
 * their kin. Everything else — narra, mahogany, acacia, mango, fruit and
 * ornamental trees — takes the non-dipterocarp coefficient.
 *
 * The two coefficients differ by less than 1%, so a species in the wrong
 * group changes a volume in the fourth decimal place. The split is kept
 * because the bulletin makes it, not because much turns on it.
 */
const DIPTEROCARP_NAMES = [
  'apitong', 'bagtikan', 'guijo', 'hagakhak', 'kalunti', 'lauan', 'red lauan',
  'white lauan', 'manggachapui', 'manggasinoro', 'mayapis', 'narig', 'palosapis',
  'panau', 'tangile', 'tiaong', 'yakal', 'almon', 'dalingdingan', 'gisok',
  'malaanonang', 'mangasinoro', 'saplungan', 'supa',
];

/** Is this species a dipterocarp? Matched loosely, on the common name. */
export function isDipterocarp(species) {
  const name = String(species ?? '').trim().toLowerCase();
  if (!name) return false;
  return DIPTEROCARP_NAMES.some((d) => name === d || name.includes(d));
}

/** A measurement that may arrive as 12, "12", "12 cm" or nothing at all. */
function measure(value) {
  if (value === null || value === undefined) return null;
  const number = parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Diameter at breast height, in whole centimetres.
 *
 * The bulletin rounds DOWN, not to nearest: "To avoid over estimation of the
 * volume and compensate measurement error, DBH is adjusted in a decreasing
 * sense (e.g. 24.5cm is recorded as 24cm DBH)." Page 2.
 */
export function dbhCm(tree) {
  const raw = measure(tree?.dbh);
  return raw === null ? null : Math.floor(raw);
}

/**
 * Merchantable height in metres, recorded to the nearest metre.
 *
 * Only merchantable_height is used. Total height is the whole tree including
 * its crown, and putting that into a bole-volume equation would overstate
 * every tree — so a record without a merchantable height has no volume here
 * rather than a flattering one.
 */
export function merchantableHeightM(tree) {
  const raw = measure(tree?.merchantable_height ?? tree?.merchantableHeight);
  return raw === null ? null : Math.round(raw);
}

/**
 * Timber volume of one tree, in cubic metres, or null when it cannot be had.
 *
 * Null is the honest answer for a tree nobody has measured a height for: the
 * figure is not zero, it is unknown, and the two should not be added together.
 */
export function volumeOf(tree) {
  const diameter = dbhCm(tree);
  const height = merchantableHeightM(tree);
  if (diameter === null || height === null) return null;

  const coefficient = isDipterocarp(tree?.species)
    ? VOLUME_COEFFICIENT.dipterocarp
    : VOLUME_COEFFICIENT.nonDipterocarp;

  return coefficient * diameter * diameter * height;
}

/* ===========================================================================
 * CARBON
 *
 * Volume is wood. Carbon is what that wood is made of, and the chain from one
 * to the other is:
 *
 *   above-ground biomass = volume × wood density × biomass expansion factor
 *   carbon               = above-ground biomass × carbon fraction
 *   carbon dioxide       = carbon × 44/12
 *
 * CARBON_FRACTION and CO2_PER_CARBON are settled science — 0.47 is the IPCC
 * default for tropical species, and 44/12 is the ratio of the molecular
 * weights, which is arithmetic.
 *
 * WOOD_DENSITY and BIOMASS_EXPANSION_FACTOR are not. Both vary by species and
 * by stand, the values here are broad tropical-hardwood defaults, and they are
 * the two numbers to replace when PGENRO or ERDB say what Laguna should use.
 * Anything derived from them is labelled an estimate wherever it is shown.
 * =========================================================================== */

/** Oven-dry tonnes per cubic metre. A broad tropical hardwood default. */
export const WOOD_DENSITY = 0.57;

/** Branches, twigs and foliage, as a multiple of the merchantable bole. */
export const BIOMASS_EXPANSION_FACTOR = 1.5;

/** Carbon as a share of oven-dry biomass. IPCC default for tropical species. */
export const CARBON_FRACTION = 0.47;

/** Molecular weight of CO₂ over that of carbon. */
export const CO2_PER_CARBON = 44 / 12;

/** Above-ground biomass of one tree, in kilograms, or null. */
export function biomassKg(tree) {
  const volume = volumeOf(tree);
  if (volume === null) return null;
  return volume * WOOD_DENSITY * 1000 * BIOMASS_EXPANSION_FACTOR;
}

/**
 * Carbon dioxide held in one tree, in kilograms, or null when it has not been
 * measured well enough to say.
 */
export function carbonDioxideKg(tree) {
  const biomass = biomassKg(tree);
  if (biomass === null) return null;
  return biomass * CARBON_FRACTION * CO2_PER_CARBON;
}

/**
 * How much of a set of trees this can actually speak for.
 *
 * A total built from a third of the inventory is not wrong, but presenting it
 * without saying so would be. Every screen showing a carbon or volume figure
 * shows this beside it.
 */
export function measuredCoverage(trees) {
  const rows = Array.isArray(trees) ? trees : [];
  const measured = rows.filter((tree) => volumeOf(tree) !== null).length;
  return { measured, total: rows.length };
}
