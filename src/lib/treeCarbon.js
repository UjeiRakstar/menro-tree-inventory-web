/**
 * The carbon in a tree, from its diameter and total height (decided 20 October).
 *
 * SOURCE
 * Chave, J., Réjou-Méchain, M., Búrquez, A. et al. (2014), "Improved allometric
 * models to estimate the aboveground biomass of tropical trees", Global Change
 * Biology 20: 3177–3190, equation 4:
 *
 *     AGB = 0.0673 × (ρ × D² × H)^0.976
 *
 * where AGB is above-ground biomass in kilograms, ρ the wood density in g/cm³,
 * D the diameter at breast height in centimetres and H the TOTAL height in
 * metres. It is fitted on 4,004 trees from 58 tropical sites, and it is the
 * equation Pansit (2019, "Carbon storage and sequestration potential of urban
 * trees in Cebu City, Philippines", Mindanao Journal of Science and Technology
 * 17: 98–111) applies to Philippine city trees.
 *
 * WHAT THIS REPLACES
 * Carbon came from the DENR volume equation (treeVolume.js), which needs the
 * MERCHANTABLE height — the bole up to the first branch — and most records
 * have none. Chave's equation takes the total height the field app already
 * records, so it speaks for far more of the inventory. Timber volume is still
 * the DENR's: that is what volume is for.
 *
 * WHAT IS STILL AN ASSUMPTION
 * The wood density. It differs by species, from about 0.3 to over 0.9 g/cm³.
 * Until a species has its own, every tree takes 0.57 g/cm³, the mean for
 * tropical Asian species (Reyes, Brown, Chapman & Lugo 1992, "Wood densities
 * of tropical tree species", USDA Forest Service General Technical Report
 * SO-88), the figure the IPCC defaults to for the region. A tree record that
 * carries its own `wood_density` uses it.
 */

/** Chave et al. 2014, equation 4. */
export const CHAVE_2014 = Object.freeze({ a: 0.0673, b: 0.976 });

/** g/cm³: the tropical Asian mean (Reyes et al. 1992), for a species with none of its own. */
export const DEFAULT_WOOD_DENSITY = 0.57;

/** Carbon as a share of oven-dry biomass, as measured in Philippine wood (Lasco & Pulhin 2000). */
export const CARBON_FRACTION = 0.45;

/** Molecular weight of CO₂ over that of carbon. */
export const CO2_PER_CARBON = 44 / 12;

/**
 * Roots, as a share of the above-ground biomass: 0.37, the ratio the Climate
 * Change Commission's Community-level GHG Inventory Tool (31 July 2024) applies
 * to forest land, and the IPCC's for tropical rain forest (2006 Guidelines,
 * Volume 4, Table 4.4). Used where a figure is to sit beside the CCC tool's —
 * the GHG inventory report — and nowhere else: the dashboard reports what
 * stands above ground.
 */
export const ROOT_SHOOT_RATIO = 0.37;

/**
 * How much a trunk thickens in a year, in centimetres of diameter.
 *
 * 1.19 cm: the mean annual increment in diameter at breast height of sixty
 * species in smallholder reforestation on Leyte (Schneider, Ashton, Montagnini
 * & Milan 2013, "Growth performance of sixty tree species in smallholder
 * reforestation trials on Leyte, Philippines", New Forests 45: 83–96), the
 * figure Pansit (2019) applies to city trees.
 *
 * It is borrowed: measured in the Philippines, not in Laguna, and on
 * reforestation sites rather than streets — an urban tree may grow slower.
 * Better still would be two diameter readings of the same tree at different
 * dates, then a per-species figure from PGENRO or ERDB.
 */
export const ANNUAL_DBH_GROWTH_CM = 1.19;

/** The smallest diameter Chave's trees include; below it the equation was never fitted. */
export const MIN_DBH_CM = 5;

/** A tree measured at breast height is at least that tall. */
export const MIN_HEIGHT_M = 1.3;

/**
 * Palms, bamboos and bananas: they have no wood in the sense the equation
 * means, and their biomass is not a tree's. They are named and left out, not
 * given a figure of nothing.
 */
