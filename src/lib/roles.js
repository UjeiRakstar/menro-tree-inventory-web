/**
 * Who someone is, and what that lets them reach.
 *
 * Three roles, one per tier of the province's environment offices — see
 * ACCOUNTS_AND_MAPPING.md:
 *
 *   pgenro         the province. Creates the LGU accounts and watches them.
 *   lgu_admin      a MENRO or City ENRO. Five per LGU, web and mobile.
 *   field_officer  the field team. The mobile app only.
 *
 * The database is what actually enforces all of this (supabase/accounts.sql).
 * This file decides only what the website SHOWS, so that someone it would
 * refuse is told why instead of being handed an empty page.
 */

export const ROLES = Object.freeze({
  PGENRO: 'pgenro',
  LGU_ADMIN: 'lgu_admin',
  FIELD_OFFICER: 'field_officer',
});

export const STATUS = Object.freeze({
  ACTIVE: 'active',
  LOCKED: 'locked',
  ARCHIVED: 'archived',
});

/** Mirrors lgu_seat_limit() in supabase/accounts.sql. */
export const SEAT_LIMIT = 5;

/**
 * The names the roles had before accounts.sql ran.
 *
 * Until it is run, the only admin is still called 'admin', and refusing them
 * would lock the one person who can run it out of their own dashboard.
 */
const LEGACY_ROLES = { admin: ROLES.PGENRO, arborist: ROLES.FIELD_OFFICER };

export function roleOf(profile) {
  const role = profile?.role ?? null;
  return LEGACY_ROLES[role] ?? role;
}

/**
 * The LGU an office's lists are narrowed to: a MENRO / CENRO's own PSGC code
 * (0 when it has none, which matches nothing); undefined for PGENRO and
 * everyone else, who see the province. Found 18 October: Kalayaan's Action
 * Board listed Santa Cruz's hazards and permits.
 */
export function officeLguOf(profile) {
  if (roleOf(profile) !== ROLES.LGU_ADMIN) return undefined;
  return Number(profile?.lgu_psgc) || 0;
}

/** Whether a row with this LGU code is one the office sees. */
export const inOfficeLgu = (officeLgu, code) => officeLgu === undefined || Number(code) === officeLgu;

/**
 * What to call the role on screen.
 *
 * An LGU admin of a city is a City ENRO — "CENRO" — which is not DENR's
 * Community ENRO. Written out in full wherever there is room, so the two are
 * never mistaken for each other.
 */
export function roleLabel(role, { isCity = false, short = false } = {}) {
  switch (LEGACY_ROLES[role] ?? role) {
    case ROLES.PGENRO:
      return 'PGENRO';
    case ROLES.LGU_ADMIN:
      if (short) return isCity ? 'CENRO' : 'MENRO';
      return isCity ? 'City ENRO (CENRO)' : 'Municipal ENRO (MENRO)';
    case ROLES.FIELD_OFFICER:
      return 'Field officer';
    default:
      return 'Unknown role';
  }
}

/**
 * Whether this person may use the website, and if not, what to tell them.
 *
 * `kind` is one of:
 *   'web'          in
 *   'mobile_only'  a field officer; the app is theirs, the website is not
 *   'pending'      a field officer not yet approved by their MENRO/CENRO
 *   'locked'       locked by PGENRO
 *   'archived'     archived by PGENRO
 *   'no_profile'   signed in, but no profile row to say who they are
 */
export function accessFor(profile) {
  if (!profile) {
    return {
      kind: 'no_profile',
      title: 'This account has no profile',
      message:
        'You are signed in, but there is no Green Tag profile attached to this account, so there ' +
        'is no way to tell which office it belongs to. Ask PGENRO to check it.',
    };
  }

  if (profile.status === STATUS.LOCKED) {
    return {
      kind: 'locked',
      title: 'This account is locked',
      message:
        'PGENRO has locked this account. Everything it recorded is still there; it just cannot ' +
        'sign in or make changes until PGENRO unlocks it.',
    };
  }

  if (profile.status === STATUS.ARCHIVED) {
    return {
      kind: 'archived',
      title: 'This account has been archived',
      message:
        'PGENRO has archived this account, usually because its holder has moved on. Its records ' +
        'stay, under its name. If you need access again, ask PGENRO.',
    };
  }

  const role = roleOf(profile);

  if (role === ROLES.PGENRO || role === ROLES.LGU_ADMIN) {
    return { kind: 'web', title: '', message: '' };
  }

  if (role === ROLES.FIELD_OFFICER) {
    if (profile.is_approved === false) {
      return {
        kind: 'pending',
        title: 'Waiting for approval',
        message:
          'Your registration has reached your MENRO / CENRO, who will approve it. Field officers ' +
          'work from the Green Tag mobile app; this website is for the LGU and PGENRO offices.',
      };
    }
    return {
      kind: 'mobile_only',
      title: 'Field officers use the mobile app',
      message:
        'Your account is for the Green Tag mobile app, where your assignments are. This website ' +
        'is for the LGU and PGENRO offices.',
    };
  }

  return {
    kind: 'no_profile',
    title: 'This account has no role',
    message: 'Your profile does not say which office it belongs to. Ask PGENRO to check it.',
  };
}

export const canUseWeb = (profile) => accessFor(profile).kind === 'web';

/**
 * Whether a MENRO / CENRO account is yet to fill in its holder's details
 * (supabase/onboarding.sql). Only a real null: before that file has run there
 * is no onboarded_at at all, and nobody is stopped. A training account is the
 * real office's, borrowed, and is never asked.
 */
export const needsOnboarding = (profile) =>
  roleOf(profile) === ROLES.LGU_ADMIN && profile?.onboarded_at === null && !profile?.is_training;
export const isPgenro = (profile) =>
  roleOf(profile) === ROLES.PGENRO && profile?.status !== STATUS.LOCKED && profile?.status !== STATUS.ARCHIVED;

/**
 * Where an account code stands. Mirrors check_account_code() in the SQL, so
 * the page and the database never disagree about whether a code still works.
 */
export function codeState(code, now = new Date()) {
  if (!code) return 'unknown';
  if (code.revoked_at) return 'revoked';
  if (code.redeemed_at) return 'used';
  if (code.expires_at && new Date(code.expires_at) <= now) return 'expired';
  return 'outstanding';
}

/**
 * Seats an LGU has given out: admins not archived, plus codes that could still
 * be used. Locked admins keep their seat — locking is reversible. Training
 * accounts and training codes take no seat. Mirrors lgu_seats_taken() in the
 * SQL; the database is what refuses the sixth.
 */
export function seatsTaken({ admins = [], codes = [] } = {}, now = new Date()) {
  const seated = admins.filter(
    (admin) =>
      roleOf(admin) === ROLES.LGU_ADMIN && admin.status !== STATUS.ARCHIVED && !admin.is_training
  ).length;
  const outstanding = codes.filter(
    (code) => codeState(code, now) === 'outstanding' && !code.is_training
  ).length;
  return seated + outstanding;
}
