import { MOCK_MAP_SITES } from '../data/mockMapSites.js';
import { geometryAreaM2, toHectares } from './areaGeometry.js';

/**
 * The areas the public map can open a panel for.
 *
 * Trees are points; these are spaces. Two kinds share one shape because they
 * answer the same questions in the same order — what is here, how big is it,
 * what is the ground like, what can go wrong with it:
 *
 *   land-cover     what is growing on a piece of ground, and how fast
 *   planting-site  where the PGENRO Forestry Division wants trees put, and which
 *
 * Everything except the polygons is sample data today. `SITES_ARE_SAMPLE` is
 * what the panel reads to say so, and it is the one line that changes when the
 * PGENRO upload replaces src/data/mockMapSites.js.
 */

export const MAP_SITES = MOCK_MAP_SITES;

/** Is what the panel is showing invented? Today, yes, and it says so. */
export const SITES_ARE_SAMPLE = true;

const featuresOf = (collection) =>
  Array.isArray(collection?.features) ? collection.features : [];

/** Every area of one kind. */
export const sitesOfKind = (kind, collection = MAP_SITES) =>
  featuresOf(collection).filter((feature) => feature?.properties?.kind === kind);

export const landCoverSites = (collection = MAP_SITES) => sitesOfKind('land-cover', collection);
export const plantingSites = (collection = MAP_SITES) => sitesOfKind('planting-site', collection);

/** One area by id. */
export const siteById = (id, collection = MAP_SITES) =>
  featuresOf(collection).find((feature) => feature?.properties?.id === id) ?? null;

/** Measured from the polygon, never read from a field. */
export const siteAreaM2 = (feature) => geometryAreaM2(feature?.geometry);
export const siteAreaHa = (feature) => toHectares(siteAreaM2(feature));

/**
 * How much of the area a hazard reaches, in square metres.
 *
 * Sample records carry a share of the whole; a real one, cut from the UPRI NOAH
 * layer, will carry the square metres outright. Both are read, so the day the
 * real layer lands nothing here needs rewriting — and a share stays consistent
 * with the area the panel shows above it, which a stored absolute figure
 * against an edited polygon would not.
 *
 * Null, not zero, when the hazard has not been assessed: "no landslide here"
 * and "nobody has looked" are not the same sentence.
 */
export function hazardAreaM2(feature, kind) {
  const hazard = feature?.properties?.hazards?.[kind];
  if (!hazard) return null;
  if (Number.isFinite(Number(hazard.areaM2))) return Number(hazard.areaM2);
  const share = Number(hazard.share);
  if (!Number.isFinite(share)) return null;
  return siteAreaM2(feature) * share;
}

/** That hazard as a share of the area, for the "x% of it" line. */
export function hazardShare(feature, kind) {
  const exposed = hazardAreaM2(feature, kind);
  const total = siteAreaM2(feature);
  if (exposed === null || total <= 0) return null;
  return exposed / total;
}

/**
 * Roughly how many seedlings a planting site takes.
 *
 * Square spacing: a 3 m lattice is one seedling for every 9 m². It is the
 * figure that turns "86,330 m²" into something a barangay captain can plan
 * around, which is the whole point of showing the area at all. Rounded down to
 * a round number — nobody should read this as a seedling-exact order.
 */
export function seedlingCapacity(areaM2, spacingM) {
  const area = Number(areaM2);
  const spacing = Number(spacingM);
  if (!Number.isFinite(area) || !Number.isFinite(spacing) || spacing <= 0 || area <= 0) return null;
  const exact = area / (spacing * spacing);
  if (exact < 100) return Math.floor(exact / 10) * 10;
  if (exact < 1000) return Math.floor(exact / 50) * 50;
  return Math.floor(exact / 100) * 100;
}

/** What a planting site's status means to someone who wants to join. */
export const SITE_STATUS = {
  open: { label: 'Open for planting', tone: 'green' },
  full: { label: 'Fully planted', tone: 'slate' },
  maintenance: { label: 'Under maintenance — not open', tone: 'amber' },
};

export const statusOf = (feature) =>
  SITE_STATUS[feature?.properties?.status] ?? SITE_STATUS.open;

/** "Brgy. Labuin, Santa Cruz, Laguna" */
export function placeLine(feature) {
  const { barangay, municipality, province } = feature?.properties ?? {};
  return [barangay && `Brgy. ${barangay}`, municipality, province].filter(Boolean).join(', ');
}

/**
 * The title the panel shows.
 *
 * A planting site always carries "Tree Planting Site" whether or not whoever
 * named it remembered to — the record holds the place, the page supplies what
 * kind of place it is.
 */
export function siteTitle(feature) {
  const name = String(feature?.properties?.name ?? '').trim();
  if (feature?.properties?.kind !== 'planting-site') return name;
  return /tree planting site/i.test(name) ? name : `${name} Tree Planting Site`;
}
