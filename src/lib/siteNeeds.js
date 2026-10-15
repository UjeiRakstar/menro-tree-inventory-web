/**
 * What a species needs of the ground it is planted in — in a form the map can
 * match against what PGENRO's layers say about a planting site.
 *
 * RISE says it in prose ("thrives at 0–800 m, in clay loam, with 1,500–3,500
 * mm of rain"); the forester records the figures here, beside that prose, in
 * the Species (RISE) tab. The PDF reader proposes them too, from the issue,
 * marked for checking like everything else it reads. Nothing is filled in
 * from anywhere but the publication.
 *
 * The keys are columns of public.species_profiles (supabase/species_site_needs.sql).
 */

export const ORIGINS = Object.freeze([
  { id: 'endemic', label: 'Endemic to the Philippines' },
  { id: 'native', label: 'Native' },
  { id: 'introduced', label: 'Introduced' },
  { id: 'invasive', label: 'Invasive' },
]);

/** Textures, coarse to the classes BSWM soil names use. */
export const SOIL_TEXTURES = Object.freeze([
  { id: 'clay', label: 'Clay' },
  { id: 'clay-loam', label: 'Clay loam' },
  { id: 'loam', label: 'Loam' },
  { id: 'silt-loam', label: 'Silt loam' },
  { id: 'sandy-loam', label: 'Sandy loam' },
  { id: 'sand', label: 'Sand' },
]);

export const FLOOD_TOLERANCE = Object.freeze([
  { id: 'none', label: 'Does not take flooding' },
  { id: 'brief', label: 'Takes brief flooding' },
  { id: 'prolonged', label: 'Takes long flooding or waterlogging' },
]);

export const SITE_NEEDS = Object.freeze([
  { key: 'origin', label: 'Origin', kind: 'choice', options: ORIGINS,
    hint: 'An invasive species is never recommended for planting; endemic and native ones come first.' },
  { key: 'elevation', label: 'Elevation', kind: 'range', unit: 'm asl', min: 'elevation_min_m', max: 'elevation_max_m', step: 1 },
  { key: 'rainfall', label: 'Rainfall', kind: 'range', unit: 'mm a year', min: 'rainfall_min_mm', max: 'rainfall_max_mm', step: 1 },
  { key: 'temperature', label: 'Mean temperature', kind: 'range', unit: '°C', min: 'temperature_min_c', max: 'temperature_max_c', step: 0.1 },
  { key: 'soil_textures', label: 'Soils it grows in', kind: 'many', options: SOIL_TEXTURES },
  { key: 'flood_tolerance', label: 'Flooding', kind: 'choice', options: FLOOD_TOLERANCE },
]);

/** Every column, in the form's own keys. */
export const SITE_NEED_KEYS = Object.freeze(
  SITE_NEEDS.flatMap((need) => (need.kind === 'range' ? [need.min, need.max] : [need.key]))
);

const NUMBER_KEYS = SITE_NEEDS.filter((need) => need.kind === 'range').flatMap((need) => [need.min, need.max]);
const optionIds = (key) => SITE_NEEDS.find((need) => need.key === key).options.map((option) => option.id);

export function emptySiteNeeds() {
  return Object.fromEntries(SITE_NEED_KEYS.map((key) => [key, key === 'soil_textures' ? [] : '']));
}

const asNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

const cleanTextures = (value) => {
  const allowed = optionIds('soil_textures');
  return Array.isArray(value) ? allowed.filter((id) => value.includes(id)) : [];
};

/**
 * Anything — a saved row, or what the PDF reader returned — as the form holds
 * it: numbers as text, choices only from their lists, textures as a list.
 */
export function siteNeedsForm(source) {
  const form = emptySiteNeeds();
  if (!source) return form;
  for (const key of NUMBER_KEYS) {
    const n = asNumber(source[key]);
    form[key] = n === null ? '' : String(n);
  }
  for (const key of ['origin', 'flood_tolerance']) {
    form[key] = optionIds(key).includes(source[key]) ? source[key] : '';
  }
  form.soil_textures = cleanTextures(source.soil_textures);
  return form;
}

/** The form as columns: blanks as null, so "not stated" stays empty. */
export function siteNeedsRow(form) {
  const row = {};
  for (const key of NUMBER_KEYS) row[key] = asNumber(form[key]);
  row.origin = form.origin || null;
  row.flood_tolerance = form.flood_tolerance || null;
  const textures = cleanTextures(form.soil_textures);
  row.soil_textures = textures.length > 0 ? textures : null;
  return row;
}

/** What is wrong with the figures, by field key; empty when nothing is. */
export function siteNeedsProblems(form) {
  const problems = {};
  for (const need of SITE_NEEDS.filter((n) => n.kind === 'range')) {
    const low = asNumber(form[need.min]);
    const high = asNumber(form[need.max]);
    if (form[need.min] !== '' && low === null) problems[need.key] = 'Not a number.';
    else if (form[need.max] !== '' && high === null) problems[need.key] = 'Not a number.';
    else if (low !== null && high !== null && low > high) problems[need.key] = 'The lowest is above the highest.';
  }
  return problems;
}

/** Which site needs the form has — the ones the PDF reader filled, for marking. */
export function filledSiteNeeds(form) {
  return SITE_NEEDS.filter((need) =>
    need.kind === 'range'
      ? form[need.min] !== '' || form[need.max] !== ''
      : need.kind === 'many'
        ? form[need.key]?.length > 0
        : Boolean(form[need.key])
  ).map((need) => need.key);
}

/** Has a species any site need recorded at all? */
export const hasSiteNeeds = (profile) =>
  SITE_NEED_KEYS.some((key) => key !== 'origin' && profile?.[key] !== null && profile?.[key] !== undefined && !(Array.isArray(profile[key]) && profile[key].length === 0));

/** The form keys one site need is kept under: a range has two. */
export function formKeysOf(key) {
  const need = SITE_NEEDS.find((n) => n.key === key);
  if (!need) return [key];
  return need.kind === 'range' ? [need.min, need.max] : [need.key];
}
