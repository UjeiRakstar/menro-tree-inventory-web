import { geometryAreaM2, toHectares } from './areaGeometry.js';
import { summariseMappedCover } from './mappedCover.js';
import { originOf } from './treeOrigin.js';

/**
 * The City Biodiversity Index points Green Tag can work out for a city: the
 * indicators of the Singapore Index on Cities' Biodiversity (User's Manual,
 * 2014; adopted by DENR-BMB TB 2018-02) that rest on what the system holds,
 * each scored 0–4 on the manual's bands. The other indicators — birds and
 * butterflies, water, parks, budget, the LBSAP, institutions, schools — are
 * outside it, so the points are "of" what was scored, never of the full 92.
 *
 * An indicator is scored only when the system has its measure: tree cover
 * once the city has mapped land cover, invasive trees once trees of known
 * origin are tagged, the events once News & Events could be read. A gap is
 * not a zero.
 *
 * The events are counted from News & Events, where each post's purpose
 * (outreach, partnership, project) says which indicator it is for.
 */

/** `bands`: the least value for 1, 2, 3 and 4 points; `fewerIsBetter` turns them round. */
export const CBI_INDICATORS = Object.freeze([
  { no: 1, id: 'natural', name: 'Proportion of natural areas', unit: '%', bands: [1, 7, 14, 20.01] },
  { no: 9, id: 'protected', name: 'Proportion of protected natural areas', unit: '%', bands: [1.4, 5.5, 9.5, 13.5] },
  { no: 10, id: 'invasive', name: 'Proportion of invasive alien species', unit: '%', bands: [30.01, 20.01, 11, 1], fewerIsBetter: true },
  { no: 12, id: 'canopy', name: 'Climate regulation: tree canopy cover', unit: '%', bands: [10.5, 19.2, 29.1, 59.8] },
  { no: 16, id: 'project', name: 'Biodiversity projects in the year', unit: '', bands: [1, 13, 22, 40] },
  { no: 21, id: 'partnership', name: 'Partnerships in the year', unit: '', bands: [1, 7, 13, 20] },
  { no: 23, id: 'outreach', name: 'Outreach and public awareness events in the year', unit: '', bands: [1, 60, 150, 301] },
]);

/** 0–4 points for a value on an indicator's bands. */
export function pointsOn(indicator, value) {
  if (!Number.isFinite(value)) return null;
  if (indicator.fewerIsBetter) return 4 - indicator.bands.filter((least) => value >= least).length;
  return indicator.bands.filter((least) => value >= least).length;
}

const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : null);

/**
 *   trees        the city's tagged trees
 *   areas        saved map areas (the map's features); the city's are picked out
 *   municipality the city's name, as the areas carry it
 *   placeAreaHa  the city's land area
 *   events       cbiEventCounts() for the city and year, or null when unread
 *
 * Returns { indicators: [{ ...indicator, value, points }], points, of, scored }.
 */
export function cbiPoints({ trees = [], areas = [], municipality = '', placeAreaHa = 0, events = null }) {
  const own = (Array.isArray(areas) ? areas : []).filter(
    (f) => f?.properties?.saved && (!municipality || f.properties.municipality === municipality)
  );
  const mapped = own.some((f) => f.properties.kind === 'land-cover');
  const coverHa = summariseMappedCover(own, { municipality }).hectares;
  const protectedHa = own
    .filter((f) => f.properties.designation)
    .reduce((total, f) => total + toHectares(geometryAreaM2(f.geometry)), 0);

  let known = 0;
  let invasive = 0;
  for (const tree of trees) {
    const origin = originOf(tree);
    if (origin === 'unrecorded') continue;
    known += 1;
    if (origin === 'invasive') invasive += 1;
  }

  const values = {
    natural: mapped ? share(coverHa, placeAreaHa) : null,
    protected: mapped || protectedHa > 0 ? share(protectedHa, placeAreaHa) : null,
    invasive: known > 0 ? share(invasive, known) : null,
    canopy: mapped ? share(coverHa, placeAreaHa) : null,
    project: events ? (events.project ?? []).length : null,
    partnership: events ? (events.partnership ?? []).length : null,
    outreach: events ? (events.outreach ?? []).length : null,
  };

  const indicators = CBI_INDICATORS.map((indicator) => {
    const value = values[indicator.id];
    return { ...indicator, value, points: value === null ? null : pointsOn(indicator, value) };
  });
  const scored = indicators.filter((i) => i.points !== null);
  return {
    indicators,
    points: scored.reduce((total, i) => total + i.points, 0),
    of: scored.length * 4,
    scored: scored.length,
  };
}
