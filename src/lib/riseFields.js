import { emptySiteNeeds, filledSiteNeeds, siteNeedsForm, siteNeedsRow } from './siteNeeds.js';

/**
 * What the forester records from a DENR-ERDB RISE publication.
 *
 * One list, read by the form (labels, order, kind of input) and by the clean-up
 * of what the PDF reader sends back, so a field cannot be on one and not the
 * other. The keys are columns of public.species_profiles
 * (supabase/species_profiles.sql and species_rise.sql), and the same keys the
 * reader is asked for in supabase/functions/rise-extract/index.ts.
 *
 * The site needs in figures — elevation, rainfall, temperature, soils,
 * flooding, origin — are a second list (siteNeeds.js), kept in the same form
 * and saved in the same row.
 */
export const RISE_FIELDS = Object.freeze([
  { key: 'species', label: 'Common name', kind: 'text', required: true,
    hint: 'Spelled exactly as the field app records it, so the map finds it — e.g. "Narra".' },
  { key: 'scientific_name', label: 'Scientific name', kind: 'text', hint: 'e.g. Pterocarpus indicus Willd.' },
  { key: 'family', label: 'Family', kind: 'text', hint: 'e.g. Fabaceae' },
  { key: 'local_names', label: 'Local names', kind: 'text', hint: 'Other names the issue gives, comma-separated.' },
  { key: 'conservation_status', label: 'Conservation status', kind: 'text',
    hint: 'As the issue states it — e.g. "Vulnerable (DAO 2017-11)".' },
  { key: 'description', label: 'Description', kind: 'long',
    hint: 'What the tree looks like and how it grows. This is what the public map shows; a blank line starts a new paragraph.' },
  { key: 'distribution', label: 'Distribution and habitat', kind: 'long' },
  { key: 'site_requirements', label: 'Site requirements', kind: 'long', hint: 'Elevation, rainfall, temperature, soil.' },
  { key: 'flowering_months', label: 'Flowering months', kind: 'months' },
  { key: 'fruiting_months', label: 'Fruiting months', kind: 'months' },
  { key: 'phenology_note', label: 'Phenology, in the issue’s words', kind: 'long' },
  { key: 'propagation', label: 'Seed collection and propagation', kind: 'long' },
  { key: 'uses', label: 'Uses', kind: 'long' },
  { key: 'pests_diseases', label: 'Pests and diseases', kind: 'long' },
  { key: 'rise_citation', label: 'RISE issue', kind: 'text', hint: 'e.g. RISE Vol. 21 No. 2 (2019)' },
  { key: 'rise_url', label: 'Link to the issue', kind: 'text', hint: 'Where the PDF can be found, if online.' },
]);

export const MONTHS = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);

const TEXT_KEYS = RISE_FIELDS.filter((field) => field.kind !== 'months').map((field) => field.key);
const MONTH_KEYS = RISE_FIELDS.filter((field) => field.kind === 'months').map((field) => field.key);

/** An empty form. Months and soils are arrays; everything else is a string. */
export function emptyRiseForm() {
  return {
    ...Object.fromEntries(RISE_FIELDS.map((field) => [field.key, field.kind === 'months' ? [] : ''])),
    ...emptySiteNeeds(),
  };
}

/** Month numbers 1–12, each once, in calendar order; anything else dropped. */
export function cleanMonths(value) {
  if (!Array.isArray(value)) return [];
  const months = new Set();
  for (const item of value) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 1 && n <= 12) months.add(n);
  }
  return [...months].sort((a, b) => a - b);
}

const cleanText = (value) => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '');

/**
 * What came back from the PDF reader, made safe to put in the form.
 *
 * The reader is a language model: it can return a field it was not asked for,
 * a month 13, a number where text was wanted, or nothing at all. Only the
 * fields above survive, each as the kind the form expects. A species with no
 * name is dropped — there is nothing to save it under.
 *
 * Returns { citation, species: [form, …] }, with the citation copied onto
 * each species that has none of its own.
 */
export function cleanExtraction(raw) {
  const citation = cleanText(raw?.citation);
  const list = Array.isArray(raw?.species) ? raw.species : [];
  const species = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const form = emptyRiseForm();
    for (const key of TEXT_KEYS) form[key] = cleanText(item[key]);
    for (const key of MONTH_KEYS) form[key] = cleanMonths(item[key]);
    Object.assign(form, siteNeedsForm(item));
    if (!form.species) continue;
    if (!form.rise_citation) form.rise_citation = citation;
    species.push(form);
  }
  return { citation, species };
}

/** Which fields the reader actually filled — the ones the forester must check. */
export function filledKeys(form) {
  return [
    ...RISE_FIELDS.filter((field) =>
      field.kind === 'months' ? form[field.key]?.length > 0 : Boolean(form[field.key])
    ).map((field) => field.key),
    ...filledSiteNeeds(form),
  ];
}

/** A saved profile row, as the form holds it. */
export function formFromProfile(row) {
  const form = emptyRiseForm();
  if (!row) return form;
  for (const key of TEXT_KEYS) form[key] = typeof row[key] === 'string' ? row[key] : '';
  for (const key of MONTH_KEYS) form[key] = cleanMonths(row[key]);
  Object.assign(form, siteNeedsForm(row));
  return form;
}

/** The form, as the row to save: blanks as null, so "not stated" stays empty. */
export function profileFromForm(form, { autofilled = false } = {}) {
  const row = {};
  for (const key of TEXT_KEYS) row[key] = cleanText(form[key]) || null;
  for (const key of MONTH_KEYS) {
    const months = cleanMonths(form[key]);
    row[key] = months.length > 0 ? months : null;
  }
  Object.assign(row, siteNeedsRow(form));
  row.autofilled = Boolean(autofilled);
  return row;
}
