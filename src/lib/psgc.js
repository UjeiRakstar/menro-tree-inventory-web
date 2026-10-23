// By key, so a page that asks only for a town's facts does not carry the
// 47 KB of barangays: the build leaves out the keys nothing uses.
import { edition, published, populationSource, province, lgus, barangays } from '../data/Laguna-PSGC-2026Q3.json';

/**
 * The Philippine Standard Geographic Code for Laguna, 3rd quarter 2026 edition
 * (PSA, published 30 September 2026): each city's and municipality's official
 * name, class and income class, and each barangay's 2024 population and
 * whether PSA counts it urban or rural.
 *
 * Checked against the app's boundaries on 18 October 2026: the same 30 LGUs
 * and 681 barangays, every code and name matching.
 *
 * Urban and rural is the NSCB definition the City Biodiversity Index bulletin
 * uses (BMB Technical Bulletin 2018-02, section 4d): a barangay of 5,000 people
 * or more, or with the establishments it lists, is urban.
 */
export const PSGC_EDITION = Object.freeze({ edition, published, populationSource });

/** A city or municipality: { name, city, cityClass, income, population2024 }, or null. */
export const lguFacts = (code) => lgus[Number(code)] ?? null;

/** A barangay: { name, urban, population2024 }, or null. */
export const barangayFacts = (code) => barangays[Number(code)] ?? null;

/** The province: { psgc, name, income, population2024 }. */
export const provinceFacts = () => province;

/**
 * The official name, as plans and reports write it: "City of Biñan",
 * "Municipality of Santa Cruz". The app's own labels ("Biñan City") end in
 * "City", so "City of" cannot simply be put in front of them.
 *
 *   lgu   { psgc, label, isCity }
 */
export function officialName(lgu) {
  if (!lgu) return 'Province of Laguna';
  const facts = lguFacts(lgu.psgc);
  if (facts) return facts.city ? facts.name : `Municipality of ${facts.name}`;
  const bare = String(lgu.label ?? '').replace(/\s+City$/i, '');
  return `${lgu.isCity ? 'City' : 'Municipality'} of ${bare}`;
}
