import { supabase } from '../supabaseClient.js';

/**
 * Residents who sign in with Google, and the leaderboard (Round D,
 * supabase/community.sql).
 *
 * A resident is not an office account: the database gives a Google sign-in a
 * public.residents row and no profile, so none of the offices' pages open for
 * it. What is kept of them is what WHAT_IS_KEPT says, and nothing else.
 */

/** Shown before a resident agrees, and on the page after. Decided 18 October. */
export const WHAT_IS_KEPT = [
  'Your name as Google gives it, or the nickname you choose instead. The leaderboard shows only this.',
  'The email Google signs you in with, so the same account is counted once. Nobody else sees it, not even the offices.',
  'The trees you tag, and whether a field officer has verified each one.',
];

export const WHAT_IS_NOT_KEPT =
  'Nothing else: no contacts, no photos from your Google account, no location beyond the trees you choose to tag.';

export const WHY_IT_IS_KEPT =
  'To count the residents who take part, as the City Biodiversity Index asks of each LGU, and to rank the leaderboard. ' +
  'Under the Data Privacy Act of 2012 (RA 10173), you can ask PGENRO to remove your account and everything kept with it.';

/** What can be checked before the database checks the rest. */
export function nicknameShapeProblem(nickname) {
  const name = (nickname ?? '').trim();
  if (name.length < 3 || name.length > 24) return 'A nickname is 3 to 24 characters.';
  if (!/^[A-Za-z0-9ÑñÁÉÍÓÚáéíóú ._-]+$/.test(name)) return 'Use letters, numbers, spaces, dots, dashes or underscores only.';
  return null;
}

/** How a resident is shown: the nickname when they chose one, else their name. */
export function displayNameOf(resident) {
  if (!resident) return '';
  if (resident.show_as === 'nickname' && resident.nickname) return resident.nickname;
  return resident.full_name || 'A resident';
}

/** Postgres's "no such function", or PostgREST's cached form of it. */
export const isMissingFunction = (error) =>
  error?.code === '42883' || error?.code === 'PGRST202' || /Could not find the function|function .* does not exist/i.test(error?.message ?? '');

/** Google sign-in not switched on in the Supabase dashboard. */
export const isProviderOff = (error) => /provider is not enabled|unsupported provider/i.test(error?.message ?? '');

/** Off to Google, and back to the Community page. */
export async function signInWithGoogle() {
  const redirectTo = `${globalThis.location?.origin ?? ''}/community`;
  return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
}

/**
 * The leaderboard: { rows, ready }. `ready` is false until community.sql has
 * run, so a page can say so instead of showing an empty board as if nobody
 * had joined.
 */
export async function loadLeaderboard(limit = 10) {
  const { data, error } = await supabase.rpc('community_leaderboard', { p_limit: limit });
  if (error) return { rows: [], ready: !isMissingFunction(error), error: isMissingFunction(error) ? null : error };
  return { rows: Array.isArray(data) ? data : [], ready: true, error: null };
}
