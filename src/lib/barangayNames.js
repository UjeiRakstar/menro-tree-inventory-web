import lguIndex from '../data/Laguna-LGUs.json';

/**
 * Writing a barangay's name the way the PSA writes it.
 *
 * This exists because of a mistake worth keeping a note of. Some records were
 * written "Brgy. Bubukal" beside the same barangay written plain, which split
 * one place into two in every grouping — so a normalisation stripped a leading
 * "Brgy." or "Barangay" from all of them.
 *
 * But "Barangay" is part of the real name of 63 barangays in Laguna: Santa
 * Cruz has Barangay I to Barangay V, Cabuyao has Barangay Uno, Luisiana has
 * Barangay Zone I, San Pablo has Barangay I-A. Stripping the word turned those
 * into "V" and "Uno" and "Zone I", which name nothing.
 *
 * So the rule is not a regular expression. It is the official list: a name is
 * normalised towards something the PSA actually calls a barangay, and anything
 * that matches nothing is left exactly as it was written rather than guessed
 * at. "Brgy." on its own is never part of an official name, which is why that
 * abbreviation can always go.
 */

/** Every official barangay in Laguna, lowercased name to its proper spelling. */
const OFFICIAL = new Map();
for (const lgu of lguIndex) {
  for (const barangay of lgu.barangays) OFFICIAL.set(barangay.toLowerCase(), barangay);
}

/** Barangays of one city or municipality, for checking a name belongs there. */
const BY_LGU = new Map(
  lguIndex.map((lgu) => [lgu.name, new Set(lgu.barangays.map((b) => b.toLowerCase()))])
);

const PREFIX = /^(?:brgy\.?|barangay)\s+/i;

/** Is this exactly what the PSA calls a barangay, somewhere in Laguna? */
export function isOfficialBarangay(name) {
  return OFFICIAL.has(String(name ?? '').trim().toLowerCase());
}

/** Is this a barangay of that particular city or municipality? */
export function isBarangayOf(name, municipality) {
  const barangays = BY_LGU.get(municipality);
  if (!barangays) return false;
  return barangays.has(String(name ?? '').trim().toLowerCase());
}

/**
 * The name to group and show this barangay under, or null when the record
 * does not say.
 *
 * Tried in order: the name as written, then the name with a leading "Brgy." or
 * "Barangay" removed, then that remainder put back behind the word "Barangay"
 * — which is what rescues a bare "V" or a "Brgy. V" into "Barangay V". A name
 * that matches none of those is returned as written, tidied of stray spaces,
 * because a barangay missing from the list is still somewhere.
 */
export function canonicalBarangay(raw) {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || /^unknown/i.test(text)) return null;

  const asWritten = OFFICIAL.get(text.toLowerCase());
  if (asWritten) return asWritten;

  const bare = text.replace(PREFIX, '').trim();
  if (!bare) return null;

  const restored = OFFICIAL.get(`barangay ${bare}`.toLowerCase());
  if (restored) return restored;

  const official = OFFICIAL.get(bare.toLowerCase());
  if (official) return official;

  return bare;
}

/**
 * How the name reads in a sentence.
 *
 * "Bubukal" becomes "Brgy. Bubukal", but "Barangay V" is left alone — it
 * already says what it is, and "Brgy. Barangay V" says it twice.
 */
export function barangayLabel(name) {
  const canonical = canonicalBarangay(name);
  if (!canonical) return '';
  return /^barangay\b/i.test(canonical) ? canonical : `Brgy. ${canonical}`;
}
