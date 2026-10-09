import leafPeakIcon from '../assets/Leaf_Peak.png';
import leafColorChangeIcon from '../assets/Leaf_ColorChange.png';
import leafSheddingIcon from '../assets/Leaf_Shedding.png';
import leafBuddingIcon from '../assets/Leaf_Budding.png';
import flowerBuddingIcon from '../assets/Flower_Budding.svg';
import flowerFullBloomIcon from '../assets/Flower_FullBloom.svg';
import flowerFadingIcon from '../assets/Flower_Fading.svg';
import fruitUnripeIcon from '../assets/Fruiting_Unripe.png';
import fruitRipeIcon from '../assets/Fruiting_Ripe.png';
import fruitSplittingIcon from '../assets/Fruiting_Splitting.png';

/**
 * What the public map's "Tree Details" tab reads off one tree record.
 *
 * The mobile app writes free-ish text — dbh arrives as "37.35 cm" and heights
 * as "11.1" — so everything here parses loosely and returns null rather than
 * guessing. Phenology columns are added by supabase/tree_phenology.sql and are
 * not filled in yet, which is why an unrecorded phase shows nothing at all.
 */

/** Lowercase, letters and digits only: "Full Canopy" and "full_canopy" match. */
const key = (value) => (typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '');

/** The leading number in "37.35 cm", 11.1 or "11.1", else null. */
function numberIn(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/** At most one decimal, and no trailing ".0" — 11.1 stays, 5.0 becomes 5. */
const format = (n) => String(Math.round(n * 10) / 10);

/**
 * How tall the tree is, in metres.
 *
 * Only the measurement counts. The app also records a height class — Small,
 * Medium, Large — but showing "Medium" where a number belongs reads as a
 * measurement that it is not, and anything downstream parsing this would have
 * to cope with a word where it expects metres.
 */
export function heightOf(tree) {
  const metres = numberIn(tree?.total_height);
  if (metres === null || metres <= 0) return null;
  return { value: format(metres), unit: 'm', caption: 'height' };
}

/** Diameter at breast height, as recorded in centimetres. */
export function dbhOf(tree) {
  const cm = numberIn(tree?.dbh);
  if (cm === null || cm <= 0) return null;
  return { value: format(cm), unit: 'cm', caption: 'Diameter at Breast Height' };
}

export const DBH_EXPLAINER =
  'Diameter at Breast Height is the width of the trunk measured 1.3 metres above the ground — ' +
  'the standard point foresters measure from, so trees can be compared with one another.';

const LEAF_PHASES = {
  peak: { icon: leafPeakIcon, label: 'Full Canopy', description: 'Leaves are at their fullest.' },
  fullcanopy: 'peak',
  mature: 'peak',
  colorchange: {
    icon: leafColorChangeIcon,
    label: 'Color Change',
    description: 'Leaves are turning colour before they drop.',
  },
  colourchange: 'colorchange',
  shedding: { icon: leafSheddingIcon, label: 'Shedding', description: 'Leaves are falling; the crown is thinning.' },
  bare: 'shedding',
  budding: { icon: leafBuddingIcon, label: 'Budding', description: 'New leaves are flushing out.' },
  flushing: 'budding',
};

const FLOWER_PHASES = {
  budding: { icon: flowerBuddingIcon, label: 'Budding', description: 'Flower buds have formed but have not opened.' },
  bud: 'budding',
  fullbloom: { icon: flowerFullBloomIcon, label: 'Full Bloom', description: 'The tree is in flower.' },
  bloom: 'fullbloom',
  flowering: 'fullbloom',
  fading: { icon: flowerFadingIcon, label: 'Fading', description: 'Flowers are fading and petals are dropping.' },
  dropping: 'fading',
};

const FRUIT_PHASES = {
  unripe: { icon: fruitUnripeIcon, label: 'Unripe', description: 'Fruit has set and is still developing.' },
  developing: 'unripe',
  ripe: { icon: fruitRipeIcon, label: 'Ripe', description: 'Fruit is mature and ready to harvest.' },
  mature: 'ripe',
  dispersing: { icon: fruitSplittingIcon, label: 'Dispersing', description: 'Fruit is splitting open and spreading seed.' },
  splitting: 'dispersing',
};

/**
 * Look a recorded status up, following synonyms. "None" and blanks mean nothing
 * to show.
 *
 * The statuses are also written as the pair they are named by — "Ripe/Mature",
 * "Peak/Full Canopy" — so a value that contains a known term counts as that
 * term. Longest match first, or "Unripe/Developing" would answer to "ripe".
 */
function phase(table, value, kind) {
  const k = key(value);
  if (!k || k === 'none' || k === 'na' || k === 'notrecorded') return null;

  const resolve = (name) => (typeof table[name] === 'string' ? table[table[name]] : table[name]);

  let entry = resolve(k);
  if (!entry) {
    const match = Object.keys(table)
      .filter((name) => k.includes(name))
      .sort((a, b) => b.length - a.length)[0];
    if (match) entry = resolve(match);
  }
  if (!entry) return null;
  return { key: k, kind, ...entry };
}

/**
 * Phenology comes from the mobile app's own observations.
 *
 * The field app writes one row per visit to public.phenology_records —
 * foliage_status, flowering_status, fruiting_status, with who looked and when —
 * so a tree keeps a timeline rather than a single current state. Read the
 * latest row and hand it here.
 *
 * The three columns on public.trees are also accepted, so a record carrying
 * either shape works and nothing breaks if a row is passed instead.
 */
export const leafPhase = (source) =>
  phase(LEAF_PHASES, source?.foliage_status ?? source?.leaf_status, 'Leaf');
export const flowerPhase = (source) =>
  phase(FLOWER_PHASES, source?.flowering_status ?? source?.flower_status, 'Flower');
export const fruitPhase = (source) =>
  phase(FRUIT_PHASES, source?.fruiting_status ?? source?.fruit_status, 'Fruit');

/** The phases worth drawing, in leaf-flower-fruit order. */
export function phenologyOf(source) {
  return [leafPhase(source), flowerPhase(source), fruitPhase(source)].filter(Boolean);
}

/** "12 March 2026", or null when the observation has no date on it. */
export function observedOn(observation) {
  const raw = observation?.observed_at;
  if (!raw) return null;
  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) return null;
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}
