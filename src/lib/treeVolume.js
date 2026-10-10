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
 * The shortest merchantable height that can be a merchantable height.
 *
 * The bulletin measures the bole from a stump about 0.5 m above the ground to
 * the first major branch, and records it to the nearest metre. A value below a
 * metre is therefore not a short tree — it is not a merchantable height at
 * all. One record in the inventory holds 0.61 against a 17 cm diameter, which
 * would be a trunk shorter than the stump it is measured from.
 *
 * Rounding such a value to 1 would quietly turn it into a volume, so it is
 * refused instead and the tree counts as unmeasured.
 */
export const MIN_MERCHANTABLE_HEIGHT_M = 1;

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
  if (raw === null || raw < MIN_MERCHANTABLE_HEIGHT_M) return null;
  return Math.round(raw);
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

/* ===========================================================================
 * DIAMETER CLASSES
 *
 * FMB Technical Bulletin No. 3 page 7. The standard classes are multiples of
 * ten, each covering a ten-centimetre band around its name:
 *
 *     class 10   5 to 14 cm      class 40   35 to 44 cm
 *     class 20   15 to 24 cm     class 50   45 to 54 cm
 *     class 30   25 to 34 cm     ... and so on in tens
 *
 * The bulletin's own table stops at 120 but says the classes continue, so the
 * class is computed rather than looked up.
 *
 * WHY THIS IS ON THE DASHBOARD
 * It is the size structure of the urban forest, and it answers a question
 * counting trees cannot: whether there is a mature canopy coming. A thousand
 * trees all in the smallest class is a planting programme that has worked and
 * a canopy that is still twenty years away. The same thousand spread across
 * the classes is a forest that replaces itself.
 * =========================================================================== */

/** The smallest diameter the bulletin inventories. Below this is a seedling. */
export const SMALLEST_CLASSED_DBH = 5;

/** The class a diameter falls in, in centimetres, or null if it is too small. */
export function diameterClassOf(tree) {
  const diameter = dbhCm(tree);
  if (diameter === null || diameter < SMALLEST_CLASSED_DBH) return null;
  return Math.round(diameter / 10) * 10;
}

/** "25 to 34 cm", the band a class covers. */
export const diameterClassRange = (klass) => `${klass - 5} to ${klass + 4} cm`;

/**
 * How many trees fall in each class, smallest class first.
 *
 * Every class between the smallest and the largest present is included even
 * when it is empty, because a gap in the middle of the range is itself the
 * finding — it means a cohort that was never planted, or one that was lost.
 *
 * `belowSmallest` and `unmeasured` are kept apart: a seedling under 5 cm is a
 * tree somebody measured, and a tree with no diameter recorded is not.
 */
export function diameterDistribution(trees) {
  const rows = Array.isArray(trees) ? trees : [];
  const counts = new Map();
  let belowSmallest = 0;
  let unmeasured = 0;

  for (const tree of rows) {
    const diameter = dbhCm(tree);
    if (diameter === null) {
      unmeasured += 1;
      continue;
    }
    if (diameter < SMALLEST_CLASSED_DBH) {
      belowSmallest += 1;
      continue;
    }
    const klass = Math.round(diameter / 10) * 10;
    counts.set(klass, (counts.get(klass) ?? 0) + 1);
  }

  const measured = rows.length - unmeasured - belowSmallest;
  const present = [...counts.keys()];
  const classes = [];

  if (present.length > 0) {
    const largest = Math.max(...present);
    for (let klass = 10; klass <= largest; klass += 10) {
      const count = counts.get(klass) ?? 0;
      classes.push({
        class: klass,
        range: diameterClassRange(klass),
        count,
        share: measured > 0 ? count / measured : 0,
      });
    }
  }

  return { classes, belowSmallest, unmeasured, measured, total: rows.length };
}

/**
 * What the shape of that distribution says, in a sentence.
 *
 * Descriptive, not prescriptive: it reports where the weight sits and what
 * that means for canopy, and stops short of telling an LGU what to plant. The
 * thresholds are for describing a shape, not a standard anybody set.
 */
export function readDiameterShape(distribution) {
  const { classes, measured } = distribution;
  if (measured === 0) return null;

  const share = (from, to) =>
    classes
      .filter((row) => row.class >= from && (to === undefined || row.class <= to))
      .reduce((sum, row) => sum + row.share, 0);

  const young = share(10, 20);
  const large = share(60);

  if (young >= 0.6) {
    return {
      key: 'young',
      headline: 'Mostly young trees',
      detail:
        'Most of the trees measured here are under 25 cm across. A canopy takes decades, so most ' +
        'of the shade and cooling these will give is still ahead of them.',
    };
  }
  if (large >= 0.4) {
    return {
      key: 'mature',
      headline: 'Mostly mature trees',
      detail:
        'A large share are 55 cm across or more. These give the most shade and hold the most ' +
        'carbon, and they are the hardest to replace: when one goes, the canopy it provided ' +
        'takes decades to grow back.',
    };
  }
  return {
    key: 'mixed',
    headline: 'A mix of ages',
    detail:
      'The trees measured here are spread across the size classes rather than bunched in one, ' +
      'which is what lets a forest replace itself as older trees are lost.',
  };
}
