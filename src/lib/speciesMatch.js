import { FLOOD_TOLERANCE, SOIL_TEXTURES, hasSiteNeeds } from './siteNeeds.js';

/**
 * Which trees suit a planting site: the species library's site needs
 * (siteNeeds.js) against what PGENRO's layers measured there.
 *
 * Each need is checked on its own and comes out one of three ways — it fits,
 * it does not, or one side has not said. A species is recommended when
 * nothing it needs is missed and at least two needs were checked and fit; one
 * fit out of six is too thin to tell a planter anything. Every reason is
 * written down, so a recommendation can be read and argued with rather than
 * taken on trust.
 *
 * An invasive species is never recommended. Endemic and native ones come
 * before introduced ones.
 */

/** A minimum of checked fits before anything is recommended. */
export const MIN_FITS = 2;

/** At least this much of a site flooding makes flooding a question. */
const FLOODS_AT_ALL = 0.05;
/** At least this much at high hazard asks for a tree that takes long floods. */
const FLOODS_BADLY = 0.1;
/** A soil counts once it is at least this much of the site. */
const SOIL_SHARE = 0.25;

const ORIGIN_ORDER = { endemic: 0, native: 1, introduced: 2 };

/** The texture class a BSWM soil name falls in, or null ("Mountain soil", "Hydrosol"). */
export function textureOf(description = '') {
  const d = description.toLowerCase();
  if (/(silty|sandy) clay loam|clay loam/.test(d)) return 'clay-loam';
  if (/sandy clay|clay/.test(d)) return 'clay';
  if (/silt loam/.test(d)) return 'silt-loam';
  if (/sandy loam/.test(d)) return 'sandy-loam';
  if (/loam/.test(d)) return 'loam';
  if (/sand/.test(d)) return 'sand';
  return null;
}

const textureLabel = (id) => SOIL_TEXTURES.find((t) => t.id === id)?.label.toLowerCase() ?? id;
const n = (value) => Math.round(value).toLocaleString('en-US');

/**
 * What the matching needs to know about a site, from its layer facts
 * (measure.js) and its LGU's CLIRAM figures.
 */
export function siteOf(facts, climate, areaM2) {
  const soils = (facts?.soil ?? [])
    .filter((soil) => soil.share >= SOIL_SHARE)
    .map((soil) => ({ ...soil, texture: textureOf(soil.description || soil.series || '') }));
  const area = areaM2 || facts?.flood?.areaM2 || null;
  return {
    elevation: facts?.elevation ?? null,
    rainfallMm: climate?.rainfall?.annualMm ?? null,
    temperatureC: climate?.temperature?.meanC ?? null,
    soils,
    flood: facts?.flood && area ? { share: facts.flood.total / area, highShare: facts.flood.high / area } : null,
  };
}

const inRange = (value, low, high) => (low === null || value >= low) && (high === null || value <= high);
const rangeText = (low, high, unit) =>
  low !== null && high !== null ? `${n(low)}–${n(high)} ${unit}` : low !== null ? `${n(low)} ${unit} or more` : `up to ${n(high)} ${unit}`;
const num = (v) => (v === null || v === undefined ? null : Number(v));

/** One species against one site: { fits, misses, unknown } — each a list of reasons. */
export function checkSpecies(profile, site) {
  const fits = [];
  const misses = [];
  const unknown = [];

  const range = (need, label, value, low, high, unit, siteText) => {
    if (low === null && high === null) return unknown.push(need);
    if (value === null || value === undefined) return unknown.push(need);
    const wants = rangeText(low, high, unit);
    (inRange(value, low, high) ? fits : misses).push(`${label} ${wants} — the site ${siteText}`);
  };

  const elevation = site.elevation;
  range(
    'elevation',
    'grows at',
    elevation?.mean ?? null,
    num(profile.elevation_min_m),
    num(profile.elevation_max_m),
    'm',
    elevation ? `is ${elevation.min === elevation.max ? `${n(elevation.mean)} m` : `${n(elevation.min)}–${n(elevation.max)} m`}` : ''
  );
  range('rainfall', 'takes', site.rainfallMm, num(profile.rainfall_min_mm), num(profile.rainfall_max_mm), 'mm of rain', `gets ${n(site.rainfallMm ?? 0)} mm`);
  range(
    'temperature',
    'grows at',
    site.temperatureC,
    num(profile.temperature_min_c),
    num(profile.temperature_max_c),
    '°C',
    `averages ${site.temperatureC} °C`
  );

  const textures = profile.soil_textures ?? [];
  const siteTextures = site.soils.filter((soil) => soil.texture);
  if (textures.length === 0 || siteTextures.length === 0) unknown.push('soil');
  else {
    const suited = siteTextures.find((soil) => textures.includes(soil.texture));
    if (suited) fits.push(`grows in ${textureLabel(suited.texture)} — the site is ${suited.description || suited.series}`);
    else misses.push(`grows in ${textures.map(textureLabel).join(', ')} — the site is ${siteTextures.map((s) => s.description || s.series).join(', ')}`);
  }

  if (!site.flood) unknown.push('flooding');
  else if (site.flood.share < FLOODS_AT_ALL) fits.push('little or none of the site floods');
  else {
    const takes = profile.flood_tolerance;
    const floods = `${Math.round(site.flood.share * 100)}% of the site floods`;
    if (!takes) unknown.push('flooding');
    else if (takes === 'none') misses.push(`does not take flooding — ${floods}`);
    else if (takes === 'brief' && site.flood.highShare >= FLOODS_BADLY) {
      misses.push(`takes only brief flooding — ${Math.round(site.flood.highShare * 100)}% of the site is at high flood hazard`);
    } else {
      fits.push(`${FLOOD_TOLERANCE.find((t) => t.id === takes).label.toLowerCase()} — ${floods}`);
    }
  }

  return { fits, misses, unknown };
}

/**
 * The species suited to a site, best first, each with its reasons; and how
 * many were set aside, and why, so an empty list can explain itself.
 *
 *   { suited: [{ profile, fits, unknown }], unsuited, invasive, noNeeds }
 */
export function recommendSpecies(profiles, site) {
  const suited = [];
  let unsuited = 0;
  let invasive = 0;
  let noNeeds = 0;
  for (const profile of profiles ?? []) {
    if (profile.origin === 'invasive') {
      invasive += 1;
      continue;
    }
    if (!hasSiteNeeds(profile)) {
      noNeeds += 1;
      continue;
    }
    const check = checkSpecies(profile, site);
    if (check.misses.length > 0 || check.fits.length < MIN_FITS) {
      unsuited += 1;
      continue;
    }
    suited.push({ profile, fits: check.fits, unknown: check.unknown });
  }
  suited.sort(
    (a, b) =>
      (ORIGIN_ORDER[a.profile.origin] ?? 3) - (ORIGIN_ORDER[b.profile.origin] ?? 3) ||
      b.fits.length - a.fits.length ||
      a.profile.species.localeCompare(b.profile.species)
  );
  return { suited, unsuited, invasive, noNeeds };
}

/** A recommendation as a planting site keeps it: [{ common, scientific, why }]. */
export const asRecommended = ({ profile, fits }) => ({
  common: profile.species,
  scientific: profile.scientific_name ?? null,
  why: fits.join('; '),
  matched: true,
});
