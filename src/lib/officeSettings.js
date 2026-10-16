import { ROLES, roleOf } from './roles.js';

/**
 * An office's settings (supabase/office_settings.sql) as the Settings page
 * edits them.
 *
 * An office is named as its documents are filed: an LGU's PSGC code as text,
 * '403426000', or 'pgenro'.
 */

export function officeOf(profile) {
  const role = roleOf(profile);
  if (role === ROLES.PGENRO) return 'pgenro';
  if (role === ROLES.LGU_ADMIN && profile?.lgu_psgc) return String(profile.lgu_psgc);
  return null;
}

/** The profile's fields, worded for an LGU office or for PGENRO. */
export function profileFields(pgenro) {
  return [
    { key: 'chief_executive', label: pgenro ? 'Provincial Governor' : 'Local Chief Executive (Mayor)', wide: false },
    { key: 'office_head', label: pgenro ? 'PGENRO head' : 'MENRO / CENRO head', wide: false },
    { key: 'address_line1', label: 'Office address', wide: true, placeholder: 'Building, street, barangay' },
    { key: 'address_line2', label: 'Address, second line', wide: true, placeholder: 'City or municipality, Laguna, ZIP code' },
    { key: 'facebook_url', label: 'Facebook page', kind: 'url', placeholder: 'facebook.com/…' },
    { key: 'website_url', label: 'Website', kind: 'url', placeholder: 'www.…' },
    { key: 'email', label: 'Email', kind: 'email' },
    { key: 'phone', label: 'Contact number', kind: 'tel' },
  ];
}

export const PROFILE_KEYS = Object.freeze([
  'chief_executive', 'office_head', 'address_line1', 'address_line2', 'facebook_url', 'website_url', 'email', 'phone',
  'lgu_logo_url', 'office_logo_url',
]);

export function profileForm(row) {
  return Object.fromEntries(PROFILE_KEYS.map((key) => [key, row?.[key] ?? '']));
}

/** What is wrong with the form, by field; empty when nothing is. */
export function profileProblems(form) {
  const problems = {};
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) problems.email = 'That is not an email address.';
  for (const key of ['facebook_url', 'website_url']) {
    const value = form[key]?.trim();
    if (value && (/\s/.test(value) || !/\.[a-z]{2,}/i.test(value))) problems[key] = 'That is not a web address.';
  }
  if (form.phone && !/^[0-9+()\-\s]{5,20}$/.test(form.phone.trim())) problems.phone = 'Numbers, spaces, + ( ) and - only.';
  return problems;
}

/** The row to save: blanks as null, links given their https://. */
export function profileRow(office, form) {
  const row = { office };
  for (const key of PROFILE_KEYS) {
    let value = String(form[key] ?? '').trim();
    if (value && ['facebook_url', 'website_url'].includes(key) && !/^https?:\/\//i.test(value)) value = `https://${value}`;
    row[key] = value || null;
  }
  return row;
}

/** A barangay's figures, as typed, to save — or a reason not to. */
export function statsRow(barangayPsgc, lguPsgc, { population, households }) {
  const number = (value) => {
    const text = String(value ?? '').replace(/,/g, '').trim();
    if (!text) return null;
    const n = Number(text);
    return Number.isInteger(n) && n >= 0 ? n : NaN;
  };
  const row = { barangay_psgc: barangayPsgc, lgu_psgc: lguPsgc, population: number(population), households: number(households) };
  if (Number.isNaN(row.population) || Number.isNaN(row.households)) return { error: 'Whole numbers only.' };
  return { row };
}

export const isMissingTable = (error) =>
  Boolean(error) &&
  (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' ||
    /does not exist|could not find the (table|function)/i.test(error.message ?? ''));
