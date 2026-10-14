/**
 * The people tests sign in as. Shared, so that "an admin" means the same
 * account in every test file.
 */

export const SANTA_CRUZ = {
  psgc: 403426000,
  name: 'Santa Cruz',
  label: 'Santa Cruz',
  is_city: false,
  short_code: 'SCZ',
};

export const CALAMBA = {
  psgc: 403405000,
  name: 'Calamba',
  label: 'Calamba City',
  is_city: true,
  short_code: 'CLB',
};

/** The MENRO of Santa Cruz — the account the dashboard was first built for. */
export const SANTA_CRUZ_ADMIN = {
  id: 'menro-admin',
  email: 'menro@example.gov.ph',
  full_name: 'Santa Cruz MENRO',
  role: 'lgu_admin',
  lgu_psgc: SANTA_CRUZ.psgc,
  status: 'active',
  is_approved: true,
};

export const PGENRO_ADMIN = {
  id: 'pgenro-admin',
  email: 'pgenro@laguna.gov.ph',
  full_name: 'PGENRO Laguna',
  role: 'pgenro',
  lgu_psgc: null,
  status: 'active',
  is_approved: true,
};