const NOT_A_TREE =
  /\b(palms?|palma|niyog|coconut|cocos|bunga|areca|arecaceae|anahaw|buri|kaong|sago|bamboos?|kawayan|bambusa|poaceae|bananas?|saging|musa|musaceae)\b/i;

export function isPalmOrBamboo(tree) {
  return NOT_A_TREE.test(`${tree?.species ?? ''} ${tree?.scientific_name ?? ''}`);
}

/** A measurement that may arrive as 12, "12", "12 cm" or nothing at all. */
function measure(value) {
  if (value === null || value === undefined) return null;
  const number = parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** Diameter at breast height in centimetres, as measured — not floored, unlike a volume's. */
export function dbhOf(tree) {
  return measure(tree?.dbh);
}

/**
 * Total height in metres. A height class from an LGU's inventory ("11-15 m")
 * counts at its middle, and says so (`fromClass`).
 */
export function totalHeightOf(tree) {
  const text = String(tree?.total_height ?? '').replace(/,/g, '');
  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    if (high > low) return { metres: (low + high) / 2, fromClass: true };
  }
  const metres = measure(tree?.total_height);
  return metres === null ? null : { metres, fromClass: false };
}

/** The wood density the tree is worked out at, in g/cm³. */
export function woodDensityOf(tree) {
  const own = measure(tree?.wood_density);
  return own !== null && own >= 0.1 && own <= 1.5 ? own : DEFAULT_WOOD_DENSITY;
}

/**
 * Why a tree has no carbon figure, in words — or null when it has one. The
 * order is the order a field officer would fix them in.
 */
export function whyNoCarbon(tree) {
  if (isPalmOrBamboo(tree)) return 'A palm, bamboo or banana: not a tree the equation is for';
  const dbh = dbhOf(tree);
  if (dbh === null) return 'No diameter recorded';
  if (dbh < MIN_DBH_CM) return `Diameter under ${MIN_DBH_CM} cm`;
  const height = totalHeightOf(tree);
  if (height === null) return 'No total height recorded';
  if (height.metres < MIN_HEIGHT_M) return `Total height under ${MIN_HEIGHT_M} m`;
  return null;
}

/** Chave's equation itself, so a year's growth can be put through it. */
function chaveKg(density, dbhCm, heightM) {
  return CHAVE_2014.a * (density * dbhCm * dbhCm * heightM) ** CHAVE_2014.b;
}

/**
 * Above-ground biomass of one tree, in kilograms, or null when it cannot be had.
 *
 * Null is the honest answer for a tree with no height: the figure is not zero,
 * it is unknown, and the two should not be added together.
 */
export function biomassKg(tree) {
  if (whyNoCarbon(tree)) return null;
  return chaveKg(woodDensityOf(tree), dbhOf(tree), totalHeightOf(tree).metres);
}

/** Carbon dioxide held above ground in one tree, in kilograms, or null. */
export function carbonDioxideKg(tree) {
  const biomass = biomassKg(tree);
  return biomass === null ? null : biomass * CARBON_FRACTION * CO2_PER_CARBON;
}

/**
 * The biomass one tree adds in a year, in kilograms, or null: the equation at
 * today's diameter and at a year's growth more. The height is held where it
 * is, so the figure leans low rather than high.
 */
export function annualBiomassKg(tree) {
  if (whyNoCarbon(tree)) return null;
  const density = woodDensityOf(tree);
  const dbh = dbhOf(tree);
  const height = totalHeightOf(tree).metres;
  return chaveKg(density, dbh + ANNUAL_DBH_GROWTH_CM, height) - chaveKg(density, dbh, height);
}

/** The CO₂ one tree takes up above ground in a year, in kilograms, or null. */
export function annualCo2Kg(tree) {
  const biomass = annualBiomassKg(tree);
  return biomass === null ? null : biomass * CARBON_FRACTION * CO2_PER_CARBON;
}

/**
 * How much of a set of trees the carbon figure can speak for. Every screen
 * showing a carbon figure shows this beside it.
 */
export function carbonCoverage(trees) {
  const rows = Array.isArray(trees) ? trees : [];
  const measured = rows.filter((tree) => !whyNoCarbon(tree)).length;
  return { measured, total: rows.length };
}
